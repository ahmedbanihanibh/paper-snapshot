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
  return driver.page.evaluate(
    ({ x, y, attribute, assigned, expect }) => {
      const leaf = document.elementFromPoint(x, y);
      if (!leaf) return { error: `nothing at (${x}, ${y}) — the point is over a gap or outside the viewport` };

      const landmark = leaf.closest('[data-list-row],[role="row"],[role="option"],[role="menuitem"],[role="dialog"],[role="listitem"],a[href],li,button');
      let chosen = landmark ?? leaf;

      if (!landmark) {
        // Widen while the ancestor is still visually the same object.
        let node = leaf;
        const leafRect = leaf.getBoundingClientRect();
        while (node.parentElement) {
          const parentRect = node.parentElement.getBoundingClientRect();
          const grew = parentRect.width > leafRect.width * 4 || parentRect.height > leafRect.height * 4;
          if (grew) break;
          node = node.parentElement;
        }
        chosen = node;
      }

      const label = (chosen.getAttribute('aria-label') || chosen.innerText || '').trim().replace(/\s+/g, ' ');

      // The staleness guard. A coordinate captured a moment ago may now point at
      // a different element because the page scrolled or re-rendered. Without a
      // check, elementFromPoint resolves SOMETHING and it measures cleanly —
      // confident, wrong output, which is the exact failure this whole tool is
      // meant to prevent. `expect` (a substring of the label, a tag, or an
      // attribute selector) turns that silent miss into a loud refusal.
      if (expect) {
        const matches = label.toLowerCase().includes(expect.toLowerCase())
          || chosen.tagName.toLowerCase() === expect.toLowerCase()
          || ((() => { try { return chosen.matches(expect); } catch { return false; } })());
        if (!matches) {
          return { error: `point (${x}, ${y}) resolved to <${chosen.tagName.toLowerCase()}> "${label.slice(0, 50)}", which does not match expect="${expect}". The layout moved — re-read coordinates and retry.`, resolvedLabel: label.slice(0, 60) };
        }
      }

      chosen.setAttribute(attribute, assigned);
      const rect = chosen.getBoundingClientRect();
      const styles = getComputedStyle(chosen);
      return {
        specId: assigned,
        tag: chosen.tagName.toLowerCase(),
        via: landmark ? 'landmark' : 'width-boundary',
        label: label.slice(0, 60),
        rect: { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1) },
        display: styles.display,
        href: chosen.getAttribute('href'),
      };
    },
    { x, y, attribute: SPEC_ID, assigned: specId ?? `pt${Date.now().toString(36)}`, expect },
  );
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
export async function ensureTagged(driver, specId, x, y) {
  // Check AND re-tag in one evaluate. Doing it as two calls does not close the
  // race, it only moves it: a check that passes can be followed by a recycle
  // before the read, and re-tagging in one call then reading in the next landed
  // the tag on a *different row* — which measures cleanly and is simply wrong.
  const result = await driver.page.evaluate(
    ({ specId, attribute, x, y }) => {
      if (document.querySelector(`[${attribute}="${specId}"]`)) return { ok: true, reResolved: false };
      const leaf = document.elementFromPoint(x, y);
      if (!leaf) return { ok: false };
      const el = leaf.closest('[data-list-row],[role="row"],[role="option"],[role="menuitem"],[role="dialog"],[role="listitem"],a[href],li') ?? leaf;
      el.setAttribute(attribute, specId);
      return { ok: true, reResolved: true };
    },
    { specId, attribute: SPEC_ID, x, y },
  );
  if (!result.ok) throw new Error(`Component at (${x}, ${y}) was re-rendered away and nothing is there now. If the page is still settling, wait and retry; if the layout moved, point again.`);
  return { specId, reResolved: result.reResolved };
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
export async function resolveSubgrid(driver, specId) {
  const touched = await driver.page.evaluate(
    ({ specId, attribute }) => {
      const root = specId ? document.querySelector(`[${attribute}="${specId}"]`) : document.body;
      if (!root) return 0;
      const targets = [root, ...root.querySelectorAll('*')]
        .filter((el) => getComputedStyle(el).gridTemplateColumns.startsWith('subgrid'));

      let count = 0;
      for (const el of targets) {
        // `display: contents` ancestors sit in this chain and must be walked
        // through, not stopped at.
        let ancestor = el.parentElement;
        let source = null;
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          if (style.display.includes('grid')
              && !style.gridTemplateColumns.startsWith('subgrid')
              && style.gridTemplateColumns !== 'none') { source = style; break; }
          ancestor = ancestor.parentElement;
        }
        if (!source) continue;
        el.dataset.specSubgridPrev = el.style.cssText;
        el.style.gridTemplateColumns = source.gridTemplateColumns;
        if (source.columnGap && source.columnGap !== 'normal') el.style.columnGap = source.columnGap;
        count += 1;
      }
      return count;
    },
    { specId, attribute: SPEC_ID },
  );

  if (!touched) return { resolved: 0, restore: async () => {} };
  return {
    resolved: touched,
    restore: () => driver.page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-spec-subgrid-prev]')) {
        el.style.cssText = el.dataset.specSubgridPrev;
        delete el.dataset.specSubgridPrev;
      }
    }),
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
export async function measuredAnnotation(driver, specId, { x = null, y = null } = {}) {
  return driver.page.evaluate(
    ({ specId, attribute, stateAttrs, x, y }) => {
      // Resolve and measure in ONE page call. Re-tagging in a previous call and
      // reading in this one still races a live app: Linear recycled the row
      // between the two, so the tag pointed at a different issue and the read
      // came back null while looking like "this component has no styles".
      // Anything that must agree with the tag has to happen inside one evaluate.
      let el = document.querySelector(`[${attribute}="${specId}"]`);
      if (!el && x !== null && y !== null) {
        const leaf = document.elementFromPoint(x, y);
        el = leaf?.closest('[data-list-row],[role="row"],[role="option"],[role="menuitem"],[role="dialog"],[role="listitem"],a[href],li') ?? leaf;
        if (el) el.setAttribute(attribute, specId);
      }
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
    { specId, attribute: SPEC_ID, stateAttrs: STATE_ATTRIBUTES, x, y },
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
