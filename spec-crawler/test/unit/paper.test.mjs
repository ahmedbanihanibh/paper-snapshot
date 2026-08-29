import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { encodePng } from '../../src/visual-diff.mjs';
import { importBundle, normalizeFrameRoot, PaperClient } from '../../src/paper.mjs';

function withTemp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'paper-verification-'));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

function fixtureBundle(dir, { html = '<div style="width: 2px; height: 1px">x</div>', frame = true } = {}) {
  mkdirSync(path.join(dir, 'frames'), { recursive: true });
  mkdirSync(path.join(dir, 'shots'), { recursive: true });
  if (frame) writeFileSync(path.join(dir, 'frames/001-card.html'), html);
  writeFileSync(path.join(dir, 'shots/001-card.png'), encodePng({ width: 2, height: 1, data: Buffer.from([255, 0, 0, 255, 255, 0, 0, 255]) }));
  writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({
    title: 'fixture',
    states: [{ id: '001-card', kind: 'card', rect: { x: 0, y: 0, width: 2, height: 1 }, frame: 'frames/001-card.html', shot: 'shots/001-card.png' }],
  }));
}

function fakePaper({ fit = true } = {}) {
  const calls = [];
  let creates = 0;
  return {
    calls,
    get creates() { return creates; },
    async info(args) {
      calls.push({ name: 'get_basic_info', args });
      return { fileName: 'Fixture', pageName: 'Page', fileId: args.fileId ?? 'file-default', pageId: 'page-1' };
    },
    async call(name, args) {
      calls.push({ name, args });
      if (name === 'create_artboard') { creates += 1; return { nodeId: `node-${creates}` }; }
      if (name === 'get_tree_summary') {
        if (!fit) throw new Error('summary unavailable');
        return 'Frame "Artboard" (node-1) 64×64\n  Frame "Content" (child-1) 2×1';
      }
      if (name === 'get_children') return { children: [{ id: 'child-1' }] };
      return { ok: true };
    },
  };
}

test('PaperClient retains every mixed MCP content part while single text stays compatible', async () => {
  const previousFetch = globalThis.fetch;
  const image = Buffer.from('image').toString('base64');
  globalThis.fetch = async () => new Response(JSON.stringify({
    jsonrpc: '2.0', id: 1,
    result: { content: [{ type: 'text', text: '{"nodeId":"A"}' }, { type: 'image', mimeType: 'image/png', data: image }] },
  }), { headers: { 'content-type': 'application/json' } });
  try {
    const mixed = await new PaperClient('http://paper.invalid').call('get_screenshot');
    assert.equal(mixed.content.length, 2);
    assert.deepEqual(mixed.parsedTexts, [{ nodeId: 'A' }]);
    assert.equal(mixed.images[0].data, image);

    globalThis.fetch = async () => new Response(JSON.stringify({
      jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: '{"fileName":"Legacy"}' }] },
    }));
    assert.deepEqual(await new PaperClient('http://paper.invalid').call('get_basic_info'), { fileName: 'Legacy' });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('normalization skips style/comments, demotes body, and preserves nested positioning', () => {
  const html = '<style>@keyframes x{}</style><!-- capture --><body style="position: fixed; top: 20px; left: 30px; width: 20px"><div style="position:absolute;top:4px">child</div></body>';
  const normalized = normalizeFrameRoot(html);
  assert.match(normalized, /^<style>[\s\S]*<\/style><!-- capture --><div style="position: relative; width: 20px">/);
  assert.match(normalized, /<div style="position:absolute;top:4px">child<\/div><\/div>$/);
  assert.doesNotMatch(normalized, /left: 30px|top: 20px/);

  const dataUri = normalizeFrameRoot('<div style="position:absolute;left:2px;background-image:url(data:image/svg+xml;utf8,&lt;svg/&gt;);width:4px"></div>');
  assert.match(dataUri, /background-image:url\(data:image\/svg\+xml;utf8,&lt;svg\/&gt;\)/);
});

test('dry run performs no Paper writes and propagates fileId to the read', () => withTemp(async (dir) => {
  fixtureBundle(dir);
  const client = fakePaper();
  const result = await importBundle(dir, { client, fileId: 'file-explicit', dryRun: true });
  assert.equal(result.imported[0].dryRun, true);
  assert.equal(result.imported[0].action, 'create');
  assert.deepEqual(client.calls.map((call) => call.name), ['get_basic_info']);
  assert.deepEqual(client.calls[0].args, { fileId: 'file-explicit' });
}));

test('successful import propagates fileId and an idempotent retry skips creation', () => withTemp(async (dir) => {
  fixtureBundle(dir);
  const client = fakePaper();
  const first = await importBundle(dir, { client, fileId: 'file-explicit' });
  const second = await importBundle(dir, { client, fileId: 'file-explicit' });

  assert.equal(first.imported[0].action, 'create');
  assert.equal(first.imported[0].fitStatus, 'fitted');
  assert.equal(second.imported[0].action, 'skip');
  assert.equal(client.creates, 1);
  for (const call of client.calls.filter((entry) => entry.name !== 'get_basic_info')) assert.equal(call.args.fileId, 'file-explicit');
}));

test('changed frames conflict by default and update the existing artboard explicitly', () => withTemp(async (dir) => {
  fixtureBundle(dir);
  const client = fakePaper();
  await importBundle(dir, { client });
  writeFileSync(path.join(dir, 'frames/001-card.html'), '<div style="width: 2px; height: 1px">changed</div>');
  const specPath = path.join(dir, 'spec.json');
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  writeFileSync(specPath, JSON.stringify({ ...spec, hashes: { artifact: 'bundle-digest-after-change' } }));

  const conflict = await importBundle(dir, { client });
  assert.equal(conflict.imported[0].action, 'conflict');
  assert.equal(client.creates, 1);

  const update = await importBundle(dir, { client, onConflict: 'update' });
  assert.equal(update.imported[0].action, 'update');
  assert.equal(update.imported[0].nodeId, 'node-1');
  assert.equal(client.creates, 1);
  assert.equal(client.calls.some((call) => call.name === 'delete_nodes'), true);
}));

test('fit failure is recorded as rejected and missing frame fails before Paper writes', () => withTemp(async (dir) => {
  fixtureBundle(dir);
  const client = fakePaper({ fit: false });
  const result = await importBundle(dir, { client });
  assert.equal(result.imported[0].status, 'rejected');
  assert.equal(result.imported[0].fitStatus, 'failed');

  const missing = path.join(dir, 'missing');
  fixtureBundle(missing, { frame: false });
  const missingClient = fakePaper();
  await assert.rejects(() => importBundle(missing, { client: missingClient }), /frame is missing/i);
  assert.equal(missingClient.creates, 0);
  assert.deepEqual(missingClient.calls, []);
}));
