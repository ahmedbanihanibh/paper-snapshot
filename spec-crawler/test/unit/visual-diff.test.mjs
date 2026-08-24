import assert from 'node:assert/strict';
import test from 'node:test';

import { comparePngs, decodePng, encodePng } from '../../src/visual-diff.mjs';

function png(width, height, pixels) {
  return encodePng({ width, height, data: Buffer.from(pixels.flat()) });
}

const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];

test('size mismatch fails without scaling the candidate', () => {
  const reference = png(2, 1, [red, blue]);
  const candidate = png(1, 1, [red]);
  const result = comparePngs(reference, candidate, { threshold: 100 });

  assert.equal(result.sizeMatch, false);
  assert.equal(result.pass, false, 'size mismatch is fatal even with a permissive changed threshold');
  assert.deepEqual(result.referenceSize, { width: 2, height: 1, w: 2, h: 1 });
  assert.deepEqual(result.candidateSize, { width: 1, height: 1, w: 1, h: 1 });
  assert.equal(result.changedPixels, 1);
  assert.equal(result.changedPct, 50);
  assert.deepEqual({ width: decodePng(result.diffPng).width, height: decodePng(result.diffPng).height }, { width: 2, height: 1 });
});

test('alpha-aware comparison ignores invisible RGB but detects alpha changes', () => {
  const invisibleRed = png(1, 1, [[255, 0, 0, 0]]);
  const invisibleBlue = png(1, 1, [[0, 0, 255, 0]]);
  const halfRed = png(1, 1, [[255, 0, 0, 128]]);

  assert.equal(comparePngs(invisibleRed, invisibleBlue).changedPct, 0);
  const alpha = comparePngs(invisibleRed, halfRed);
  assert.equal(alpha.changedPct, 100);
  assert.ok(alpha.rgbaMeanDeltaPct > 0);
  assert.ok(alpha.perceptual.luminanceMeanDeltaPct > 0);
});

test('explicit masks exclude only requested pixels and report deterministic evidence', () => {
  const reference = png(2, 1, [red, red]);
  const candidate = png(2, 1, [blue, red]);
  const unmasked = comparePngs(reference, candidate, { regions: [{ name: 'left', x: 0, y: 0, width: 1, height: 1 }] });
  const masked = comparePngs(reference, candidate, { masks: [{ x: 0, y: 0, width: 1, height: 1 }] });
  const repeated = comparePngs(reference, candidate, { masks: [{ x: 0, y: 0, width: 1, height: 1 }] });

  assert.equal(unmasked.changedPct, 50);
  assert.equal(unmasked.regions[0].changedPct, 100);
  assert.equal(masked.changedPct, 0);
  assert.equal(masked.maskedPixels, 1);
  assert.equal(masked.reportHash, repeated.reportHash);
  assert.deepEqual(masked.diffPng, repeated.diffPng);
});
