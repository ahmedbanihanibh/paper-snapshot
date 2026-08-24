import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  MANIFEST_SCHEMA_VERSION,
  normalizeManifest,
  readManifest,
  serializeManifest,
} from '../../src/manifest.mjs';

const withTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'manifest-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('unversioned v1 manifests normalize in memory and serialize additively as v2', () => {
  const v1 = {
    title: 'Captured app',
    hash: 'bundle-v1-hash',
    capturedAt: '2026-08-23T10:00:00.000Z',
    stateCount: 1,
    states: [{ id: '001-menu', name: 'menu', hash: 'legacy-state-hash', frame: 'frames/001-menu.html' }],
    cssSpec: { selectors: 2 },
  };

  const migrated = normalizeManifest(v1);

  assert.equal(migrated.schemaVersion, MANIFEST_SCHEMA_VERSION);
  assert.equal(migrated.manifestRevision, 0);
  assert.equal(migrated.hash, 'bundle-v1-hash');
  assert.equal(migrated.states[0].hash, 'legacy-state-hash');
  assert.deepEqual(migrated.cssSpec, v1.cssSpec);
  assert.equal(migrated.provenance.sourceSchemaVersion, 1);

  const persisted = JSON.parse(serializeManifest(migrated));
  assert.equal(persisted.schemaVersion, 2);
  assert.equal(persisted.stateCount, 1);
  assert.equal(persisted.states[0].frame, 'frames/001-menu.html');
});

test('zero-state CSS-only manifests remain valid', () => {
  const manifest = normalizeManifest({ cssSpec: { button: { hover: true } } });
  assert.deepEqual(manifest.states, []);
  assert.equal(manifest.stateCount, 0);
  assert.deepEqual(manifest.cssSpec, { button: { hover: true } });
});

test('malformed JSON fails loudly with the manifest path', () => withTemp((dir) => {
  const file = path.join(dir, 'spec.json');
  writeFileSync(file, '{"states": [', 'utf8');

  assert.throws(
    () => readManifest(file),
    (error) => error instanceof SyntaxError && error.message.includes(file) && error.cause instanceof SyntaxError,
  );
  assert.equal(readFileSync(file, 'utf8'), '{"states": [');
}));

test('structurally malformed v2 manifests are rejected without being repaired', () => withTemp((dir) => {
  const file = path.join(dir, 'spec.json');
  const source = JSON.stringify({
    schemaVersion: 2,
    manifestRevision: 4,
    provenance: { sourceSchemaVersion: 2 },
    stateCount: 99,
    states: [],
  });
  writeFileSync(file, source, 'utf8');

  assert.throws(() => readManifest(file), /stateCount 99/);
  assert.equal(readFileSync(file, 'utf8'), source);
  assert.throws(() => normalizeManifest({ schemaVersion: 2, states: [], stateCount: 0, provenance: { sourceSchemaVersion: 2 } }), /manifestRevision/);
}));

test('manifest serialization is deterministic across key order', () => {
  const a = normalizeManifest({ z: 1, title: 'x', states: [] });
  const b = normalizeManifest({ states: [], title: 'x', z: 1 });
  assert.equal(serializeManifest(a), serializeManifest(b));
});
