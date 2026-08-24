/**
 * `captureState` — the one path a state reaches the bundle by.
 *
 * There were five: plain state, coordinate/intent, state-matrix entry,
 * component/overlay, hover-reveal. They agreed on nothing. Two recorded a rect
 * and three did not, so three kinds of frame reached Paper at 800x600. One
 * resolved subgrid and restored it in a `finally`, one resolved it and restored
 * it only on the happy path, three never resolved it at all. One released a held
 * mouse button. None of them checked that the thing they measured was still the
 * thing they serialized.
 *
 * Those are not five bugs to fix five times. They are one missing seam. Every
 * kind now differs only in what it passes in — which subject, which action to
 * drive, which extra shots — and the invariants live once, in
 * `withCaptureTransaction`, where they cannot be forgotten by the sixth caller.
 */

import { formatAnnotation, parkPointer } from './capture-intent.mjs';
import { CaptureError, withCaptureTransaction } from './capture-transaction.mjs';
import { sha256 } from './hashes.mjs';
import { TARGET_ID_ATTRIBUTE } from './target.mjs';

/**
 * The dedupe key: structure joined with what the subject paints.
 *
 * Kept as one opaque digest because that is what `Bundle.seen()` and the legacy
 * `hash` record field already are. Bundles captured before this change carry
 * topology-only hashes; they simply will not collide with new ones, which is the
 * safe direction — a re-capture writes a state rather than silently skipping it.
 */
async function stateIdentity(tx, driver) {
  const structural = await driver.structuralHash?.(tx.specId ?? null);
  if (!structural) return null;
  const paint = await tx.paintSignature();
  // NUL separates the two layers because neither can contain one, so no structure
  // string can be suffixed into colliding with a structure-plus-paint pair.
  return sha256(paint ? `${structural}\u0000${paint}` : structural);
}

/**
 * Capture one state.
 *
 * @param {object} options
 * @param {object} options.driver              SpecDriver
 * @param {object} options.bundle              Bundle
 * @param {string} options.name                state name; becomes part of the artifact id
 * @param {string} [options.kind]
 * @param {number} [options.tier]
 * @param {Array}  [options.path]              the record's crawl path (not the prose reach trail)
 * @param {string} [options.notes]             used when there is no measurement to format
 * @param {string} [options.why]               the agent's half: what this component is
 * @param {string} [options.reachedBy]         the agent's half: how this state was reached
 * @param {string} [options.specId]            subject; omit with x/y to resolve from a point
 * @param {number} [options.x]
 * @param {number} [options.y]
 * @param {string} [options.expect]            required with x/y — guards a stale coordinate
 * @param {Function} [options.action]          drives the state between the two stability waits
 * @param {boolean} [options.pointerHeld]      the action leaves the button down
 * @param {boolean} [options.dedupe]           skip a structurally identical state (default true)
 * @param {{triggerId?: string, surfaceId?: string, anchor?: object, label?: string}} [options.annotate]
 *        draw the trigger/surface relationship and keep an annotated context shot
 * @param {boolean} [options.cssSpec]          attach the Tier 1 CSS-state matrix
 * @param {object} [options.shots]             extra pre-captured shots, e.g. `{ context }`
 * @param {object} [options.state]             extra record fields (trigger, animation, …)
 * @returns {Promise<object>} `{ ok: true, record, … }`, `{ ok: true, duplicate: true, existingId }`,
 *                            or `{ ok: false, code, stage, evidence }`
 */
export async function captureState(options = {}) {
  const {
    driver,
    bundle,
    name,
    kind = 'agent-captured',
    tier = 3,
    level,
    path: statePath = [],
    notes = null,
    why = null,
    reachedBy = null,
    specId = null,
    x = null,
    y = null,
    expect = null,
    action = null,
    pointerHeld = false,
    recorder = false,
    forcedState = null,
    subgrid = true,
    volatile: volatileRegions = [],
    stability = {},
    oracle = null,
    preconditions = [],
    dedupe = true,
    hash: hashOverride,
    annotate = null,
    cssSpec = false,
    shots: extraShots = null,
    state: extraState = {},
    serializeSpecId,
    screenshotSpecId,
  } = options;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return new CaptureError('captureState needs a name; the artifact id is derived from it.', {
      code: 'ERR_CAPTURE_USAGE', stage: 'precondition',
    }).toResult();
  }

  return withCaptureTransaction({
    driver,
    bundle,
    target: { specId, x, y, expect },
    preconditions,
    action,
    stability,
    oracle,
    subgrid,
    pointerHeld,
    annotations: Boolean(annotate),
    recorder,
    forcedState,
    volatile: volatileRegions,
  }, async (tx) => {
    // Measure before serializing. Measuring after subgrid resolution is what makes
    // the annotation report real pixel tracks rather than the literal "subgrid".
    const measured = await tx.measure();
    const rect = await tx.rect();

    // Identity is topology *and* paint. `structuralHash` alone reports rest and
    // hover as the same state whenever the app styles hover in CSS rather than
    // with a data attribute, and the matrix then skips the hover frame with
    // "structurally identical to a state already captured".
    const hash = hashOverride !== undefined
      ? hashOverride
      : await stateIdentity(tx, driver);
    if (dedupe && hash && bundle.seen?.(hash)) {
      const existing = bundle.states?.find?.((candidate) => candidate.hash === hash);
      return {
        duplicate: true,
        existingId: existing?.id ?? null,
        hash,
        message: 'This exact structure and state is already captured; nothing was written.',
      };
    }

    const frame = await tx.serialize(serializeSpecId === undefined ? tx.specId : serializeSpecId);
    const surface = await tx.screenshot(screenshotSpecId === undefined ? tx.specId : screenshotSpecId);

    const shots = { surface, ...(extraShots ?? {}) };
    if (annotate) {
      await driver.annotate({
        triggerId: annotate.triggerId ?? null,
        surfaceId: annotate.surfaceId ?? tx.specId ?? null,
        anchor: annotate.anchor ?? null,
        label: annotate.label ?? null,
      });
      shots.context = await driver.screenshot();
      // Cleared here as well as in the transaction's cleanup: the overlay is a
      // child of <body>, so leaving it up until `finally` would read as page-level
      // drift on a whole-page capture.
      await driver.clearAnnotations();
    }

    const cssStates = cssSpec
      ? await driver.cssSpec(tx.specId ?? null).catch(() => undefined)
      : undefined;

    const annotation = measured && (why || reachedBy)
      ? formatAnnotation(measured, { why, path: reachedBy })
      : notes;

    return {
      state: {
        name,
        tier,
        kind,
        ...(level === undefined ? {} : { level }),
        path: statePath,
        ...(annotation ? { notes: annotation } : {}),
        ...(hash ? { hash } : {}),
        ...(cssStates ? { cssStates: { components: cssStates.components.length, stateNames: cssStates.stateNames } } : {}),
        // Recorded on the state, not just returned: a later verification run has
        // to mask the same pixels this capture agreed to ignore, and it has only
        // the manifest to learn that from.
        ...(tx.volatile.length ? { volatile: tx.volatile } : {}),
        ...extraState,
        rect: extraState.rect ?? rect,
      },
      frame,
      shots,
      cssStates,
      extra: { measured, rect, ...(tx.volatile.length ? { volatile: tx.volatile } : {}) },
    };
  });
}

/**
 * The pointer sequence that reaches one CSS state, as an action for `captureState`.
 *
 * `rest` is a park-and-verify rather than a move-away: an app can keep the last
 * hovered row marked until the pointer leaves the whole list, so a "rest" frame
 * taken just below it is silently the hover frame.
 */
export function pointerStateAction(state, { dwellMs = 320 } = {}) {
  return async ({ driver, specId }) => {
    if (state === 'rest') return { state, park: await parkPointer(driver, specId) };
    if (state === 'focus') {
      const park = await parkPointer(driver, specId);
      await driver.page.evaluate(
        ({ id, attribute }) => document.querySelector(`[${attribute}="${id}"]`)?.focus?.(),
        { id: specId, attribute: TARGET_ID_ATTRIBUTE },
      );
      await driver.page.waitForTimeout(240);
      return { state, park };
    }
    const box = await driver.page.evaluate(({ id, attribute }) => {
      const element = document.querySelector(`[${attribute}="${id}"]`);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
    }, { id: specId, attribute: TARGET_ID_ATTRIBUTE });
    if (!box) throw new CaptureError(`Cannot drive "${state}": ${specId} is not in the document.`, {
      code: 'ERR_CAPTURE_SUBJECT_MISSING', stage: 'action', evidence: { specId, state },
    });
    await driver.page.mouse.move(box.cx, box.cy);
    await driver.page.waitForTimeout(dwellMs);
    if (state === 'active') {
      await driver.page.mouse.down();
      await driver.page.waitForTimeout(140);
    }
    return { state, at: box };
  };
}

/** True when this state's action leaves the mouse button held down. */
export const pointerStateHoldsButton = (state) => state === 'active';

export { CaptureError, withCaptureTransaction };
