/**
 * Hover reveals — tooltips, in-row affordances, submenus.
 *
 * These are the states a crawler structurally cannot reach and a subtree capture
 * structurally cannot contain:
 *
 *   - a tooltip portals far outside its target and only appears after the
 *     pointer has *rested* for several hundred milliseconds, so settling on DOM
 *     mutations returns long before it exists;
 *   - an in-row affordance (a `+` that appears on hover) is often a sibling
 *     rather than a child, so screenshotting the row misses it;
 *   - a submenu needs a second dwell on an item inside the first surface.
 *
 * All three are found the same way: snapshot what is visible page-wide, hover,
 * wait past the delay, snapshot again, and diff. That diff — rather than any
 * selector guess — is what identifies the revealed surface, exactly as it does
 * for drag overlays.
 */

import * as agent from './page-agent.mjs';

const MIN_AREA = 80;

/** Everything currently visible, keyed by spec id. Tags first so ids exist. */
async function visibilityMap(driver) {
  await driver.page.evaluate(agent.tagElements, agent.ID_ATTRIBUTE);
  return driver.page.evaluate(({ attribute, minArea }) => {
    const map = {};
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const rect = element.getBoundingClientRect();
      if (rect.width * rect.height < minArea) continue;
      const styles = getComputedStyle(element);
      if (styles.display === 'none' || styles.visibility === 'hidden' || Number(styles.opacity) < 0.05) continue;
      map[element.getAttribute(attribute)] = {
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height),
      };
    }
    return map;
  }, { attribute: agent.ID_ATTRIBUTE, minArea: MIN_AREA });
}

/** Reduce revealed ids to their outermost elements, and describe each. */
async function rollUp(driver, ids, targetId) {
  if (!ids.length) return [];
  return driver.page.evaluate(({ attribute, revealed, target }) => {
    const set = new Set(revealed);
    const roots = [];
    for (const id of set) {
      const element = document.querySelector(`[${attribute}="${id}"]`);
      if (!element) continue;
      let ancestor = element.parentElement;
      let nested = false;
      while (ancestor) {
        if (set.has(ancestor.getAttribute(attribute))) { nested = true; break; }
        ancestor = ancestor.parentElement;
      }
      if (nested) continue;

      const rect = element.getBoundingClientRect();
      const host = target ? document.querySelector(`[${attribute}="${target}"]`) : null;
      const text = (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      roots.push({
        id,
        role: element.getAttribute('role') ?? null,
        label: text,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        // Distinguishes a tooltip or menu from an affordance that appeared
        // inside the row: they need different treatment when implemented.
        insideTarget: !!(host && host.contains(element)),
        portalled: element.parentElement === document.body,
      });
    }
    return roots.sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
  }, { attribute: agent.ID_ATTRIBUTE, revealed: ids, target: targetId ?? null });
}

/**
 * Hover a target, wait past the reveal delay, and report everything that appeared.
 *
 * @param {object} driver
 * @param {{targetId?: string, point?: {x: number, y: number}, dwellMs?: number}} options
 */
export async function captureReveal(driver, { targetId, point, dwellMs = 900 } = {}) {
  const before = await visibilityMap(driver);

  let at = point;
  if (!at && targetId) {
    const handle = await driver.page.$(`[data-spec-id="${targetId}"]`);
    const box = handle && await handle.boundingBox();
    if (!box) throw new Error(`Reveal target ${targetId} not found.`);
    at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  if (!at) throw new Error('captureReveal needs a targetId or point.');

  await driver.page.mouse.move(at.x, at.y);
  // Deliberately a fixed dwell, not a settle: a tooltip's delay is a timer that
  // has not fired yet, so waiting for the DOM to go quiet returns immediately
  // and reports nothing revealed.
  await new Promise((resolve) => setTimeout(resolve, dwellMs));

  const after = await visibilityMap(driver);
  const appeared = Object.keys(after).filter((id) => !before[id]);
  const surfaces = await rollUp(driver, appeared, targetId);

  return {
    target: targetId ?? at,
    dwellMs,
    surfaces,
    // A submenu can be a single short row, so height is a poor discriminator.
    // Role first, then "an outside surface that is not a tooltip".
    tooltip: surfaces.find((s) => !s.insideTarget && s.role !== 'menu' && s.rect.width < 400 && s.rect.height < 60) ?? null,
    affordance: surfaces.find((s) => s.insideTarget) ?? null,
    menu: surfaces.find((s) => s.role === 'menu' || s.role === 'listbox')
      ?? surfaces.find((s) => !s.insideTarget && s.rect.height >= 32 && s.rect.width >= 90) ?? null,
  };
}

/**
 * Reveal, then reveal again from something inside the first surface.
 *
 * Submenus need a second dwell on an item within the parent menu; the parent
 * must stay open throughout, so the pointer travels item-to-item rather than
 * returning to rest.
 */
export async function captureRevealChain(driver, { steps = [], dwellMs = 900 } = {}) {
  const results = [];
  for (const step of steps) {
    const reveal = await captureReveal(driver, { ...step, dwellMs: step.dwellMs ?? dwellMs });
    results.push(reveal);
    // The next step is located inside what this one revealed.
    if (step.then) {
      const scope = reveal.menu ?? reveal.surfaces[0];
      if (!scope) break;
      const nextId = await driver.page.evaluate(({ attribute, scopeId, text }) => {
        const host = document.querySelector(`[${attribute}="${scopeId}"]`);
        const match = [...(host?.querySelectorAll('*') ?? [])].find((e) => (e.textContent || '').trim() === text && e.children.length <= 2);
        return match?.getAttribute(attribute) ?? null;
      }, { attribute: agent.ID_ATTRIBUTE, scopeId: scope.id, text: step.then });
      if (nextId) steps.push({ targetId: nextId });
    }
  }
  return results;
}
