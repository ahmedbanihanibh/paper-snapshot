/**
 * Functions that run *inside* the page.
 *
 * Each is passed whole to page.evaluate(), so they must be self-contained —
 * no imports, no closure over module scope. They communicate through
 * `data-spec-id` attributes, which give elements a stable identity across
 * evaluate boundaries (a DOM node reference can't cross that boundary, and
 * CSS-path selectors break the moment a portal re-renders).
 */

/** Attribute used to identify elements across evaluate calls. */
export const ID_ATTRIBUTE = 'data-spec-id';

/**
 * Tag every currently-untagged element and return the tags assigned.
 * Run once at baseline, then again after each interaction — anything that
 * comes back the second time is, by definition, new DOM.
 */
export function tagElements(attribute) {
  const fresh = [];
  let counter = Number(document.documentElement.dataset.specCounter ?? '0');
  for (const element of document.querySelectorAll('*')) {
    if (element.hasAttribute(attribute)) continue;
    counter += 1;
    const id = `s${counter}`;
    element.setAttribute(attribute, id);
    fresh.push(id);
  }
  document.documentElement.dataset.specCounter = String(counter);
  return fresh;
}

/**
 * Reduce a set of newly-tagged ids to the top-most elements among them.
 *
 * A freshly opened menu tags dozens of nodes; we only want the menu root.
 * An element is a root if no ancestor is also in the new set.
 */
export function newRoots(attribute, freshIds) {
  const fresh = new Set(freshIds);
  const roots = [];

  for (const id of fresh) {
    const element = document.querySelector(`[${attribute}="${id}"]`);
    if (!element) continue;

    let ancestor = element.parentElement;
    let nested = false;
    while (ancestor) {
      if (fresh.has(ancestor.getAttribute(attribute))) { nested = true; break; }
      ancestor = ancestor.parentElement;
    }
    if (nested) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue; // measurement shims, focus traps

    const styles = getComputedStyle(element);
    if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue;

    roots.push({
      id,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') ?? (element.tagName === 'DIALOG' ? 'dialog' : null),
      label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 120),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      // Portalled overlays attach near the end of <body>; in-flow content doesn't.
      portalled: element.parentElement === document.body,
      // Structural fingerprint, so the same menu opened from three places is
      // captured once. Text is excluded — the same menu with different item
      // labels is still the same component.
      hash: (() => {
        const parts = [];
        const walk = (node, depth) => {
          if (depth > 4 || parts.length > 220) return;
          parts.push(`${node.tagName}.${(typeof node.className === 'string' ? node.className : '').trim().split(/\s+/).slice(0, 2).join('.')}`);
          for (const child of node.children) walk(child, depth + 1);
        };
        walk(element, 0);
        return parts.join('|');
      })(),
    });
  }
  return roots;
}

/**
 * Interactive elements worth clicking, in visual order.
 *
 * Deliberately broad — an app like Linear drives most of its surfaces off
 * generic divs with ARIA rather than <button>. The cost of a false positive is
 * one wasted click; the cost of a false negative is a missing spec mode.
 */
export function collectTriggers({ attribute, denyPattern, scopeId, include, exclude, excludeArea, includeArea }) {
  const CANDIDATES = [
    '[aria-haspopup]', '[aria-expanded]', '[popovertarget]', 'summary',
    'button', '[role="button"]', '[role="tab"]', '[role="combobox"]',
    '[role="menuitem"]', '[role="switch"]', '[role="checkbox"]', 'select',
    // Selectable rows: clicking one either navigates (recorded as a route) or
    // reveals a selection surface. Both are spec modes worth having.
    '[role="option"]', '[aria-selected]',
  ].join(',');

  const deny = denyPattern ? new RegExp(denyPattern, 'i') : null;
  const seen = new Set();
  const triggers = [];

  // Crawling *inside* an open surface means only its own controls count; the
  // page behind it is a different level of the tree.
  //
  // `include`/`exclude` are the region controls: an open overlay always wins
  // (scopeId), but at the page level a run can be confined to the content area
  // and kept out of navigation chrome. Label-based deny cannot express "not the
  // sidebar" — every nav item has a different label.
  let scope = scopeId ? document.querySelector(`[${attribute}="${scopeId}"]`) : document;
  if (!scopeId && include) scope = document.querySelector(include) ?? scope;
  if (!scope) return [];

  // Role- and tag-based discovery misses whole sections of real apps: Linear's
  // sidebar rows are plain divs with click handlers and no ARIA at all, so a
  // scoped crawl there finds one trigger and reports the section as inert.
  // `cursor: pointer` is the author telling the user it is clickable, which is
  // the same claim ARIA would make.
  const clickable = [];
  for (const element of scope.querySelectorAll('div,span,li,a')) {
    if (element.matches(CANDIDATES)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 12 || rect.height < 12) continue;
    if (getComputedStyle(element).cursor !== 'pointer') continue;
    // Keep the outermost pointer element of a nested run, not every layer.
    if (element.parentElement && getComputedStyle(element.parentElement).cursor === 'pointer'
      && scope.contains(element.parentElement)) continue;
    clickable.push(element);
  }

  for (const element of [...scope.querySelectorAll(CANDIDATES), ...clickable]) {
    const id = element.getAttribute(attribute);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    // Exclusions apply even inside an overlay: a portalled menu can still
    // contain a region the caller ruled out.
    if (exclude) { try { if (element.closest(exclude)) continue; } catch { /* bad selector */ } }

    // Geometric inclusion, for virtualized lists. A sidebar section is often a
    // *band* of rows in one flat positioned list rather than a subtree — Linear's
    // Favorites has no container of its own — so a selector cannot express it and
    // only a rect can.
    if (includeArea) {
      const box = element.getBoundingClientRect();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const [ix1, iy1, ix2, iy2] = includeArea;
      if (cx < ix1 || cx > ix2 || cy < iy1 || cy > iy2) continue;
    }

    // Geometric exclusion, for apps with no semantic landmarks to select.
    // Linear renders its whole shell as unlabelled divs, so "stay out of the
    // sidebar" can only be expressed as a box. Tested against the trigger's
    // centre so a wide element straddling the boundary is judged by where it
    // actually sits.
    if (excludeArea) {
      const box = element.getBoundingClientRect();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const [x1, y1, x2, y2] = excludeArea;
      if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) continue;
    }

    if (element.disabled || element.getAttribute('aria-disabled') === 'true') continue;

    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const styles = getComputedStyle(element);
    if (styles.visibility === 'hidden' || styles.display === 'none') continue;

    const label = (element.getAttribute('aria-label') || element.title || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (deny && deny.test(label)) continue;

    triggers.push({
      id,
      label,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      hasPopup: element.getAttribute('aria-haspopup'),
      expanded: element.getAttribute('aria-expanded'),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    });
  }
  return triggers.sort((left, right) => (left.rect.y - right.rect.y) || (left.rect.x - right.rect.x));
}

/**
 * Resolve when the DOM has stopped changing.
 *
 * Overlays animate in; serializing mid-transition captures a half-faded frame
 * with wrong opacity and transform. Waiting for a quiet period is more reliable
 * than a fixed sleep because it adapts to slow and fast machines alike.
 */
export function settle(quietMs, timeoutMs) {
  return new Promise((resolve) => {
    let timer;
    const deadline = setTimeout(() => { observer.disconnect(); clearTimeout(timer); resolve('timeout'); }, timeoutMs);
    const done = () => { observer.disconnect(); clearTimeout(deadline); resolve('quiet'); };
    const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, quietMs); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    timer = setTimeout(done, quietMs);
  });
}

/**
 * A cheap fingerprint of "what is on screen", used to confirm we returned to
 * baseline.
 *
 * Overlays are counted only when *visible*. Counting elements present in the
 * DOM cannot tell open from closed in any app that pre-renders its overlays and
 * toggles visibility — which is the common case, and the one `harvestSurfaces`
 * exists to handle. With a presence count, `reset()` declares success while a
 * menu is still open, and the next capture is attributed to the wrong trigger.
 */
export function pageSignature(attribute) {
  const candidates = document.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[role="alertdialog"],dialog[open],[data-state="open"],[aria-modal="true"]');
  let visible = 0;
  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    const styles = getComputedStyle(element);
    if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue;
    visible += 1;
  }
  return `${document.querySelectorAll('*').length}:${visible}:${location.pathname}`;
}

/**
 * Last-resort click: dispatch the full pointer sequence by hand.
 *
 * Two reasons this exists rather than calling `element.click()`:
 * SVG and other non-HTML elements have no `.click()` method at all (Linear's
 * sidebar triggers are icons), and menus that open on `pointerdown` never see a
 * bare click event. Dispatching the real sequence on EventTarget covers both.
 */
export function clickById({ attribute, id }) {
  const element = document.querySelector(`[${attribute}="${id}"]`);
  if (!element) return false;
  element.scrollIntoView({ block: 'center', behavior: 'instant' });

  const rect = element.getBoundingClientRect();
  const base = {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2,
    button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true,
  };

  const fire = (Ctor, type, extra) => {
    try { element.dispatchEvent(new Ctor(type, { ...base, ...extra })); } catch { /* older event ctor */ }
  };

  fire(PointerEvent, 'pointerover', { buttons: 0 });
  fire(PointerEvent, 'pointerenter', { buttons: 0 });
  fire(MouseEvent, 'mouseover', { buttons: 0 });
  fire(PointerEvent, 'pointerdown', { buttons: 1 });
  fire(MouseEvent, 'mousedown', { buttons: 1 });
  fire(PointerEvent, 'pointerup', { buttons: 0 });
  fire(MouseEvent, 'mouseup', { buttons: 0 });
  fire(MouseEvent, 'click', { buttons: 0 });
  return true;
}

/** Compact map of the page for an agent to reason about, without shipping raw HTML. */
export function describePage(attribute) {
  // Selectable rows/cards are a first-class category, not an afterthought: apps
  // like Linear render issue cards as `div[aria-selected][tabindex]`, so a
  // button-centric query returns a page with no content in it.
  const interesting = document.querySelectorAll([
    'button', '[role="button"]', '[role="tab"]', '[role="menuitem"]',
    '[role="dialog"]', '[role="menu"]', '[role="listbox"]', '[role="toolbar"]',
    '[role="option"]', '[role="row"]', '[role="gridcell"]', '[role="treeitem"]',
    'a[href]', 'input', 'textarea', 'select',
    '[aria-haspopup]', '[aria-expanded]', '[aria-selected]', '[aria-checked]',
    '[data-state]', '[tabindex]:not([tabindex="-1"])',
  ].join(','));
  const items = [];
  for (const element of interesting) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.bottom < 0 || rect.top > innerHeight * 2) continue;
    items.push({
      id: element.getAttribute(attribute),
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') ?? undefined,
      state: element.getAttribute('data-state') ?? undefined,
      expanded: element.getAttribute('aria-expanded') ?? undefined,
      selected: element.getAttribute('aria-selected') ?? undefined,
      label: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    });
    if (items.length >= 400) break;
  }
  return { url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight }, items };
}

/**
 * Install an animation recorder, then leave it running.
 *
 * Recording must start *before* the trigger fires: a CSS transition is already
 * mid-flight by the time a CDP click round-trips back, and its first frames —
 * the ones that carry the entry curve — are gone. So this is installed first,
 * the click happens separately, and the results are read afterwards.
 *
 * Two things are gathered every frame:
 *  - `document.getAnimations()` — declared timing and keyframes, covering CSS
 *    transitions, CSS animations and WAAPI alike.
 *  - computed transform/opacity plus the bounding rect of every animated
 *    element. The rect matters: a minimize/maximize is usually a FLIP, where
 *    real geometry changes and the library animates the delta. Transform values
 *    alone replay at the wrong size.
 */
export function startAnimationRecorder({ attribute, maxMs }) {
  const state = { samples: [], declared: [], startedAt: performance.now(), done: false };
  window.__specAnimation = state;

  const seen = new WeakSet();
  const tracked = new Map(); // element -> id
  // Properties to sample per element, learned from each animation's own
  // keyframes. Sampling a fixed transform/opacity pair misses everything else an
  // app animates — clip-path, filter, background, custom properties — and then
  // reports "no numeric change" for an animation that plainly moved.
  const watched = new Map(); // id -> Set<css property>
  const toKebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const IGNORED = new Set(['composite', 'computedOffset', 'easing', 'offset']);

  const describe = (element) => {
    if (!element || !element.getAttribute) return null;
    let id = element.getAttribute(attribute);
    if (!id) { id = `anim-${tracked.size + 1}`; element.setAttribute(attribute, id); }
    return id;
  };

  const frame = () => {
    const now = performance.now() - state.startedAt;

    for (const animation of document.getAnimations()) {
      if (!seen.has(animation)) {
        seen.add(animation);
        const effect = animation.effect;
        const target = effect?.target ?? null;
        const id = describe(target);
        if (id && target) tracked.set(target, id);
        let keyframes = [];
        try { keyframes = effect?.getKeyframes?.() ?? []; } catch { /* cross-origin or detached */ }

        if (id) {
          const properties = watched.get(id) ?? new Set(['transform', 'opacity']);
          for (const keyframe of keyframes) {
            for (const key of Object.keys(keyframe)) {
              if (IGNORED.has(key)) continue;
              properties.add(toKebab(key));
            }
          }
          watched.set(id, properties);
        }
        state.declared.push({
          at: Math.round(now),
          id,
          type: animation.constructor?.name ?? 'Animation',
          // CSSTransition exposes which property it drives; CSSAnimation the name.
          property: animation.transitionProperty ?? null,
          animationName: animation.animationName ?? null,
          timing: effect?.getTiming ? { ...effect.getTiming() } : null,
          computedTiming: effect?.getComputedTiming ? (({ duration, delay, endTime, activeDuration, easing, iterations, fill }) => ({
            // `duration` is `'auto'` for CSS animations and may arrive as a
            // non-plain value; a raw copy serialises across evaluate as `{}`.
            duration: typeof duration === 'number' ? duration : Number(duration) || null,
            delay: Number(delay) || 0,
            endTime: Number(endTime) || null,
            activeDuration: Number(activeDuration) || null,
            easing, iterations, fill,
          }))(effect.getComputedTiming()) : null,
          keyframes: keyframes.map((k) => ({ ...k })),
        });
      }
    }

    if (tracked.size) {
      const entry = { t: Math.round(now * 100) / 100, nodes: {} };
      for (const [element, id] of tracked) {
        const styles = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const props = {};
        for (const property of watched.get(id) ?? ['transform', 'opacity']) {
          props[property] = styles.getPropertyValue(property);
        }
        // Which properties this element genuinely transitions, straight from the
        // element. Everything else that changes is a consequence of layout, and
        // a clone that drives a consequence directly applies it instantly —
        // which is how a maximize animation ends up jumping to full height on
        // frame one.
        const transition = {
          property: styles.transitionProperty,
          duration: styles.transitionDuration,
          easing: styles.transitionTimingFunction,
          delay: styles.transitionDelay,
        };
        // The box constraints in effect *at this instant*. Endpoint values say
        // what animates; only the live constraints say which element's box the
        // animation actually controls. A `min-height` that equals the element's
        // rendered height mid-transition is driving it; the same value on a
        // child is merely being pushed. Capturing this per frame is what makes
        // ownership decidable from one recording instead of a re-run.
        const constraints = {
          minHeight: styles.minHeight, maxHeight: styles.maxHeight,
          minWidth: styles.minWidth, maxWidth: styles.maxWidth,
          flex: styles.flex, overflow: styles.overflow, boxSizing: styles.boxSizing,
        };
        entry.nodes[id] = {
          transform: styles.transform,
          opacity: styles.opacity,
          props,
          transition,
          constraints,
          rect: { x: +rect.x.toFixed(2), y: +rect.y.toFixed(2), w: +rect.width.toFixed(2), h: +rect.height.toFixed(2) },
        };
      }
      state.samples.push(entry);
    }

    const running = document.getAnimations().some((a) => a.playState === 'running');
    if (now > maxMs || (now > 120 && !running && state.samples.length > 4)) { state.done = true; return; }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  return true;
}

/** Drain the recorder installed by startAnimationRecorder. */
export function readAnimationRecorder() {
  const state = window.__specAnimation;
  if (!state) return null;
  delete window.__specAnimation;
  return { declared: state.declared, samples: state.samples, done: state.done };
}
