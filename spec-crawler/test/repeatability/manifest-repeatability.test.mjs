/**
 * The repeatability gate.
 *
 * Capture the same frozen page N times, each into its own fresh output
 * directory, and require every run to produce the same evidence. The failure
 * this is really hunting is not "a byte changed" — it is *ordering*: a state
 * matrix whose entries arrive in a different sequence produces different
 * artifact ids for the same states, and every downstream reference (frame
 * paths, Paper artboards, verification lookups) silently points somewhere else.
 * So state ORDER is asserted separately from the set of state ids, and the
 * per-run assertion messages name the run index — a gate that says "run 7
 * diverged" is actionable; one that says "not equal" is not.
 *
 * Every run is compared against run 0 rather than pairwise, which is the same
 * relation transitively but keeps the failure output to one diff.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LEASE_ROOT,
  RUNS,
  SKIP,
  canonicalManifestJson,
  launchBrowser,
  listing,
  makeRunDir,
  pngDimensions,
  readArtifact,
  readSpec,
  runDeterministicCapture,
} from './helpers.mjs';

const HASH_LAYERS = ['topology', 'state', 'layout', 'visual', 'content', 'environment', 'artifact'];

let browser;
/** @type {Array<{dir: string, spec: object}>} */
const runs = [];
/** Baselines taken *after* the browser exists, so its own temp files are not counted as leaks. */
let tmpdirBaseline = [];
let leaseBaseline = [];

test.before(async (t) => {
  if (SKIP) return;
  browser = await launchBrowser();
  tmpdirBaseline = listing(os.tmpdir());
  leaseBaseline = listing(LEASE_ROOT);

  for (let index = 0; index < RUNS; index += 1) {
    const dir = makeRunDir(t, `spec-repeat-${index}-`);
    await runDeterministicCapture(browser, dir);
    runs.push({ dir, spec: readSpec(dir) });
  }
});

test.after(async () => {
  await browser?.close();
});

const gate = (name, fn) => test(name, { skip: SKIP }, fn);

/** Run 0 is the reference; every other run is a candidate that must match it. */
const others = () => runs.slice(1).map((run, offset) => ({ ...run, index: offset + 1 }));

gate('every run captured the same states in the same order', () => {
  const expected = runs[0].spec.states.map((state) => state.id);
  assert.equal(expected.length, 5, `the fixture script must capture 5 states; got ${JSON.stringify(expected)}`);

  for (const run of others()) {
    const actual = run.spec.states.map((state) => state.id);
    // deepEqual on the arrays, not on sets: reordering is the bug under test.
    assert.deepEqual(actual, expected, `run ${run.index} produced a different state order`);
    assert.equal(run.spec.stateCount, expected.length, `run ${run.index} has a stateCount inconsistent with its states`);
  }
});

gate('the canonicalised manifest is byte-identical across every run', () => {
  const expected = canonicalManifestJson(runs[0].spec);
  for (const run of others()) {
    assert.equal(canonicalManifestJson(run.spec), expected, `run ${run.index} produced a different canonical manifest`);
  }
});

gate('every layered hash matches, layer by layer, for every state', () => {
  for (const run of others()) {
    for (const [position, expected] of runs[0].spec.states.entries()) {
      const actual = run.spec.states[position];
      for (const layer of HASH_LAYERS) {
        assert.equal(
          actual.hashes?.[layer],
          expected.hashes?.[layer],
          `run ${run.index} state ${expected.id}: ${layer} hash diverged`,
        );
      }
    }
    for (const layer of HASH_LAYERS) {
      assert.equal(run.spec.hashes?.[layer], runs[0].spec.hashes?.[layer], `run ${run.index}: manifest ${layer} hash diverged`);
    }
  }
});

gate('serialized frame bytes are identical across every run', () => {
  for (const run of others()) {
    for (const [position, expected] of runs[0].spec.states.entries()) {
      const actual = run.spec.states[position];
      const expectedBytes = readArtifact(runs[0].dir, expected.frame);
      const actualBytes = readArtifact(run.dir, actual.frame);
      assert.ok(
        expectedBytes.equals(actualBytes),
        `run ${run.index} state ${expected.id}: frame bytes differ (${expectedBytes.length} vs ${actualBytes.length})`,
      );
    }
  }
});

gate('every declared artifact is present and byte-identical across every run', () => {
  for (const run of others()) {
    for (const [position, expected] of runs[0].spec.states.entries()) {
      const actual = run.spec.states[position];
      const expectedPaths = (expected.artifacts ?? []).map((artifact) => artifact.path);
      const actualPaths = (actual.artifacts ?? []).map((artifact) => artifact.path);
      assert.deepEqual(actualPaths, expectedPaths, `run ${run.index} state ${expected.id}: artifact set or order diverged`);

      for (const relativePath of expectedPaths) {
        const expectedBytes = readArtifact(runs[0].dir, relativePath);
        const actualBytes = readArtifact(run.dir, relativePath);
        assert.ok(expectedBytes.equals(actualBytes), `run ${run.index}: ${relativePath} bytes differ`);
      }
    }
  }
});

/**
 * Screenshots get their own gate. On this machine raw PNG bytes are in fact
 * bit-identical, and the strong assertion below is what holds that line. The
 * weaker size+dimension checks are kept alongside it deliberately: if the pixel
 * assertion ever fails on another host, the diagnostic should say whether the
 * image merely re-encoded or actually changed shape.
 */
gate('screenshots have identical dimensions, byte length, and bytes across every run', () => {
  for (const run of others()) {
    for (const [position, expected] of runs[0].spec.states.entries()) {
      const actual = run.spec.states[position];
      assert.deepEqual(Object.keys(actual.shots).sort(), Object.keys(expected.shots).sort(), `run ${run.index} state ${expected.id}: shot kinds diverged`);

      for (const kind of Object.keys(expected.shots)) {
        const expectedBytes = readArtifact(runs[0].dir, expected.shots[kind]);
        const actualBytes = readArtifact(run.dir, actual.shots[kind]);
        const label = `run ${run.index} state ${expected.id} shot "${kind}"`;

        assert.deepEqual(pngDimensions(actualBytes), pngDimensions(expectedBytes), `${label}: PNG dimensions diverged`);
        assert.equal(actualBytes.length, expectedBytes.length, `${label}: byte length diverged`);
        assert.ok(actualBytes.equals(expectedBytes), `${label}: pixels diverged at identical byte length`);
      }
    }
  }
});

gate('no run left a staging directory behind', () => {
  for (const run of runs) {
    const staged = listing(run.dir).filter((entry) => entry.startsWith('.artifact-stage-'));
    assert.deepEqual(staged, [], `${run.dir} still holds staging directories`);
  }
});

gate('no run leaked a lease directory', () => {
  assert.deepEqual(listing(LEASE_ROOT), leaseBaseline, 'a lease directory outlived the run that took it');
});

gate('no run leaked a crawler-owned directory into the shared temp root', () => {
  // os.tmpdir() belongs to the whole machine, not to this test. Playwright's own
  // `playwright-artifacts-*` and `playwright_chromiumdev_profile-*` land there, a
  // browser still exiting can create one after the baseline was taken, and a
  // sibling test file's run directories share our prefix. Asserting on the whole
  // listing made this fail on other people's litter — which in a suite whose
  // entire purpose is repeatability is worse than not asserting at all.
  //
  // The signal we actually want is a crawler artifact escaping its output dir:
  // staging that was never renamed away, or a lease taken outside the lease root.
  // Per-run staging and lease leaks are covered by the two gates above; this one
  // catches the same things escaping to the shared root.
  const CRAWLER_OWNED = ['.artifact-stage-', '.spec-crawler-', 'spec-crawler-leases'];
  const stray = listing(os.tmpdir())
    .filter((entry) => !tmpdirBaseline.includes(entry))
    .filter((entry) => CRAWLER_OWNED.some((prefix) => entry.startsWith(prefix)));
  assert.deepEqual(stray, [], 'the capture pipeline left a staging or lease directory in the shared temp root');
});

gate('each run wrote exactly the artifact tree its manifest declares', () => {
  for (const run of runs) {
    const declared = new Set(run.spec.states.flatMap((state) => (state.artifacts ?? []).map((artifact) => artifact.path)));
    for (const relativePath of declared) {
      assert.ok(existsSync(path.join(run.dir, ...relativePath.split('/'))), `${run.dir}: declared artifact ${relativePath} is missing`);
    }
    // And nothing beyond them: an undeclared file is evidence nobody can verify.
    for (const directory of ['frames', 'shots', 'jsx', 'states', 'contracts']) {
      const absolute = path.join(run.dir, directory);
      if (!existsSync(absolute)) continue;
      for (const entry of readdirSync(absolute)) {
        const relativePath = `${directory}/${entry}`;
        assert.ok(declared.has(relativePath), `${run.dir}: ${relativePath} is on disk but not declared in the manifest`);
      }
    }
  }
});
