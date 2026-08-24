import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { encodePng } from '../../src/visual-diff.mjs';
import { verifyPaperRoundTrip, verifyStandaloneState, volatileMasks } from '../../src/verification.mjs';

const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
const shot = () => encodePng({ width: 2, height: 1, data: pixels });

function withTemp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verification-'));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

function bundle(dir, { frame = true, screenshot = true } = {}) {
  mkdirSync(path.join(dir, 'frames'), { recursive: true });
  mkdirSync(path.join(dir, 'shots'), { recursive: true });
  if (frame) writeFileSync(path.join(dir, 'frames/001-state.html'), '<!-- lead --><body style="position:absolute;top:5px;width:2px;height:1px"><span role="status">ready</span></body>');
  if (screenshot) writeFileSync(path.join(dir, 'shots/001-state.png'), shot());
  writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({
    provenance: { viewport: { width: 320, height: 240 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' },
    states: [{
      id: '001-state', kind: 'fixture', rect: { x: 0, y: 0, width: 2, height: 1 },
      frame: 'frames/001-state.html', shot: 'shots/001-state.png',
      semanticLandmarks: [{ name: 'status', role: 'status' }],
    }],
  }));
}

function paperClient({ screenshot = 'image', fit = true } = {}) {
  const calls = [];
  return {
    calls,
    async info(args) { return { fileName: 'Paper file', pageName: 'Page 1', fileId: args.fileId ?? 'file-1', pageId: 'page-1' }; },
    async call(name, args) {
      calls.push({ name, args });
      if (name === 'create_artboard') return { nodeId: 'node-1' };
      if (name === 'get_tree_summary') {
        if (!fit) return 'Frame "Artboard" (node-1) 64×64';
        return 'Frame "Artboard" (node-1) 64×64\n  Frame "Content" (child-1) 2×1';
      }
      if (name === 'get_screenshot') {
        if (screenshot === 'missing') return { content: [{ type: 'text', text: 'not ready' }] };
        return { content: [{ type: 'text', text: '{"ok":true}' }, { type: 'image', mimeType: 'image/png', data: shot().toString('base64') }] };
      }
      return { ok: true };
    },
  };
}

test('standalone verification uses injected renderer and returns accepted evidence', () => withTemp(async (dir) => {
  bundle(dir);
  let request;
  const result = await verifyStandaloneState(dir, '001', {
    render: async (input) => {
      request = input;
      return {
        png: shot(),
        geometry: { width: 2, height: 1, scrollWidth: 2, scrollHeight: 1, clientWidth: 2, clientHeight: 1 },
        overflow: { x: false, y: false },
        clipping: { clipped: false, descendantCount: 0 },
        landmarks: [{ name: 'status', required: true, found: true, count: 1 }],
        fonts: { status: 'loaded', families: ['Inter'] },
      };
    },
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.comparison.sizeMatch, true);
  assert.equal(result.checks.pass, true);
  assert.equal(request.environment.colorScheme, 'dark');
  assert.equal(request.environment.reducedMotion, 'reduce');
  assert.match(request.html, /^<!-- lead --><div style="position: relative; width:2px; height:1px">/);
  assert.ok(result.reportHash);
}));

test('standalone missing frame is an error and missing screenshot is pending', () => withTemp(async (dir) => {
  bundle(dir, { frame: false });
  assert.equal((await verifyStandaloneState(dir, '001', { render: async () => ({ png: shot() }) })).status, 'error');

  const pendingDir = path.join(dir, 'pending');
  bundle(pendingDir, { screenshot: false });
  assert.equal((await verifyStandaloneState(pendingDir, '001', { render: async () => ({ png: shot() }) })).status, 'pending');
}));

test('Paper screenshot unavailable is unavailable rather than accepted', () => withTemp(async (dir) => {
  bundle(dir);
  const client = paperClient({ screenshot: 'missing' });
  const result = await verifyPaperRoundTrip(dir, '001', { client, standalone: false });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.nodeId, 'node-1');
  assert.match(result.reason, /no PNG/i);
}));

test('Paper fit failure is rejected before screenshot comparison', () => withTemp(async (dir) => {
  bundle(dir);
  const client = paperClient({ fit: false });
  const result = await verifyPaperRoundTrip(dir, '001', { client, standalone: false });
  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /fitToContent/i);
  assert.equal(client.calls.some((call) => call.name === 'get_screenshot'), false);
}));

test('Paper round trip compares source and standalone with exact IDs and dimensions', () => withTemp(async (dir) => {
  bundle(dir);
  const client = paperClient();
  const result = await verifyPaperRoundTrip(dir, '001', {
    client,
    fileId: 'explicit-file',
    standaloneResult: { status: 'accepted', candidatePng: shot() },
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.fileId, 'explicit-file');
  assert.equal(result.pageId, 'page-1');
  assert.equal(result.nodeId, 'node-1');
  assert.equal(result.source.sizeMatch, true);
  assert.equal(result.standalone.sizeMatch, true);
  assert.equal(result.dimensions.source.width, 2);
  assert.equal(result.dimensions.paper.width, 2);
  const screenshotCall = client.calls.find((call) => call.name === 'get_screenshot');
  assert.equal(screenshotCall.args.fileId, 'explicit-file');
}));

test('volatileMasks scales recorded CSS-pixel rects into device pixels', () => {
  // The rects are recorded in CSS pixels relative to the subject; the PNG is in
  // device pixels. Skipping this conversion masks the wrong quarter of the image
  // on any retina capture, and the verdict still reads as a clean pass.
  const state = {
    volatile: [
      { selector: '#clock', reason: 'ticks', rects: [{ x: 10, y: 4, width: 30.4, height: 12.2 }] },
      { selector: '.badge', reason: 'unread count', rects: [{ x: 0, y: 0, width: 8, height: 8 }] },
    ],
  };

  assert.deepEqual(volatileMasks(state, 1), [
    { x: 10, y: 4, width: 31, height: 13 },
    { x: 0, y: 0, width: 8, height: 8 },
  ]);
  assert.deepEqual(volatileMasks(state, 2), [
    { x: 20, y: 8, width: 61, height: 25 },
    { x: 0, y: 0, width: 16, height: 16 },
  ]);

  // Masks round outward — a mask one pixel short of the volatile region leaves a
  // fringe of ticking pixels in the comparison, which is the failure it exists to
  // prevent.
  const [scaled] = volatileMasks({ volatile: [{ rects: [{ x: 1.6, y: 1.6, width: 1.1, height: 1.1 }] }] }, 1);
  assert.deepEqual(scaled, { x: 1, y: 1, width: 2, height: 2 });

  assert.deepEqual(volatileMasks({}, 2), []);
  assert.deepEqual(volatileMasks(null, 2), []);
  assert.deepEqual(volatileMasks(state, 0), volatileMasks(state, 1), 'a nonsense ratio falls back to 1, never to zero-size masks');
});
