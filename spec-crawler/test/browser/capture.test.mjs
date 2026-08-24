import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { Bundle } from '../../src/bundle.mjs';
import { captureState, pointerStateAction } from '../../src/capture.mjs';
import { SpecDriver } from '../../src/driver.mjs';
import * as pageAgent from '../../src/page-agent.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = await readFile(path.join(HERE, 'fixtures/capture.html'), 'utf8');

const executableCandidates = [
  process.env.SPEC_BROWSER_EXECUTABLE,
  chromium.executablePath(),
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => existsSync(candidate));
const browserOptions = executablePath ? { headless: true, executablePath } : null;

/* Fast but real: the fixture has no fonts or images to wait on, so the oracle
 * only has to see two identical quiet samples. */
const STABILITY = { timeoutMs: 3_000, quietWindowMs: 40, pollIntervalMs: 20, consecutiveSamples: 2 };

let browser;
let page;
let driver;
let bundleDir;
let bundle;
const scratch = [];

test.before(async () => {
  if (!browserOptions) return;
  browser = await chromium.launch(browserOptions);
  page = await browser.newPage({ viewport: { width: 900, height: 600 } });
});

test.after(async () => {
  await browser?.close();
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  if (!page) return;
  await page.setContent(fixture, { waitUntil: 'load' });
  await page.evaluate(pageAgent.tagElements, pageAgent.ID_ATTRIBUTE);
  driver = new SpecDriver({ close: async () => {} }, page);
  bundleDir = mkdtempSync(path.join(os.tmpdir(), 'spec-capture-'));
  scratch.push(bundleDir);
  bundle = new Bundle(bundleDir, { app: 'capture-fixture' }, { fresh: true });
});

const browserTest = (name, fn) => test(name, { skip: !browserOptions ? 'no chromium binary reachable' : false }, fn);

const specIdOf = (selector) => page.$eval(selector, (element, attribute) => element.getAttribute(attribute), pageAgent.ID_ATTRIBUTE);
const readManifest = () => JSON.parse(readFileSync(path.join(bundleDir, 'spec.json'), 'utf8'));

/** A failed capture must leave no manifest at all, and no orphan artifacts beside it. */
function assertNothingWritten() {
  assert.equal(existsSync(path.join(bundleDir, 'spec.json')), false, 'a failed capture wrote a manifest');
  for (const dir of ['frames', 'shots']) {
    const entries = readdirSync(path.join(bundleDir, dir));
    assert.deepEqual(entries, [], `a failed capture left artifacts in ${dir}/`);
  }
}

/** Delegate to the real driver, but let a test interpose on one call. */
function interpose(base, overrides) {
  return {
    page: base.page,
    serialize: (id) => base.serialize(id),
    screenshot: (id) => base.screenshot(id),
    structuralHash: (id) => base.structuralHash(id),
    cssSpec: (id) => base.cssSpec(id),
    annotate: (options) => base.annotate(options),
    clearAnnotations: () => base.clearAnnotations(),
    ...overrides,
  };
}

browserTest('captureState commits a subgrid row with its real rect and restores the page', async () => {
  const specId = await specIdOf('#row');
  const styleBefore = await page.$eval('#row', (element) => element.getAttribute('style'));
  const expected = await page.$eval('#row', (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  const result = await captureState({
    driver, bundle, specId, name: 'issue row rest', stability: STABILITY,
    notes: 'pointer parked outside the list',
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.committed, true);
  assert.equal(result.subgridResolved, 1);
  assert.ok(result.cleanup.every((entry) => entry.ok), JSON.stringify(result.cleanup));

  const record = result.record;
  assert.equal(Math.round(record.rect.width), Math.round(expected.width));
  assert.equal(Math.round(record.rect.height), Math.round(expected.height));
  assert.equal(Math.round(record.rect.x), Math.round(expected.x));

  // The frame must lay out standalone: the subgrid was baked into real tracks.
  const html = readFileSync(path.join(bundleDir, ...record.frame.split('/')), 'utf8');
  assert.ok(html.length > 0);
  assert.match(html, /\[icon\]/);
  assert.doesNotMatch(html, /grid-template-columns:\s*subgrid/);
  assert.ok(existsSync(path.join(bundleDir, ...record.shot.split('/'))));

  const manifest = readManifest();
  assert.equal(manifest.stateCount, 1);
  assert.equal(manifest.states[0].id, record.id);

  // The live page must be handed back exactly as it was found.
  const styleAfter = await page.$eval('#row', (element) => ({
    style: element.getAttribute('style'),
    token: element.hasAttribute('data-spec-subgrid-token'),
  }));
  assert.equal(styleAfter.style, styleBefore);
  assert.equal(styleAfter.token, false);
});

browserTest('a whole-page capture still records a rect rather than defaulting to 800x600', async () => {
  const result = await captureState({ driver, bundle, name: 'full page', stability: STABILITY });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.record.rect, { x: 0, y: 0, width: 900, height: 600 });
  assert.equal(readManifest().stateCount, 1);
});

browserTest('a subject that changes mid-capture is rejected and nothing is written', async () => {
  const specId = await specIdOf('#drifter');
  const mutating = interpose(driver, {
    // Serialization is the widest window in a capture; a virtualised list ticks
    // here more often than anywhere else.
    serialize: async (id) => {
      const frame = await driver.serialize(id);
      await page.$eval('#drifter', (element) => { element.textContent = 'Recycled label'; });
      return frame;
    },
  });

  const result = await captureState({ driver: mutating, bundle, specId, name: 'drifting', stability: STABILITY });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CAPTURE_DRIFT');
  assert.equal(result.stage, 'drift');
  assert.ok(result.evidence.differingFields.some((field) => field.field === 'textDigest'), JSON.stringify(result.evidence));
  assertNothingWritten();
});

browserTest('a throwing capture restores subgrid and releases the pointer', async () => {
  const specId = await specIdOf('#row');
  const styleBefore = await page.$eval('#row', (element) => element.getAttribute('style'));
  const failing = interpose(driver, {
    screenshot: async () => { throw new Error('screenshot backend unavailable'); },
  });

  const result = await captureState({
    driver: failing, bundle, specId, name: 'row active', stability: STABILITY,
    action: pointerStateAction('active'), pointerHeld: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'capture');
  assert.match(result.message, /screenshot backend unavailable/);
  assert.deepEqual(result.cleanup.map((entry) => entry.name), ['subgrid', 'pointer']);
  assert.ok(result.cleanup.every((entry) => entry.ok), JSON.stringify(result.cleanup));

  const pointer = await page.evaluate(() => window.__pointer);
  assert.equal(pointer.downs, 1);
  assert.equal(pointer.ups, 1, 'a held button turns every later move into a drag');

  const styleAfter = await page.$eval('#row', (element) => element.getAttribute('style'));
  assert.equal(styleAfter, styleBefore);
  assertNothingWritten();
});

browserTest('driving a pointer state commits the state the page actually reached', async () => {
  const specId = await specIdOf('#row');
  const result = await captureState({
    driver, bundle, specId, name: 'row hover', stability: STABILITY,
    action: pointerStateAction('hover'),
    notes: 'real pointer, not a forced pseudo-state',
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  const html = readFileSync(path.join(bundleDir, ...result.record.frame.split('/')), 'utf8');
  // The fixture marks the row through an attribute, so a :hover rule would not
  // reproduce it — the serialized frame has to carry the hovered background.
  assert.match(html, /rgb\(221, 227, 245\)/);
  assert.equal(await page.$eval('#row', (element) => element.getAttribute('data-active')), 'true');
});

browserTest('the annotated context shot is kept and the annotation layer never survives', async () => {
  const specId = await specIdOf('#panel');
  const result = await captureState({
    driver, bundle, specId, name: 'details panel', kind: 'dialog', tier: 4, stability: STABILITY,
    annotate: { triggerId: null, label: 'bottom/start gap 4px' },
    cssSpec: true,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(Object.keys(result.record.shots).sort(), ['context', 'surface']);
  assert.ok(existsSync(path.join(bundleDir, ...result.record.shots.context.split('/'))));
  assert.equal(await page.evaluate(() => Boolean(document.getElementById('__spec_annotations__'))), false);
});

browserTest('a CSS-only hover commits rather than deduping against rest', async () => {
  // #css-hover has no hover attribute and no script — rest and hover are the same
  // DOM. Topology-only dedupe reported the hover frame as already captured, which
  // is how hover frames went missing from state matrices on real apps.
  const specId = await specIdOf('#css-hover');
  const rest = await captureState({ driver, bundle, specId, name: 'css hover rest', stability: STABILITY });
  assert.equal(rest.ok, true, JSON.stringify(rest));
  assert.equal(rest.committed, true);

  const hover = await captureState({
    driver, bundle, specId, name: 'css hover hovered', stability: STABILITY,
    action: pointerStateAction('hover'),
  });
  assert.equal(hover.ok, true, JSON.stringify(hover));
  assert.equal(hover.committed, true, 'the hover frame must not be skipped as a duplicate');
  assert.notEqual(hover.record.hash, rest.record.hash);

  const html = readFileSync(path.join(bundleDir, ...hover.record.frame.split('/')), 'utf8');
  assert.match(html, /rgb\(201, 212, 242\)/, 'the committed frame must carry the hovered background');
});

browserTest('a live region makes its component uncapturable until it is declared volatile', async () => {
  await page.evaluate(() => window.__startLiveTicker());
  const specId = await specIdOf('#live-card');

  const undeclared = await captureState({ driver, bundle, specId, name: 'live card', stability: STABILITY });
  assert.equal(undeclared.ok, false, 'a ticking value must be caught by the drift guard when undeclared');
  assert.equal(undeclared.code, 'ERR_CAPTURE_DRIFT');
  assertNothingWritten();

  const declared = await captureState({
    driver, bundle, specId, name: 'live card', stability: STABILITY,
    volatile: [{ selector: '#live-count', reason: 'unread count ticks continuously; not part of the spec' }],
  });
  assert.equal(declared.ok, true, JSON.stringify(declared));
  assert.equal(declared.committed, true);

  const [region] = declared.record.volatile;
  assert.equal(region.selector, '#live-count');
  assert.match(region.reason, /ticks continuously/);
  assert.equal(region.matched, 1);
  // Rects are relative to the subject, which is the frame an element screenshot
  // is in — a viewport-relative rect would mask the wrong pixels below the fold.
  assert.ok(region.rects[0].width > 0 && region.rects[0].height > 0);
  assert.ok(region.rects[0].x < declared.record.rect.width, 'rect must be subject-relative, not viewport-relative');
});

browserTest('a volatile declaration must name a reason and must match something', async () => {
  await page.evaluate(() => window.__startLiveTicker());
  const specId = await specIdOf('#live-card');

  const noReason = await captureState({
    driver, bundle, specId, name: 'live card', stability: STABILITY,
    volatile: [{ selector: '#live-count' }],
  });
  assert.equal(noReason.ok, false);
  assert.equal(noReason.code, 'ERR_CAPTURE_VOLATILE_USAGE');
  assert.match(noReason.message, /reason/);

  // A stale selector is the dangerous case: the author believes the clock is
  // excluded, nothing matches, and the capture fails as drift with no hint that
  // the declaration was the problem.
  const stale = await captureState({
    driver, bundle, specId, name: 'live card', stability: STABILITY,
    volatile: [{ selector: '#renamed-last-week', reason: 'unread count' }],
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'ERR_CAPTURE_VOLATILE_UNMATCHED');
  assert.match(stale.message, /#renamed-last-week/);
  assertNothingWritten();
});

browserTest('a second identical capture is deduped instead of written twice', async () => {
  const specId = await specIdOf('#panel');
  const first = await captureState({ driver, bundle, specId, name: 'details panel', stability: STABILITY });
  assert.equal(first.ok, true, JSON.stringify(first));

  const second = await captureState({ driver, bundle, specId, name: 'details panel again', stability: STABILITY });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.duplicate, true);
  assert.equal(second.existingId, first.record.id);
  assert.equal(readManifest().stateCount, 1);
});
