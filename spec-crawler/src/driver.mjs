/**
 * Browser attachment and the primitives every pass is built from.
 *
 * Attaches to an *already running* Edge/Chrome over CDP rather than launching
 * its own browser, so the crawl inherits your real logged-in session. That is
 * the difference between this being usable on Linear and not.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import * as agent from './page-agent.mjs';
import { waitForStable } from './stability.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const SETTLE_QUIET_MS = 180;
const SETTLE_TIMEOUT_MS = 3000;

/**
 * Lift `elementSerializer` out of the extension's background.js.
 *
 * Extracted rather than forked so the extension stays the single source of
 * truth for serialization: fix a style bug there and the crawler inherits it.
 * The function is self-contained (verified: no references to outer scope), and
 * terminates at the first column-zero `}` after its declaration.
 */
function loadSerializerSource() {
  const source = readFileSync(path.join(REPO_ROOT, 'background.js'), 'utf8');
  const match = source.match(/^async function elementSerializer\([\s\S]*?^\}$/m);
  if (!match) {
    throw new Error('Could not find elementSerializer in background.js — did the extension refactor? Update loadSerializerSource().');
  }
  return match[0];
}

export class SpecDriver {
  #serializerSource = null;
  #subgridTransaction = 0;

  /**
   * Attributes that carry interaction state, and so must separate two captures of
   * the same component. Deliberately a allow-list rather than "every data-*":
   * identity attributes like data-list-key hold per-row uuids, and hashing those
   * would make every row in a list its own component.
   *
   * `data-active` / `data-apply-background` / `data-keyboard-active` /
   * `data-selected` and the four run-edge flags are Linear's row model. The rest
   * are the conventional ones (Radix, ARIA) that most apps use.
   */
  static STATE_ATTRIBUTES = [
    'data-state',
    'data-active',
    'data-selected',
    'data-apply-background',
    'data-keyboard-active',
    'data-first-selected',
    'data-last-selected',
    'data-first-in-group',
    'data-last-in-group',
    'data-highlighted',
    'data-disabled',
    'data-checked',
    'aria-expanded',
    'aria-selected',
    'aria-checked',
    'aria-current',
    'aria-pressed',
    'open',
  ];

  constructor(browser, page, { baselineUrlParts = ['origin', 'pathname', 'search'] } = {}) {
    this.browser = browser;
    this.page = page;
    this.baselineUrl = page.url();
    this.baselineUrlParts = [...baselineUrlParts];
    this.lastStabilityEvidence = null;
    this.lastResetReport = null;
  }

  /**
   * @param {string} endpoint CDP endpoint, e.g. http://localhost:9222
   * @param {string} [urlPattern] substring/regex matched against open tabs
   * @param {{baselineUrlParts?: string[]}} [options] semantic URL fields to compare during reset
   */
  static async attach(endpoint, urlPattern, options = {}) {
    const browser = await chromium.connectOverCDP(endpoint);
    const contexts = browser.contexts();
    const pages = contexts.flatMap((context) => context.pages());
    if (pages.length === 0) throw new Error('Browser has no open pages.');

    let page = pages[0];
    if (urlPattern) {
      const pattern = new RegExp(urlPattern, 'i');
      const match = pages.find((candidate) => pattern.test(candidate.url()));
      if (!match) {
        throw new Error(`No open tab matches ${urlPattern}. Open tabs:\n${pages.map((p) => `  ${p.url()}`).join('\n')}`);
      }
      page = match;
    }
    await page.bringToFront();
    return new SpecDriver(browser, page, options);
  }

  /**
   * Point the attached tab at a specific page before crawling.
   *
   * `urlPattern` only *selects* among open tabs; this navigates. Scoping a run
   * to one page is the common case and far cheaper than sweeping an app, so it
   * deserves to be one step rather than "go open the right tab first".
   */
  async goto(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.settle(300, 8000);
    await this.establishBaseline();
    return this.page.url();
  }

  async close() {
    // Only detaches; never closes the user's browser.
    await this.browser.close().catch(() => {});
  }

  /** Tag the DOM and record the resting signature. Call before any interaction. */
  async establishBaseline() {
    this.pendingFresh = new Set();
    await this.clearCrawlerResidue();
    // Settle first. Tagging a half-hydrated app assigns ids to a skeleton, and
    // the real controls then arrive untagged — page_describe returns a full,
    // plausible-looking map in which every id is null, and frontier reports
    // "nothing untried" because there is genuinely nothing tagged to try.
    // Nothing throws; three rounds were lost to reading that as a broken loop.
    await this.settle(300, 8000).catch(() => {});
    await this.page.evaluate(agent.tagElements, agent.ID_ATTRIBUTE);
    this.baselineUrl = this.page.url();
    this.baselineSignature = await this.signature();
    this.baselineSnapshot = await this.semanticSnapshot();
    this.baselineOverlays = new Set(await this.visibleOverlays());
    return this.baselineSignature;
  }

  /**
   * Everything that appeared since baseline, by either mechanism: freshly
   * mounted DOM, or pre-rendered DOM that just became visible.
   */
  async harvestSurfaces() {
    const mounted = await this.harvestNewRoots();
    const visible = await this.visibleOverlays();
    const revealedIds = visible.filter((id) => !this.baselineOverlays?.has(id));
    const mountedIds = new Set(mounted.map((root) => root.id));
    const revealed = await this.describeByIds(revealedIds.filter((id) => !mountedIds.has(id)));
    return [...mounted, ...revealed];
  }

  signature() {
    return this.page.evaluate(agent.pageSignature, agent.ID_ATTRIBUTE);
  }

  semanticSnapshot() {
    return this.page.evaluate(agent.semanticSnapshot, {
      attribute: agent.ID_ATTRIBUTE,
      urlParts: this.baselineUrlParts,
    });
  }

  async compareToBaseline() {
    const actual = await this.semanticSnapshot();
    const comparison = agent.compareSemanticSnapshots(this.baselineSnapshot, actual);
    return { ...comparison, expected: this.baselineSnapshot, actual };
  }

  async settle(quietMs = SETTLE_QUIET_MS, timeoutMs = SETTLE_TIMEOUT_MS, options = {}) {
    // Preserve the positional timing arguments while widening the result from the
    // old 'quiet'/'timeout' string to evidence with an explicit status field.
    if (quietMs && typeof quietMs === 'object') {
      options = quietMs;
      quietMs = options.quietWindowMs ?? SETTLE_QUIET_MS;
      timeoutMs = options.timeoutMs ?? SETTLE_TIMEOUT_MS;
    }
    const evidence = await waitForStable(this.page, {
      quietWindowMs: quietMs,
      timeoutMs,
      pollIntervalMs: options.pollIntervalMs,
      consecutiveSamples: options.consecutiveSamples,
      maxSampledElements: options.maxSampledElements,
      includeSubtree: options.includeSubtree,
      scope: options.scope ?? null,
      throwOnTimeout: options.throwOnTimeout,
    });
    evidence.status = evidence.stable ? 'quiet' : (evidence.timedOut ? 'timeout' : 'failed');
    this.lastStabilityEvidence = evidence;
    return evidence;
  }

  /** Exact old return contract for integrations that still compare strings. */
  async settleLegacy(quietMs = SETTLE_QUIET_MS, timeoutMs = SETTLE_TIMEOUT_MS, options = {}) {
    return (await this.settle(quietMs, timeoutMs, options)).status;
  }

  /**
   * Tag whatever appeared since the last tagging pass and return the new roots.
   *
   * Candidates accumulate in `pendingFresh` rather than being consumed. Tagging
   * is destructive — an element tagged while it was still at opacity 0 mid
   * transition would never be "fresh" again, so a retry after the animation
   * finished could never find it. Accumulating lets the second look re-judge
   * the same candidates now that they have settled.
   */
  async harvestNewRoots() {
    const tagged = await this.page.evaluate(agent.tagElements, agent.ID_ATTRIBUTE);
    this.pendingFresh ??= new Set();
    for (const id of tagged) this.pendingFresh.add(id);

    const fresh = Array.from(this.pendingFresh);
    if (fresh.length === 0) return [];
    return this.page.evaluate(
      ([attribute, ids]) => {
        const freshSet = new Set(ids);
        const roots = [];
        for (const id of freshSet) {
          const element = document.querySelector(`[${attribute}="${id}"]`);
          if (!element) continue;
          let ancestor = element.parentElement;
          let nested = false;
          while (ancestor) {
            if (freshSet.has(ancestor.getAttribute(attribute))) { nested = true; break; }
            ancestor = ancestor.parentElement;
          }
          if (nested) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) continue;
          const styles = getComputedStyle(element);
          if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue;
          const parts = [];
          const walk = (node, depth) => {
            if (depth > 4 || parts.length > 220) return;
            parts.push(`${node.tagName}.${(typeof node.className === 'string' ? node.className : '').trim().split(/\s+/).slice(0, 2).join('.')}`);
            for (const child of node.children) walk(child, depth + 1);
          };
          walk(element, 0);
          const innerRole = element.querySelector('[role="menu"],[role="listbox"],[role="menubar"],[role="tree"],[role="grid"],[role="radiogroup"]')?.getAttribute('role')
            ?? (element.querySelector('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]') ? 'menu' : null)
            ?? (element.querySelector('[role="option"]') ? 'listbox' : null);
          roots.push({
            id,
            tag: element.tagName.toLowerCase(),
            role: element.getAttribute('role') ?? (element.tagName === 'DIALOG' ? 'dialog' : null),
            innerRole,
            label: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            portalled: element.parentElement === document.body,
            hash: parts.join('|'),
          });
        }
        return roots;
      },
      [agent.ID_ATTRIBUTE, fresh],
    );
  }

  /**
   * Structural fingerprint of a subtree, or of the page's visible overlays.
   *
   * Text is excluded deliberately: the same menu showing different item labels
   * is still the same component, and an agent that treats it as new will loop
   * forever on a list that re-renders.
   *
   * State attributes are NOT excluded, and that distinction cost a capture run.
   * Tag-and-class alone answers "is this the same component?", which is the right
   * question for Tier 2 overlay dedupe. It is the wrong question for Tier 1 and 3,
   * where the whole point is to capture one component in each of its states. An
   * app that expresses state through classes survives either way; Linear expresses
   * it through data attributes and a pseudo-element, so rest / hover / selected /
   * cursor on an issue row all hashed identically and every state after the first
   * was silently discarded as a duplicate.
   *
   * Only attributes that carry *state* are included. Identity attributes are not:
   * data-list-key holds a per-row uuid, and hashing that would make every row of a
   * list a distinct "component" and defeat the dedupe entirely.
   */
  structuralHash(specId = null) {
    return this.page.evaluate(({ attribute, target, stateAttrs }) => {
      const root = target ? document.querySelector(`[${attribute}="${target}"]`) : document.body;
      if (!root) return null;
      const parts = [];
      const walk = (node, depth) => {
        if (depth > 4 || parts.length > 220) return;
        const classes = (typeof node.className === 'string' ? node.className : '').trim().split(/\s+/).slice(0, 2).join('.');
        const state = stateAttrs
          .filter((name) => node.hasAttribute(name))
          .map((name) => `${name}=${node.getAttribute(name)}`)
          .join(',');
        parts.push(`${node.tagName}.${classes}${state ? `[${state}]` : ''}`);
        for (const child of node.children) walk(child, depth + 1);
      };
      walk(root, 0);
      return parts.join('|');
    }, { attribute: agent.ID_ATTRIBUTE, target: specId, stateAttrs: SpecDriver.STATE_ATTRIBUTES });
  }

  /**
   * Identity of "where the app currently is".
   *
   * Route plus the set of open overlays. Two visits to the same route with the
   * same menu open are the same state, so an exploring agent can tell whether an
   * interaction moved it somewhere new or merely redrew the page.
   */
  async currentStateKey() {
    const overlays = await this.visibleOverlays();
    const hashes = await this.describeByIds(overlays);
    const signature = hashes.map((entry) => entry.hash).sort().join('#');
    const route = new URL(this.page.url()).pathname;
    return `${route}::${signature || 'root'}`;
  }

  /**
   * @param {string} denyPattern label regex to skip
   * @param {string|null} scopeId confine to an open surface
   * @param {{include?: string, exclude?: string}} region CSS selectors bounding the page-level crawl
   */
  triggers(denyPattern, scopeId = null, region = {}) {
    return this.page.evaluate(agent.collectTriggers, {
      attribute: agent.ID_ATTRIBUTE,
      denyPattern,
      scopeId,
      include: region.include ?? this.region?.include ?? null,
      exclude: region.exclude ?? this.region?.exclude ?? null,
      excludeArea: region.excludeArea ?? this.region?.excludeArea ?? null,
      includeArea: region.includeArea ?? this.region?.includeArea ?? null,
    });
  }

  /**
   * Bound every subsequent crawl to a region of the page.
   *
   * Sticky by design. A per-call argument is one an agent forgets, and the cost
   * of forgetting is a run that wanders through navigation chrome the user
   * explicitly excluded.
   */
  setRegion({ include = null, exclude = null, excludeArea = null, includeArea = null } = {}) {
    this.region = { include, exclude, excludeArea, includeArea };
    return this.region;
  }

  /**
   * Landmarks worth scoping to, with how many triggers each holds.
   *
   * Answers "what should I pass to --scope?" without the caller guessing at
   * selectors or reading the DOM by hand.
   */
  regions() {
    return this.page.evaluate((attribute) => {
      const CANDIDATES = 'main,nav,aside,header,footer,[role="main"],[role="navigation"],[role="complementary"],[role="banner"],[role="contentinfo"],[role="region"]';
      const TRIGGERS = 'button,[role="button"],[role="tab"],[aria-haspopup],[aria-expanded],a[href]';
      const out = [];
      for (const element of document.querySelectorAll(CANDIDATES)) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) continue;
        const id = element.getAttribute(attribute);
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role');
        // A selector the caller can actually paste back in.
        const selector = element.id ? `#${element.id}` : (role ? `[role="${role}"]` : tag);
        out.push({
          selector,
          tag,
          role,
          triggers: element.querySelectorAll(TRIGGERS).length,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          label: (element.getAttribute('aria-label') || '').slice(0, 60),
        });
      }
      return out.sort((left, right) => right.triggers - left.triggers);
    }, agent.ID_ATTRIBUTE);
  }

  /**
   * A described element without an id cannot be clicked, hovered or captured,
   * so a map where every id is null is not a smaller answer — it is a useless
   * one that looks complete. Re-tag once and say so plainly if it stays that way.
   */
  async describe() {
    // describePage returns {url, title, viewport, items}, not a bare array.
    const untagged = (result) => {
      const items = result?.items ?? [];
      return items.length > 0 && items.every((item) => !item.id);
    };

    let result = await this.page.evaluate(agent.describePage, agent.ID_ATTRIBUTE);
    if (untagged(result)) {
      await this.establishBaseline();
      result = await this.page.evaluate(agent.describePage, agent.ID_ATTRIBUTE);
    }
    if (untagged(result)) {
      throw new Error(`Found ${result.items.length} elements but none are tagged — the page was `
        + 'still rendering when the DOM was tagged. Call browser_attach again now that it has settled.');
    }
    return result;
  }

  /**
   * Click with a real pointer, falling back to a DOM click.
   *
   * `element.click()` dispatches only a `click` event. Linear, Radix and most
   * modern menu implementations open on `pointerdown`/`mousedown`, so a DOM
   * click silently does nothing — the trigger reads as inert when it isn't.
   * Playwright's click drives CDP input (move, down, up), which those handlers
   * actually see. The DOM fallback covers elements that are obscured or
   * scrolled out of reach, where real input can't land.
   */
  async clickById(id) {
    // Trigger discovery can match an inner icon (Linear's sidebar buttons wrap
    // an <svg> that carries the aria attributes). Clicking the icon works only
    // if it isn't pointer-events:none — clicking the actionable ancestor always
    // works, so resolve upward before doing anything else.
    const selector = `[${agent.ID_ATTRIBUTE}="${id}"]`;
    const actionable = await this.page.evaluate(({ attribute, target }) => {
      const element = document.querySelector(`[${attribute}="${target}"]`);
      if (!element) return null;
      const owner = element.closest('button, a[href], [role="button"], [role="menuitem"], [role="tab"], summary') ?? element;
      return owner.getAttribute(attribute);
    }, { attribute: agent.ID_ATTRIBUTE, target: id });

    const handle = await this.page.$(actionable ? `[${agent.ID_ATTRIBUTE}="${actionable}"]` : selector);
    if (!handle) return false;

    // Real CDP input first — it's the only path that behaves exactly like a
    // user, including hover-then-press ordering.
    try {
      await handle.scrollIntoViewIfNeeded({ timeout: 1500 });
      await handle.click({ timeout: 2500 });
      return true;
    } catch { /* covered, unstable, or zero-size — escalate */ }

    // Still real input, but aimed at coordinates so Playwright's actionability
    // checks can't veto it. Handles triggers sitting under sticky headers.
    try {
      const box = await handle.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 20 });
        return true;
      }
    } catch { /* fall through to synthetic events */ }

    return this.page.evaluate(agent.clickById, { attribute: agent.ID_ATTRIBUTE, id });
  }

  /**
   * Ids of overlay-ish elements currently visible.
   *
   * The other half of overlay detection: plenty of apps pre-render their menus
   * and merely toggle visibility, so "new DOM appeared" finds nothing. Diffing
   * this set across an interaction catches those.
   */
  visibleOverlays() {
    return this.page.evaluate((attribute) => {
      // `role="grid"` was here and matched Linear's issue board — page content,
      // not an overlay. Overlays are identified by role AND by being taken out
      // of normal flow; static in-flow content never is. That pairing is what
      // separates a 175x45 context menu from the whole board.
      const OVERLAYS = '[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[role="alertdialog"],[data-state="open"],dialog[open],[aria-modal="true"]';
      const ids = [];
      for (const element of document.querySelectorAll(OVERLAYS)) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) continue;
        const styles = getComputedStyle(element);
        if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue;
        const floating = ['absolute', 'fixed', 'sticky'].includes(styles.position) || element.parentElement === document.body;
        if (!floating) continue;
        const id = element.getAttribute(attribute);
        if (id) ids.push(id);
      }
      return ids;
    }, agent.ID_ATTRIBUTE);
  }

  /**
   * Descend from an overlay wrapper to the surface a designer would name.
   *
   * `harvestNewRoots` returns only top-most new elements, so a portal wrapper
   * that fills the viewport hides the dialog inside it — the capture then
   * records 1432x723 for a 750x261 composer, and both size rows in the evidence
   * card are wrong. If the pick is viewport-sized and holds a descendant with a
   * real overlay role, that descendant is the surface.
   */
  async refineSurface(rootId) {
    const refined = await this.page.evaluate(({ attribute, id }) => {
      const root = document.querySelector(`[${attribute}="${id}"]`);
      if (!root) return null;
      const rootRect = root.getBoundingClientRect();
      const rootArea = rootRect.width * rootRect.height;
      const viewportArea = innerWidth * innerHeight;
      // Only wrappers are worth descending from; a normal-sized surface is
      // already the answer.
      if (rootArea < viewportArea * 0.8) return null;

      const ROLES = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="tooltip"]';
      let best = null;
      for (const candidate of root.querySelectorAll(ROLES)) {
        const rect = candidate.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area < viewportArea * 0.01 || area > rootArea * 0.95) continue;
        if (!best || area > best.area) best = { element: candidate, area };
      }
      if (!best) return null;

      let refinedId = best.element.getAttribute(attribute);
      if (!refinedId) {
        refinedId = `refined-${Math.round(best.area)}`;
        best.element.setAttribute(attribute, refinedId);
      }
      return refinedId;
    }, { attribute: agent.ID_ATTRIBUTE, id: rootId });

    if (!refined) return null;
    return (await this.describeByIds([refined]))[0] ?? null;
  }

  /** Describe already-tagged elements by id, for the revealed-overlay path. */
  describeByIds(ids) {
    return this.page.evaluate(({ attribute, wanted }) => {
      const described = [];
      for (const id of wanted) {
        const element = document.querySelector(`[${attribute}="${id}"]`);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const parts = [];
        const walk = (node, depth) => {
          if (depth > 4 || parts.length > 220) return;
          parts.push(`${node.tagName}.${(typeof node.className === 'string' ? node.className : '').trim().split(/\s+/).slice(0, 2).join('.')}`);
          for (const child of node.children) walk(child, depth + 1);
        };
        walk(element, 0);
        const innerRole = element.querySelector('[role="menu"],[role="listbox"],[role="menubar"],[role="tree"],[role="grid"],[role="radiogroup"]')?.getAttribute('role')
          ?? (element.querySelector('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]') ? 'menu' : null)
          ?? (element.querySelector('[role="option"]') ? 'listbox' : null);
        described.push({
          id,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role') ?? (element.tagName === 'DIALOG' ? 'dialog' : null),
          innerRole,
          label: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          portalled: element.parentElement === document.body,
          revealed: true,
          hash: parts.join('|'),
        });
      }
      return described;
    }, { attribute: agent.ID_ATTRIBUTE, wanted: ids });
  }

  /**
   * Return the page to its resting state.
   *
   * Escalates: Escape (dismisses well-behaved overlays), then a click on an
   * inert corner, then a reload. Each step is verified against the baseline
   * signature — an unverified dismiss is how these crawlers silently corrupt
   * themselves and attribute one menu's styles to the next trigger.
   */
  async clearCrawlerResidue({ clearTags = false } = {}) {
    await this.page.evaluate(agent.clearCrawlerResidue, {
      clearTags,
      attribute: agent.ID_ATTRIBUTE,
    }).catch(() => {});
    // Forced :hover is often JS-driven too. Parking real input and blurring clears
    // what the page itself can clear; DevTools-only forced pseudo state belongs to
    // the CDP session that created it and cannot be cleared from another session.
    await this.page.mouse?.move?.(1, 1).catch(() => {});
  }

  async reset({ structured = false } = {}) {
    this.pendingFresh = new Set();
    const attempts = [];
    for (const attempt of ['escape', 'escape', 'corner']) {
      await this.clearCrawlerResidue();
      if (attempt === 'escape') await this.page.keyboard.press('Escape').catch(() => {});
      else await this.page.mouse.click(2, 2).catch(() => {});
      const stability = await this.settle(120, 1200);
      const comparison = await this.compareToBaseline();
      attempts.push({ method: attempt, stability, differences: comparison.differences });
      if (comparison.equal) {
        this.lastResetReport = { method: attempt, clean: true, attempts, differences: [] };
        return structured ? this.lastResetReport : attempt;
      }
    }

    let navigationError = null;
    await this.page.goto(this.baselineUrl, { waitUntil: 'domcontentloaded' })
      .catch((error) => { navigationError = String(error?.message ?? error); });
    const stability = await this.settle(300, 5000);
    await this.clearCrawlerResidue();
    // Reload creates a new document epoch. Take the clean reloaded state as the
    // next baseline, but preserve the pre-reload differences in the report.
    const beforeRebaseline = this.baselineSnapshot ? await this.compareToBaseline().catch(() => null) : null;
    // Re-baselining makes any post-reload state compare equal to itself, so the
    // comparison cannot answer whether the reset worked. A swallowed navigation
    // failure leaves the page exactly as dirty as it was and the old code still
    // reported clean:true. Overlay count is the only absolute criterion here, and
    // it is what `ensureClean` already uses.
    const remaining = await this.visibleOverlays().catch(() => []);
    await this.establishBaseline();
    attempts.push({ method: 'reload', stability, overlays: remaining, differences: beforeRebaseline?.differences ?? [] });
    this.lastResetReport = {
      method: 'reload',
      clean: !navigationError && remaining.length === 0,
      ...(navigationError ? { navigationError } : {}),
      ...(remaining.length ? { residualOverlays: remaining.slice(0, 8) } : {}),
      attempts,
      differences: beforeRebaseline?.differences ?? [],
    };
    return structured ? this.lastResetReport : 'reload';
  }

  /**
   * Reach a state with no overlay open, then take that as the baseline.
   *
   * `reset()` compares against a previously recorded signature, which is useless
   * when that baseline was itself recorded with something already open — it then
   * matches a dirty page and reports success. This uses an absolute criterion:
   * zero visible overlays, escalating to a reload, which is the only guaranteed
   * way back. Required before capturing an *opening* transition, since the
   * closed state is half of what is being measured.
   */
  async ensureClean({ maxAttempts = 3, structured = false } = {}) {
    const attempts = [];
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await this.clearCrawlerResidue();
      const overlays = await this.visibleOverlays();
      if (overlays.length === 0) {
        await this.establishBaseline();
        const method = attempt === 0 ? 'already-clean' : 'dismissed';
        this.lastResetReport = { method, clean: true, attempts, differences: [] };
        return structured ? this.lastResetReport : method;
      }
      await this.page.keyboard.press('Escape').catch(() => {});
      const stability = await this.settle(120, 1200);
      attempts.push({ method: 'escape', overlays, stability });
    }

    await this.page.goto(this.baselineUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const stability = await this.settle(300, 6000);
    await this.clearCrawlerResidue();
    const remaining = await this.visibleOverlays();
    await this.establishBaseline();
    this.lastResetReport = {
      method: 'reloaded',
      clean: remaining.length === 0,
      attempts: [...attempts, { method: 'reload', overlays: remaining, stability }],
      differences: remaining.length ? [{ path: 'surfaces', expected: [], actual: remaining }] : [],
    };
    return structured ? this.lastResetReport : 'reloaded';
  }

  /**
   * Bake `grid-template-columns: subgrid` into explicit tracks before serializing.
   *
   * A subgrid has no columns of its own — it borrows its parent's. Serializing
   * one *out of its layout context*, which is exactly what capturing a component
   * means, drops the tracks: every cell falls into a single implicit column and
   * the component renders as a vertical stack. Nothing errors, and the reference
   * screenshot still looks perfect because the browser rendered it in place, so
   * the frames reach Paper broken and look measured.
   *
   * That is how thirteen Linear issue-row frames were imported stacked. The row is
   * `subgrid` and inherits `[indent] 8px [checkbox] 18px [priority] 16px
   * [identifier] 50px [status] 16px [title] 937px [createdAt] 60px [end-padding]
   * 18px` from a grid four ancestors up.
   *
   * Resolving reads the nearest non-subgrid grid ancestor's *computed* tracks —
   * already absolute pixels — and writes them onto every subgrid in the captured
   * subtree as an inline style, so the fragment lays itself out standalone.
   * Returns a restore function; the page must not be left mutated.
   */
  async #resolveSubgrid(specId, selector) {
    this.#subgridTransaction += 1;
    const result = await this.page.evaluate(agent.resolveSubgrids, {
      attribute: agent.ID_ATTRIBUTE,
      targetSpecId: specId ?? null,
      targetSelector: specId ? null : selector,
      token: `driver-${this.#subgridTransaction}`,
    });
    let restored = false;
    return {
      resolved: result?.resolved ?? 0,
      restore: async () => {
        if (restored || !result?.resolved) return 0;
        restored = true;
        return this.page.evaluate(agent.restoreSubgrids, { records: result.records });
      },
    };
  }

  /**
   * Serialize a subtree using the extension's own serializer.
   *
   * The extension returns three things under confusing names: `rawHtml` is the
   * inline-styled markup, `html` is that same markup wrapped as a JSX component
   * for an LLM, and `capturedAnimationsStyle` holds the @keyframes blocks.
   * Paper's paste path is `capturedAnimationsStyle + rawHtml` — matching
   * background.js exactly, so a crawled frame pastes identically to a
   * hand-captured one.
   */
  async serialize(specId) {
    this.#serializerSource ??= loadSerializerSource();
    const selector = specId ? `[${agent.ID_ATTRIBUTE}="${specId}"]` : 'body';
    const subgrid = await this.#resolveSubgrid(specId, selector);
    let result;
    let serializationError = null;
    try {
      result = await this.page.evaluate(
        async ([source, target]) => {
          const factory = new Function(`${source}; return elementSerializer;`);
          return factory()(target);
        },
        [this.#serializerSource, selector],
      );
    } catch (error) {
      serializationError = error;
    } finally {
      try {
        await subgrid.restore();
      } catch (restoreError) {
        if (!serializationError) serializationError = restoreError;
      }
    }
    if (serializationError) throw serializationError;

    if (result?.status !== 'success') {
      throw new Error(`Serializer failed for ${selector}: ${result?.error ?? result?.status ?? 'unknown'}`);
    }
    return {
      paperHtml: (result.capturedAnimationsStyle || '') + result.rawHtml,
      jsx: result.html,
    };
  }

  /**
   * Draw the trigger box, the surface box, and the anchor relationship onto the
   * live page so the next screenshot carries them.
   *
   * A bare context screenshot shows a menu somewhere on a page; it does not say
   * which control opened it or how it is positioned. An implementing agent then
   * guesses at placement. Annotating in-page (rather than compositing after)
   * keeps it in the same coordinate space as the pixels, with no image library.
   */
  async annotate({ triggerId, surfaceId, anchor, label }) {
    await this.page.evaluate(({ attribute, trigger, surface, meta }) => {
      const layer = document.createElement('div');
      layer.id = '__spec_annotations__';
      Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });

      const box = (element, color, text) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const frame = document.createElement('div');
        Object.assign(frame.style, {
          position: 'fixed', left: `${rect.x}px`, top: `${rect.y}px`,
          width: `${rect.width}px`, height: `${rect.height}px`,
          outline: `2px solid ${color}`, outlineOffset: '1px', borderRadius: '3px',
        });
        const tag = document.createElement('div');
        tag.textContent = text;
        Object.assign(tag.style, {
          position: 'fixed', left: `${rect.x}px`, top: `${Math.max(0, rect.y - 20)}px`,
          font: '600 11px ui-monospace, monospace', color: '#fff', background: color,
          padding: '2px 6px', borderRadius: '3px', whiteSpace: 'nowrap',
        });
        layer.append(frame, tag);
      };

      box(document.querySelector(`[${attribute}="${trigger}"]`), '#e5484d', 'trigger');
      box(document.querySelector(`[${attribute}="${surface}"]`), '#3e63dd', meta ? `surface · ${meta}` : 'surface');
      document.body.appendChild(layer);
    }, {
      attribute: agent.ID_ATTRIBUTE,
      trigger: triggerId ?? null,
      surface: surfaceId ?? null,
      meta: label ?? (anchor ? `${anchor.side}/${anchor.align} gap ${anchor.gap}px` : null),
    });
  }

  clearAnnotations() {
    return this.page.evaluate(() => document.getElementById('__spec_annotations__')?.remove());
  }

  /** Install the in-page animation recorder. Call immediately before triggering. */
  startAnimationRecorder(maxMs = 2000) {
    return this.page.evaluate(agent.startAnimationRecorder, { attribute: agent.ID_ATTRIBUTE, maxMs });
  }

  /** Wait for the recorder to finish, then drain it. */
  async readAnimationRecorder(maxMs = 2000) {
    // Reading a partial recording is the right call — a truncated sample is still
    // evidence. Reading it WITHOUT saying it was truncated is not: the analyser
    // reports frame counts and durations from a subset exactly as it would from a
    // complete run, so a clipped recording becomes a confident short duration.
    let truncated = false;
    await this.page.waitForFunction(() => window.__specAnimation?.done === true, null, { timeout: maxMs + 1500 })
      .catch(() => { truncated = true; });
    const recording = await this.page.evaluate(agent.readAnimationRecorder);
    return truncated ? { ...recording, truncated: true, truncatedAfterMs: maxMs + 1500 } : recording;
  }

  async screenshot(specId) {
    if (!specId) return this.page.screenshot({ type: 'png' });
    const handle = await this.page.$(`[${agent.ID_ATTRIBUTE}="${specId}"]`);
    if (!handle) return this.page.screenshot({ type: 'png' });
    return handle.screenshot({ type: 'png' }).catch(() => this.page.screenshot({ type: 'png' }));
  }

  /** Run the Tier 1 static CSS-state scan in the page. */
  async cssSpec(specId) {
    const source = readFileSync(path.join(REPO_ROOT, 'interaction-spec.js'), 'utf8')
      .replace(/^export function/m, 'function')
      .replace(/^if \(typeof window[\s\S]*$/m, '');
    return this.page.evaluate(
      ([code, attribute, target]) => {
        const root = target ? document.querySelector(`[${attribute}="${target}"]`) : document;
        const factory = new Function(`${code}; return captureInteractionSpec;`);
        const result = factory()(root ?? document);
        // Element handles can't cross the evaluate boundary; swap in the id.
        return {
          ...result,
          components: result.components.map(({ element, ...rest }) => ({
            ...rest,
            id: element.getAttribute(attribute),
          })),
        };
      },
      [source, agent.ID_ATTRIBUTE, specId ?? null],
    );
  }
}
