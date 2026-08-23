/**
 * Tier 2 — autonomous surface discovery, to configurable depth.
 *
 * Depth 1 captures overlays opened from the page. Depth 2 also captures what
 * lives *inside* them — a dialog's buttons and dropdowns. Depth 3 goes one
 * further. Deterministic throughout, so it runs as one call rather than as
 * hundreds of agent round-trips.
 *
 * Reaching a nested state is done by replaying its path from a clean baseline
 * rather than by trying to unwind. Escape inside a dropdown frequently closes
 * the whole dialog, so "go back one level" is not a reliable primitive; "start
 * over and redo N clicks" is. It costs clicks and buys determinism.
 */

/**
 * Triggers whose labels indicate they destroy the thing being crawled.
 *
 * Not a safety mechanism — the target is a disposable workspace. It exists
 * because a crawler that deletes the board on click 12 has nothing left to
 * crawl for clicks 13-200.
 */
export const DEFAULT_DENY = '\\b(delete|remove|archive|trash|sign out|log ?out|leave|cancel subscription|revoke|reset)\\b';

/**
 * Identity that survives a reload.
 *
 * spec-ids are assigned per page load, and this crawl causes plenty of
 * navigation, so a list captured up front goes stale. Position is deliberately
 * excluded — it shifts with scroll. Ordinal among identical labels
 * disambiguates instead.
 */
export const keyedList = (list) => {
  const counts = new Map();
  return list.map((trigger) => {
    const base = `${trigger.tag}|${trigger.role ?? ''}|${trigger.label}`;
    const ordinal = counts.get(base) ?? 0;
    counts.set(base, ordinal + 1);
    return { ...trigger, key: `${base}|${ordinal}` };
  });
};

/**
 * What kind of surface this is, from the strongest evidence available.
 *
 * The container's own role is the *weakest* signal: Radix — and Linear, which
 * builds on the same pattern — renders every popover with `role="dialog"`
 * whatever it holds, so a dropdown of menu items reports as a dialog. The
 * trigger's `aria-haspopup` is the author stating outright what it opens, and a
 * descendant `role="menu"`/`listbox` is direct structural evidence. Both beat
 * the wrapper.
 *
 * This matters downstream: kind decides which primitive the surface maps to,
 * and a menu implemented as a dialog is the wrong component.
 */
export function classify(surface, trigger) {
  const declared = trigger?.hasPopup;
  // Per ARIA, aria-haspopup="true" means a menu.
  const fromTrigger = declared === 'true' ? 'menu' : (declared && declared !== 'false' ? declared : null);

  const kind = fromTrigger
    ?? surface.innerRole
    ?? surface.role
    ?? (surface.portalled ? 'overlay' : 'inline');

  return {
    kind,
    roleEvidence: {
      triggerHasPopup: declared ?? null,
      innerRole: surface.innerRole ?? null,
      containerRole: surface.role ?? null,
    },
  };
}

/**
 * How a surface is positioned relative to the control that opened it.
 *
 * The single most useful fact for reimplementing a popover: side, alignment and
 * gap are exactly the props a Popper/Floating-UI call takes. Two rects in a JSON
 * file leave that to be re-derived by hand every time.
 */
function anchorOf(triggerRect, surfaceRect) {
  if (!triggerRect || !surfaceRect) return null;
  const below = surfaceRect.y >= triggerRect.y + triggerRect.height - 4;
  const above = surfaceRect.y + surfaceRect.height <= triggerRect.y + 4;
  const side = below ? 'bottom' : above ? 'top' : (surfaceRect.x >= triggerRect.x + triggerRect.width - 4 ? 'right' : 'left');

  const startDelta = Math.abs(surfaceRect.x - triggerRect.x);
  const endDelta = Math.abs((surfaceRect.x + surfaceRect.width) - (triggerRect.x + triggerRect.width));
  const centreDelta = Math.abs((surfaceRect.x + surfaceRect.width / 2) - (triggerRect.x + triggerRect.width / 2));
  const align = Math.min(startDelta, endDelta, centreDelta) === startDelta ? 'start'
    : (Math.min(endDelta, centreDelta) === endDelta ? 'end' : 'center');

  const gap = side === 'bottom' ? surfaceRect.y - (triggerRect.y + triggerRect.height)
    : side === 'top' ? triggerRect.y - (surfaceRect.y + surfaceRect.height)
    : side === 'right' ? surfaceRect.x - (triggerRect.x + triggerRect.width)
    : triggerRect.x - (surfaceRect.x + surfaceRect.width);

  return { side, align, gap: Math.round(gap), triggerRect, surfaceRect };
}

/** The overlay among the harvested roots; siblings are usually backdrops and focus guards. */
const pickSurface = (roots) => roots
  .filter((root) => root.portalled || root.role)
  .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))[0] ?? roots[0];

export async function crawlOverlays(driver, bundle, options = {}) {
  const {
    deny = DEFAULT_DENY,
    limit = Infinity,
    depth = 1,
    scanStates = true,
    debugInert = false,
    region = null,
    shots = 'context',
    onProgress = () => {},
  } = options;

  // Sticky for the whole run, so every re-enumeration after a navigation stays
  // inside the requested area rather than quietly reverting to the full page.
  if (region) driver.setRegion(region);

  await driver.establishBaseline();
  const initial = await driver.triggers(deny);
  const report = {
    depth,
    region: driver.region ?? null,
    triggersFound: initial.length,
    captured: 0,
    duplicates: 0,
    navigations: [],
    inert: 0,
    inertDetail: [],
    failures: [],
    byLevel: {},
  };

  const rootBudget = Math.min(initial.length, limit);
  const visited = new Set();
  let rootsVisited = 0;

  /** Drive the page to the state named by `path`, returning the scope to crawl within. */
  async function replayPath(path) {
    await driver.reset();
    let scopeId = null;
    for (const key of path) {
      const trigger = keyedList(await driver.triggers(deny, scopeId)).find((candidate) => candidate.key === key);
      if (!trigger) return { ok: false };
      if (!await driver.clickById(trigger.id)) return { ok: false };
      await driver.settle();
      const surface = pickSurface(await driver.harvestSurfaces());
      if (!surface) return { ok: false };
      scopeId = surface.id;
    }
    return { ok: true, scopeId };
  }

  /**
   * Crawl every trigger reachable at `path`.
   * @param {string[]} path trigger keys from the root
   * @param {number} level 0 for the page itself
   */
  async function crawlLevel(path, level) {
    if (level >= depth) return;

    const entry = await replayPath(path);
    if (!entry.ok) return;

    const triggers = keyedList(await driver.triggers(deny, entry.scopeId));
    const children = [];

    for (const trigger of triggers) {
      const pathKey = [...path, trigger.key].join(' > ');
      if (visited.has(pathKey)) continue;
      if (level === 0) {
        if (rootsVisited >= rootBudget) break;
        rootsVisited += 1;
      }
      visited.add(pathKey);

      let inFlight = trigger;
      try {
        // Re-enter the parent state before every click. Capturing a surface
        // leaves the page somewhere unknown, and only a replay guarantees the
        // next click starts from the state this level actually describes.
        const restored = await replayPath(path);
        if (!restored.ok) break;

        // Ids are per page load; re-resolve this trigger in the restored DOM.
        const live = keyedList(await driver.triggers(deny, restored.scopeId)).find((candidate) => candidate.key === trigger.key);
        if (!live) continue;
        inFlight = live;

        onProgress({ level, path, trigger: live.label || live.tag, captured: report.captured });

        // Taken before the click: afterwards the trigger may be covered by the
        // very surface it opened, or re-rendered out of existence.
        const triggerShot = shots !== 'minimal' ? await driver.screenshot(live.id).catch(() => null) : null;
        const beforeShot = shots === 'all' ? await driver.screenshot().catch(() => null) : null;

        if (!await driver.clickById(live.id)) {
          report.inert += 1;
          report.inertDetail.push({ level, path, trigger: live.label, reason: 'unclickable' });
          continue;
        }

        await driver.settle();

        if (driver.page.url() !== driver.baselineUrl) {
          report.navigations.push({ level, from: live.label, url: driver.page.url() });
          continue;
        }

        let roots = await driver.harvestSurfaces();
        // Nothing yet usually means slow, not dead — heavy composers and modals
        // routinely outrun the first settle window.
        if (roots.length === 0) {
          await driver.settle(250, live.hasPopup ? 4000 : 1500);
          roots = await driver.harvestSurfaces();
        }

        if (roots.length === 0) {
          report.inert += 1;
          const detail = { level, path, trigger: live.label, role: live.role, hasPopup: live.hasPopup, reason: 'no-new-or-revealed-surface' };
          if (debugInert) detail.debugShot = await bundle.addDebugShot(live.label || live.id, await driver.screenshot());
          report.inertDetail.push(detail);
          continue;
        }

        const surface = pickSurface(roots);

        // An in-flow element with no overlay role and a tiny box is a
        // re-rendered icon, not a surface worth a frame. Anything carrying a
        // real overlay role is kept regardless of size.
        const substantial = surface.role || (surface.rect.width >= 60 && surface.rect.height >= 32);
        if (!substantial) {
          report.inert += 1;
          report.inertDetail.push({ level, path, trigger: live.label, reason: 'surface-too-small', rect: surface.rect });
          continue;
        }

        if (bundle.seen(surface.hash)) {
          report.duplicates += 1;
          // Still worth descending: the same menu opened from a new place can
          // expose different children. Only the frame is redundant.
          if (level + 1 < depth) children.push(trigger.key);
          continue;
        }

        const classified = classify(surface, live);

        const frame = await driver.serialize(surface.id);
        const surfaceShot = await driver.screenshot(surface.id);
        // The whole viewport with the surface open — the only artifact showing
        // anchoring, backdrop, and what it overlaps.
        const anchor = anchorOf(live.rect, surface.rect);
        let contextShot = null;
        if (shots !== 'minimal') {
          await driver.annotate({ triggerId: live.id, surfaceId: surface.id, anchor }).catch(() => {});
          contextShot = await driver.screenshot().catch(() => null);
          await driver.clearAnnotations().catch(() => {});
        }

        // Scoped to the open surface, so the dialog's own buttons finally exist
        // in the DOM to be scanned. The root-level scan cannot see them.
        const states = scanStates ? await driver.cssSpec(surface.id).catch(() => undefined) : undefined;

        bundle.add({
          // The trigger's accessible name ("Create new issue") is a far better
          // identifier than the surface's textContent, which sweeps up every
          // string inside it ("showing-all-itemsffai-filteradvanced...").
          name: live.label || surface.role || 'surface',
          tier: 2,
          level,
          path,
          kind: classified.kind,
          roleEvidence: classified.roleEvidence,
          detectedBy: surface.revealed ? 'revealed' : 'mounted',
          trigger: { label: live.label, role: live.role, hasPopup: live.hasPopup },
          rect: surface.rect,
          anchor,
          hash: surface.hash,
          cssStates: states ? { components: states.components.length, stateNames: states.stateNames } : undefined,
        }, frame, { surface: surfaceShot, context: contextShot, trigger: triggerShot, before: beforeShot }, states);

        report.captured += 1;
        report.byLevel[level] = (report.byLevel[level] ?? 0) + 1;

        if (level + 1 < depth) children.push(trigger.key);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        // A context destroyed mid-evaluate means the click navigated away.
        // That is a route finding, not a failure.
        if (/Execution context was destroyed|Target closed|frame was detached/i.test(message)) {
          report.navigations.push({ level, from: inFlight?.label ?? null, url: driver.page.url() });
        } else {
          report.failures.push({ level, trigger: inFlight?.label ?? null, error: message });
        }
        await driver.reset().catch(() => {});
      }
    }

    // Descend only after this level is fully enumerated, so the trigger list
    // isn't being re-derived from a page that a nested crawl has moved.
    for (const key of children) {
      await crawlLevel([...path, key], level + 1);
    }
  }

  await crawlLevel([], 0);
  await driver.reset().catch(() => {});

  if (rootBudget < initial.length) {
    report.truncated = `Stopped at ${rootBudget} of ${initial.length} root triggers (limit).`;
  }
  return report;
}
