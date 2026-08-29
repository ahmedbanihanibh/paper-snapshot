import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StabilityOracle,
  StabilityTimeoutError,
  assessStabilitySamples,
  normalizeStabilityOptions,
  waitForStable,
} from '../../src/stability.mjs';
import { compareSemanticSnapshots } from '../../src/page-agent.mjs';
import { SpecDriver } from '../../src/driver.mjs';

test('sample assessment requires consecutive fully-ready identical signatures', () => {
  const result = assessStabilitySamples([
    { signature: 'a', domQuiet: true, fontsReady: true, imagesReady: true, animationsReady: true },
    { signature: 'a', domQuiet: true, fontsReady: true, imagesReady: false, animationsReady: true },
    { signature: 'b', domQuiet: true, fontsReady: true, imagesReady: true, animationsReady: true },
    { signature: 'b', domQuiet: true, fontsReady: true, imagesReady: true, animationsReady: true },
    { signature: 'b', domQuiet: true, fontsReady: true, imagesReady: true, animationsReady: true },
  ], { consecutiveSamples: 3 });

  assert.deepEqual(result, {
    stable: true,
    consecutive: 3,
    required: 3,
    lastSignature: 'b',
  });
});

test('waitForStable preserves structured timeout evidence for compatibility callers', async () => {
  const evidence = {
    stable: false,
    timedOut: true,
    elapsedMs: 25,
    diagnostics: { blockers: ['animations'] },
  };
  const page = { evaluate: async () => evidence };

  assert.equal(await waitForStable(page, { timeoutMs: 25 }), evidence);
});

test('StabilityOracle can turn a timeout into a typed error without hiding evidence', async () => {
  const evidence = {
    stable: false,
    timedOut: true,
    elapsedMs: 40,
    diagnostics: { blockers: ['fonts', 'images'] },
  };
  const oracle = new StabilityOracle({ evaluate: async () => evidence }, { throwOnTimeout: true });

  await assert.rejects(oracle.wait(), (error) => {
    assert.ok(error instanceof StabilityTimeoutError);
    assert.equal(error.code, 'ERR_STABILITY_TIMEOUT');
    assert.equal(error.evidence, evidence);
    assert.match(error.message, /fonts, images/);
    return true;
  });
});

test('semantic baseline comparison reports a different visible surface despite equal counts', () => {
  const expected = {
    url: { pathname: '/issues' },
    surfaces: [{ key: 'div|menu|one|0', stateHash: 'state-a', visualHash: 'visual-a' }],
    focus: null,
    scroll: [{ key: 'window', left: 0, top: 0 }],
    relevantState: [],
    crawlerResidue: [],
  };
  const actual = {
    ...expected,
    surfaces: [{ key: 'div|menu|two|0', stateHash: 'state-b', visualHash: 'visual-b' }],
  };

  const comparison = compareSemanticSnapshots(expected, actual);
  assert.equal(comparison.equal, false);
  assert.ok(comparison.differences.some((difference) => difference.path === 'surfaces'));
});

test('reset preserves escalation and reports semantic differences for failed attempts', async () => {
  const pressed = [];
  const page = {
    url: () => 'https://example.test/issues',
    keyboard: { press: async (key) => pressed.push(key) },
    mouse: { click: async () => pressed.push('corner') },
  };
  const driver = new SpecDriver({ close: async () => {} }, page);
  driver.clearCrawlerResidue = async () => {};
  driver.settle = async () => ({ stable: true, timedOut: false, status: 'quiet' });
  const comparisons = [
    { equal: false, differences: [{ path: 'surfaces', expected: [], actual: ['menu-a'] }] },
    { equal: true, differences: [] },
  ];
  driver.compareToBaseline = async () => comparisons.shift();

  const report = await driver.reset({ structured: true });

  assert.equal(report.method, 'escape');
  assert.equal(report.attempts.length, 2);
  assert.deepEqual(report.attempts[0].differences, [{ path: 'surfaces', expected: [], actual: ['menu-a'] }]);
  assert.deepEqual(pressed, ['Escape', 'Escape']);
});

test('stability options reject invalid timing values by falling back to safe defaults', () => {
  const options = normalizeStabilityOptions({
    timeoutMs: -1,
    pollIntervalMs: 0,
    quietWindowMs: Number.NaN,
    consecutiveSamples: 0,
    maxSampledElements: -20,
  });

  assert.equal(options.timeoutMs, 3_000);
  assert.equal(options.pollIntervalMs, 50);
  assert.equal(options.quietWindowMs, 100);
  assert.equal(options.consecutiveSamples, 3);
  assert.equal(options.maxSampledElements, 500);
});
