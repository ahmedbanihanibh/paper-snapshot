/**
 * Scenario planner and runner.
 *
 * The schema (`scenario-schema.mjs`) says what a scenario may contain; this
 * module is the only thing that decides what any of it *means* against a live
 * page. Nothing here evaluates author-supplied strings as code — every
 * `page.evaluate` call in this file passes one of the fixed functions defined
 * below plus a plain data argument.
 *
 * Two invariants the runner keeps no matter what happens:
 *
 *  - a failed step stops the steps that depend on it rather than letting the
 *    run continue against a state that never arrived, and
 *  - teardown and the reset policy always run, including after a failure and
 *    including after the runner itself throws.
 */

import { TARGET_ID_ATTRIBUTE, acquireTargetLease } from './target.mjs';
import { typeInto, dragAndVerify } from './assert.mjs';
import { ACTIONS, isNormalizedScenario, validateScenario } from './scenario-schema.mjs';

export class ScenarioStepError extends Error {
  constructor(message, { code = 'ERR_SCENARIO_STEP', path = null, evidence = null } = {}) {
    super(message);
    this.name = 'ScenarioStepError';
    this.code = code;
    this.path = path;
    this.evidence = evidence;
  }
}

const STATUS = Object.freeze({
  OK: 'ok',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  PLANNED: 'planned',
});

export const scenarioStatuses = STATUS;

/* ------------------------------------------------------------------ planning */

function refsOf(step) {
  const refs = [];
  const consider = (target) => { if (target?.kind === 'ref') refs.push(target.ref); };
  consider(step.target);
  for (const value of Object.values(step.params ?? {})) {
    if (value && typeof value === 'object' && value.kind === 'ref') consider(value);
  }
  consider(step.expect?.target);
  return refs;
}

function planStep(step, previousId) {
  const dependsOn = [...new Set([...(previousId ? [previousId] : []), ...refsOf(step)])];
  return {
    index: step.index,
    id: step.id,
    phase: step.phase,
    action: step.action,
    mutating: step.mutating,
    target: step.target ?? null,
    params: step.params ?? {},
    expectation: step.expect ? { name: step.expect.name, kind: step.expect.kind } : null,
    dependsOn,
    notes: step.notes ?? null,
  };
}

function planPhase(steps) {
  const planned = [];
  let previousId = null;
  for (const step of steps) {
    planned.push(planStep(step, previousId));
    previousId = step.id;
  }
  return planned;
}

/**
 * Deterministic plan for a scenario. Pure: identical input yields byte-identical
 * JSON, which is what makes `--dry-run` output diffable across sessions.
 */
export function planScenario(input) {
  const scenario = isNormalizedScenario(input) ? input : validateScenario(input);

  const phases = {
    preconditions: planPhase(scenario.preconditions),
    steps: planPhase(scenario.steps),
    teardown: planPhase(scenario.teardown),
  };
  const all = [...phases.preconditions, ...phases.steps, ...phases.teardown];

  return {
    schemaVersion: scenario.schemaVersion,
    name: scenario.name,
    description: scenario.description,
    target: scenario.target,
    environment: scenario.environment,
    region: scenario.region,
    resetPolicy: scenario.resetPolicy,
    bundle: scenario.captures?.outDir ?? null,
    verification: scenario.verification,
    phases,
    totals: {
      steps: all.length,
      mutating: all.filter((step) => step.mutating).length,
      expectations: all.filter((step) => step.expectation).length,
      captures: all.filter((step) => step.action === 'capture' || step.action === 'captureMotion').length,
    },
  };
}

/* ------------------------------------------------------- page-side primitives */

/* These run inside the browser. They receive data only. */

function pageFindByRole({ attribute, role, labelIncludes, nth }) {
  const IMPLICIT = { button: ['button', '[role="button"]'], link: ['a[href]'], textbox: ['input:not([type="hidden"])', 'textarea'], checkbox: ['input[type="checkbox"]'] };
  const selectors = [`[role="${role.replace(/"/g, '\\"')}"]`, ...(IMPLICIT[role] ?? [])];
  const seen = new Set();
  const hits = [];
  for (const selector of selectors) {
    let nodes;
    try { nodes = document.querySelectorAll(selector); } catch { continue; }
    for (const element of nodes) {
      if (seen.has(element)) continue;
      seen.add(element);
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const styles = getComputedStyle(element);
      if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue;
      const label = (element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ');
      if (labelIncludes && !label.toLowerCase().includes(String(labelIncludes).toLowerCase())) continue;
      hits.push({ element, label });
    }
  }
  if (hits.length === 0) return { ok: false, reason: 'not-found', count: 0 };
  let chosen;
  if (nth === null || nth === undefined) {
    if (hits.length > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        count: hits.length,
        labels: hits.slice(0, 8).map((hit) => hit.label.slice(0, 60)),
      };
    }
    chosen = hits[0];
  } else {
    if (nth >= hits.length) return { ok: false, reason: 'out-of-range', count: hits.length };
    chosen = hits[nth];
  }
  let id = chosen.element.getAttribute(attribute);
  if (!id) {
    const root = document.documentElement;
    const next = Number(root.dataset.scenarioRoleCounter || '0') + 1;
    root.dataset.scenarioRoleCounter = String(next);
    id = `role${next}`;
    chosen.element.setAttribute(attribute, id);
  }
  const rect = chosen.element.getBoundingClientRect();
  return {
    ok: true,
    count: hits.length,
    specId: id,
    descriptor: {
      specId: id,
      tag: chosen.element.tagName.toLowerCase(),
      role: chosen.element.getAttribute('role') || null,
      label: chosen.label.slice(0, 120),
      rect: { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1) },
    },
  };
}

function pageDescribeSpecId({ attribute, specId }) {
  const element = document.querySelector(`[${attribute}="${String(specId).replace(/"/g, '\\"')}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const styles = getComputedStyle(element);
  return {
    specId,
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') || null,
    label: (element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    value: 'value' in element ? String(element.value ?? '') : null,
    rect: { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1) },
    visible: rect.width >= 1 && rect.height >= 1 && styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0',
  };
}

function pageReadAttribute({ attribute, specId, name }) {
  const element = document.querySelector(`[${attribute}="${String(specId).replace(/"/g, '\\"')}"]`);
  if (!element) return { found: false, value: null };
  return { found: true, value: element.getAttribute(name) };
}

function pageCountRoleMatches({ role, labelIncludes }) {
  let count = 0;
  let nodes;
  try { nodes = document.querySelectorAll(role ? `[role="${String(role).replace(/"/g, '\\"')}"]` : '*'); } catch { return 0; }
  for (const element of nodes) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    const styles = getComputedStyle(element);
    if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue;
    if (labelIncludes) {
      const label = (element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim();
      if (!label.toLowerCase().includes(String(labelIncludes).toLowerCase())) continue;
    }
    count += 1;
  }
  return count;
}

function pageCountVisibleText({ text }) {
  const needle = String(text).toLowerCase();
  let count = 0;
  for (const element of document.querySelectorAll('*')) {
    if (element.children.length) continue;
    const label = (element.textContent || '').trim();
    if (!label.toLowerCase().includes(needle)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const styles = getComputedStyle(element);
    if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue;
    count += 1;
  }
  return count;
}

function pageReadEnvironment() {
  const query = (feature) => {
    for (const value of ['light', 'dark', 'reduce', 'no-preference']) {
      if (window.matchMedia(`(${feature}: ${value})`).matches) return value;
    }
    return null;
  };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    deviceScaleFactor: window.devicePixelRatio,
    colorScheme: query('prefers-color-scheme'),
    reducedMotion: query('prefers-reduced-motion'),
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/* ---------------------------------------------------------------- run context */

const specSelector = (specId) => `[${TARGET_ID_ATTRIBUTE}="${String(specId).replace(/"/g, '\\"')}"]`;

class RunContext {
  constructor({ scenario, driver, deps }) {
    this.scenario = scenario;
    this.driver = driver;
    this.deps = deps;
    this.outputs = new Map();
    this.captures = [];
  }

  get page() { return this.driver.page; }

  async resolveTarget(target, { field = 'target' } = {}) {
    if (!target) throw new ScenarioStepError('no target to resolve', { code: 'ERR_SCENARIO_TARGET', path: field });

    if (target.kind === 'ref') {
      const produced = this.outputs.get(target.ref);
      if (!produced) {
        throw new ScenarioStepError(`ref ${JSON.stringify(target.ref)} names a step that produced no element`, {
          code: 'ERR_SCENARIO_REF', path: field,
        });
      }
      const descriptor = await this.page.evaluate(pageDescribeSpecId, { attribute: TARGET_ID_ATTRIBUTE, specId: produced.specId });
      if (!descriptor) {
        throw new ScenarioStepError(`ref ${JSON.stringify(target.ref)} points at ${produced.specId}, which is no longer in the document`, {
          code: 'ERR_SCENARIO_REF_STALE', path: field,
        });
      }
      return { specId: produced.specId, descriptor, via: 'ref' };
    }

    if (target.kind === 'point' || (target.kind === 'specId' && target.expect)) {
      const lease = await acquireTargetLease(this.driver, target.kind === 'point'
        ? { x: target.point.x, y: target.point.y, expect: target.expect }
        : { specId: target.specId, expect: target.expect });
      return { specId: lease.specId, descriptor: lease.snapshot, via: target.kind === 'point' ? 'point-lease' : 'specid-lease' };
    }

    if (target.kind === 'specId') {
      const descriptor = await this.page.evaluate(pageDescribeSpecId, { attribute: TARGET_ID_ATTRIBUTE, specId: target.specId });
      if (!descriptor) {
        throw new ScenarioStepError(`no element carries ${TARGET_ID_ATTRIBUTE}=${JSON.stringify(target.specId)}`, {
          code: 'ERR_SCENARIO_TARGET_NOT_FOUND', path: field,
        });
      }
      return { specId: target.specId, descriptor, via: 'specId' };
    }

    const found = await this.page.evaluate(pageFindByRole, {
      attribute: TARGET_ID_ATTRIBUTE,
      role: target.role,
      labelIncludes: target.labelIncludes,
      nth: target.nth,
    });
    if (!found.ok) {
      const detail = found.reason === 'ambiguous'
        ? `${found.count} elements match (${(found.labels ?? []).join(' | ')}); add labelIncludes or nth`
        : `${found.reason} (${found.count} candidates)`;
      throw new ScenarioStepError(
        `role target role=${JSON.stringify(target.role)}${target.labelIncludes ? ` labelIncludes=${JSON.stringify(target.labelIncludes)}` : ''}: ${detail}`,
        { code: 'ERR_SCENARIO_TARGET_NOT_FOUND', path: field, evidence: found },
      );
    }
    return { specId: found.specId, descriptor: found.descriptor, via: 'role' };
  }
}

/* --------------------------------------------------------------- expectations */

async function snapshotExpectation(ctx, expectation) {
  if (!expectation) return null;
  switch (expectation.kind) {
    case 'surfaceAppears':
    case 'surfaceDisappears':
      return { count: await ctx.page.evaluate(pageCountRoleMatches, { role: expectation.role ?? null, labelIncludes: expectation.labelIncludes ?? null }) };
    case 'textVisible':
    case 'textAbsent':
      return { count: await ctx.page.evaluate(pageCountVisibleText, { text: expectation.text }) };
    case 'moved': {
      const resolved = await ctx.resolveTarget(expectation.target, { field: 'expect.target' });
      return { specId: resolved.specId, rect: resolved.descriptor.rect };
    }
    case 'urlMatches':
      return { url: ctx.page.url() };
    default:
      return null;
  }
}

async function checkExpectation(ctx, expectation, before) {
  const result = { name: expectation.name, kind: expectation.kind, ok: false, expected: null, observed: null };

  switch (expectation.kind) {
    case 'surfaceAppears':
    case 'surfaceDisappears': {
      const after = await ctx.page.evaluate(pageCountRoleMatches, { role: expectation.role ?? null, labelIncludes: expectation.labelIncludes ?? null });
      const appears = expectation.kind === 'surfaceAppears';
      if (expectation.target) {
        const specId = await resolveSoftly(ctx, expectation.target);
        const descriptor = await ctx.page.evaluate(pageDescribeSpecId, { attribute: TARGET_ID_ATTRIBUTE, specId });
        result.observed = { visible: Boolean(descriptor?.visible), matches: after };
        result.expected = appears ? { visible: true } : { visible: false };
        result.ok = appears ? Boolean(descriptor?.visible) : !descriptor?.visible;
        return result;
      }
      result.observed = { matches: after, matchesBefore: before?.count ?? null };
      if (before) {
        result.expected = appears ? { matchesGreaterThan: before.count } : { matchesLessThan: before.count };
        result.ok = appears ? after > before.count : after < before.count;
      } else {
        result.expected = appears ? { matchesAtLeast: 1 } : { matches: 0 };
        result.ok = appears ? after >= 1 : after === 0;
      }
      return result;
    }
    case 'textVisible':
    case 'textAbsent': {
      const after = await ctx.page.evaluate(pageCountVisibleText, { text: expectation.text });
      result.observed = { matches: after };
      result.expected = expectation.kind === 'textVisible' ? { matchesAtLeast: 1 } : { matches: 0 };
      result.ok = expectation.kind === 'textVisible' ? after >= 1 : after === 0;
      return result;
    }
    case 'attribute': {
      const resolved = await ctx.resolveTarget(expectation.target, { field: 'expect.target' });
      const read = await ctx.page.evaluate(pageReadAttribute, {
        attribute: TARGET_ID_ATTRIBUTE, specId: resolved.specId, name: expectation.attributeName,
      });
      result.expected = { attribute: expectation.attributeName, equals: expectation.equals };
      result.observed = { value: read.value, found: read.found };
      result.ok = read.found && read.value === expectation.equals;
      return result;
    }
    case 'fieldValue': {
      const resolved = await ctx.resolveTarget(expectation.target, { field: 'expect.target' });
      const descriptor = await ctx.page.evaluate(pageDescribeSpecId, { attribute: TARGET_ID_ATTRIBUTE, specId: resolved.specId });
      const value = descriptor?.value ?? descriptor?.label ?? null;
      result.expected = { equals: expectation.equals };
      result.observed = { value };
      result.ok = value === expectation.equals;
      return result;
    }
    case 'moved': {
      const minDelta = expectation.minDeltaPx ?? 4;
      const descriptor = before?.specId
        ? await ctx.page.evaluate(pageDescribeSpecId, { attribute: TARGET_ID_ATTRIBUTE, specId: before.specId })
        : null;
      result.expected = { minDeltaPx: minDelta, from: before?.rect ?? null };
      if (!before) {
        result.observed = { reason: 'no before-rect was taken; `moved` is only meaningful on a mutating step' };
        result.ok = false;
        return result;
      }
      if (!descriptor) {
        result.observed = { rect: null, note: 'element left the document' };
        result.ok = true;
        return result;
      }
      const dx = Math.abs(descriptor.rect.x - before.rect.x);
      const dy = Math.abs(descriptor.rect.y - before.rect.y);
      result.observed = { rect: descriptor.rect, dx: +dx.toFixed(1), dy: +dy.toFixed(1) };
      result.ok = dx >= minDelta || dy >= minDelta;
      return result;
    }
    case 'urlMatches': {
      const url = ctx.page.url();
      result.expected = { pattern: expectation.pattern, from: before?.url ?? null };
      result.observed = { url };
      result.ok = new RegExp(expectation.pattern).test(url);
      return result;
    }
    case 'viewport': {
      const env = await ctx.page.evaluate(pageReadEnvironment);
      result.expected = { width: expectation.width, height: expectation.height, deviceScaleFactor: expectation.deviceScaleFactor ?? null };
      result.observed = { width: env.width, height: env.height, deviceScaleFactor: env.deviceScaleFactor };
      result.ok = env.width === expectation.width
        && env.height === expectation.height
        && (expectation.deviceScaleFactor === undefined || env.deviceScaleFactor === expectation.deviceScaleFactor);
      return result;
    }
    case 'media': {
      const env = await ctx.page.evaluate(pageReadEnvironment);
      result.expected = { colorScheme: expectation.colorScheme ?? null, reducedMotion: expectation.reducedMotion ?? null };
      result.observed = { colorScheme: env.colorScheme, reducedMotion: env.reducedMotion };
      result.ok = (expectation.colorScheme === undefined || env.colorScheme === expectation.colorScheme)
        && (expectation.reducedMotion === undefined || env.reducedMotion === expectation.reducedMotion);
      return result;
    }
    case 'noOverlays': {
      const overlays = await ctx.driver.visibleOverlays();
      result.expected = { overlays: 0 };
      result.observed = { overlays: overlays.length, ids: overlays.slice(0, 8) };
      result.ok = overlays.length === 0;
      return result;
    }
    default:
      throw new ScenarioStepError(`unimplemented expectation kind ${expectation.kind}`, { code: 'ERR_SCENARIO_EXPECTATION' });
  }
}

async function resolveSoftly(ctx, target) {
  try {
    const resolved = await ctx.resolveTarget(target, { field: 'expect.target' });
    return resolved.specId;
  } catch {
    return target.kind === 'specId' ? target.specId : '__missing__';
  }
}

/* ------------------------------------------------------------------- actions */

async function loadOptionalModule(specifier) {
  try {
    return await import(new URL(specifier, import.meta.url).href);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

/**
 * The capture implementation lives in `src/capture.mjs`, which is owned by
 * another workstream. It is imported by path and only when a capture step
 * actually runs, so this module stays loadable — and unit-testable — while that
 * file does not exist yet.
 */
async function captureFunctions(ctx) {
  if (ctx.deps.capture || ctx.deps.captureMotion) {
    return { capture: ctx.deps.capture ?? null, captureMotion: ctx.deps.captureMotion ?? null };
  }
  const loaded = await loadOptionalModule('./capture.mjs') ?? await loadOptionalModule('./capture-transaction.mjs');
  if (!loaded) return { capture: null, captureMotion: null };
  return {
    capture: loaded.captureScenarioState ?? loaded.captureState ?? loaded.capture ?? null,
    captureMotion: loaded.captureScenarioMotion ?? loaded.captureMotion ?? loaded.captureAnimation ?? null,
  };
}

/**
 * One Bundle per run, opened on the first capture rather than on attach —
 * opening it earlier would create the output directory for scenarios that never
 * reach a capture step. An injected capture seam owns its own bundle, so this
 * never touches the filesystem in that case.
 */
async function bundleFor(ctx) {
  if (ctx.bundle) return ctx.bundle;
  if (ctx.deps.bundle) { ctx.bundle = ctx.deps.bundle; return ctx.bundle; }
  if (ctx.deps.capture || ctx.deps.captureMotion) return null;
  const { Bundle } = await import('./bundle.mjs');
  ctx.bundle = new Bundle(ctx.scenario.captures.outDir, {
    scenario: ctx.scenario.name,
    ...ctx.scenario.captures.meta,
  }, { fresh: ctx.scenario.captures.fresh });
  return ctx.bundle;
}

/** Read a state id out of whatever shape the capture implementation returns. */
function stateIdOf(record) {
  return record?.record?.id ?? record?.stateId ?? record?.id ?? null;
}

function assertCaptureSucceeded(record, step) {
  if (record && record.ok === false) {
    throw new ScenarioStepError(
      `capture ${JSON.stringify(step.params.name)} failed${record.stage ? ` at ${record.stage}` : ''}: ${record.message ?? 'no reason given'}`,
      { code: record.code ?? 'ERR_SCENARIO_CAPTURE', evidence: record.evidence ?? record },
    );
  }
}

const ACTION_RUNNERS = {
  async navigate(ctx, step) {
    const url = await ctx.driver.goto(step.params.url);
    return { url };
  },

  async setViewport(ctx, step) {
    const size = { width: step.params.width, height: step.params.height };
    try {
      await ctx.page.setViewportSize(size);
    } catch (cause) {
      throw new ScenarioStepError(`setViewport(${size.width}x${size.height}) was rejected by the attached browser: ${cause.message}`, {
        code: 'ERR_SCENARIO_VIEWPORT', evidence: size,
      });
    }
    await ctx.driver.settle(200, 4000);
    return { requested: { ...size, deviceScaleFactor: step.params.deviceScaleFactor ?? null } };
  },

  async setMedia(ctx, step) {
    const media = {};
    if (step.params.colorScheme !== undefined) media.colorScheme = step.params.colorScheme;
    if (step.params.reducedMotion !== undefined) media.reducedMotion = step.params.reducedMotion;
    await ctx.page.emulateMedia(media);
    await ctx.driver.settle(200, 4000);
    return { requested: media };
  },

  async verifyEnvironment(ctx) {
    const declared = ctx.scenario.environment ?? {};
    const observed = await ctx.page.evaluate(pageReadEnvironment);
    const checks = [];
    const compare = (field, expected, actual) => {
      if (expected === null || expected === undefined) return;
      checks.push({ field, expected, observed: actual, ok: expected === actual });
    };
    compare('viewport.width', declared.viewport?.width ?? null, observed.width);
    compare('viewport.height', declared.viewport?.height ?? null, observed.height);
    compare('deviceScaleFactor', declared.deviceScaleFactor, observed.deviceScaleFactor);
    compare('colorScheme', declared.colorScheme, observed.colorScheme);
    compare('reducedMotion', declared.reducedMotion, observed.reducedMotion);
    compare('locale', declared.locale, observed.locale);
    compare('timezone', declared.timezone, observed.timezone);
    const failed = checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      throw new ScenarioStepError(
        `environment does not match the scenario: ${failed.map((check) => `${check.field} is ${JSON.stringify(check.observed)}, scenario declares ${JSON.stringify(check.expected)}`).join('; ')}`,
        { code: 'ERR_SCENARIO_ENVIRONMENT', evidence: { checks, observed } },
      );
    }
    return { checks, observed };
  },

  async click(ctx, step) {
    const resolved = await ctx.resolveTarget(step.target);
    const button = step.params.button ?? 'left';
    const clickCount = step.params.clickCount ?? 1;
    if (button === 'left' && clickCount === 1) {
      const clicked = await ctx.driver.clickById(resolved.specId);
      if (!clicked) throw new ScenarioStepError(`click on ${resolved.specId} did not land`, { code: 'ERR_SCENARIO_CLICK', evidence: resolved.descriptor });
    } else {
      const handle = await ctx.page.$(specSelector(resolved.specId));
      const box = handle && await handle.boundingBox();
      if (!box) throw new ScenarioStepError(`click target ${resolved.specId} has no box`, { code: 'ERR_SCENARIO_CLICK' });
      await ctx.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button, clickCount, delay: 20 });
    }
    return { specId: resolved.specId, descriptor: resolved.descriptor, via: resolved.via, button, clickCount };
  },

  async press(ctx, step) {
    const chords = step.params.keys.trim().split(/\s+/);
    for (const chord of chords) await ctx.page.keyboard.press(chord);
    return { keys: chords };
  },

  async hover(ctx, step) {
    const resolved = await ctx.resolveTarget(step.target);
    const handle = await ctx.page.$(specSelector(resolved.specId));
    if (!handle) throw new ScenarioStepError(`hover target ${resolved.specId} vanished before the pointer reached it`, { code: 'ERR_SCENARIO_HOVER' });
    await handle.hover({ timeout: 2500 });
    return { specId: resolved.specId, descriptor: resolved.descriptor, via: resolved.via };
  },

  async type(ctx, step) {
    const resolved = await ctx.resolveTarget(step.target);
    const value = await typeInto(ctx.driver, specSelector(resolved.specId), step.params.text, { delay: step.params.delayMs ?? 80 });
    return { specId: resolved.specId, value, via: resolved.via };
  },

  async drag(ctx, step) {
    const from = await ctx.resolveTarget(step.target);
    const to = await ctx.resolveTarget(step.params.to, { field: 'to' });
    const moved = await dragAndVerify(ctx.driver, { fromId: from.specId, toId: to.specId, steps: step.params.steps ?? 10 });
    return { specId: from.specId, from: from.specId, to: to.specId, moved };
  },

  async expect() {
    return {};
  },

  async capture(ctx, step) {
    const { capture } = await captureFunctions(ctx);
    if (!capture) {
      throw new ScenarioStepError(
        'no capture implementation is available: pass deps.capture, or provide src/capture.mjs exporting captureScenarioState/captureState/capture',
        { code: 'ERR_SCENARIO_CAPTURE_UNAVAILABLE' },
      );
    }
    const resolved = step.target ? await ctx.resolveTarget(step.target) : null;
    const notes = [step.params.why, step.params.path, step.notes].filter(Boolean).join(' — ') || null;
    const record = await capture({
      driver: ctx.driver,
      bundle: await bundleFor(ctx),
      oracle: ctx.deps.oracle ?? null,
      outDir: ctx.scenario.captures.outDir,
      name: step.params.name,
      notes,
      why: step.params.why ?? null,
      path: step.params.path ?? null,
      subgrid: step.params.subgrid ?? false,
      specId: resolved?.specId ?? null,
      scenario: ctx.scenario.name,
      step: step.id,
    });
    assertCaptureSucceeded(record, step);
    const entry = { step: step.id, name: step.params.name, kind: 'state', stateId: stateIdOf(record), record: record ?? null };
    ctx.captures.push(entry);
    return { specId: resolved?.specId ?? null, capture: entry };
  },

  async captureMotion(ctx, step) {
    const { captureMotion } = await captureFunctions(ctx);
    if (!captureMotion) {
      throw new ScenarioStepError(
        'no motion-capture implementation is available: pass deps.captureMotion, or provide src/capture.mjs exporting captureScenarioMotion/captureMotion/captureAnimation',
        { code: 'ERR_SCENARIO_CAPTURE_UNAVAILABLE' },
      );
    }
    const resolved = step.target ? await ctx.resolveTarget(step.target) : null;
    const notes = [step.params.why, step.params.path, step.notes].filter(Boolean).join(' — ') || null;
    const record = await captureMotion({
      driver: ctx.driver,
      bundle: await bundleFor(ctx),
      oracle: ctx.deps.oracle ?? null,
      outDir: ctx.scenario.captures.outDir,
      name: step.params.name,
      notes,
      why: step.params.why ?? null,
      path: step.params.path ?? null,
      durationMs: step.params.durationMs ?? 1200,
      fps: step.params.fps ?? 30,
      specId: resolved?.specId ?? null,
      scenario: ctx.scenario.name,
      step: step.id,
    });
    assertCaptureSucceeded(record, step);
    const entry = { step: step.id, name: step.params.name, kind: 'motion', stateId: stateIdOf(record), record: record ?? null };
    ctx.captures.push(entry);
    return { specId: resolved?.specId ?? null, capture: entry };
  },

  async reset(ctx, step) {
    const mode = step.params.mode ?? 'reset';
    const report = mode === 'ensureClean'
      ? await ctx.driver.ensureClean({ structured: true })
      : await ctx.driver.reset({ structured: true });
    return { mode, report };
  },

  async verifyStandalone(ctx, step) {
    return runVerification(ctx, step, 'standalone');
  },

  async verifyPaper(ctx, step) {
    return runVerification(ctx, step, 'paper');
  },
};

async function verificationFunctions(ctx) {
  if (ctx.deps.verification) return ctx.deps.verification;
  const module = await import('./verification.mjs');
  return { standalone: module.verifyStandaloneState, paper: module.verifyPaperRoundTrip };
}

async function runVerification(ctx, step, leg) {
  const functions = await verificationFunctions(ctx);
  const run = functions[leg];
  if (typeof run !== 'function') {
    throw new ScenarioStepError(`no ${leg} verification implementation available`, { code: 'ERR_SCENARIO_VERIFY_UNAVAILABLE' });
  }
  const outDir = ctx.scenario.captures.outDir;
  const configured = ctx.scenario.verification?.[leg] ?? null;
  const states = step.params.states ?? configured?.states ?? ctx.captures.map((entry) => entry.stateId).filter(Boolean);
  if (states.length === 0) {
    throw new ScenarioStepError(`${leg} verification has no states to check: name them in the step, in verification.${leg}.states, or capture some first`, {
      code: 'ERR_SCENARIO_VERIFY_EMPTY',
    });
  }
  const reports = [];
  for (const state of states) {
    const report = await run(outDir, state, configured?.threshold !== null && configured?.threshold !== undefined ? { threshold: configured.threshold } : {});
    reports.push({ state, status: report?.status ?? 'error', reportHash: report?.reportHash ?? null, reason: report?.reason ?? null });
  }
  const rejected = reports.filter((report) => report.status === 'rejected' || report.status === 'error');
  const result = { leg, reports, ok: rejected.length === 0 };
  ctx.verification ??= { standalone: [], paper: [] };
  ctx.verification[leg].push(...reports);
  if (!result.ok) {
    throw new ScenarioStepError(
      `${leg} verification rejected ${rejected.length} of ${reports.length} state(s): ${rejected.map((report) => `${report.state} (${report.status}${report.reason ? `: ${report.reason}` : ''})`).join(', ')}`,
      { code: 'ERR_SCENARIO_VERIFY_REJECTED', evidence: result },
    );
  }
  return result;
}

/* -------------------------------------------------------------------- runner */

function skippedRecord(planned, because) {
  return {
    index: planned.index,
    id: planned.id,
    phase: planned.phase,
    action: planned.action,
    status: STATUS.SKIPPED,
    dependsOn: planned.dependsOn,
    evidence: { skippedBecause: because },
    error: null,
  };
}

function serializeError(error) {
  return {
    message: error?.message ?? String(error),
    code: error?.code ?? 'ERR_UNKNOWN',
    name: error?.name ?? 'Error',
    path: error?.path ?? null,
    evidence: error?.evidence ?? null,
  };
}

async function executeStep(ctx, step, planned) {
  const runner = ACTION_RUNNERS[step.action];
  if (!runner) throw new ScenarioStepError(`no runner for action ${step.action}`, { code: 'ERR_SCENARIO_ACTION' });

  const before = step.mutating ? await snapshotExpectation(ctx, step.expect) : null;
  const output = await runner(ctx, step);
  if (step.mutating) await ctx.driver.settle(200, 5000);

  if (ACTIONS[step.action]?.produces && output?.specId) {
    ctx.outputs.set(step.id, { specId: output.specId, descriptor: output.descriptor ?? null });
  }

  let expectation = null;
  if (step.expect) {
    expectation = await checkExpectation(ctx, step.expect, before);
    if (!expectation.ok) {
      throw new ScenarioStepError(
        `postcondition ${JSON.stringify(step.expect.name)} (${step.expect.kind}) did not hold after ${step.action}: expected ${JSON.stringify(expectation.expected)}, observed ${JSON.stringify(expectation.observed)}`,
        { code: 'ERR_SCENARIO_POSTCONDITION', evidence: { expectation, output } },
      );
    }
  }

  return {
    index: planned.index,
    id: planned.id,
    phase: planned.phase,
    action: planned.action,
    status: STATUS.OK,
    dependsOn: planned.dependsOn,
    evidence: { output: output ?? null, expectation },
    error: null,
  };
}

function dryRunRecord(planned) {
  return {
    index: planned.index,
    id: planned.id,
    phase: planned.phase,
    action: planned.action,
    status: STATUS.PLANNED,
    dependsOn: planned.dependsOn,
    evidence: {
      mutating: planned.mutating,
      target: planned.target,
      params: planned.params,
      expectation: planned.expectation,
    },
    error: null,
  };
}

/**
 * Validate, plan and (unless `dryRun`) execute a scenario.
 *
 * @param {object} input raw scenario JSON or an already-validated scenario
 * @param {object} [options]
 * @param {boolean} [options.dryRun] validate and plan without touching a browser
 * @param {object} [options.driver] an attached SpecDriver
 * @param {Function} [options.attach] async ({endpoint, urlPattern}) => driver
 * @param {Function} [options.capture] capture seam (see src/capture.mjs)
 * @param {Function} [options.captureMotion] motion-capture seam
 * @param {object} [options.verification] {standalone, paper} seam
 * @param {Function} [options.onProgress] called with each step record as it lands
 */
export async function runScenario(input, options = {}) {
  const scenario = isNormalizedScenario(input) ? input : validateScenario(input);
  const plan = planScenario(scenario);

  if (options.dryRun) {
    const report = options.onProgress ?? (() => {});
    const steps = [...plan.phases.preconditions, ...plan.phases.steps, ...plan.phases.teardown].map((planned) => {
      const record = dryRunRecord(planned);
      report(record);
      return record;
    });
    return {
      ok: true,
      mode: 'dry-run',
      schemaVersion: scenario.schemaVersion,
      scenario: { name: scenario.name, description: scenario.description },
      plan,
      steps,
      captures: { outDir: plan.bundle, entries: [] },
      verification: { standalone: [], paper: [], ok: true },
      reset: { policy: scenario.resetPolicy, ran: false, report: null },
      teardown: { ran: false, steps: plan.phases.teardown.length },
    };
  }

  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const onProgress = options.onProgress ?? (() => {});

  let driver = options.driver ?? null;
  let ownsDriver = false;
  const records = [];
  let failure = null;
  let resetReport = { policy: scenario.resetPolicy, ran: false, report: null, error: null };
  let teardownRan = false;

  const ctx = new RunContext({ scenario, driver: null, deps: options });
  ctx.verification = { standalone: [], paper: [] };

  try {
    if (!driver) {
      const attach = options.attach ?? (async ({ endpoint, urlPattern }) => {
        const { SpecDriver } = await import('./driver.mjs');
        return SpecDriver.attach(endpoint, urlPattern ?? undefined);
      });
      const endpoint = options.endpoint ?? scenario.target.endpoint;
      if (!endpoint) {
        throw new ScenarioStepError('no CDP endpoint: set target.endpoint in the scenario or pass --endpoint', { code: 'ERR_SCENARIO_ENDPOINT', path: 'target.endpoint' });
      }
      driver = await attach({ endpoint, urlPattern: options.urlPattern ?? scenario.target.urlPattern });
      ownsDriver = true;
    }
    ctx.driver = driver;

    if (scenario.target.navigateTo) await driver.goto(scenario.target.navigateTo);
    else if (typeof driver.establishBaseline === 'function' && !options.driver) await driver.establishBaseline();

    if (scenario.region && typeof driver.setRegion === 'function') driver.setRegion(scenario.region);

    for (const phase of ['preconditions', 'steps']) {
      const planned = plan.phases[phase];
      const source = scenario[phase];
      for (const [index, plannedStep] of planned.entries()) {
        if (failure) {
          const record = skippedRecord(plannedStep, failure.id);
          records.push(record);
          onProgress(record);
          continue;
        }
        let record;
        try {
          record = await executeStep(ctx, source[index], plannedStep);
        } catch (error) {
          record = {
            index: plannedStep.index,
            id: plannedStep.id,
            phase: plannedStep.phase,
            action: plannedStep.action,
            status: STATUS.FAILED,
            dependsOn: plannedStep.dependsOn,
            evidence: null,
            error: serializeError(error),
          };
          failure = { id: plannedStep.id, error: record.error };
        }
        records.push(record);
        onProgress(record);

        if (!failure && phase === 'steps' && scenario.resetPolicy === 'between-steps' && index < planned.length - 1) {
          await driver.reset({ structured: true }).catch(() => {});
        }
      }
    }
  } catch (error) {
    failure ??= { id: '(setup)', error: serializeError(error) };
    if (records.length === 0 || records.at(-1).status !== STATUS.FAILED) {
      records.unshift({
        index: -1, id: '(setup)', phase: 'setup', action: 'attach',
        status: STATUS.FAILED, dependsOn: [], evidence: null, error: serializeError(error),
      });
    }
  } finally {
    // Teardown and reset run whatever happened above; a scenario that leaves an
    // overlay open poisons every capture that follows it in the same session.
    if (ctx.driver) {
      for (const [index, plannedStep] of plan.phases.teardown.entries()) {
        let record;
        try {
          record = await executeStep(ctx, scenario.teardown[index], plannedStep);
        } catch (error) {
          record = {
            index: plannedStep.index, id: plannedStep.id, phase: 'teardown', action: plannedStep.action,
            status: STATUS.FAILED, dependsOn: plannedStep.dependsOn, evidence: null, error: serializeError(error),
          };
        }
        records.push(record);
        onProgress(record);
      }
      teardownRan = true;

      if (scenario.resetPolicy !== 'never') {
        try {
          resetReport = { policy: scenario.resetPolicy, ran: true, report: await ctx.driver.reset({ structured: true }), error: null };
        } catch (error) {
          resetReport = { policy: scenario.resetPolicy, ran: true, report: null, error: serializeError(error) };
        }
      }
    }
    if (ctx.bundle && !options.bundle && typeof ctx.bundle.close === 'function') await ctx.bundle.close().catch(() => {});
    if (ownsDriver && driver && typeof driver.close === 'function') await driver.close().catch(() => {});
  }

  const finishedAt = now();
  const failed = records.filter((record) => record.status === STATUS.FAILED);
  return {
    ok: failed.length === 0,
    mode: 'run',
    schemaVersion: scenario.schemaVersion,
    scenario: { name: scenario.name, description: scenario.description },
    plan,
    steps: records,
    captures: { outDir: plan.bundle, entries: ctx.captures },
    verification: { ...ctx.verification, ok: [...ctx.verification.standalone, ...ctx.verification.paper].every((report) => report.status !== 'rejected' && report.status !== 'error') },
    reset: resetReport,
    teardown: { ran: teardownRan, steps: plan.phases.teardown.length },
    startedAt,
    finishedAt,
  };
}
