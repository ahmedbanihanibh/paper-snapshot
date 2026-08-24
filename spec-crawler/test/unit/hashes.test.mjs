import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalJson,
  hashCanonical,
  sha256,
  computeLayeredHashes,
} from '../../src/hashes.mjs';

test('canonical JSON and hashes do not depend on object insertion order', () => {
  const left = { z: 3, nested: { beta: true, alpha: [2, 1] }, a: 'first' };
  const right = { a: 'first', nested: { alpha: [2, 1], beta: true }, z: 3 };

  assert.equal(canonicalJson(left), '{"a":"first","nested":{"alpha":[2,1],"beta":true},"z":3}');
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(hashCanonical(left), hashCanonical(right));
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('layered hashes exclude volatile provenance but include stable environment facts', () => {
  const input = {
    state: { name: 'menu', kind: 'dialog', rect: { x: 10, y: 20, width: 300, height: 200 } },
    frame: { paperHtml: '<div>Menu</div>', jsx: '<div>Menu</div>' },
    shots: { surface: Buffer.from('same visual') },
    provenance: { browser: 'Edge 151', viewport: { width: 1440, height: 900 }, capturedAt: '2026-01-01T00:00:00Z', runId: 'one' },
  };
  const first = computeLayeredHashes(input);
  const second = computeLayeredHashes({
    ...input,
    provenance: { ...input.provenance, capturedAt: '2026-08-24T00:00:00Z', runId: 'two' },
  });
  const changedEnvironment = computeLayeredHashes({
    ...input,
    provenance: { ...input.provenance, browser: 'Edge 152' },
  });

  assert.deepEqual(first, second);
  assert.notEqual(first.environment, changedEnvironment.environment);
  assert.notEqual(first.artifact, changedEnvironment.artifact);
});

test('canonical JSON rejects non-JSON object types instead of collapsing them', () => {
  assert.throws(() => canonicalJson({ value: new Date('2026-01-01') }), /plain objects/i);
  assert.throws(() => canonicalJson({ value: new Map() }), /plain objects/i);
  assert.throws(() => canonicalJson({ value: Number.NaN }), /non-finite/i);
});

test('visually different captures remain distinct when their legacy state hash collides', () => {
  const base = {
    state: { name: 'menu', hash: 'legacy-collision', rect: { x: 0, y: 0, width: 100, height: 80 } },
    frame: { paperHtml: '<div>same topology and content</div>' },
    provenance: { browser: 'Edge' },
  };

  const dark = computeLayeredHashes({ ...base, shots: { surface: Buffer.from('dark pixels') } });
  const light = computeLayeredHashes({ ...base, shots: { surface: Buffer.from('light pixels') } });

  assert.equal(dark.state, light.state);
  assert.notEqual(dark.visual, light.visual);
  assert.notEqual(dark.artifact, light.artifact);
});
