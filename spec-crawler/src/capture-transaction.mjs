/**
 * The transactional envelope every capture runs inside.
 *
 * A capture is not one call. It is a precondition, a wait, a lease, a page
 * mutation, three reads that must describe the same instant, and five undos that
 * must happen whether or not any of it worked. Written inline — which is how
 * every capture handler was written — each of those is one `await` that some
 * error path skips, and the failures are all of the same silent shape:
 *
 *   - `subgrid.restore()` skipped on a throw leaves the *live page* carrying
 *     inline grid tracks the app never wrote; every later capture inherits them;
 *   - `mouse.up()` skipped after an `active` state turns every subsequent move
 *     into a drag, so the next frame is a page mid-gesture that looks fine;
 *   - a virtualised row recycled between `measure` and `serialize` produces an
 *     annotation describing row A beside markup of row B, and both look right;
 *   - a state written with no rect makes the Paper importer fall back to 800x600,
 *     which is how three full-page frames landed at the wrong size.
 *
 * None of those throw. All of them commit. So this module owns the ordering and
 * the undo stack, refuses to commit anything it cannot evidence, and returns a
 * structured failure rather than a plausible success.
 *
 * Cleanup is a LIFO stack and always runs, in reverse of acquisition:
 *
 *   acquire  recorder -> forced-state -> pointer -> annotations -> subgrid
 *   release  subgrid  -> annotations  -> pointer -> forced-state -> recorder
 *
 * Subgrid is released first because it is the only one that rewrote the DOM the
 * other undos are about to be observed against.
 */

import {
  ensureTagged,
  measuredAnnotation,
  resolveSubgrid,
  serializeStable,
} from './capture-intent.mjs';
import { StabilityOracle } from './stability.mjs';
import {
  TARGET_ID_ATTRIBUTE,
  TargetLeaseError,
  acquireTargetLease,
  getTargetLease,
} from './target.mjs';

/** Acquisition order. Cleanup is the exact reverse and is asserted in tests. */
export const CLEANUP_SEQUENCE = Object.freeze([
  'recorder',
  'forced-state',
  'pointer',
  'annotations',
  'subgrid',
]);

/** Stages, in the order a capture passes through them. Reported on failure. */
export const CAPTURE_STAGES = Object.freeze([
  'precondition',
  'stability-before',
  'target',
  'action',
  'stability-after',
  'subgrid',
  'fingerprint',
  'capture',
  'drift',
  'validate',
  'commit',
]);

export class CaptureError extends Error {
  constructor(message, { code = 'ERR_CAPTURE_FAILED', stage = 'capture', evidence = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CaptureError';
    this.code = code;
    this.stage = stage;
    this.evidence = evidence;
  }

  /** The structured failure object. Never thrown across the module boundary. */
  toResult() {
    return { ok: false, code: this.code, stage: this.stage, message: this.message, evidence: this.evidence };
  }
}

function failure(error, stage) {
  if (error instanceof CaptureError) return error.toResult();
  if (error instanceof TargetLeaseError) {
    return {
      ok: false,
      code: error.code,
      stage,
      message: error.message,
      evidence: { reason: error.reason, ...(error.evidence ? { target: error.evidence } : {}) },
    };
  }
  return {
    ok: false,
    code: 'ERR_CAPTURE_FAILED',
    stage,
    message: String(error?.message ?? error),
    evidence: { name: error?.name ?? 'Error', stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 6).join('\n') : null },
  };
}

/**
 * Read everything that would make a later measurement describe a different
 * subject than an earlier one.
 *
 * Deliberately excludes viewport position and document scroll. Playwright's
 * element screenshot scrolls its target into view, so x/y legitimately move
 * *because we captured*; treating that as drift would reject every capture below
 * the fold. Size, identity, paint and state attributes do not move on their own.
 */
function readFingerprint({ specId, attribute, stateAttrs, includeEpoch = true }) {
  const element = specId
    ? document.querySelector(`[${attribute}="${String(specId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`)
    : document.documentElement;
  if (!element) return { present: false, signature: 'absent' };

  const round = (value) => Math.round(value * 10) / 10;
  const rect = element.getBoundingClientRect();
  const styles = getComputedStyle(element);
  const before = getComputedStyle(element, '::before');
  const after = getComputedStyle(element, '::after');
  const text = String(element.textContent ?? '').trim().replace(/\s+/g, ' ');

  let digest = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    digest ^= text.charCodeAt(index);
    digest = Math.imul(digest, 0x01000193);
  }

  const parts = [
    element.tagName.toLowerCase(),
    element.id || '',
    element.getAttribute('role') || '',
    (digest >>> 0).toString(16),
    element.childElementCount,
    `${round(rect.width)}x${round(rect.height)}`,
    styles.display, styles.visibility, styles.opacity, styles.transform,
    styles.backgroundColor, styles.color, styles.borderColor, styles.borderWidth,
    styles.borderRadius, styles.boxShadow, styles.fontSize, styles.fontWeight,
    styles.gridTemplateColumns, styles.columnGap,
    before.content, before.backgroundColor, before.opacity,
    after.content, after.backgroundColor, after.opacity,
    stateAttrs.map((name) => `${name}=${element.getAttribute(name) ?? ''}`).join(','),
  ];
  // The document epoch belongs to drift detection, which must reject a capture
  // that spanned a navigation. It must NOT reach the dedupe signature: it changes
  // on every reload, so including it would make every state unique across runs.
  if (includeEpoch) parts.push(String(performance.timeOrigin));
  return { present: true, signature: parts.join('|') };
}

const FINGERPRINT_STATE_ATTRIBUTES = [
  'data-state', 'data-active', 'data-selected', 'data-apply-background',
  'data-keyboard-active', 'data-highlighted', 'data-disabled', 'data-checked',
  'aria-expanded', 'aria-selected', 'aria-checked', 'aria-current', 'aria-pressed', 'open',
];

/** Read the subject's rect. Required for every state; there is no fallback. */
function readRect({ specId, attribute }) {
  const element = specId
    ? document.querySelector(`[${attribute}="${String(specId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`)
    : null;
  const round = (value) => Math.round(value * 10) / 10;
  if (element) {
    const rect = element.getBoundingClientRect();
    return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height), source: 'element' };
  }
  if (specId) return null;
  return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, source: 'viewport' };
}

/** LIFO undo stack. Runs every entry, records every outcome, throws for none. */
class CleanupStack {
  #entries = [];

  push(name, run) {
    if (typeof run !== 'function') throw new TypeError(`Cleanup "${name}" needs a function.`);
    this.#entries.push({ name, run });
  }

  get names() {
    return this.#entries.map((entry) => entry.name);
  }

  async unwind() {
    const report = [];
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      const entry = this.#entries[index];
      try {
        const value = await entry.run();
        report.push({ name: entry.name, ok: true, ...(value === undefined ? {} : { result: value }) });
      } catch (error) {
        report.push({ name: entry.name, ok: false, error: String(error?.message ?? error) });
      }
    }
    return report;
  }
}

function assertPositiveRect(rect, label) {
  if (!rect || typeof rect !== 'object') {
    throw new CaptureError(`${label} has no rect. A state without a rect makes the Paper importer fall back to 800x600.`, {
      code: 'ERR_CAPTURE_NO_RECT', stage: 'validate', evidence: { rect: rect ?? null },
    });
  }
  const width = rect.width ?? rect.w;
  const height = rect.height ?? rect.h;
  const finite = ['x', 'y'].every((key) => Number.isFinite(rect[key]))
    && Number.isFinite(width) && width > 0
    && Number.isFinite(height) && height > 0;
  if (!finite) {
    throw new CaptureError(`${label} has an unusable rect (${JSON.stringify(rect)}).`, {
      code: 'ERR_CAPTURE_NO_RECT', stage: 'validate', evidence: { rect },
    });
  }
  return { x: rect.x, y: rect.y, width, height };
}

function assertCommittable(payload) {
  const state = payload?.state;
  if (!state || typeof state !== 'object') {
    throw new CaptureError('The capture body returned no state to commit.', {
      code: 'ERR_CAPTURE_INCOMPLETE', stage: 'validate', evidence: { returned: payload ?? null },
    });
  }
  const name = state.name ?? '(unnamed)';
  const rect = assertPositiveRect(state.rect, `State "${name}"`);

  const paperHtml = payload.frame?.paperHtml;
  if (typeof paperHtml !== 'string' || paperHtml.trim().length === 0) {
    throw new CaptureError(`State "${name}" serialized to empty frame HTML — the subtree was not captured.`, {
      code: 'ERR_CAPTURE_EMPTY_FRAME', stage: 'validate', evidence: { bytes: typeof paperHtml === 'string' ? paperHtml.length : null },
    });
  }

  const shots = Buffer.isBuffer(payload.shots) ? { surface: payload.shots } : (payload.shots ?? {});
  const surface = shots.surface;
  if (!surface || !(Buffer.isBuffer(surface) || surface instanceof Uint8Array) || surface.length === 0) {
    throw new CaptureError(`State "${name}" is missing its required surface screenshot.`, {
      code: 'ERR_CAPTURE_NO_SHOT', stage: 'validate', evidence: { shotKinds: Object.keys(shots) },
    });
  }
  for (const [kind, buffer] of Object.entries(shots)) {
    if (!buffer) delete shots[kind];
  }
  return { state: { ...state, rect }, frame: payload.frame, shots, cssStates: payload.cssStates };
}

/**
 * Run one capture inside the envelope.
 *
 * @param {object} context
 * @param {object} context.driver          SpecDriver (or a double exposing page/serialize/screenshot)
 * @param {object} context.bundle          Bundle facade; `add()` is the only write performed
 * @param {{specId?: string, x?: number, y?: number, expect?: string}} [context.target]
 * @param {Array<{name: string, check: Function}>} [context.preconditions]
 * @param {Function} [context.action]      drives the state; runs between the two stability waits
 * @param {object|false} [context.stability]
 * @param {object} [context.oracle]        injected StabilityOracle (tests, or a shared one)
 * @param {boolean} [context.subgrid]      resolve subgrid for the subject (default true)
 * @param {boolean} [context.pointerHeld]  the action leaves the button down
 * @param {boolean} [context.annotations]  the body draws the annotation layer
 * @param {boolean|number} [context.recorder]
 * @param {{specId?: string, states?: string[], clear?: Function}} [context.forcedState]
 * @param {Function} fn                    async (tx) => { state, frame, shots, cssStates } | { duplicate: true }
 * @returns {Promise<object>} `{ ok: true, record, ... }` or `{ ok: false, code, stage, evidence }`
 */
export async function withCaptureTransaction(context, fn) {
  const {
    driver,
    bundle,
    target = {},
    preconditions = [],
    action = null,
    stability = {},
    oracle: injectedOracle = null,
    subgrid: resolveSubgridFor = true,
    pointerHeld = false,
    annotations = false,
    recorder = false,
    forcedState = null,
  } = context ?? {};

  const cleanup = new CleanupStack();
  let stage = 'precondition';
  let outcome = null;
  let cleanupReport = [];

  try {
    if (typeof fn !== 'function') throw new CaptureError('withCaptureTransaction requires a capture body.', { code: 'ERR_CAPTURE_USAGE', stage });
    if (!driver || !driver.page) {
      throw new CaptureError('No attached page. Call browser_attach first.', { code: 'ERR_CAPTURE_NO_DRIVER', stage });
    }
    if (!bundle || typeof bundle.add !== 'function') {
      throw new CaptureError('No bundle is open, so there is nowhere to commit this state.', { code: 'ERR_CAPTURE_NO_BUNDLE', stage });
    }

    for (const precondition of preconditions) {
      const verdict = await precondition.check(driver);
      const ok = verdict === true || verdict?.ok === true;
      if (!ok) {
        throw new CaptureError(`Precondition "${precondition.name}" does not hold; anything measured now would describe the state before it.`, {
          code: 'ERR_CAPTURE_PRECONDITION', stage, evidence: { precondition: precondition.name, verdict: verdict ?? null },
        });
      }
    }

    const oracle = injectedOracle
      ?? (stability === false ? null : new StabilityOracle(driver.page, stability ?? {}));
    const settle = async () => (oracle ? oracle.wait() : { stable: null, skipped: 'stability disabled' });

    stage = 'stability-before';
    const stabilityBefore = await settle();

    stage = 'target';
    const hasPoint = Number.isFinite(target.x) && Number.isFinite(target.y);
    let lease = null;
    let specId = target.specId ?? null;
    if (hasPoint) {
      // A point is the only source that can be re-resolved after a virtualised
      // list recycles its nodes, so it always gets a lease with an expectation.
      lease = specId ? getTargetLease(driver, specId) : null;
      if (lease) await lease.revalidate();
      else {
        lease = await acquireTargetLease(driver, {
          x: target.x, y: target.y, expect: target.expect, assignedSpecId: specId,
        });
      }
      specId = lease.specId;
    } else if (specId) {
      const existing = getTargetLease(driver, specId);
      if (existing) {
        await existing.revalidate();
        lease = existing;
      }
    }

    if (recorder) {
      const maxMs = typeof recorder === 'number' ? recorder : 2000;
      await driver.startAnimationRecorder?.(maxMs);
      cleanup.push('recorder', async () => {
        await driver.page.evaluate(() => { delete window.__specAnimation; });
        return 'cleared';
      });
    }

    if (forcedState?.states?.length) {
      const clear = forcedState.clear ?? driver.clearForcedState?.bind(driver) ?? null;
      cleanup.push('forced-state', async () => {
        if (!clear) {
          // Reported, not swallowed: a forced pseudo-state belongs to the CDP
          // session that set it, and a session we were not handed cannot clear it.
          throw new Error(`forced pseudo-states ${forcedState.states.join(', ')} on ${forcedState.specId ?? specId} were left applied — no clear handle was supplied`);
        }
        await clear({ specId: forcedState.specId ?? specId, states: forcedState.states });
        return 'cleared';
      });
    }

    // Registered before the action runs, so a throw inside it still releases.
    if (pointerHeld) {
      cleanup.push('pointer', async () => {
        await driver.page.mouse.up();
        return 'released';
      });
    }

    stage = 'action';
    let actionResult;
    if (action) actionResult = await action({ driver, specId, lease });

    stage = 'stability-after';
    const stabilityAfter = await settle();

    if (annotations) {
      cleanup.push('annotations', async () => {
        await driver.clearAnnotations();
        return 'cleared';
      });
    }

    stage = 'subgrid';
    let subgridResolved = 0;
    if (resolveSubgridFor !== false && specId) {
      const transaction = await resolveSubgrid(driver, specId);
      subgridResolved = transaction.resolved ?? 0;
      cleanup.push('subgrid', () => transaction.restore());
    }

    stage = 'fingerprint';
    const fingerprintArgs = { specId, attribute: TARGET_ID_ATTRIBUTE, stateAttrs: FINGERPRINT_STATE_ATTRIBUTES };
    const readPrint = () => driver.page.evaluate(readFingerprint, fingerprintArgs);
    const before = await readPrint();
    if (specId && before?.present === false) {
      throw new CaptureError(`Subject ${specId} is not in the document at capture time.`, {
        code: 'ERR_CAPTURE_SUBJECT_MISSING', stage, evidence: { specId },
      });
    }

    const tx = {
      driver,
      bundle,
      specId,
      lease,
      target: lease?.snapshot ?? null,
      point: hasPoint ? { x: target.x, y: target.y } : null,
      subgridResolved,
      actionResult,
      onCleanup: (name, run) => cleanup.push(name, run),

      /** The rect every state must carry. Never falls back for a named subject. */
      rect: async () => {
        const rect = await driver.page.evaluate(readRect, { specId, attribute: TARGET_ID_ATTRIBUTE });
        if (!rect) {
          throw new CaptureError(`Cannot read a rect for ${specId} — it left the document mid-capture.`, {
            code: 'ERR_CAPTURE_NO_RECT', stage: 'capture', evidence: { specId },
          });
        }
        return rect;
      },

      /** The enriched measurement. Only available when a lease anchors the subject. */
      measure: async () => {
        if (!specId) return null;
        if (!lease && !hasPoint) return null;
        return measuredAnnotation(driver, specId, { x: target.x ?? null, y: target.y ?? null, expect: target.expect ?? null });
      },

      ensureTagged: async () => (specId && hasPoint
        ? ensureTagged(driver, specId, target.x, target.y, { expect: target.expect ?? null })
        : null),

      serialize: async (overrideSpecId = specId) => (hasPoint && overrideSpecId === specId
        ? serializeStable(driver, specId, target.x, target.y)
        : driver.serialize(overrideSpecId)),

      screenshot: (overrideSpecId = specId) => driver.screenshot(overrideSpecId),

      fingerprint: readPrint,

      /**
       * What the subject currently *paints*, without the document epoch.
       *
       * `structuralHash` sees tags, classes and state attributes. A CSS-only
       * `:hover`, `:focus-visible` or `:active` state changes none of those, so
       * deduping on topology alone discards the hover frame as "structurally
       * identical to rest" — which is precisely the frame the state matrix exists
       * to record. This is the layer that tells them apart.
       */
      paintSignature: async () => {
        const print = await driver.page.evaluate(readFingerprint, { ...fingerprintArgs, includeEpoch: false });
        return print?.present ? print.signature : null;
      },
    };

    stage = 'capture';
    const payload = await fn(tx);

    if (payload?.duplicate) {
      outcome = { ok: true, committed: false, duplicate: true, ...payload };
    } else {
      stage = 'drift';
      const after = await readPrint();
      if (!after?.present || after.signature !== before.signature) {
        throw new CaptureError(
          `The subject changed while it was being captured, so the measurement, the frame and the screenshot do not describe one instant.`,
          {
            code: 'ERR_CAPTURE_DRIFT',
            stage,
            evidence: {
              specId,
              before: before?.signature ?? null,
              after: after?.signature ?? null,
              stillPresent: after?.present ?? false,
              differingFields: diffSignatures(before?.signature, after?.signature),
            },
          },
        );
      }

      stage = 'validate';
      const committable = assertCommittable(payload);

      stage = 'commit';
      const record = bundle.add(committable.state, committable.frame, committable.shots, committable.cssStates);
      outcome = {
        ok: true,
        committed: true,
        record,
        resolved: lease?.snapshot ? { ...lease.snapshot, label: String(lease.snapshot.label ?? '').slice(0, 60) } : null,
        subgridResolved,
        ...(payload.extra ?? {}),
      };
    }

    outcome.stability = { before: stabilityBefore, after: stabilityAfter };
  } catch (error) {
    outcome = failure(error, stage);
  } finally {
    cleanupReport = await cleanup.unwind();
  }

  outcome.cleanup = cleanupReport;
  const leaked = cleanupReport.filter((entry) => !entry.ok);
  if (leaked.length) outcome.cleanupErrors = leaked;
  return outcome;
}

const SIGNATURE_FIELDS = [
  'tag', 'id', 'role', 'textDigest', 'childElementCount', 'size',
  'display', 'visibility', 'opacity', 'transform',
  'backgroundColor', 'color', 'borderColor', 'borderWidth',
  'borderRadius', 'boxShadow', 'fontSize', 'fontWeight',
  'gridTemplateColumns', 'columnGap',
  'before.content', 'before.backgroundColor', 'before.opacity',
  'after.content', 'after.backgroundColor', 'after.opacity',
  'stateAttributes', 'documentEpoch',
];

/** Name what moved, so a drift rejection is diagnosable without re-running it. */
export function diffSignatures(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return null;
  const left = before.split('|');
  const right = after.split('|');
  const differences = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === right[index]) continue;
    differences.push({ field: SIGNATURE_FIELDS[index] ?? `field-${index}`, before: left[index] ?? null, after: right[index] ?? null });
  }
  return differences;
}

export { CleanupStack, assertCommittable, assertPositiveRect };
