import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Bundle } from '../../src/bundle.mjs';

function png(width = 80, height = 60) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const withTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bundle-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

const addState = (bundle, name = 'Menu', extra = {}) => bundle.add(
  { name, tier: 3, kind: 'dialog', hash: `legacy-${name}`, rect: { x: 10, y: 20, width: 80, height: 60 }, ...extra },
  { paperHtml: `<div>${name}</div>`, jsx: `<div>${name}</div>` },
  png(),
  { rest: { opacity: '1' } },
);

test('add remains compatible and writes artifacts plus spec.json through immediately', () => withTemp((dir) => {
  const bundle = new Bundle(dir, { title: 'Demo', hash: 'top-level-legacy-hash' }, {
    now: () => '2026-08-24T10:00:00.000Z',
  });
  const record = addState(bundle);

  assert.equal(record.id, '001-menu');
  assert.equal(record.hash, 'legacy-Menu');
  assert.equal(record.shot, 'shots/001-menu.png');
  assert.equal(record.shots.surface, record.shot);
  assert.equal(record.frame, 'frames/001-menu.html');
  assert.equal(record.jsx, 'jsx/001-menu.jsx');
  assert.equal(record.states, 'states/001-menu.json');
  assert.ok(record.hashes.artifact);
  assert.ok(record.artifacts.length >= 4);
  assert.equal(bundle.seen('legacy-Menu'), true);
  assert.equal(bundle.states[0], record);

  const spec = JSON.parse(readFileSync(path.join(dir, 'spec.json'), 'utf8'));
  assert.equal(spec.schemaVersion, 2);
  assert.equal(spec.manifestRevision, 1);
  assert.equal(spec.hash, 'top-level-legacy-hash');
  assert.equal(spec.stateCount, 1);
  assert.equal(spec.states[0].id, '001-menu');
  assert.equal(existsSync(path.join(dir, record.frame)), true);
}));

test('resumes an unversioned v1 bundle, migrates additively, and numbers after the highest existing prefix', () => withTemp((dir) => {
  mkdirSync(path.join(dir, 'frames'), { recursive: true });
  mkdirSync(path.join(dir, 'shots'), { recursive: true });
  for (const id of ['001-first', '005-fifth']) {
    writeFileSync(path.join(dir, 'frames', `${id}.html`), `<div>${id}</div>`);
    writeFileSync(path.join(dir, 'shots', `${id}.png`), png());
  }
  writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({
    title: 'v1 bundle',
    capturedAt: '2026-08-23T00:00:00.000Z',
    cssSpec: { preserved: true },
    crawlReport: { preserved: true },
    stateCount: 2,
    states: [
      { id: '001-first', name: 'first', hash: 'old-one', rect: { x: 0, y: 0, width: 80, height: 60 }, frame: 'frames/001-first.html', shot: 'shots/001-first.png', shots: { surface: 'shots/001-first.png' } },
      { id: '005-fifth', name: 'fifth', hash: 'old-five', rect: { x: 0, y: 0, width: 80, height: 60 }, frame: 'frames/005-fifth.html', shot: 'shots/005-fifth.png', shots: { surface: 'shots/005-fifth.png' } },
    ],
  }, null, 2));

  const bundle = new Bundle(dir, {}, { now: () => '2026-08-24T00:00:00.000Z' });
  assert.equal(bundle.resumed, 2);
  assert.equal(bundle.seen('old-five'), true);
  const next = addState(bundle, 'Next');
  assert.equal(next.id, '006-next');

  const spec = JSON.parse(readFileSync(path.join(dir, 'spec.json'), 'utf8'));
  assert.equal(spec.schemaVersion, 2);
  assert.equal(spec.provenance.sourceSchemaVersion, 1);
  assert.equal(spec.states[0].hash, 'old-one');
  assert.ok(spec.states[0].hashes.artifact);
  assert.ok(spec.states[0].artifacts.length === 2);
  assert.deepEqual(spec.cssSpec, { preserved: true });
  assert.deepEqual(spec.crawlReport, { preserved: true });
}));

test('malformed existing spec.json throws without clearing bundle contents', () => withTemp((dir) => {
  mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const sentinel = path.join(dir, 'frames', 'do-not-delete.html');
  writeFileSync(sentinel, '<div>evidence</div>');
  writeFileSync(path.join(dir, 'spec.json'), '{broken');

  assert.throws(() => new Bundle(dir), /Malformed manifest JSON/);
  assert.throws(() => new Bundle(dir, {}, { fresh: true }), /Malformed manifest JSON/);
  assert.equal(readFileSync(sentinel, 'utf8'), '<div>evidence</div>');
  assert.equal(readFileSync(path.join(dir, 'spec.json'), 'utf8'), '{broken');
}));

test('rejects empty frames and missing surface shots without publishing a state', () => withTemp((dir) => {
  const bundle = new Bundle(dir);
  assert.throws(
    () => bundle.add({ name: 'empty', rect: { x: 0, y: 0, width: 1, height: 1 } }, { paperHtml: '' }, png(1, 1)),
    /non-empty HTML/i,
  );
  assert.throws(
    () => bundle.add({ name: 'no-shot', rect: { x: 0, y: 0, width: 1, height: 1 } }, { paperHtml: '<div>x</div>' }),
    /surface shot/i,
  );
  assert.equal(bundle.states.length, 0);
  assert.equal(existsSync(path.join(dir, 'spec.json')), false);
}));

test('derives a missing rect from the surface PNG for existing capture_at callers', () => withTemp((dir) => {
  const bundle = new Bundle(dir);
  const record = bundle.add(
    { name: 'point capture', tier: 3, kind: 'agent-captured', hash: 'point' },
    { paperHtml: '<div>point</div>' },
    png(123, 45),
  );
  assert.deepEqual(record.rect, { x: 0, y: 0, width: 123, height: 45 });
}));

test('motion contracts, empty JSX, and falsey CSS state payloads hash and resume consistently', () => withTemp((dir) => {
  const bundle = new Bundle(dir);
  const record = bundle.add(
    {
      name: 'animated',
      kind: 'dialog',
      rect: { x: 0, y: 0, width: 80, height: 60 },
      animation: {
        frames: 2,
        frameIntervalMs: 16,
        nodes: [{
          id: 'panel',
          properties: { opacity: { from: 0, to: 1, driven: true } },
          transition: { property: 'opacity', duration: '0.2s', easing: 'ease', delay: '0s' },
        }],
      },
    },
    { paperHtml: '<div>animated</div>', jsx: '' },
    png(),
    false,
  );
  assert.ok(record.contract);
  assert.ok(record.checklist);
  assert.ok(record.jsx);
  assert.ok(record.states);

  const resumed = new Bundle(dir);
  assert.equal(resumed.resumed, 1);
  assert.equal(resumed.states[0].hashes.artifact, record.hashes.artifact);
}));

test('different CSS-only bundles have different content and artifact hashes', () => {
  const leftDir = mkdtempSync(path.join(tmpdir(), 'bundle-css-left-'));
  const rightDir = mkdtempSync(path.join(tmpdir(), 'bundle-css-right-'));
  try {
    const left = new Bundle(leftDir, {}, { now: () => '2026-08-24T00:00:00.000Z' });
    left.setCssSpec({ selectors: 1 });
    left.write();
    const right = new Bundle(rightDir, {}, { now: () => '2026-08-24T00:00:00.000Z' });
    right.setCssSpec({ selectors: 2 });
    right.write();
    const leftSpec = JSON.parse(readFileSync(path.join(leftDir, 'spec.json'), 'utf8'));
    const rightSpec = JSON.parse(readFileSync(path.join(rightDir, 'spec.json'), 'utf8'));
    assert.notEqual(leftSpec.hashes.content, rightSpec.hashes.content);
    assert.notEqual(leftSpec.hashes.artifact, rightSpec.hashes.artifact);
  } finally {
    rmSync(leftDir, { recursive: true, force: true });
    rmSync(rightDir, { recursive: true, force: true });
  }
});

test('write preserves the CSS-only zero-state bundle and compatibility setters', () => withTemp((dir) => {
  const bundle = new Bundle(dir, { title: 'CSS only' }, { now: () => '2026-08-24T00:00:00.000Z' });
  bundle.setCssSpec({ selectors: 7 });
  bundle.setCrawlReport({ visited: 0 });
  const specPath = bundle.write();
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));

  assert.equal(spec.stateCount, 0);
  assert.deepEqual(spec.states, []);
  assert.deepEqual(spec.cssSpec, { selectors: 7 });
  assert.deepEqual(spec.crawlReport, { visited: 0 });
}));
