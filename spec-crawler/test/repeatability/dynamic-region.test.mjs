/**
 * The other half of repeatability: can the pipeline express "this region is
 * *expected* to vary"?
 *
 * It can, in two distinct places, and conflating them is the mistake this file
 * exists to prevent.
 *
 * At COMPARISON time, `src/visual-diff.mjs` and `src/verification.mjs` mask
 * pixels when two images are diffed. At CAPTURE time, `captureState` takes a
 * `volatile: [{ selector, reason }]` declaration, which is a different and
 * stronger thing: it excludes the region from drift detection and from state
 * identity. Without it a subject containing any live region — a clock, a relative
 * timestamp, a live count — cannot be captured at all, because the value ticks
 * between the pre- and post-capture fingerprint and every attempt is rejected as
 * drift.
 *
 * What a declaration deliberately does NOT do is rewrite the artifact. The frame
 * and the screenshot keep what was actually on screen, so a volatile state still
 * diverges run to run. That is correct: the stored evidence is what was there,
 * and the declaration says how to READ it, not what to record.
 *
 *   1. a state with no volatile content reproduces exactly (the control), so a
 *      divergence below cannot be blamed on the fixture or the browser;
 *   2. a state whose content is drawn from the RNG and the clock is correctly
 *      *detected* as differing — the hashes are sensitive enough to catch it;
 *   3. declaring the region volatile makes the subject capturable and records the
 *      mask, while leaving (1) and (2) exactly as they were.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Bundle } from '../../src/bundle.mjs';
import { SpecDriver } from '../../src/driver.mjs';
import * as pageAgent from '../../src/page-agent.mjs';
import {
  SKIP,
  STABILITY,
  VIEWPORT,
  captureState,
  fixtureUrl,
  launchBrowser,
  makeRunDir,
  readArtifact,
  runDynamicCapture,
} from './helpers.mjs';

let browser;
/** @type {Array<{dir: string, spec: object}>} */
const runs = [];

test.before(async (t) => {
  if (SKIP) return;
  browser = await launchBrowser();
  for (let index = 0; index < 2; index += 1) {
    const dir = makeRunDir(t, `spec-dynamic-${index}-`);
    const spec = await runDynamicCapture(browser, dir);
    runs.push({ dir, spec });
  }
});

test.after(async () => {
  await browser?.close();
});

const gate = (name, fn) => test(name, { skip: SKIP }, fn);

const stateNamed = (run, name) => {
  const found = run.spec.states.find((state) => state.name === name);
  assert.ok(found, `run is missing the "${name}" state: ${run.spec.states.map((state) => state.name).join(', ')}`);
  return found;
};

gate('the control state on the dynamic page still reproduces exactly', () => {
  const [first, second] = runs;
  const a = stateNamed(first, 'control panel');
  const b = stateNamed(second, 'control panel');

  assert.equal(b.id, a.id, 'the control state must keep its id and position');
  for (const layer of ['topology', 'layout', 'content', 'visual', 'artifact']) {
    assert.equal(b.hashes[layer], a.hashes[layer], `control state ${layer} hash diverged — the fixture itself is unstable`);
  }
  assert.ok(readArtifact(first.dir, a.frame).equals(readArtifact(second.dir, b.frame)), 'control frame bytes diverged');
  assert.ok(readArtifact(first.dir, a.shot).equals(readArtifact(second.dir, b.shot)), 'control screenshot bytes diverged');
});

gate('a genuinely volatile state is detected as differing between runs', () => {
  const [first, second] = runs;
  const a = stateNamed(first, 'volatile panel');
  const b = stateNamed(second, 'volatile panel');

  // Same subject, same position, same shape: only the payload moved.
  assert.equal(b.id, a.id);
  assert.deepEqual(b.rect, a.rect, 'the volatile region must keep its geometry, so only content can explain the divergence');
  assert.equal(b.hashes.topology, a.hashes.topology, 'the DOM shape is unchanged; only the text node differs');

  assert.notEqual(b.hashes.content, a.hashes.content, 'the content hash failed to notice a random token');
  assert.notEqual(b.hashes.visual, a.hashes.visual, 'the visual hash failed to notice rendered random text');
  assert.notEqual(b.hashes.artifact, a.hashes.artifact, 'the composed artifact digest failed to notice a volatile region');

  assert.ok(!readArtifact(first.dir, a.frame).equals(readArtifact(second.dir, b.frame)), 'volatile frame bytes were unexpectedly identical');
  assert.ok(!readArtifact(first.dir, a.shot).equals(readArtifact(second.dir, b.shot)), 'volatile screenshot bytes were unexpectedly identical');
});

gate('one volatile state is enough to diverge the whole bundle digest', () => {
  const [first, second] = runs;
  assert.notEqual(second.spec.hashes.artifact, first.spec.hashes.artifact);
  assert.notEqual(second.spec.hashes.content, first.spec.hashes.content);
  // Ordering and topology survive: the divergence is content, not structure.
  assert.deepEqual(second.spec.states.map((state) => state.id), first.spec.states.map((state) => state.id));
  assert.equal(second.spec.hashes.topology, first.spec.hashes.topology);
});

gate('a declared volatile region makes a live subject capturable and records the mask', async (t) => {
  const capture = async (dir) => {
    const page = await browser.newPage({ viewport: { ...VIEWPORT } });
    try {
      await page.goto(fixtureUrl('dynamic.html'), { waitUntil: 'load' });
      await page.evaluate(pageAgent.tagElements, pageAgent.ID_ATTRIBUTE);
      const driver = new SpecDriver({ close: async () => {} }, page);
      const bundle = new Bundle(dir, { app: 'repeatability-mask-probe' }, { fresh: true });
      const specId = await page.$eval('#volatile', (element, attribute) => element.getAttribute(attribute), pageAgent.ID_ATTRIBUTE);
      const result = await captureState({
        driver, bundle, specId, name: 'volatile panel', stability: STABILITY,
        volatile: [{ selector: '#volatile-value', reason: 'random token and load timestamp; not part of the spec' }],
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      bundle.write();
      return result.record;
    } finally {
      await page.close();
    }
  };

  const a = await capture(makeRunDir(t, 'spec-mask-a-'));
  const b = await capture(makeRunDir(t, 'spec-mask-b-'));

  // What a declaration buys, and what it does not.
  //
  // It buys capturability and a recorded mask: the region is excluded from drift
  // detection, so the state commits, and its rects are written to the manifest so
  // a later verification excludes the same pixels.
  //
  // It does NOT rewrite the artifact. The frame and the PNG keep the value that
  // was actually on screen, so the content hash still diverges between runs —
  // which is correct. The stored evidence is what was there; declaring a region
  // volatile says how to READ that evidence, not what to record.
  for (const record of [a, b]) {
    const [region] = record.volatile;
    assert.equal(region.selector, '#volatile-value');
    assert.match(region.reason, /random token/);
    assert.equal(region.matched, 1);
    assert.ok(region.rects.length === 1 && region.rects[0].width > 0);
  }
  assert.notEqual(b.hashes.content, a.hashes.content, 'the stored artifact must keep what was actually rendered');
  assert.equal(b.hashes.topology, a.hashes.topology, 'structure is identical between runs');
});
