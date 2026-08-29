import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ArtifactStore, describeArtifact } from '../../src/artifact-store.mjs';
import { computeLayeredHashes, hashCanonical, sha256 } from '../../src/hashes.mjs';
import { normalizeManifest } from '../../src/manifest.mjs';

function png(width = 4, height = 3) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const withTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'artifact-store-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

function transaction(revision = 1, overrides = {}) {
  const html = overrides.html ?? Buffer.from('<div>Captured</div>');
  const image = overrides.image ?? png();
  const frame = describeArtifact({ id: '001-card:frame', kind: 'frame', path: 'frames/001-card.html', data: html });
  const shot = describeArtifact({ id: '001-card:shot:surface', kind: 'shot', path: 'shots/001-card.png', data: image });
  const stateInput = { name: 'card', kind: 'surface', rect: overrides.rect ?? { x: 1, y: 2, width: 4, height: 3 } };
  const hashes = computeLayeredHashes({ state: stateInput, frame: { paperHtml: html.toString('utf8') }, shots: { surface: image } });
  const state = {
    id: '001-card',
    ...stateInput,
    frame: frame.path,
    shot: overrides.omitShot ? undefined : shot.path,
    shots: overrides.omitShot ? {} : { surface: shot.path },
    artifacts: overrides.omitShot ? [frame] : [frame, shot],
    hashes,
    provenance: {},
  };
  const manifest = normalizeManifest({
    manifestRevision: revision,
    states: [state],
    artifacts: state.artifacts,
    provenance: { sourceSchemaVersion: 2 },
  });
  const artifacts = overrides.omitShot
    ? [{ ...frame, data: html }]
    : [{ ...frame, data: html }, { ...shot, data: image }];
  return { manifest, artifacts };
}

test('stages and commits validated artifacts before atomically publishing spec.json', () => withTemp((dir) => {
  const store = new ArtifactStore(dir);
  const tx = transaction();
  store.commit(tx);

  assert.equal(readFileSync(path.join(dir, 'frames/001-card.html'), 'utf8'), '<div>Captured</div>');
  assert.deepEqual(readFileSync(path.join(dir, 'shots/001-card.png')), png());
  const manifest = JSON.parse(readFileSync(path.join(dir, 'spec.json'), 'utf8'));
  assert.equal(manifest.manifestRevision, 1);
  assert.equal(manifest.states[0].artifacts[1].width, 4);
  assert.equal(manifest.states[0].artifacts[1].height, 3);
  assert.equal(readdirSync(dir).some((name) => name.startsWith('.artifact-stage-')), false);
}));

test('rejects path traversal before writing outside the bundle', () => withTemp((dir) => {
  const store = new ArtifactStore(dir);
  const tx = transaction();
  tx.artifacts[0].path = '../escaped.html';

  assert.throws(() => store.commit(tx), /safe relative path/i);
  assert.equal(existsSync(path.join(dir, '..', 'escaped.html')), false);
  assert.equal(existsSync(path.join(dir, 'spec.json')), false);
}));

test('rejects empty HTML, invalid PNGs, invalid rects, and a missing required surface shot', () => withTemp((dir) => {
  const store = new ArtifactStore(dir);

  assert.throws(() => store.commit(transaction(1, { html: Buffer.from('   ') })), /non-empty HTML/i);
  assert.throws(() => store.commit(transaction(1, { image: Buffer.from('not a png') })), /PNG signature/i);
  assert.throws(() => store.commit(transaction(1, { rect: { x: 0, y: 0, width: 0, height: 3 } })), /positive finite width/i);
  assert.throws(() => store.commit(transaction(1, { omitShot: true })), /surface shot/i);
  assert.equal(existsSync(path.join(dir, 'spec.json')), false);
}));

test('manifest replacement is atomic under an injected failure and abandoned staging is recovered safely', () => withTemp((dir) => {
  const initial = normalizeManifest({ manifestRevision: 1, states: [], cssSpec: { preserved: true } });
  new ArtifactStore(dir).commit({ manifest: initial, artifacts: [] });
  const before = readFileSync(path.join(dir, 'spec.json'), 'utf8');

  const failing = new ArtifactStore(dir, {
    seams: {
      beforeManifestRename() { throw new Error('injected manifest rename failure'); },
    },
  });
  assert.throws(() => failing.commit(transaction(2)), /injected manifest rename failure/);
  assert.equal(readFileSync(path.join(dir, 'spec.json'), 'utf8'), before);
  assert.equal(readdirSync(dir).some((name) => name.startsWith('.artifact-stage-')), true);

  const recovered = new ArtifactStore(dir);
  assert.equal(recovered.abandonedStaging.length, 1);
  assert.equal(existsSync(path.join(dir, 'frames/001-card.html')), false);
  assert.equal(readFileSync(path.join(dir, 'spec.json'), 'utf8'), before);
}));

test('a fault after the manifest rename is recorded, not thrown — the commit already happened', () => withTemp((dir) => {
  // The manifest rename is the commit point. A housekeeping failure after it used
  // to propagate out of commit(), so the caller saw a throw for a state that was
  // already durably written, retried it, and minted a second id for one state.
  const store = new ArtifactStore(dir, {
    seams: { afterManifestRename() { throw new Error('injected post-commit fault'); } },
  });

  const manifestPath = store.commit(transaction(1));
  assert.equal(manifestPath, path.join(dir, 'spec.json'));

  const written = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(written.states.length, 1, 'the state must be present in the published manifest');
  assert.equal(existsSync(path.join(dir, 'frames/001-card.html')), true);

  assert.equal(store.lastCommitFaults.length, 1);
  assert.equal(store.lastCommitFaults[0].step, 'afterManifestRename');
  assert.match(store.lastCommitFaults[0].message, /injected post-commit fault/);
}));

test('rollback preserves identical files that predated the failed transaction', () => withTemp((dir) => {
  const initial = normalizeManifest({ manifestRevision: 1, states: [], cssSpec: { preserved: true } });
  new ArtifactStore(dir).commit({ manifest: initial, artifacts: [] });
  mkdirSync(path.join(dir, 'frames'));
  mkdirSync(path.join(dir, 'shots'));
  writeFileSync(path.join(dir, 'frames/001-card.html'), '<div>Captured</div>');
  writeFileSync(path.join(dir, 'shots/001-card.png'), png());

  const failing = new ArtifactStore(dir, { seams: { beforeManifestRename() { throw new Error('stop'); } } });
  assert.throws(() => failing.commit(transaction(2)), /stop/);
  new ArtifactStore(dir);

  assert.equal(readFileSync(path.join(dir, 'frames/001-card.html'), 'utf8'), '<div>Captured</div>');
  assert.deepEqual(readFileSync(path.join(dir, 'shots/001-card.png')), png());
}));

test('abandoned recovery rejects intermediate symlinks and never touches external files', () => withTemp((dir) => {
  const outside = mkdtempSync(path.join(tmpdir(), 'artifact-store-outside-'));
  try {
    const victim = path.join(outside, 'victim.html');
    const content = Buffer.from('<div>external</div>');
    writeFileSync(victim, content);
    symlinkSync(outside, path.join(dir, 'frames'), 'dir');
    const transactionId = '11111111-1111-4111-8111-111111111111';
    const stage = path.join(dir, `.artifact-stage-${transactionId}`);
    mkdirSync(stage);
    writeFileSync(path.join(stage, 'transaction.json'), JSON.stringify({
      transactionId,
      targetRevision: 1,
      artifacts: [{ path: 'frames/victim.html', sha256: sha256(content), created: true }],
    }));

    assert.throws(() => new ArtifactStore(dir), /symbolic link/i);
    assert.equal(readFileSync(victim, 'utf8'), '<div>external</div>');
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
}));

test('rejects a symlinked spec.json without reading or replacing its target', () => withTemp((dir) => {
  const outside = mkdtempSync(path.join(tmpdir(), 'artifact-store-manifest-outside-'));
  try {
    const target = path.join(outside, 'spec.json');
    writeFileSync(target, '{"external":true}');
    symlinkSync(target, path.join(dir, 'spec.json'));
    assert.throws(() => new ArtifactStore(dir), /Unsafe manifest path/);
    assert.equal(readFileSync(target, 'utf8'), '{"external":true}');
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
}));

test('rejects artifact-less ghost states', () => withTemp((dir) => {
  const manifest = normalizeManifest({ manifestRevision: 1, states: [{ id: 'ghost' }] });
  assert.throws(() => new ArtifactStore(dir).commit({ manifest, artifacts: [] }), /missing its frame reference/i);
  assert.equal(existsSync(path.join(dir, 'spec.json')), false);
}));

test('does not treat arbitrary similarly named directories as owned staging', () => withTemp((dir) => {
  const unrelated = path.join(dir, '.artifact-stage-user-data');
  mkdirSync(unrelated);
  writeFileSync(path.join(unrelated, 'keep.txt'), 'user data');

  const store = new ArtifactStore(dir);
  assert.deepEqual(store.abandonedStaging, []);
  assert.equal(readFileSync(path.join(unrelated, 'keep.txt'), 'utf8'), 'user data');
}));

test('rejects duplicate artifact IDs and mismatched content hashes', () => withTemp((dir) => {
  const store = new ArtifactStore(dir);
  const duplicate = transaction();
  duplicate.manifest.states[0].artifacts[1].id = duplicate.manifest.states[0].artifacts[0].id;
  duplicate.manifest.artifacts = duplicate.manifest.states[0].artifacts;
  assert.throws(() => store.commit(duplicate), /Duplicate artifact id/);

  const mismatched = transaction();
  mismatched.manifest.states[0].artifacts[0].sha256 = '0'.repeat(64);
  mismatched.manifest.artifacts = mismatched.manifest.states[0].artifacts;
  assert.throws(() => store.commit(mismatched), /hash mismatch/i);

  const forgedLayer = transaction();
  forgedLayer.manifest.states[0].hashes.topology = '1'.repeat(64);
  const forged = forgedLayer.manifest.states[0].hashes;
  forged.artifact = hashCanonical({
    topology: forged.topology,
    state: forged.state,
    layout: forged.layout,
    visual: forged.visual,
    content: forged.content,
    environment: forged.environment,
  });
  assert.throws(() => store.commit(forgedLayer), /topology hash mismatch/i);
}));
