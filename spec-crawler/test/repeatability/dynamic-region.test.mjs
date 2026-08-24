/**
 * The other half of repeatability: can the pipeline express "this region is
 * *expected* to vary"?
 *
 * Today it cannot — not at capture time. Masking exists in the repo, but it
 * lives in `src/visual-diff.mjs` / `src/verification.mjs`, where it is applied
 * when two images are *compared*. `captureState` has no mask, exclusion, or
 * volatile-region option: an option named `mask` is simply not destructured, so
 * it is silently ignored and the volatile pixels land in the frame, the
 * screenshot, and every hash derived from them.
 *
 * Rather than invent an API, this file pins the behaviour that actually exists,
 * so the gap is a failing expectation the day someone closes it rather than a
 * line in a report nobody re-reads:
 *
 *   1. a state with no volatile content reproduces exactly (the control), so a
 *      divergence below cannot be blamed on the fixture or the browser;
 *   2. a state whose content is drawn from the RNG and the clock is correctly
 *      *detected* as differing — the hashes are sensitive enough to catch it;
 *   3. asking for a mask does not change (1) or (2), which is the evidence that
 *      the capture layer cannot yet express the intent.
 *
 * If a real capture-time mask ever lands, assertion 3 flips and this file is
 * where the new contract gets written.
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

gate('captureState has no capture-time mask: the option is accepted and ignored', async (t) => {
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
        // Not part of captureState's option surface. If a capture-time mask ever
        // lands, this is the call that should start producing stable evidence.
        mask: [{ x: 0, y: 0, width: 320, height: 72 }],
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
  assert.notEqual(
    b.hashes.content,
    a.hashes.content,
    'a `mask` option now changes capture output — the capture layer can express volatile regions, so update this suite',
  );
});
