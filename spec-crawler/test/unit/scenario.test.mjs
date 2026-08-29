import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  SCENARIO_SCHEMA_VERSION,
  ScenarioValidationError,
  collectScenarioViolations,
  validateScenario,
} from '../../src/scenario-schema.mjs';
import { planScenario, runScenario } from '../../src/scenario.mjs';

/* ------------------------------------------------------------------ helpers */

const scenarioWith = (steps, extra = {}) => ({
  schemaVersion: 1,
  name: 'unit-scenario',
  steps,
  ...extra,
});

const violationAt = (violations, path) => violations.find((violation) => violation.path === path);

const openMenu = {
  id: 'open-menu',
  action: 'click',
  target: { role: 'button', labelIncludes: 'Open menu' },
  expect: { name: 'the menu appears', kind: 'surfaceAppears', role: 'menu' },
};

/**
 * A driver stand-in. `page.evaluate` dispatches on the *name* of the page-side
 * function the runner passes, which is the only stable seam a fake has: those
 * functions are module-private by design and are never author-supplied.
 */
function fakeDriver({ menuOpensOnClick = true } = {}) {
  const world = { menuOpen: false, overlays: [], clicks: [], presses: [], resets: 0, settles: 0 };

  const descriptorFor = (specId) => ({
    specId,
    tag: specId === 'menu' ? 'div' : 'button',
    role: specId === 'menu' ? 'menu' : 'button',
    label: specId === 'menu' ? 'Duplicate Delete' : 'Open menu',
    value: null,
    rect: { x: 10, y: 20, width: 120, height: 32 },
    visible: specId === 'menu' ? world.menuOpen : true,
  });

  const page = {
    url: () => 'https://example.test/app',
    async evaluate(fn, arg) {
      switch (fn.name) {
        case 'pageFindByRole': {
          if (arg.role === 'menu' && !world.menuOpen) return { ok: false, reason: 'not-found', count: 0 };
          const specId = arg.role === 'menu' ? 'menu' : 'trigger';
          return { ok: true, count: 1, specId, descriptor: descriptorFor(specId) };
        }
        case 'pageDescribeSpecId':
          return descriptorFor(arg.specId);
        case 'pageReadAttribute':
          return { found: true, value: arg.name === 'aria-expanded' ? String(world.menuOpen) : 'idle' };
        case 'pageCountRoleMatches':
          return arg.role === 'menu' ? (world.menuOpen ? 1 : 0) : 0;
        case 'pageCountVisibleText':
          return world.menuOpen ? 1 : 0;
        case 'pageReadEnvironment':
          return {
            width: 1280, height: 800, deviceScaleFactor: 2,
            colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', timezone: 'UTC',
          };
        default:
          throw new Error(`fake page.evaluate has no case for ${fn.name || '(anonymous)'}`);
      }
    },
    async $() {
      return { async hover() {}, async boundingBox() { return { x: 10, y: 20, width: 120, height: 32 }; } };
    },
    keyboard: { async press(key) { world.presses.push(key); if (key === 'Escape') world.menuOpen = false; } },
    mouse: { async click() {}, async move() {} },
    async emulateMedia() {},
    async setViewportSize() {},
  };

  return {
    page,
    world,
    async settle() { world.settles += 1; return { status: 'quiet', stable: true }; },
    async clickById(id) {
      world.clicks.push(id);
      if (id === 'trigger' && menuOpensOnClick) world.menuOpen = true;
      if (id === 'menu') world.menuOpen = false;
      return true;
    },
    async visibleOverlays() { return world.menuOpen ? ['menu'] : []; },
    async reset() { world.resets += 1; world.menuOpen = false; return { method: 'escape', clean: true, attempts: [], differences: [] }; },
    async ensureClean() { world.menuOpen = false; return { method: 'already-clean', clean: true, attempts: [], differences: [] }; },
    setRegion() {},
    async establishBaseline() {},
  };
}

/* --------------------------------------------------------------- validation */

test('a complete scenario validates and fills in its defaults', () => {
  const scenario = validateScenario(scenarioWith([openMenu], {
    description: 'open the menu',
    target: { endpoint: 'http://localhost:9222' },
    captures: { outDir: 'specs/menu' },
  }));

  assert.equal(scenario.schemaVersion, SCENARIO_SCHEMA_VERSION);
  assert.equal(scenario.resetPolicy, 'after-scenario');
  assert.equal(scenario.captures.fresh, false);
  assert.deepEqual(scenario.preconditions, []);
  assert.deepEqual(scenario.teardown, []);
  assert.equal(scenario.steps[0].mutating, true);
  assert.equal(scenario.steps[0].params.button, 'left');
  assert.equal(scenario.steps[0].params.clickCount, 1);
});

test('a state-mutating action without a named postcondition is rejected', () => {
  const violations = collectScenarioViolations(scenarioWith([
    { action: 'click', target: { role: 'button', labelIncludes: 'Open menu' } },
  ]));

  const violation = violationAt(violations, 'steps[0].expect');
  assert.ok(violation, `expected a violation at steps[0].expect, got ${JSON.stringify(violations)}`);
  assert.equal(violation.code, 'missing-postcondition');
});

test('an expectation without a name is rejected — the name is the whole value', () => {
  const violations = collectScenarioViolations(scenarioWith([
    { action: 'click', target: { role: 'button' }, expect: { kind: 'surfaceAppears', role: 'menu' } },
  ]));
  assert.equal(violationAt(violations, 'steps[0].expect.name')?.code, 'missing-field');
});

test('a point target without expect is rejected', () => {
  const violations = collectScenarioViolations(scenarioWith([
    {
      action: 'click',
      target: { point: { x: 420, y: 310 } },
      expect: { name: 'the menu appears', kind: 'surfaceAppears', role: 'menu' },
    },
  ]));

  const violation = violationAt(violations, 'steps[0].target.expect');
  assert.ok(violation, `expected a violation at steps[0].target.expect, got ${JSON.stringify(violations)}`);
  assert.equal(violation.code, 'missing-field');
});

test('a point target with expect is accepted', () => {
  const scenario = validateScenario(scenarioWith([
    {
      action: 'click',
      target: { point: { x: 420, y: 310 }, expect: 'issue row' },
      expect: { name: 'the row selects', kind: 'surfaceAppears', role: 'menu' },
    },
  ]));
  assert.equal(scenario.steps[0].target.kind, 'point');
  assert.deepEqual(scenario.steps[0].target.point, { x: 420, y: 310 });
});

test('a target naming two discriminators is rejected as ambiguous', () => {
  const violations = collectScenarioViolations(scenarioWith([
    {
      action: 'hover',
      target: { specId: 'n42', role: 'button' },
      expect: { name: 'tooltip', kind: 'surfaceAppears', role: 'tooltip' },
    },
  ]));
  assert.equal(violationAt(violations, 'steps[0].target')?.code, 'ambiguous-target');
});

test('an unknown action is rejected and the message lists the known ones', () => {
  const violations = collectScenarioViolations(scenarioWith([{ action: 'teleport' }]));
  const violation = violationAt(violations, 'steps[0].action');
  assert.equal(violation.code, 'unknown-action');
  assert.match(violation.message, /captureMotion/);
});

test('an unknown field is rejected rather than silently ignored', () => {
  const violations = collectScenarioViolations(scenarioWith([
    { ...openMenu, timeoutMs: 500 },
  ]));
  assert.equal(violationAt(violations, 'steps[0].timeoutMs')?.code, 'unknown-field');
});

test('an unknown expectation kind is rejected', () => {
  const violations = collectScenarioViolations(scenarioWith([
    { action: 'click', target: { role: 'button' }, expect: { name: 'x', kind: 'evaluate', text: 'anything' } },
  ]));
  assert.equal(violationAt(violations, 'steps[0].expect.kind')?.code, 'unknown-expectation');
});

test('a wrong schemaVersion is rejected', () => {
  for (const version of [0, 2, '1', undefined]) {
    const raw = scenarioWith([openMenu]);
    if (version === undefined) delete raw.schemaVersion; else raw.schemaVersion = version;
    const violations = collectScenarioViolations(raw);
    const violation = violationAt(violations, 'schemaVersion');
    assert.ok(violation, `schemaVersion ${String(version)} should be rejected`);
    assert.ok(['unsupported-version', 'missing-field'].includes(violation.code));
  }
});

test('a ref that names no earlier element-producing step is rejected', () => {
  const violations = collectScenarioViolations(scenarioWith([
    openMenu,
    { action: 'hover', target: { ref: 'not-a-step' }, expect: { name: 'x', kind: 'surfaceAppears', role: 'tooltip' } },
  ]));
  assert.equal(violationAt(violations, 'steps[1].target.ref')?.code, 'unresolved-ref');
});

test('a ref naming an earlier step resolves at validation time', () => {
  const scenario = validateScenario(scenarioWith([
    openMenu,
    { action: 'hover', target: { ref: 'open-menu' }, expect: { name: 'x', kind: 'surfaceAppears', role: 'tooltip' } },
  ]));
  assert.equal(scenario.steps[1].target.ref, 'open-menu');
});

test('duplicate step ids are rejected', () => {
  const violations = collectScenarioViolations(scenarioWith([openMenu, { ...openMenu }]));
  assert.equal(violationAt(violations, 'steps[1].id')?.code, 'duplicate-id');
});

test('a capture step without captures.outDir is rejected', () => {
  const violations = collectScenarioViolations(scenarioWith([
    { action: 'capture', name: 'menu-open' },
  ]));
  assert.equal(violationAt(violations, 'captures.outDir')?.code, 'missing-field');
});

test('verifyEnvironment without an environment block is rejected', () => {
  const violations = collectScenarioViolations(scenarioWith([{ action: 'verifyEnvironment' }]));
  assert.equal(violationAt(violations, 'steps[0]')?.code, 'missing-environment');
});

test('validateScenario throws one error carrying every violation', () => {
  assert.throws(
    () => validateScenario(scenarioWith([{ action: 'teleport' }, { action: 'click', target: { role: 'button' } }])),
    (error) => {
      assert.ok(error instanceof ScenarioValidationError);
      assert.equal(error.code, 'ERR_SCENARIO_INVALID');
      assert.ok(error.violations.length >= 2);
      return true;
    },
  );
});

test('an empty steps array is rejected', () => {
  assert.equal(violationAt(collectScenarioViolations(scenarioWith([])), 'steps')?.code, 'empty');
});

/* ----------------------------------------------------------------- planning */

test('planning is deterministic and records dependencies', () => {
  const raw = scenarioWith([
    openMenu,
    { id: 'pick', action: 'click', target: { ref: 'open-menu' }, expect: { name: 'menu closes', kind: 'surfaceDisappears', role: 'menu' } },
  ], { teardown: [{ id: 'dismiss', action: 'press', keys: 'Escape', expect: { name: 'clean', kind: 'noOverlays' } }] });

  const first = planScenario(raw);
  const second = planScenario(raw);
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  assert.deepEqual(first.phases.steps[0].dependsOn, []);
  assert.deepEqual(first.phases.steps[1].dependsOn, ['open-menu']);
  assert.deepEqual(first.totals, { steps: 3, mutating: 3, expectations: 3, captures: 0 });
});

test('dry-run validates and plans without a browser, and is byte-identical across runs', async () => {
  const raw = scenarioWith([openMenu], { captures: { outDir: 'specs/menu' } });

  const first = await runScenario(raw, { dryRun: true });
  const second = await runScenario(raw, { dryRun: true });

  assert.equal(first.ok, true);
  assert.equal(first.mode, 'dry-run');
  assert.deepEqual(first.steps.map((step) => step.status), ['planned']);
  assert.equal(first.captures.outDir, 'specs/menu');
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(Object.hasOwn(first, 'startedAt'), false, 'dry-run output must carry no wall clock');
});

test('dry-run rejects an invalid scenario before it can plan anything', async () => {
  await assert.rejects(
    () => runScenario(scenarioWith([{ action: 'click', target: { role: 'button' } }]), { dryRun: true }),
    ScenarioValidationError,
  );
});

/* ------------------------------------------------------------------ running */

test('a scenario runs against a driver, resolves refs, and captures through the injected seam', async () => {
  const driver = fakeDriver();
  const captured = [];

  const report = await runScenario(scenarioWith([
    openMenu,
    {
      id: 'shot',
      action: 'capture',
      target: { role: 'menu' },
      name: 'menu-open',
      why: 'resting state of the open menu',
    },
    {
      id: 'expanded',
      action: 'expect',
      expect: {
        name: 'trigger reports expanded',
        kind: 'attribute',
        target: { ref: 'open-menu' },
        attributeName: 'aria-expanded',
        equals: 'true',
      },
    },
  ], {
    captures: { outDir: 'specs/menu' },
    teardown: [{ id: 'dismiss', action: 'press', keys: 'Escape', expect: { name: 'clean', kind: 'noOverlays' } }],
  }), {
    driver,
    capture: async (request) => { captured.push(request); return { stateId: '001-menu-open' }; },
    now: () => '2026-01-01T00:00:00.000Z',
  });

  assert.equal(report.ok, true, JSON.stringify(report.steps, null, 2));
  assert.deepEqual(report.steps.map((step) => step.status), ['ok', 'ok', 'ok', 'ok']);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].name, 'menu-open');
  assert.equal(captured[0].specId, 'menu');
  assert.equal(captured[0].outDir, 'specs/menu');
  assert.deepEqual(report.captures.entries.map((entry) => entry.stateId), ['001-menu-open']);
  assert.equal(report.teardown.ran, true);
  assert.equal(report.reset.ran, true);
  assert.equal(driver.world.clicks[0], 'trigger');
  assert.equal(captured[0].bundle, null, 'an injected capture seam owns its own bundle');
  assert.equal(existsSync(path.resolve('specs/menu')), false, 'no bundle directory may be created behind an injected seam');
});

test('a "moved" postcondition fails when the element vanished rather than moved', async () => {
  // Dropping a row into a folder removes it from the list. Calling that "moved"
  // let a drag pass its own postcondition without ever evidencing the nesting it
  // was written to prove.
  const driver = fakeDriver();
  const inner = driver.page.evaluate.bind(driver.page);
  let clicked = false;
  driver.page.evaluate = async (fn, arg) => {
    if (fn.name === 'pageDescribeSpecId' && clicked) return null;
    return inner(fn, arg);
  };
  const clickById = driver.clickById.bind(driver);
  driver.clickById = async (id) => { const result = await clickById(id); clicked = true; return result; };

  const report = await runScenario(scenarioWith([{
    id: 'drop',
    action: 'click',
    target: { role: 'button', labelIncludes: 'Open menu' },
    expect: { name: 'the row moved', kind: 'moved', target: { role: 'button', labelIncludes: 'Open menu' } },
  }]), { driver, now: () => '2026-01-01T00:00:00.000Z' });

  assert.equal(report.ok, false);
  const [step] = report.steps;
  assert.equal(step.status, 'failed');
  assert.match(JSON.stringify(step.evidence ?? step.error), /left the document/);
  assert.match(JSON.stringify(step.evidence ?? step.error), /surfaceDisappears/);
});

test('declared verification that never ran is not reported as a clean verdict', async () => {
  // `[].every()` is true. A scenario that declares verification and then never
  // reaches the step that performs it must not read as verified — that is the
  // "optional verification counted as success" the whole effort is about.
  const report = await runScenario(scenarioWith([openMenu], {
    captures: { outDir: 'specs/menu' },
    verification: { standalone: { states: ['001-menu-open'] } },
  }), {
    driver: fakeDriver(),
    capture: async () => ({ stateId: '001-menu-open' }),
    now: () => '2026-01-01T00:00:00.000Z',
  });

  assert.deepEqual(report.steps.map((step) => step.status), ['ok']);
  assert.equal(report.verification.declared, true);
  assert.equal(report.verification.ran, false);
  assert.equal(report.verification.ok, false);
  assert.match(report.verification.reason, /nothing was verified/);
  assert.equal(report.ok, false, 'a run cannot be ok while its declared verification never happened');
});

test('an undeclared verification leaves the run ok', async () => {
  const report = await runScenario(scenarioWith([openMenu]), {
    driver: fakeDriver(),
    now: () => '2026-01-01T00:00:00.000Z',
  });
  assert.equal(report.verification.declared, false);
  assert.equal(report.verification.ok, true);
  assert.equal(report.ok, true, JSON.stringify(report.steps));
});

test('a between-steps reset that does not come clean fails the run instead of poisoning the next step', async () => {
  // The old code was `driver.reset(...).catch(() => {})`. A reset that silently
  // did nothing left the next step measuring the previous step's leftovers, and
  // the report said every step passed.
  const driver = fakeDriver();
  driver.reset = async () => ({ method: 'reload', clean: false, residualOverlays: ['menu'], attempts: [], differences: [] });

  const report = await runScenario(scenarioWith([
    openMenu,
    { id: 'second', action: 'press', keys: 'Escape', expect: { name: 'nothing open', kind: 'noOverlays' } },
  ], { resetPolicy: 'between-steps' }), {
    driver,
    now: () => '2026-01-01T00:00:00.000Z',
  });

  assert.equal(report.ok, false);
  const reset = report.steps.find((step) => step.id === 'open-menu:reset');
  assert.ok(reset, `expected a recorded reset failure, got ${JSON.stringify(report.steps.map((step) => step.id))}`);
  assert.equal(reset.status, 'failed');
  assert.equal(reset.error.code, 'ERR_SCENARIO_RESET');
  assert.equal(report.steps.find((step) => step.id === 'second').status, 'skipped');
});

test('a failed postcondition fails the step, stops its dependents, and still runs teardown and reset', async () => {
  // The click lands but the menu never opens — exactly the silent no-op the
  // postcondition rule exists to catch.
  const driver = fakeDriver({ menuOpensOnClick: false });

  const report = await runScenario(scenarioWith([
    openMenu,
    { id: 'pick', action: 'click', target: { role: 'menu' }, expect: { name: 'menu closes', kind: 'surfaceDisappears', role: 'menu' } },
    { id: 'after', action: 'expect', expect: { name: 'row updated', kind: 'textVisible', text: 'Duplicate' } },
  ], {
    teardown: [{ id: 'dismiss', action: 'press', keys: 'Escape', expect: { name: 'clean', kind: 'noOverlays' } }],
  }), { driver, now: () => '2026-01-01T00:00:00.000Z' });

  assert.equal(report.ok, false);
  assert.deepEqual(report.steps.map((step) => [step.id, step.status]), [
    ['open-menu', 'failed'],
    ['pick', 'skipped'],
    ['after', 'skipped'],
    ['dismiss', 'ok'],
  ]);

  const failed = report.steps[0];
  assert.equal(failed.error.code, 'ERR_SCENARIO_POSTCONDITION');
  assert.match(failed.error.message, /the menu appears/);
  assert.equal(report.steps[1].evidence.skippedBecause, 'open-menu');
  assert.equal(report.steps[2].evidence.skippedBecause, 'open-menu');

  assert.equal(report.teardown.ran, true, 'teardown must run after a failure');
  assert.equal(report.reset.ran, true, 'the reset policy must run after a failure');
  assert.equal(driver.world.resets, 1);
});

test('a failed precondition skips every step but still tears down', async () => {
  const driver = fakeDriver({ menuOpensOnClick: false });

  const report = await runScenario(scenarioWith([
    { id: 'later', action: 'press', keys: 'a', expect: { name: 'text lands', kind: 'textVisible', text: 'Duplicate' } },
  ], {
    preconditions: [openMenu],
    teardown: [{ id: 'dismiss', action: 'press', keys: 'Escape', expect: { name: 'clean', kind: 'noOverlays' } }],
  }), { driver, now: () => '2026-01-01T00:00:00.000Z' });

  assert.equal(report.ok, false);
  assert.deepEqual(report.steps.map((step) => [step.phase, step.status]), [
    ['preconditions', 'failed'],
    ['steps', 'skipped'],
    ['teardown', 'ok'],
  ]);
});

test('a live run with no endpoint refuses rather than guessing one', async () => {
  const report = await runScenario(scenarioWith([
    { id: 'escape', action: 'press', keys: 'Escape', expect: { name: 'clean', kind: 'noOverlays' } },
  ]), { now: () => '2026-01-01T00:00:00.000Z' });

  assert.equal(report.ok, false);
  assert.equal(report.steps[0].error.code, 'ERR_SCENARIO_ENDPOINT');
  assert.equal(report.steps[0].error.path, 'target.endpoint');
});

test('a capture step with no capture implementation fails with an actionable message', async () => {
  const driver = fakeDriver();
  const report = await runScenario(scenarioWith([
    { id: 'shot', action: 'capture', name: 'menu-open' },
  ], { captures: { outDir: 'specs/menu' }, resetPolicy: 'never' }), {
    driver,
    capture: null,
    captureMotion: async () => ({ stateId: 'unused' }),
    now: () => '2026-01-01T00:00:00.000Z',
  });

  assert.equal(report.ok, false);
  assert.equal(report.steps[0].error.code, 'ERR_SCENARIO_CAPTURE_UNAVAILABLE');
  assert.equal(report.reset.ran, false, 'resetPolicy "never" must not reset');
});

test('resetPolicy between-steps resets after every step but the last', async () => {
  const driver = fakeDriver();
  const report = await runScenario(scenarioWith([
    openMenu,
    { id: 'again', action: 'click', target: { role: 'button', labelIncludes: 'Open menu' }, expect: { name: 'menu reappears', kind: 'surfaceAppears', role: 'menu' } },
  ], { resetPolicy: 'between-steps' }), { driver, now: () => '2026-01-01T00:00:00.000Z' });

  assert.equal(report.ok, true, JSON.stringify(report.steps, null, 2));
  // one between-steps reset plus the end-of-scenario reset
  assert.equal(driver.world.resets, 2);
});
