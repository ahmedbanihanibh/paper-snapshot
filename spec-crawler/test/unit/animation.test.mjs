import assert from 'node:assert/strict';
import test from 'node:test';

import { analyseRecording, emitCode, scopeRecording } from '../../src/animation.mjs';

const nodeSample = (t, overrides = {}) => ({
  t,
  nodes: {
    subject: {
      transform: 'none', opacity: '1', rect: { x: 0, y: 0, w: 100, h: 100 },
      props: {}, constraints: {},
      transition: { property: 'none', duration: '0s', easing: 'ease', delay: '0s' },
      ...overrides,
    },
  },
});

test('analysis preserves typed CSS values and never emits blanket px', () => {
  const recording = {
    declared: [{ id: 'subject', type: 'CSSTransition', property: 'width', computedTiming: { duration: 200, delay: 0, easing: 'ease-in' } }],
    samples: [
      nodeSample(0, { props: { width: '2rem', 'background-color': 'rgb(0 0 0)' }, transition: { property: 'width, background-color', duration: '200ms, 120ms', easing: 'ease-in, linear', delay: '0s, 40ms' } }),
      nodeSample(100, { props: { width: '3rem', 'background-color': 'rgb(128 0 0)' }, transition: { property: 'width, background-color', duration: '200ms, 120ms', easing: 'ease-in, linear', delay: '0s, 40ms' } }),
      nodeSample(200, { props: { width: '4rem', 'background-color': 'rgb(255 0 0)' }, transition: { property: 'width, background-color', duration: '200ms, 120ms', easing: 'ease-in, linear', delay: '0s, 40ms' } }),
    ],
  };

  const result = analyseRecording(recording);
  const node = result.nodes[0];
  assert.equal(node.properties.width.unit, 'rem');
  assert.equal(node.properties.width.fromCss, '2rem');
  assert.equal(node.properties['background-color'].valueType, 'color');
  assert.equal(node.properties['background-color'].from, 'rgb(0 0 0)');
  assert.match(result.emit[0].css, /width: 2rem/);
  assert.match(result.emit[0].css, /background-color: rgb\(0 0 0\)/);
  assert.doesNotMatch(result.emit[0].css, /rgb\(0 0 0\)px/);
  assert.match(result.emit[0].css, /width 200ms ease-in/);
  assert.match(result.emit[0].css, /background-color 120ms linear 40ms/);
});

test('angle and quoted or compound raw endpoints emit verbatim', () => {
  const result = analyseRecording({
    declared: [{ id: 'subject', type: 'CSSTransition', property: 'rotate', computedTiming: { duration: 150, easing: 'linear' } }],
    samples: [
      nodeSample(0, { props: { rotate: '0deg', '--label': '"phase 1 of 2"', 'background-position': '10px 25%' }, transition: { property: 'rotate, --label, background-position', duration: '150ms, 0ms, 0ms', easing: 'linear', delay: '0s' } }),
      nodeSample(75, { props: { rotate: '45deg', '--label': '"phase 2 of 2"', 'background-position': '20px 75%' }, transition: { property: 'rotate, --label, background-position', duration: '150ms, 0ms, 0ms', easing: 'linear', delay: '0s' } }),
      nodeSample(150, { props: { rotate: '90deg', '--label': '"phase 2 of 2"', 'background-position': '30px 100%' }, transition: { property: 'rotate, --label, background-position', duration: '150ms, 0ms, 0ms', easing: 'linear', delay: '0s' } }),
    ],
  });
  assert.equal(result.nodes[0].properties.rotate.unit, 'deg');
  assert.equal(result.nodes[0].properties['--label'].interpolation, 'discrete');
  assert.match(result.emit[0].css, /rotate: 90deg/);
  assert.match(result.emit[0].css, /--label: "phase 2 of 2"/);
  assert.match(result.emit[0].css, /background-position: 30px 100%/);
  assert.equal(result.emit[0].framerMotion.animate['--label'], '"phase 2 of 2"');
});

test('empty motion emits no invalid empty transition', () => {
  const emitted = emitCode({ properties: {}, measured: { durationMs: 0, overshoot: 0 }, fit: { type: 'tween', duration: 0, easing: 'linear' } });
  assert.doesNotMatch(emitted.css, /transition\s*:/);
  assert.deepEqual(emitted.framerMotion.transition, {});
});

test('anisotropic matrix scale emits independent scaleX and scaleY values', () => {
  const result = analyseRecording({
    declared: [{ id: 'subject', type: 'CSSTransition', property: 'transform', computedTiming: { duration: 180, easing: 'ease-out' } }],
    samples: [
      nodeSample(0, { transform: 'matrix(1, 0, 0, 1, 0, 0)', props: { transform: 'matrix(1, 0, 0, 1, 0, 0)' }, transition: { property: 'transform', duration: '180ms', easing: 'ease-out', delay: '0s' } }),
      nodeSample(90, { transform: 'matrix(1.5, 0, 0, 2, 0, 0)', props: { transform: 'matrix(1.5, 0, 0, 2, 0, 0)' }, transition: { property: 'transform', duration: '180ms', easing: 'ease-out', delay: '0s' } }),
      nodeSample(180, { transform: 'matrix(2, 0, 0, 3, 0, 0)', props: { transform: 'matrix(2, 0, 0, 3, 0, 0)' }, transition: { property: 'transform', duration: '180ms', easing: 'ease-out', delay: '0s' } }),
    ],
  });
  const emitted = result.emit[0];
  assert.deepEqual(emitted.framerMotion.initial, { scaleX: 1, scaleY: 1 });
  assert.deepEqual(emitted.framerMotion.animate, { scaleX: 2, scaleY: 3 });
  assert.match(emitted.css, /scale\(1\.000, 1\.000\)/);
  assert.match(emitted.css, /scale\(2\.000, 3\.000\)/);
});

test('unsupported compound changes are retained as discrete evidence but not emitted', () => {
  const result = analyseRecording({
    declared: [{ id: 'subject', type: 'CSSTransition', property: 'filter', computedTiming: { duration: 100, easing: 'linear' } }],
    samples: [
      nodeSample(0, { props: { filter: 'blur(1px) brightness(0.8)' }, transition: { property: 'filter', duration: '100ms', easing: 'linear', delay: '0s' } }),
      nodeSample(50, { props: { filter: 'blur(2px) brightness(0.9)' }, transition: { property: 'filter', duration: '100ms', easing: 'linear', delay: '0s' } }),
      nodeSample(100, { props: { filter: 'blur(3px) brightness(1)' }, transition: { property: 'filter', duration: '100ms', easing: 'linear', delay: '0s' } }),
    ],
  });
  const property = result.nodes[0].properties.filter;
  assert.equal(property.interpolation, 'unsupported');
  assert.equal(property.emittable, false);
  assert.doesNotMatch(result.emit[0].css, /filter:/);
  assert.match(result.emit[0].note, /unsupported/i);
});

test('scopeRecording excludes pre-existing and unrelated ambient animations with reasons', () => {
  const recording = {
    declared: [
      { animationId: 'ambient-before', id: 'spinner', property: 'transform' },
      { animationId: 'triggered-panel', id: 'panel', property: 'opacity' },
      { animationId: 'ambient-after', id: 'ticker', property: 'transform' },
    ],
    samples: [{ t: 0, nodes: { spinner: {}, panel: {}, ticker: {} } }],
  };
  const scoped = scopeRecording(recording, {
    beforeAnimationIds: ['ambient-before'], allowedNodeIds: ['panel'],
  });
  assert.deepEqual(scoped.declared.map((entry) => entry.animationId), ['triggered-panel']);
  assert.deepEqual(Object.keys(scoped.samples[0].nodes), ['panel']);
  assert.equal(scoped.selection.included[0].reason, 'allowed causal target');
  assert.ok(scoped.selection.excluded.some((entry) => entry.animationId === 'ambient-before' && /before/.test(entry.reason)));
  assert.ok(scoped.selection.excluded.some((entry) => entry.animationId === 'ambient-after' && /unrelated/.test(entry.reason)));
});

test('existing spring fit and ownership evidence remain additive and readable', () => {
  const samples = [
    [0, 100], [50, 160], [100, 210], [150, 195], [220, 200],
  ].map(([t, h]) => nodeSample(t, {
    props: { 'min-height': `${h}px` }, rect: { x: 0, y: 0, w: 100, h },
    constraints: { minHeight: `${h}px`, maxWidth: 'none' },
    transition: { property: 'min-height', duration: '220ms', easing: 'linear', delay: '0s' },
  }));
  const node = analyseRecording({ declared: [], samples }).nodes[0];
  assert.equal(node.fit.type, 'spring');
  assert.deepEqual(node.owns, ['height ← its own min-height']);
  assert.ok(node.properties['min-height']);
  assert.ok(emitCode(node).framerMotion.transition.stiffness > 0);
});

test('an unknown easing is never replaced with a plausible default', () => {
  // analyseRecording records the sentinel "unknown — no declared timing, curve did
  // not overshoot" precisely so this stays honest. emitCode used to detect that
  // sentinel and substitute `ease-out`, printing a fabricated curve under a
  // contract heading that says "reuse this transition verbatim".
  const emitted = emitCode({
    properties: {
      opacity: { from: 0, to: 1, driven: true, emittable: true, timing: null, durationMs: null },
    },
    measured: { durationMs: null, overshoot: 0 },
    fit: { type: 'tween', duration: null, easing: 'unknown — no declared timing, curve did not overshoot' },
  });

  assert.doesNotMatch(JSON.stringify(emitted.css ?? ''), /ease-out/, 'must not invent an easing');
  assert.doesNotMatch(JSON.stringify(emitted.css ?? ''), /0ms/, 'must not invent a zero duration');
  assert.deepEqual(emitted.framerMotion.transition, {}, 'an unmeasurable property is omitted, not defaulted');
  assert.match(emitted.note ?? '', /NOT EMITTED/, 'a dropped property must be announced, not silently absent');
  assert.match(emitted.note ?? '', /opacity/, 'and it must name which property');
  const [opacity] = emitted.perProperty.filter((entry) => entry.property === 'opacity');
  assert.equal(opacity.durationMs, null);
  assert.equal(opacity.easing, null);
  assert.equal(opacity.measured, false);
});

test('agreement never reports "confirmed" against a measurement that never happened', async () => {
  const { agreementVerdict } = await import('../../src/animation.mjs');

  // The old band was max(2 * 16.7, declared * 0.5). A declared 30ms against a
  // measured 0 fell inside it, so "declared timing confirmed by measurement" was
  // printed onto the Paper evidence artboard with nothing behind it.
  assert.match(
    agreementVerdict({ declaredTiming: { duration: 30 }, measuredMs: null, frameIntervalMs: null }),
    /NOT verified/,
  );
  assert.match(
    agreementVerdict({ declaredTiming: null, measuredMs: null, frameIntervalMs: null }),
    /duration unknown/,
  );

  // 50% was far too wide: a declared 300ms was "confirmed" by a measured 450ms.
  assert.match(
    agreementVerdict({ declaredTiming: { duration: 300 }, measuredMs: 450, frameIntervalMs: 16 }),
    /investigate/,
  );
  const confirmed = agreementVerdict({ declaredTiming: { duration: 300 }, measuredMs: 305, frameIntervalMs: 16 });
  assert.match(confirmed, /confirmed by measurement/);
  assert.match(confirmed, /within \d+ms/, 'the band must be stated so a reader can judge it');
  assert.match(
    agreementVerdict({ declaredTiming: { duration: 300 }, measuredMs: 305, frameIntervalMs: null }),
    /sample interval unknown/,
  );
});

test('a frame interval is null when none was observed, never an invented 16.7', () => {
  const one = analyseRecording({ declared: [], samples: [nodeSample(0)] });
  assert.equal(one.frameIntervalMs, null, 'a single sample cannot yield an interval');

  const truncated = analyseRecording({ declared: [], samples: [nodeSample(0)], truncated: true });
  assert.equal(truncated.truncated, true, 'a clipped recording must say so');
});
