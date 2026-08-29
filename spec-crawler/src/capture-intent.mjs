/**
 * Intent-level capture, for an agent that is looking at the page rather than
 * scripting it.
 *
 * The existing tools are primitives — click(specId), hover(specId),
 * capture_state(specId, name, notes). An agent driving those is writing the same
 * script by another name: it must first learn spec ids, then drive the
 * precondition itself, then hand-write what it measured. That is why every
 * capture session so far needed a human in the loop composing steps.
 *
 * These take coordinates instead, because coordinates are the one vocabulary a
 * vision-driven agent already has. It points at pixels; elementFromPoint turns
 * that into a node; everything downstream is DOM work the agent never sees.
 *
 * The knowledge that used to live in a person's head lives here instead:
 *
 *   - park the pointer OUTSIDE the component's scroll container before capturing
 *     "rest", and verify it actually cleared — apps commonly keep the last
 *     hovered row marked until the pointer leaves the whole list, so a rest
 *     capture taken just below the last row is really the hover state;
 *   - use a real pointer, not forced pseudo-states, when an app drives state
 *     through data attributes rather than :hover — forcing :hover on those
 *     changes literally nothing and the capture looks fine;
 *   - resolve `subgrid` before serializing, or the component lays out as a
 *     vertical stack once it is outside its parent grid;
 *   - prove which state you reached by reading it back, never by assuming the
 *     input took.
 *
 * Each of those cost a wrong answer at least once. Encoded here they cost
 * nothing again.
 */

import * as pageAgent from './page-agent.mjs';
import {
  TargetLeaseError,
  acquireTargetLease,
  getTargetLease,
} from './target.mjs';

/** Attributes that carry interaction state. Identity attributes are excluded on
 *  purpose: per-row uuids would make every row its own component. */
export const STATE_ATTRIBUTES = [
  'data-state', 'data-active', 'data-selected', 'data-apply-background',
  'data-keyboard-active', 'data-first-selected', 'data-last-selected',
  'data-first-in-group', 'data-last-in-group', 'data-highlighted',
  'data-disabled', 'data-checked', 'aria-expanded', 'aria-selected',
  'aria-checked', 'aria-current', 'aria-pressed', 'open',
];

const SPEC_ID = 'data-spec-id';

/**
 * Turn a point into a component.
 *
 * `elementFromPoint` lands on whatever leaf is under the cursor — a span inside a
 * label inside the thing you meant. Walking up to a *boundary* is what makes the
 * result the component the agent was pointing at rather than a fragment of it.
 *
 * The boundary heuristic prefers, in order: an explicit landmark (role, href,
 * data-list-row), then the last ancestor that still shares the leaf's width,
 * then the leaf. Sharing width is the useful signal — a row's text span is 300px
 * inside a 1179px row, and the row is what you want.
 */
export async function resolveComponentAt(driver, x, y, { specId = null, expect = null } = {}) {
  try {
    const lease = await acquireTargetLease(driver, {
      x,
      y,
      expect,
      assignedSpecId: specId,
    });
    // Preserve the original plain-object return contract. The live lease is kept
    // in target.mjs's page-local registry and is revalidated by every later step.
    return { ...lease.snapshot, label: lease.snapshot.label.slice(0, 60) };
  } catch (error) {
    if (!(error instanceof TargetLeaseError)) throw error;
    return {
      error: error.message,
      code: error.code,
      reason: error.reason,
      resolvedLabel: error.evidence?.resolved?.label?.slice?.(0, 60),
    };
  }
}

/**
 * Guarantee the tag is still on a live element, re-resolving from the point if not.
 *
 * A spec id is an attribute on a DOM node, and a virtualised list throws its nodes
 * away constantly — Linear recycles rows on any re-render, scroll or data tick. So
 * between two calls the tagged element can simply cease to exist, and every read
 * after that returns null while looking exactly like "the component has no styles".
 * Observed as an annotation that silently came back empty.
 *
 * Coordinates survive what node references do not, which is the same reason this
 * module takes them in the first place. Keeping the point lets any lost tag be
 * re-earned instead of failing.
 */
export async function ensureTagged(driver, specId, x, y, { expect = null } = {}) {
  let lease = getTargetLease(driver, specId);
  if (!lease) {
    // Direct callers can still recover, but must now supply the expectation that
    // prevents a stale coordinate from silently becoming a different component.
    lease = await acquireTargetLease(driver, {
      x,
      y,
      expect,
      assignedSpecId: specId,
    });
    return { specId, reResolved: true, lease: lease.snapshot };
  }
  const before = lease.snapshot.rect;
  const current = await lease.ensureTagged();
  return {
    specId,
    reResolved: current.via !== 'spec-id' || JSON.stringify(current.rect) !== JSON.stringify(before),
    lease: current,
  };
}

/**
 * Serialize, re-asserting the tag immediately beforehand and retrying once.
 *
 * `serialize` resolves the tag itself, inside the extension's serializer, so it
 * is a second independent chance for a recycled node to have taken the tag with
 * it — and it fails hard ("Element not found") rather than returning empty.
 * Re-asserting is cheap; losing a driven state because a list ticked is not,
 * because re-reaching a state costs far more than re-tagging.
 */
export async function serializeStable(driver, specId, x, y) {
  await ensureTagged(driver, specId, x, y);
  try {
    return await driver.serialize(specId);
  } catch (error) {
    if (!/not found/i.test(String(error?.message))) throw error;
    await ensureTagged(driver, specId, x, y);
    return driver.serialize(specId);
  }
}

/**
 * Bake `subgrid` into explicit tracks, with line names and the inherited gap.
 *
 * A subgrid borrows its parent's columns. Serialized on its own it has none, so
 * every cell auto-flows into one implicit column and the component renders as a
 * vertical stack — while the reference screenshot stays perfect, because the
 * browser rendered it in place. Thirteen frames reached Paper stacked this way.
 *
 * Two details that are not optional. Line names are load-bearing: cells place by
 * name (`grid-column-start: title`), so a nameless track list resolves no
 * placement at all. And gaps are inherited alongside the tracks — dropping them
 * butts the cells together.
 *
 * Returns a restore function; the live page must not be left mutated.
 */
let subgridTransaction = 0;

export async function resolveSubgrid(driver, specId) {
  subgridTransaction += 1;
  const result = await driver.page.evaluate(pageAgent.resolveSubgrids, {
    attribute: SPEC_ID,
    targetSpecId: specId ?? null,
    token: `intent-${subgridTransaction}`,
  });
  if (!result?.resolved) return { resolved: 0, restore: async () => 0 };
  let restored = false;
  return {
    resolved: result.resolved,
    restore: async () => {
      if (restored) return 0;
      restored = true;
      return driver.page.evaluate(pageAgent.restoreSubgrids, { records: result.records });
    },
  };
}

/**
 * The measured half of an annotation.
 *
 * An agent can describe how it got somewhere — that is its own action trail, and
 * it is the half a person otherwise reconstructs badly. What it cannot do is read
 * a pseudo-element's fill or a resolved grid track, because none of that reaches
 * a screenshot or an accessibility tree. So the agent supplies intent and path,
 * and this supplies everything a screenshot loses. Neither half can fake the
 * other, which is the property worth keeping.
 */
export async function measuredAnnotation(driver, specId, { x = null, y = null, expect = null } = {}) {
  await ensureTagged(driver, specId, x, y, { expect });
  return driver.page.evaluate(
    ({ specId, attribute, stateAttrs }) => {
      // The TargetLease was revalidated immediately before this read. If the
      // element disappears in the narrow gap, return null rather than resolving
      // the coordinate without identity evidence and measuring the wrong row.
      const el = document.querySelector(`[${attribute}="${specId}"]`);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const styles = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');

      const paint = (pseudo, label) => (pseudo.content !== 'none' && pseudo.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ? `${label} ${pseudo.backgroundColor}${pseudo.opacity !== '1' ? ` @ opacity ${pseudo.opacity}` : ''}`
        : null);

      let grid = null;
      if (styles.display.includes('grid')) {
        grid = { tracks: styles.gridTemplateColumns, columnGap: styles.columnGap };
      }

      return {
        rect: { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1) },
        background: styles.backgroundColor,
        color: styles.color,
        borderRadius: styles.borderRadius,
        font: `${styles.fontSize} / ${styles.lineHeight} ${styles.fontWeight} ${styles.fontFamily.split(',')[0]}`,
        boxShadow: styles.boxShadow === 'none' ? null : styles.boxShadow,
        border: styles.borderWidth === '0px' ? null : `${styles.borderWidth} ${styles.borderStyle} ${styles.borderColor}`,
        pseudoPaint: [paint(before, '::before'), paint(after, '::after')].filter(Boolean),
        grid,
        stateAttributes: Object.fromEntries(
          stateAttrs.filter((name) => el.hasAttribute(name)).map((name) => [name, el.getAttribute(name)]),
        ),
      };
    },
    { specId, attribute: SPEC_ID, stateAttrs: STATE_ATTRIBUTES },
  );
}

/** Render the measured block as the text that goes into a Paper frame description. */
export function formatAnnotation(measured, { why, path } = {}) {
  if (!measured) return why ?? '';
  const lines = [];
  if (why) lines.push(why.trim());
  if (path) lines.push(`REACHED BY: ${path.trim()}`);
  lines.push(`MEASURED: ${measured.rect.width}x${measured.rect.height} at (${measured.rect.x}, ${measured.rect.y}).`);
  if (measured.background !== 'rgba(0, 0, 0, 0)') lines.push(`background ${measured.background}`);
  if (measured.pseudoPaint.length) lines.push(`pseudo-element paint: ${measured.pseudoPaint.join('; ')} — this is invisible to a screenshot and to the accessibility tree.`);
  if (measured.borderRadius !== '0px') lines.push(`radius ${measured.borderRadius}`);
  if (measured.border) lines.push(`border ${measured.border}`);
  if (measured.boxShadow) lines.push(`shadow ${measured.boxShadow}`);
  lines.push(`type ${measured.font}`);
  if (measured.grid) lines.push(`GRID tracks ${measured.grid.tracks}${measured.grid.columnGap !== 'normal' ? `, column-gap ${measured.grid.columnGap}` : ''} — resolved from subgrid at capture time so the frame lays out standalone.`);
  const state = Object.entries(measured.stateAttributes);
  if (state.length) lines.push(`STATE ATTRIBUTES ${state.map(([k, v]) => `${k}=${v}`).join(', ')} — this component expresses state through attributes, so a CSS :hover rule will not reproduce it.`);
  return lines.join(' ');
}

/**
 * Find a pointer position that genuinely clears hover.
 *
 * Moving "off the element" is not enough. An app can keep the last hovered row
 * marked until the pointer leaves the entire list, so parking just below the last
 * row still reports hover — and a rest capture taken there is silently the hover
 * state. Two identical frames is the *good* outcome; the bad one is a rest frame
 * that is really hover and nobody notices.
 *
 * So: try candidates, and verify against the element rather than trusting the move.
 */
export async function parkPointer(driver, specId) {
  const viewport = driver.page.viewportSize() ?? { width: 1280, height: 720 };
  const candidates = [
    { x: 4, y: Math.round(viewport.height / 2) },
    { x: Math.round(viewport.width - 4), y: 4 },
    { x: 4, y: 4 },
  ];
  for (const point of candidates) {
    await driver.page.mouse.move(point.x, point.y);
    await driver.page.waitForTimeout(320);
    const stillActive = await driver.page.evaluate(
      ({ specId, attribute, stateAttrs }) => {
        const el = document.querySelector(`[${attribute}="${specId}"]`);
        if (!el) return false;
        if (el.matches(':hover')) return true;
        return stateAttrs.some((name) => el.getAttribute(name) === 'true');
      },
      { specId, attribute: SPEC_ID, stateAttrs: ['data-active', 'data-apply-background', 'data-highlighted'] },
    );
    if (!stillActive) return { ...point, cleared: true };
  }
  return { ...candidates[0], cleared: false };
}

/**
 * Drive a component through the states a pointer can reach, and keep only the
 * ones that actually differ.
 *
 * Deliberately does NOT invent app-specific states. Selection, keyboard cursors
 * and expansion need domain knowledge — `x` selects a row in one app and deletes
 * it in another. What it does instead is report which state attributes the
 * component carries, so the agent can see what else exists and drive those
 * itself. Guessing at them is how a crawler destroys a workspace.
 *
 * Every state is verified by reading back a computed-style fingerprint. A state
 * that produced no visible change is reported as such rather than captured,
 * because a bundle of identical frames is worse than an honest gap.
 */
export async function driveStateMatrix(driver, specId) {
  const fingerprint = () => driver.page.evaluate(
    ({ specId, attribute, stateAttrs }) => {
      const el = document.querySelector(`[${attribute}="${specId}"]`);
      if (!el) return null;
      const styles = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const rect = el.getBoundingClientRect();
      return [
        styles.backgroundColor, styles.color, styles.opacity, styles.boxShadow,
        styles.borderColor, styles.borderRadius, styles.transform,
        before.backgroundColor, before.opacity,
        `${rect.width}x${rect.height}`,
        stateAttrs.map((name) => `${name}=${el.getAttribute(name) ?? ''}`).join(','),
      ].join('|');
    },
    { specId, attribute: SPEC_ID, stateAttrs: STATE_ATTRIBUTES },
  );

  const box = await driver.page.evaluate(
    ({ specId, attribute }) => {
      const el = document.querySelector(`[${attribute}="${specId}"]`);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
    },
    { specId, attribute: SPEC_ID },
  );
  if (!box) throw new Error(`capture_state_matrix: ${specId} is no longer in the DOM.`);

  const results = [];

  const park = await parkPointer(driver, specId);
  const restPrint = await fingerprint();
  results.push({ state: 'rest', changed: true, print: restPrint, note: park.cleared
    ? `pointer parked at (${park.x}, ${park.y}), verified clear`
    : `WARNING: could not clear hover from any park position — this "rest" frame may be the hover state` });

  await driver.page.mouse.move(box.cx, box.cy);
  await driver.page.waitForTimeout(360);
  const hoverPrint = await fingerprint();
  results.push({ state: 'hover', changed: hoverPrint !== restPrint, print: hoverPrint,
    note: hoverPrint === restPrint ? 'no visible change on hover' : 'real pointer, not a forced pseudo-state' });

  await driver.page.mouse.down();
  await driver.page.waitForTimeout(160);
  const activePrint = await fingerprint();
  await driver.page.mouse.up();
  results.push({ state: 'active', changed: activePrint !== hoverPrint, print: activePrint,
    note: 'pointer held down; released immediately after reading' });

  await parkPointer(driver, specId);
  await driver.page.evaluate(
    ({ specId, attribute }) => document.querySelector(`[${attribute}="${specId}"]`)?.focus?.(),
    { specId, attribute: SPEC_ID },
  );
  await driver.page.waitForTimeout(240);
  const focusPrint = await fingerprint();
  results.push({ state: 'focus', changed: focusPrint !== restPrint, print: focusPrint,
    note: 'programmatic focus; may differ from :focus-visible after real keyboard entry' });

  await parkPointer(driver, specId);
  return { states: results, availableStateAttributes: (await measuredAnnotation(driver, specId))?.stateAttributes ?? {} };
}
