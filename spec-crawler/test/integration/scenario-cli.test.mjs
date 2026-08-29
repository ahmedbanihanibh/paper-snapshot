import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const FIXTURES = path.join(HERE, '..', 'fixtures');
const SCENARIOS = path.join(FIXTURES, 'scenarios');
const BUNDLES = path.join(FIXTURES, 'bundles');

/** Run a CLI and return its exit code alongside its streams, never throwing. */
async function cli(script, args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [path.join(REPO, script), ...args], { cwd: REPO });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

const withTemp = async (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scenario-cli-'));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

/* --------------------------------------------------------- scenario-run.mjs */

test('scenario-run --dry-run exits 0 and prints only the report on stdout', async () => {
  const result = await cli('scenario-run.mjs', ['--file', path.join(SCENARIOS, 'menu-open.json'), '--dry-run']);

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.scenario.name, 'fixture-app-menu-open');
  assert.equal(report.plan.totals.captures, 1);
  assert.ok(report.steps.every((step) => step.status === 'planned'));
  assert.match(result.stderr, /\[planned\] steps\/open-menu/);
});

test('two dry runs of the same file produce byte-identical stdout', async () => {
  const args = ['--file', path.join(SCENARIOS, 'menu-open.json'), '--dry-run'];
  const [first, second] = await Promise.all([cli('scenario-run.mjs', args), cli('scenario-run.mjs', args)]);

  assert.equal(first.code, 0);
  assert.equal(second.code, 0);
  assert.equal(first.stdout, second.stdout);
});

test('scenario-run --out writes the same report it printed', async () => {
  await withTemp(async (dir) => {
    const outPath = path.join(dir, 'nested', 'report.json');
    const result = await cli('scenario-run.mjs', [
      '--file', path.join(SCENARIOS, 'menu-open.json'), '--dry-run', '--out', outPath,
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.ok(existsSync(outPath), 'report file should exist');
    assert.equal(readFileSync(outPath, 'utf8'), result.stdout);
  });
});

test('scenario-run exits 2 on an invalid scenario and lists every violation', async () => {
  const result = await cli('scenario-run.mjs', ['--file', path.join(SCENARIOS, 'invalid.json'), '--dry-run']);

  assert.equal(result.code, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.error, 'invalid-scenario');

  const codes = report.violations.map((violation) => violation.code);
  assert.ok(codes.includes('unsupported-version'));
  assert.ok(codes.includes('unknown-action'));
  assert.ok(codes.includes('missing-postcondition'));
  assert.ok(codes.includes('unresolved-ref'));
  assert.ok(report.violations.some((violation) => violation.path === 'steps[0].target.expect'));
});

test('scenario-run exits 3 without --file and 3 on an unknown flag', async () => {
  const missing = await cli('scenario-run.mjs', ['--dry-run']);
  assert.equal(missing.code, 3);
  assert.match(missing.stderr, /--file is required/);

  const unknown = await cli('scenario-run.mjs', ['--file', path.join(SCENARIOS, 'menu-open.json'), '--nope']);
  assert.equal(unknown.code, 3);
});

test('scenario-run exits 3 when the file cannot be read', async () => {
  const result = await cli('scenario-run.mjs', ['--file', path.join(SCENARIOS, 'does-not-exist.json'), '--dry-run']);
  assert.equal(result.code, 3);
  assert.match(result.stderr, /Cannot read scenario/);
});

test('a live run with no endpoint exits 1 rather than attaching to a guess', async () => {
  const result = await cli('scenario-run.mjs', ['--file', path.join(SCENARIOS, 'no-endpoint.json')]);

  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.steps[0].error.code, 'ERR_SCENARIO_ENDPOINT');
});

test('the fixture app is the surface the fixture scenario describes', () => {
  const html = readFileSync(path.join(FIXTURES, 'app', 'index.html'), 'utf8');
  const scenario = JSON.parse(readFileSync(path.join(SCENARIOS, 'menu-open.json'), 'utf8'));

  assert.match(html, /role="menu"/);
  assert.match(html, /role="menuitem"/);
  assert.match(html, /aria-expanded/);
  for (const role of ['menu', 'menuitem', 'row', 'button']) {
    assert.ok(JSON.stringify(scenario).includes(`"${role}"`), `scenario should exercise role ${role}`);
  }
});

/* ------------------------------------------------------ validate-bundles.mjs */

test('validate-bundles exits 0 on a good bundle', async () => {
  const result = await cli('validate-bundles.mjs', [path.join(BUNDLES, 'good')]);

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^ok\s+.*good \(1 state\)$/m);
});

test('validate-bundles exits 1 on a corrupted bundle and lists every violation', async () => {
  const result = await cli('validate-bundles.mjs', ['--json', path.join(BUNDLES, 'corrupted')]);

  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);

  const codes = report.bundles[0].violations.map((violation) => violation.code);
  assert.ok(codes.includes('hash-mismatch'), JSON.stringify(codes));
  assert.ok(codes.includes('size-mismatch'));
  assert.ok(codes.includes('undeclared-reference'));
  assert.equal(report.violationCount, report.bundles[0].violations.length);
});

test('validate-bundles checks every directory it is given, not just the first failure', async () => {
  const result = await cli('validate-bundles.mjs', [
    '--json', path.join(BUNDLES, 'corrupted'), path.join(BUNDLES, 'good'),
  ]);

  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.bundles.length, 2);
  assert.equal(report.bundles[0].ok, false);
  assert.equal(report.bundles[1].ok, true);
});

test('validate-bundles reports a missing artifact file and a missing manifest', async () => {
  await withTemp(async (dir) => {
    const bundle = path.join(dir, 'holed');
    cpSync(path.join(BUNDLES, 'good'), bundle, { recursive: true });
    rmSync(path.join(bundle, 'frames', '001-menu.html'));

    const holed = await cli('validate-bundles.mjs', ['--json', bundle]);
    assert.equal(holed.code, 1);
    assert.ok(JSON.parse(holed.stdout).bundles[0].violations.some((violation) => violation.code === 'missing-artifact'));

    const empty = path.join(dir, 'empty');
    cpSync(path.join(BUNDLES, 'good'), empty, { recursive: true });
    rmSync(path.join(empty, 'spec.json'));

    const noManifest = await cli('validate-bundles.mjs', ['--json', empty]);
    assert.equal(noManifest.code, 1);
    assert.equal(JSON.parse(noManifest.stdout).bundles[0].violations[0].code, 'missing-manifest');
  });
});

test('validate-bundles reports a malformed manifest without erasing anything', async () => {
  await withTemp(async (dir) => {
    const bundle = path.join(dir, 'malformed');
    cpSync(path.join(BUNDLES, 'good'), bundle, { recursive: true });
    writeFileSync(path.join(bundle, 'spec.json'), '{ not json');

    const result = await cli('validate-bundles.mjs', ['--json', bundle]);
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.stdout).bundles[0].violations[0].code, 'malformed-manifest');
    assert.ok(existsSync(path.join(bundle, 'frames', '001-menu.html')), 'evidence must survive validation');
  });
});

test('validate-bundles exits 3 with no arguments', async () => {
  const result = await cli('validate-bundles.mjs', []);
  assert.equal(result.code, 3);
  assert.match(result.stderr, /At least one bundle directory is required/);
});
