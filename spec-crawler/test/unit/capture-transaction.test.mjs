import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CaptureError,
  CleanupStack,
  assertCommittable,
  diffSignatures,
  normalizeVolatile,
  withCaptureTransaction,
} from '../../src/capture-transaction.mjs';
import { captureState } from '../../src/capture.mjs';
import { sha256 } from '../../src/hashes.mjs';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

/** Mirrors `stateIdentity`: a state is its structure *and* what it paints. */
const identityOf = (structural, paint) => sha256(`${structural}\u0000${paint}`);

/**
 * The doubles dispatch page.evaluate by the evaluated function's *name*, which is
 * how a real page distinguishes them too — the fingerprint reader, the rect
 * reader and the subgrid pair are all named declarations.
 */
function makeHarness({
  fingerprints = ['sig-A'],
  rect = { x: 10, y: 20, width: 300, height: 32, source: 'element' },
  seen = false,
  states = [],
  subgridResolved = 1,
} = {}) {
  const log = [];
  const added = [];
  const prints = [...fingerprints];
  let lastPrint = prints[prints.length - 1] ?? 'sig-A';

  const evaluate = async (fn) => {
    const name = typeof fn === 'function' ? (fn.name || 'anonymous') : String(fn);
    log.push(`evaluate:${name}`);
    if (name === 'readFingerprint') {
      const signature = prints.length ? prints.shift() : lastPrint;
      lastPrint = signature;
      return signature === null ? { present: false, signature: 'absent' } : { present: true, signature };
    }
    if (name === 'readRect') return rect;
    if (name === 'resolveSubgrids') return { resolved: subgridResolved, records: [{ token: 't-0' }] };
    if (name === 'restoreSubgrids') { log.push('cleanup:subgrid'); return subgridResolved; }
    return undefined;
  };

  const driver = {
    page: {
      evaluate,
      viewportSize: () => ({ width: 1280, height: 800 }),
      waitForTimeout: async () => {},
      mouse: {
        up: async () => { log.push('cleanup:pointer'); },
        down: async () => { log.push('mouse:down'); },
        move: async () => { log.push('mouse:move'); },
      },
    },
    serialize: async (specId) => { log.push(`serialize:${specId ?? 'body'}`); return { paperHtml: '<div data-x="1">row</div>' }; },
    screenshot: async (specId) => { log.push(`screenshot:${specId ?? 'page'}`); return PNG; },
    structuralHash: async () => 'structural-hash-1',
    annotate: async () => { log.push('annotate'); },
    clearAnnotations: async () => { log.push('cleanup:annotations'); },
    startAnimationRecorder: async () => { log.push('recorder:start'); },
    cssSpec: async () => ({ components: [{ id: 'a' }], stateNames: ['hover'] }),
  };

  const bundle = {
    states,
    seen: () => seen,
    add(state, frame, shots, cssStates) {
      added.push({ state, frame, shots, cssStates });
      return { id: `00${added.length}-${String(state.name).toLowerCase()}`, ...state, frame: 'frames/x.html', shot: 'shots/x.png' };
    },
  };

  const oracle = { wait: async () => { log.push('stability'); return { stable: true }; } };

  return { driver, bundle, oracle, log, added };
}

const fullContext = (harness, overrides = {}) => ({
  driver: harness.driver,
  bundle: harness.bundle,
  oracle: harness.oracle,
  target: { specId: 'row-1' },
  recorder: true,
  forcedState: { states: ['hover'], clear: async () => { harness.log.push('cleanup:forced-state'); } },
  pointerHeld: true,
  annotations: true,
  ...overrides,
});

const goodPayload = () => ({
  state: { name: 'row', tier: 3, kind: 'agent-captured', path: [], rect: { x: 10, y: 20, width: 300, height: 32 } },
  frame: { paperHtml: '<div>row</div>' },
  shots: { surface: PNG },
});

test('every cleanup runs on success, LIFO, in reverse of acquisition', async () => {
  const harness = makeHarness();
  const result = await withCaptureTransaction(fullContext(harness), async () => goodPayload());

  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.deepEqual(
    result.cleanup.map((entry) => entry.name),
    ['subgrid', 'annotations', 'pointer', 'forced-state', 'recorder'],
  );
  assert.ok(result.cleanup.every((entry) => entry.ok), JSON.stringify(result.cleanup));
  assert.equal(result.cleanupErrors, undefined);
  assert.equal(harness.added.length, 1);
});

test('the same cleanups run in the same order when the capture body throws', async () => {
  const harness = makeHarness();
  const result = await withCaptureTransaction(fullContext(harness), async () => {
    throw new Error('serializer exploded');
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'capture');
  assert.equal(result.code, 'ERR_CAPTURE_FAILED');
  assert.match(result.message, /serializer exploded/);
  assert.deepEqual(
    result.cleanup.map((entry) => entry.name),
    ['subgrid', 'annotations', 'pointer', 'forced-state', 'recorder'],
  );
  assert.ok(result.cleanup.every((entry) => entry.ok));
  assert.equal(harness.added.length, 0, 'a thrown capture must not write a manifest state');
});

test('cleanup order is observed against the page, not just reported', async () => {
  const harness = makeHarness();
  await withCaptureTransaction(fullContext(harness), async () => goodPayload());

  const observed = harness.log.filter((entry) => entry.startsWith('cleanup:'));
  assert.deepEqual(observed, ['cleanup:subgrid', 'cleanup:annotations', 'cleanup:pointer', 'cleanup:forced-state']);
});

test('stability is awaited before and after the action', async () => {
  const harness = makeHarness();
  await withCaptureTransaction(fullContext(harness, {
    action: async () => { harness.log.push('action'); },
  }), async () => goodPayload());

  const sequence = harness.log.filter((entry) => entry === 'stability' || entry === 'action');
  assert.deepEqual(sequence, ['stability', 'action', 'stability']);
});

test('a failing cleanup is reported without masking the committed record', async () => {
  const harness = makeHarness();
  const result = await withCaptureTransaction(fullContext(harness, {
    forcedState: { states: ['hover'] },
  }), async () => goodPayload());

  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(result.cleanupErrors.length, 1);
  assert.equal(result.cleanupErrors[0].name, 'forced-state');
  assert.match(result.cleanupErrors[0].error, /no clear handle/);
  assert.deepEqual(
    result.cleanup.map((entry) => entry.name),
    ['subgrid', 'annotations', 'pointer', 'forced-state', 'recorder'],
  );
});

test('a subject that drifts between the pre- and post-fingerprint is rejected', async () => {
  const harness = makeHarness({ fingerprints: ['div|row|row|aaaa|3|300x32', 'div|row|row|bbbb|3|300x32'] });
  const result = await withCaptureTransaction(fullContext(harness), async () => goodPayload());

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_DRIFT');
  assert.equal(result.stage, 'drift');
  assert.equal(result.evidence.specId, 'row-1');
  assert.deepEqual(result.evidence.differingFields, [{ field: 'textDigest', before: 'aaaa', after: 'bbbb' }]);
  assert.equal(harness.added.length, 0, 'drift must not write a manifest state');
  assert.deepEqual(result.cleanup.map((entry) => entry.name), ['subgrid', 'annotations', 'pointer', 'forced-state', 'recorder']);
});

test('a subject that vanishes mid-capture is rejected as drift', async () => {
  const harness = makeHarness({ fingerprints: ['sig-A', null] });
  const result = await withCaptureTransaction(fullContext(harness), async () => goodPayload());

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_DRIFT');
  assert.equal(result.evidence.stillPresent, false);
  assert.equal(harness.added.length, 0);
});

test('a subject missing before the capture body runs never reaches it', async () => {
  const harness = makeHarness({ fingerprints: [null] });
  let bodyRan = false;
  const result = await withCaptureTransaction(fullContext(harness), async () => { bodyRan = true; return goodPayload(); });

  assert.equal(bodyRan, false);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_SUBJECT_MISSING');
  assert.equal(result.stage, 'fingerprint');
  assert.equal(harness.added.length, 0);
});

test('a state with no rect is refused', async () => {
  const harness = makeHarness();
  const payload = goodPayload();
  delete payload.state.rect;
  const result = await withCaptureTransaction(fullContext(harness), async () => payload);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_NO_RECT');
  assert.equal(result.stage, 'validate');
  assert.equal(harness.added.length, 0);
});

test('a zero-area rect is refused as firmly as a missing one', async () => {
  const harness = makeHarness();
  const payload = goodPayload();
  payload.state.rect = { x: 0, y: 0, width: 0, height: 32 };
  const result = await withCaptureTransaction(fullContext(harness), async () => payload);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_NO_RECT');
  assert.equal(harness.added.length, 0);
});

test('an empty frame is refused', async () => {
  const harness = makeHarness();
  const payload = goodPayload();
  payload.frame = { paperHtml: '   ' };
  const result = await withCaptureTransaction(fullContext(harness), async () => payload);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_EMPTY_FRAME');
  assert.equal(result.stage, 'validate');
  assert.equal(harness.added.length, 0);
});

test('a missing surface screenshot is refused', async () => {
  const harness = makeHarness();
  const payload = goodPayload();
  payload.shots = { context: PNG };
  const result = await withCaptureTransaction(fullContext(harness), async () => payload);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_NO_SHOT');
  assert.deepEqual(result.evidence.shotKinds, ['context']);
  assert.equal(harness.added.length, 0);
});

test('a bare buffer is still accepted as the surface shot', async () => {
  const harness = makeHarness();
  const payload = goodPayload();
  payload.shots = PNG;
  const result = await withCaptureTransaction(fullContext(harness), async () => payload);

  assert.equal(result.ok, true);
  assert.ok(Buffer.isBuffer(harness.added[0].shots.surface));
});

test('missing driver and missing bundle fail before anything touches the page', async () => {
  const harness = makeHarness();
  const noDriver = await withCaptureTransaction({ bundle: harness.bundle }, async () => goodPayload());
  assert.equal(noDriver.code, 'ERR_CAPTURE_NO_DRIVER');
  assert.equal(noDriver.stage, 'precondition');

  const noBundle = await withCaptureTransaction({ driver: harness.driver }, async () => goodPayload());
  assert.equal(noBundle.code, 'ERR_CAPTURE_NO_BUNDLE');
  assert.equal(harness.log.length, 0);
});

test('a declared precondition that does not hold stops the capture', async () => {
  const harness = makeHarness();
  const result = await withCaptureTransaction(fullContext(harness, {
    preconditions: [{ name: 'no overlay open', check: async () => ({ ok: false, overlays: ['dialog'] }) }],
  }), async () => goodPayload());

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_PRECONDITION');
  assert.equal(result.stage, 'precondition');
  assert.deepEqual(result.evidence.verdict, { ok: false, overlays: ['dialog'] });
  assert.equal(harness.added.length, 0);
});

test('a duplicate returns without committing and still unwinds', async () => {
  const harness = makeHarness();
  const result = await withCaptureTransaction(fullContext(harness), async () => ({ duplicate: true, existingId: '004-row' }));

  assert.equal(result.ok, true);
  assert.equal(result.committed, false);
  assert.equal(result.existingId, '004-row');
  assert.equal(harness.added.length, 0);
  assert.deepEqual(result.cleanup.map((entry) => entry.name), ['subgrid', 'annotations', 'pointer', 'forced-state', 'recorder']);
});

test('CleanupStack runs every entry even when one throws', async () => {
  const stack = new CleanupStack();
  const seen = [];
  stack.push('first', () => { seen.push('first'); });
  stack.push('second', () => { seen.push('second'); throw new Error('undo failed'); });
  stack.push('third', () => { seen.push('third'); return 'ok'; });

  const report = await stack.unwind();
  assert.deepEqual(seen, ['third', 'second', 'first']);
  assert.deepEqual(report.map((entry) => [entry.name, entry.ok]), [['third', true], ['second', false], ['first', true]]);
  assert.equal(report[0].result, 'ok');
});

test('assertCommittable normalizes w/h aliases and drops the rect provenance field', () => {
  const committable = assertCommittable({
    state: { name: 'row', rect: { x: 1, y: 2, w: 30, h: 40, source: 'element' } },
    frame: { paperHtml: '<div/>' },
    shots: { surface: PNG },
  });
  assert.deepEqual(committable.state.rect, { x: 1, y: 2, width: 30, height: 40 });
});

test('diffSignatures names the field that moved', () => {
  assert.deepEqual(
    diffSignatures('div|a|row|1111|2|10x10', 'div|a|row|1111|2|10x20'),
    [{ field: 'size', before: '10x10', after: '10x20' }],
  );
  assert.equal(diffSignatures('a', null), null);
});

test('normalizeVolatile requires a selector and a stated reason', () => {
  assert.deepEqual(normalizeVolatile(null), []);
  assert.deepEqual(
    normalizeVolatile([{ selector: '  #clock  ', reason: '  ticks  ' }]),
    [{ selector: '#clock', reason: 'ticks' }],
  );

  // A reason is required because declaring a region volatile is the power to make
  // a capture stop noticing that something changed.
  assert.throws(() => normalizeVolatile([{ selector: '#clock' }]), (error) => {
    assert.equal(error.code, 'ERR_CAPTURE_VOLATILE_USAGE');
    assert.match(error.message, /reason/);
    return true;
  });
  assert.throws(() => normalizeVolatile(['#clock']), { code: 'ERR_CAPTURE_VOLATILE_USAGE' });
  assert.throws(() => normalizeVolatile([{ reason: 'no selector' }]), { code: 'ERR_CAPTURE_VOLATILE_USAGE' });
});

test('a malformed volatile declaration returns a structured failure and never throws', async () => {
  const harness = makeHarness();
  const result = await withCaptureTransaction(
    { driver: harness.driver, bundle: harness.bundle, oracle: harness.oracle, target: { specId: 'row-1' }, volatile: [{ selector: '#clock' }] },
    async () => goodPayload(),
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_VOLATILE_USAGE');
  assert.equal(result.stage, 'precondition');
  assert.equal(harness.added.length, 0);
  assert.deepEqual(result.cleanup, [], 'nothing was acquired, so nothing needed unwinding');
});

test('CaptureError serializes to the structured failure shape', () => {
  const error = new CaptureError('nope', { code: 'ERR_X', stage: 'commit', evidence: { a: 1 } });
  assert.deepEqual(error.toResult(), { ok: false, code: 'ERR_X', stage: 'commit', message: 'nope', evidence: { a: 1 } });
});

/* captureState — the single path every capture kind goes through. */

test('captureState records the measured rect and commits one state', async () => {
  const harness = makeHarness();
  const result = await captureState({
    driver: harness.driver,
    bundle: harness.bundle,
    oracle: harness.oracle,
    specId: 'row-1',
    name: 'issue row rest',
    notes: 'pointer parked outside the list',
  });

  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(harness.added.length, 1);
  const [written] = harness.added;
  assert.deepEqual(written.state.rect, { x: 10, y: 20, width: 300, height: 32 });
  assert.equal(written.state.hash, identityOf('structural-hash-1', 'sig-A'));
  assert.notEqual(written.state.hash, 'structural-hash-1');
  assert.equal(written.state.notes, 'pointer parked outside the list');
  assert.equal(written.frame.paperHtml, '<div data-x="1">row</div>');
  assert.ok(Buffer.isBuffer(written.shots.surface));
  assert.equal(result.record.id, '001-issue row rest');
  assert.equal(result.subgridResolved, 1);
});

test('captureState refuses a nameless capture before touching the page', async () => {
  const harness = makeHarness();
  const result = await captureState({ driver: harness.driver, bundle: harness.bundle, oracle: harness.oracle, specId: 'row-1' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_USAGE');
  assert.equal(harness.log.length, 0);
});

test('captureState dedupes without writing anything', async () => {
  const harness = makeHarness({ seen: true, states: [{ id: '002-row', hash: identityOf('structural-hash-1', 'sig-A') }] });
  const result = await captureState({
    driver: harness.driver, bundle: harness.bundle, oracle: harness.oracle,
    specId: 'row-1', name: 'issue row',
  });

  assert.equal(result.ok, true);
  assert.equal(result.committed, false);
  assert.equal(result.duplicate, true);
  assert.equal(result.existingId, '002-row');
  assert.equal(harness.added.length, 0);
  assert.deepEqual(result.cleanup.map((entry) => entry.name), ['subgrid']);
});

test('a CSS-only hover is not deduped away as "structurally identical" to rest', async () => {
  // The regression this guards: `structuralHash` sees tags, classes and state
  // attributes. An app that styles hover in CSS rather than with a data attribute
  // produces the *same* structural hash for rest and hover, so a topology-only
  // dedupe skipped the hover frame — the one the state matrix exists to record.
  const written = new Set();
  const captureWith = async (paint, name) => {
    const harness = makeHarness({ fingerprints: [paint] });
    harness.bundle.seen = (hash) => written.has(hash);
    const result = await captureState({
      driver: harness.driver, bundle: harness.bundle, oracle: harness.oracle,
      specId: 'row-1', name,
    });
    if (result.committed) written.add(harness.added[0].state.hash);
    return result;
  };

  const rest = await captureWith('rest-paint', 'row rest');
  const hover = await captureWith('hover-paint', 'row hover');
  const restAgain = await captureWith('rest-paint', 'row rest again');

  assert.equal(rest.committed, true);
  assert.equal(hover.committed, true, 'hover differs only in paint and must still be recorded');
  assert.equal(restAgain.committed, false, 'an identical structure and paint is still a duplicate');
  assert.equal(restAgain.duplicate, true);
  assert.equal(written.size, 2);
  assert.notEqual(identityOf('structural-hash-1', 'rest-paint'), identityOf('structural-hash-1', 'hover-paint'));
});

test('captureState keeps an annotated context shot and clears the layer inside the drift window', async () => {
  const harness = makeHarness();
  const result = await captureState({
    driver: harness.driver, bundle: harness.bundle, oracle: harness.oracle,
    specId: 'menu-1', name: 'menu open',
    annotate: { triggerId: 'btn-1', label: 'bottom/start gap 4px' },
    cssSpec: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(harness.added[0].shots).sort(), ['context', 'surface']);
  assert.deepEqual(harness.added[0].state.cssStates, { components: 1, stateNames: ['hover'] });
  // Cleared once inside the body and once by the cleanup stack; both are safe.
  const clears = harness.log.filter((entry) => entry === 'cleanup:annotations');
  assert.equal(clears.length, 2);
  assert.ok(harness.log.indexOf('annotate') < harness.log.indexOf('screenshot:page'));
});

test('captureState propagates a structured failure instead of a partial write', async () => {
  const harness = makeHarness();
  harness.driver.serialize = async () => ({ paperHtml: '' });
  const result = await captureState({
    driver: harness.driver, bundle: harness.bundle, oracle: harness.oracle,
    specId: 'row-1', name: 'issue row',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_EMPTY_FRAME');
  assert.equal(result.record, undefined);
  assert.equal(harness.added.length, 0);
});

test('captureState carries extra record fields through unchanged', async () => {
  const harness = makeHarness();
  const result = await captureState({
    driver: harness.driver, bundle: harness.bundle, oracle: harness.oracle,
    specId: 'menu-1', name: 'menu', tier: 4, level: 0, kind: 'menu',
    state: { trigger: { label: 'More', role: 'button' }, detectedBy: 'mounted', animation: { nodes: [] } },
  });

  assert.equal(result.ok, true);
  const [written] = harness.added;
  assert.equal(written.state.tier, 4);
  assert.equal(written.state.level, 0);
  assert.equal(written.state.kind, 'menu');
  assert.deepEqual(written.state.trigger, { label: 'More', role: 'button' });
  assert.equal(written.state.detectedBy, 'mounted');
});
