import assert from 'node:assert/strict';
import test from 'node:test';

import { animationChecklist, animationContract } from '../../src/contract.mjs';

const state = {
  id: 'dialog-open', kind: 'dialog', trigger: { label: 'Open' },
  animation: {
    frames: 5, frameIntervalMs: 16.7,
    selection: { included: [{ animationId: 'panel', reason: 'allowed causal target' }], excluded: [{ animationId: 'spinner', reason: 'present before interaction' }] },
    nodes: [{
      id: 'panel', owns: ['height ← its own min-height'],
      transition: { property: 'width, rotate', duration: '180ms, 240ms', easing: 'ease-out, linear', delay: '0s, 20ms' },
      properties: {
        width: { from: 20, to: 80, fromCss: '20%', toCss: '80%', unit: '%', valueType: 'length', interpolation: 'numeric', driven: true, durationMs: 180 },
        rotate: { from: 0, to: 90, fromCss: '0deg', toCss: '90deg', unit: 'deg', valueType: 'angle', interpolation: 'numeric', driven: true, durationMs: 240 },
        display: { from: 'none', to: 'block', fromCss: 'none', toCss: 'block', valueType: 'discrete', interpolation: 'discrete', driven: false, durationMs: null },
      },
      measured: { durationMs: 240, staggerMs: 20 }, fit: { type: 'tween', duration: 240, easing: 'linear' },
    }],
  },
};

test('animation contract reports units, interpolation, and causal exclusions additively', () => {
  const contract = animationContract(state);
  assert.match(contract, /20%/);
  assert.match(contract, /90deg/);
  assert.match(contract, /spinner.*present before interaction/i);
  assert.match(contract, /discrete/);
});

test('animation checklist preserves old fields and adds typed values and per-property timings', () => {
  const checklist = animationChecklist(state);
  const node = checklist.requiredNodes[0];
  assert.equal(node.node, 'panel');
  assert.equal(node.transition, 'width, rotate');
  assert.deepEqual(node.owns, ['height ← its own min-height']);
  assert.deepEqual(node.animate[0], {
    property: 'width', from: 20, to: 80,
    fromCss: '20%', toCss: '80%', valueType: 'length', interpolation: 'numeric', unit: '%',
    durationMs: 180, delayMs: null, easing: null,
  });
  assert.equal(checklist.causal.excluded[0].animationId, 'spinner');
});
