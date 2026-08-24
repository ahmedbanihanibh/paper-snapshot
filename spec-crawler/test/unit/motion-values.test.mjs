import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMotionValue, serializeMotionValue } from '../../src/animation.mjs';

test('typed CSS values preserve number, length, angle, and color syntax', () => {
  assert.deepEqual(parseMotionValue('opacity', '0.625'), {
    kind: 'number', interpolation: 'numeric', numeric: 0.625, unit: '', css: '0.625', emittable: true,
  });
  assert.equal(parseMotionValue('width', '37.5%').kind, 'length');
  assert.equal(parseMotionValue('width', '37.5%').unit, '%');
  assert.equal(parseMotionValue('inset-inline-start', '2rem').unit, 'rem');
  assert.equal(parseMotionValue('rotate', '-15deg').kind, 'angle');
  assert.equal(parseMotionValue('rotate', '-15deg').unit, 'deg');

  for (const color of ['#ff00aa', 'rgb(12 34 56 / 0.5)', 'oklch(62% 0.2 250)', 'transparent']) {
    const parsed = parseMotionValue('background-color', color);
    assert.equal(parsed.kind, 'color');
    assert.equal(parsed.css, color);
    assert.equal(parsed.interpolation, 'color');
    assert.equal(serializeMotionValue(parsed), color);
  }
});

test('simple filters, clip paths, and custom-property scalars are typed', () => {
  const blur = parseMotionValue('filter', 'blur(1.25rem)');
  assert.equal(blur.kind, 'filter');
  assert.equal(blur.numeric, 1.25);
  assert.equal(blur.unit, 'rem');
  assert.equal(serializeMotionValue({ ...blur, numeric: 2 }), 'blur(2rem)');

  const inset = parseMotionValue('clip-path', 'inset(12%)');
  assert.equal(inset.kind, 'clip-path');
  assert.equal(inset.numeric, 12);
  assert.equal(serializeMotionValue({ ...inset, numeric: 40 }), 'inset(40%)');

  const custom = parseMotionValue('--progress-angle', '45deg');
  assert.equal(custom.kind, 'custom-property');
  assert.equal(custom.syntaxKind, 'angle');
  assert.equal(custom.interpolation, 'numeric-candidate');
  assert.equal(custom.numeric, 45);
});

test('quoted and compound values remain explicit raw tracks instead of first-number guesses', () => {
  const quoted = parseMotionValue('--label', '"phase 2 of 3"');
  assert.equal(quoted.kind, 'raw');
  assert.equal(quoted.interpolation, 'discrete');
  assert.equal(quoted.numeric, undefined);
  assert.equal(quoted.css, '"phase 2 of 3"');

  const compound = parseMotionValue('background-position', '10px 25%');
  assert.equal(compound.kind, 'raw');
  assert.equal(compound.interpolation, 'discrete');
  assert.equal(compound.numeric, undefined);

  const invalid = parseMotionValue('filter', 'blur(2px) brightness(0.8)');
  assert.equal(invalid.kind, 'unsupported');
  assert.equal(invalid.emittable, false);
});
