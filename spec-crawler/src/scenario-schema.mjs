/**
 * Declarative scenario schema, version 1.
 *
 * A scenario is data, never code. There is no field anywhere in this grammar
 * that is evaluated as JavaScript — every "expectation" is a typed record whose
 * meaning is fixed here and implemented in `scenario.mjs` against the page. That
 * is deliberate: a scenario file is the thing another session reads to know how
 * a state was reached, and a file containing `evaluate: "() => ..."` explains
 * nothing and can do anything.
 *
 * Two rules carry most of the weight:
 *
 *  1. Every state-mutating action must carry a *named* postcondition. Without it
 *     an action that silently did nothing still produces a plausible-looking
 *     step record and every measurement after it describes the state before it
 *     (see the failures recorded at the top of `assert.mjs`).
 *  2. A point target must declare what it expects to hit. Coordinates drift; a
 *     coordinate with no expectation resolves to whatever happens to be there.
 */

export const SCENARIO_SCHEMA_VERSION = 1;

export const COLOR_SCHEMES = Object.freeze(['light', 'dark', 'no-preference']);
export const REDUCED_MOTION = Object.freeze(['reduce', 'no-preference']);
export const RESET_POLICIES = Object.freeze(['never', 'between-steps', 'after-scenario']);
export const PHASES = Object.freeze(['preconditions', 'steps', 'teardown']);

/** Expectation grammar. `name` is required on every one of these. */
export const EXPECTATION_KINDS = Object.freeze({
  surfaceAppears: {
    fields: { role: { type: 'string' }, labelIncludes: { type: 'string' } },
    atLeastOne: ['role', 'labelIncludes'],
  },
  surfaceDisappears: {
    fields: { role: { type: 'string' }, labelIncludes: { type: 'string' }, target: { type: 'target' } },
    atLeastOne: ['role', 'labelIncludes', 'target'],
  },
  textVisible: { fields: { text: { type: 'string', required: true } } },
  textAbsent: { fields: { text: { type: 'string', required: true } } },
  // `name` is the expectation's label on every kind, so the DOM attribute being
  // read has to be called something else.
  attribute: {
    fields: {
      target: { type: 'target', required: true },
      attributeName: { type: 'string', required: true },
      equals: { type: 'string', required: true },
    },
  },
  fieldValue: {
    fields: { target: { type: 'target', required: true }, equals: { type: 'string', required: true } },
  },
  moved: {
    fields: { target: { type: 'target', required: true }, minDeltaPx: { type: 'integer', min: 1, default: 4 } },
  },
  urlMatches: { fields: { pattern: { type: 'pattern', required: true } } },
  viewport: {
    fields: {
      width: { type: 'integer', min: 1, required: true },
      height: { type: 'integer', min: 1, required: true },
      deviceScaleFactor: { type: 'number', min: 0.1 },
    },
  },
  media: {
    fields: { colorScheme: { type: 'enum', values: COLOR_SCHEMES }, reducedMotion: { type: 'enum', values: REDUCED_MOTION } },
    atLeastOne: ['colorScheme', 'reducedMotion'],
  },
  noOverlays: { fields: {} },
});

/**
 * Action grammar.
 *
 * `mutating` drives the postcondition rule. `target` is 'required' | 'optional'
 * | 'none'. `produces` marks the actions whose resolved element may be named by
 * a later `{ref}` target.
 */
export const ACTIONS = Object.freeze({
  navigate: { mutating: true, target: 'none', fields: { url: { type: 'string', required: true } } },
  setViewport: {
    mutating: true,
    target: 'none',
    fields: {
      width: { type: 'integer', min: 1, required: true },
      height: { type: 'integer', min: 1, required: true },
      deviceScaleFactor: { type: 'number', min: 0.1 },
    },
  },
  setMedia: {
    mutating: true,
    target: 'none',
    fields: { colorScheme: { type: 'enum', values: COLOR_SCHEMES }, reducedMotion: { type: 'enum', values: REDUCED_MOTION } },
    atLeastOne: ['colorScheme', 'reducedMotion'],
  },
  verifyEnvironment: { mutating: false, target: 'none', fields: {}, needsEnvironment: true, forbidsExpect: true },
  click: {
    mutating: true,
    target: 'required',
    produces: true,
    fields: { button: { type: 'enum', values: ['left', 'right', 'middle'], default: 'left' }, clickCount: { type: 'integer', min: 1, max: 3, default: 1 } },
  },
  press: { mutating: true, target: 'none', fields: { keys: { type: 'string', required: true } } },
  hover: { mutating: true, target: 'required', produces: true, fields: {} },
  type: {
    mutating: true,
    target: 'required',
    produces: true,
    fields: { text: { type: 'string', required: true }, delayMs: { type: 'integer', min: 0, max: 1000, default: 80 } },
  },
  drag: { mutating: true, target: 'required', produces: true, fields: { to: { type: 'target', required: true }, steps: { type: 'integer', min: 1, max: 100, default: 10 } } },
  expect: { mutating: false, target: 'none', fields: {}, requiresExpect: true },
  capture: {
    mutating: false,
    target: 'optional',
    produces: true,
    fields: {
      name: { type: 'string', required: true },
      why: { type: 'string' },
      path: { type: 'string' },
      subgrid: { type: 'boolean', default: false },
    },
    needsBundle: true,
  },
  captureMotion: {
    mutating: false,
    target: 'optional',
    produces: true,
    fields: {
      name: { type: 'string', required: true },
      why: { type: 'string' },
      path: { type: 'string' },
      durationMs: { type: 'integer', min: 50, max: 20000, default: 1200 },
      fps: { type: 'integer', min: 1, max: 120, default: 30 },
    },
    needsBundle: true,
  },
  reset: { mutating: true, target: 'none', fields: { mode: { type: 'enum', values: ['reset', 'ensureClean'], default: 'reset' } } },
  verifyStandalone: { mutating: false, target: 'none', fields: { states: { type: 'stringArray' } }, needsBundle: true },
  verifyPaper: { mutating: false, target: 'none', fields: { states: { type: 'stringArray' } }, needsBundle: true },
});

export const ACTION_NAMES = Object.freeze(Object.keys(ACTIONS));

/**
 * Brand stamped on a normalized scenario. Validation is not idempotent — the
 * normalized step shape is deliberately richer than the authored one — so the
 * planner needs a way to tell "already validated" from "raw" that does not
 * depend on guessing from field names.
 */
const NORMALIZED = Symbol.for('spec-crawler.scenario.normalized');

export function isNormalizedScenario(value) {
  return Boolean(value) && typeof value === 'object' && value[NORMALIZED] === true;
}

export class ScenarioValidationError extends Error {
  constructor(violations) {
    const list = violations.map((violation) => `  ${violation.path}: ${violation.message}`).join('\n');
    super(`Scenario is invalid (${violations.length} violation${violations.length === 1 ? '' : 's'}):\n${list}`);
    this.name = 'ScenarioValidationError';
    this.code = 'ERR_SCENARIO_INVALID';
    this.violations = violations;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class Collector {
  constructor() { this.violations = []; }

  add(path, code, message) {
    this.violations.push({ path, code, message });
    return undefined;
  }

  get ok() { return this.violations.length === 0; }
}

const at = (base, key) => (typeof key === 'number' ? `${base}[${key}]` : (base ? `${base}.${key}` : key));

function unknownKeys(collector, value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      collector.add(at(path, key), 'unknown-field', `unknown field (allowed here: ${[...allowed].sort().join(', ')})`);
    }
  }
}

function readScalar(collector, value, spec, path) {
  if (value === undefined) {
    if (spec.required) return collector.add(path, 'missing-field', 'is required');
    return spec.default;
  }
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string' || value.trim().length === 0) {
        return collector.add(path, 'bad-type', 'must be a non-empty string');
      }
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') return collector.add(path, 'bad-type', 'must be a boolean');
      return value;
    case 'integer':
      if (!Number.isSafeInteger(value)) return collector.add(path, 'bad-type', 'must be an integer');
      if (spec.min !== undefined && value < spec.min) return collector.add(path, 'out-of-range', `must be >= ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) return collector.add(path, 'out-of-range', `must be <= ${spec.max}`);
      return value;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return collector.add(path, 'bad-type', 'must be a finite number');
      if (spec.min !== undefined && value < spec.min) return collector.add(path, 'out-of-range', `must be >= ${spec.min}`);
      return value;
    case 'enum':
      if (!spec.values.includes(value)) return collector.add(path, 'bad-value', `must be one of: ${spec.values.join(', ')}`);
      return value;
    case 'pattern':
      if (typeof value !== 'string' || value.length === 0) return collector.add(path, 'bad-type', 'must be a non-empty regular-expression string');
      try { new RegExp(value); } catch (cause) {
        return collector.add(path, 'bad-value', `is not a valid regular expression: ${cause.message}`);
      }
      return value;
    case 'stringArray':
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
        return collector.add(path, 'bad-type', 'must be an array of non-empty strings');
      }
      return [...value];
    default:
      return collector.add(path, 'internal', `unsupported field type ${spec.type}`);
  }
}

function readRect(collector, value, path) {
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object with x, y, width, height');
  unknownKeys(collector, value, new Set(['x', 'y', 'width', 'height']), path);
  const rect = {};
  for (const key of ['x', 'y', 'width', 'height']) {
    rect[key] = readScalar(collector, value[key], { type: 'number', required: true }, at(path, key));
  }
  return rect;
}

const TARGET_DISCRIMINATORS = ['specId', 'point', 'role', 'ref'];

/**
 * A target names one element. Exactly one discriminator, and a coordinate
 * target must say what it expects to find there.
 */
export function readTarget(collector, value, path) {
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  const present = TARGET_DISCRIMINATORS.filter((key) => value[key] !== undefined);
  if (present.length === 0) {
    return collector.add(path, 'missing-field', `must name exactly one of: ${TARGET_DISCRIMINATORS.join(', ')}`);
  }
  if (present.length > 1) {
    return collector.add(path, 'ambiguous-target', `names ${present.join(' and ')}; exactly one of ${TARGET_DISCRIMINATORS.join(', ')} is allowed`);
  }

  const kind = present[0];
  if (kind === 'specId') {
    unknownKeys(collector, value, new Set(['specId', 'expect']), path);
    return {
      kind: 'specId',
      specId: readScalar(collector, value.specId, { type: 'string', required: true }, at(path, 'specId')),
      expect: readScalar(collector, value.expect, { type: 'string' }, at(path, 'expect')) ?? null,
    };
  }
  if (kind === 'point') {
    unknownKeys(collector, value, new Set(['point', 'expect']), path);
    let point = null;
    if (!isRecord(value.point)) {
      collector.add(at(path, 'point'), 'bad-type', 'must be an object with numeric x and y');
    } else {
      unknownKeys(collector, value.point, new Set(['x', 'y']), at(path, 'point'));
      point = {
        x: readScalar(collector, value.point.x, { type: 'number', required: true }, at(at(path, 'point'), 'x')),
        y: readScalar(collector, value.point.y, { type: 'number', required: true }, at(at(path, 'point'), 'y')),
      };
    }
    if (value.expect === undefined) {
      collector.add(at(path, 'expect'), 'missing-field',
        'is required for a point target: a coordinate with no expectation resolves to whatever happens to be there');
      return undefined;
    }
    return { kind: 'point', point, expect: readScalar(collector, value.expect, { type: 'string', required: true }, at(path, 'expect')) };
  }
  if (kind === 'role') {
    unknownKeys(collector, value, new Set(['role', 'labelIncludes', 'nth']), path);
    return {
      kind: 'role',
      role: readScalar(collector, value.role, { type: 'string', required: true }, at(path, 'role')),
      labelIncludes: readScalar(collector, value.labelIncludes, { type: 'string' }, at(path, 'labelIncludes')) ?? null,
      nth: readScalar(collector, value.nth, { type: 'integer', min: 0 }, at(path, 'nth')) ?? null,
    };
  }
  unknownKeys(collector, value, new Set(['ref']), path);
  return { kind: 'ref', ref: readScalar(collector, value.ref, { type: 'string', required: true }, at(path, 'ref')) };
}

function readExpectation(collector, value, path) {
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  const kind = value.kind;
  if (typeof kind !== 'string') return collector.add(at(path, 'kind'), 'missing-field', 'is required');
  const spec = EXPECTATION_KINDS[kind];
  if (!spec) {
    return collector.add(at(path, 'kind'), 'unknown-expectation',
      `unknown expectation kind ${JSON.stringify(kind)} (known: ${Object.keys(EXPECTATION_KINDS).sort().join(', ')})`);
  }

  const allowed = new Set(['kind', 'name', ...Object.keys(spec.fields)]);
  unknownKeys(collector, value, allowed, path);

  const name = readScalar(collector, value.name, { type: 'string', required: true }, at(path, 'name'));
  const result = { kind, name };
  for (const [field, fieldSpec] of Object.entries(spec.fields)) {
    const fieldPath = at(path, field);
    if (fieldSpec.type === 'target') {
      if (value[field] === undefined) {
        if (fieldSpec.required) collector.add(fieldPath, 'missing-field', 'is required');
        continue;
      }
      result[field] = readTarget(collector, value[field], fieldPath);
      continue;
    }
    const read = readScalar(collector, value[field], fieldSpec, fieldPath);
    if (read !== undefined) result[field] = read;
  }
  if (spec.atLeastOne && !spec.atLeastOne.some((field) => result[field] !== undefined && result[field] !== null)) {
    collector.add(path, 'missing-field', `requires at least one of: ${spec.atLeastOne.join(', ')}`);
  }
  return result;
}

function readStep(collector, value, path, { phase, index }) {
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');

  const action = value.action;
  if (typeof action !== 'string') return collector.add(at(path, 'action'), 'missing-field', 'is required');
  const spec = ACTIONS[action];
  if (!spec) {
    return collector.add(at(path, 'action'), 'unknown-action',
      `unknown action ${JSON.stringify(action)} (known: ${ACTION_NAMES.slice().sort().join(', ')})`);
  }

  const allowed = new Set(['action', 'id', 'notes', 'expect', ...Object.keys(spec.fields)]);
  if (spec.target !== 'none') allowed.add('target');
  unknownKeys(collector, value, allowed, path);

  const id = value.id === undefined
    ? `${phase}-${index + 1}-${action}`
    : readScalar(collector, value.id, { type: 'string' }, at(path, 'id'));

  const step = { id, phase, index, action, mutating: Boolean(spec.mutating), notes: null, target: null, expect: null, params: {} };
  step.notes = readScalar(collector, value.notes, { type: 'string' }, at(path, 'notes')) ?? null;

  if (spec.target === 'required' && value.target === undefined) {
    collector.add(at(path, 'target'), 'missing-field', `is required for action ${action}`);
  } else if (value.target !== undefined && spec.target === 'none') {
    // caught by unknownKeys already
  } else if (value.target !== undefined) {
    step.target = readTarget(collector, value.target, at(path, 'target')) ?? null;
  }

  for (const [field, fieldSpec] of Object.entries(spec.fields)) {
    const fieldPath = at(path, field);
    if (fieldSpec.type === 'target') {
      if (value[field] === undefined) {
        if (fieldSpec.required) collector.add(fieldPath, 'missing-field', 'is required');
        continue;
      }
      step.params[field] = readTarget(collector, value[field], fieldPath) ?? null;
      continue;
    }
    const read = readScalar(collector, value[field], fieldSpec, fieldPath);
    if (read !== undefined) step.params[field] = read;
  }
  if (spec.atLeastOne && !spec.atLeastOne.some((field) => step.params[field] !== undefined && step.params[field] !== null)) {
    collector.add(path, 'missing-field', `requires at least one of: ${spec.atLeastOne.join(', ')}`);
  }

  if (spec.forbidsExpect && value.expect !== undefined) {
    collector.add(at(path, 'expect'), 'unexpected-field',
      `action ${action} checks the declared environment block and takes no expect`);
  } else if (value.expect !== undefined) {
    step.expect = readExpectation(collector, value.expect, at(path, 'expect')) ?? null;
  } else if (spec.mutating || spec.requiresExpect) {
    collector.add(at(path, 'expect'), 'missing-postcondition',
      `action ${action} changes state and requires a named postcondition; an action that silently does nothing still produces a plausible step record`);
  }

  return step;
}

function readTargetBlock(collector, value, path) {
  if (value === undefined) return { endpoint: null, urlPattern: null, navigateTo: null };
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  unknownKeys(collector, value, new Set(['endpoint', 'urlPattern', 'navigateTo']), path);
  return {
    endpoint: readScalar(collector, value.endpoint, { type: 'string' }, at(path, 'endpoint')) ?? null,
    urlPattern: readScalar(collector, value.urlPattern, { type: 'pattern' }, at(path, 'urlPattern')) ?? null,
    navigateTo: readScalar(collector, value.navigateTo, { type: 'string' }, at(path, 'navigateTo')) ?? null,
  };
}

function readEnvironment(collector, value, path) {
  if (value === undefined) return null;
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  const allowed = new Set(['viewport', 'deviceScaleFactor', 'colorScheme', 'reducedMotion', 'locale', 'timezone']);
  unknownKeys(collector, value, allowed, path);

  let viewport = null;
  if (value.viewport !== undefined) {
    const viewportPath = at(path, 'viewport');
    if (!isRecord(value.viewport)) {
      collector.add(viewportPath, 'bad-type', 'must be an object with width and height');
    } else {
      unknownKeys(collector, value.viewport, new Set(['width', 'height']), viewportPath);
      viewport = {
        width: readScalar(collector, value.viewport.width, { type: 'integer', min: 1, required: true }, at(viewportPath, 'width')),
        height: readScalar(collector, value.viewport.height, { type: 'integer', min: 1, required: true }, at(viewportPath, 'height')),
      };
    }
  }

  return {
    viewport,
    deviceScaleFactor: readScalar(collector, value.deviceScaleFactor, { type: 'number', min: 0.1 }, at(path, 'deviceScaleFactor')) ?? null,
    colorScheme: readScalar(collector, value.colorScheme, { type: 'enum', values: COLOR_SCHEMES }, at(path, 'colorScheme')) ?? null,
    reducedMotion: readScalar(collector, value.reducedMotion, { type: 'enum', values: REDUCED_MOTION }, at(path, 'reducedMotion')) ?? null,
    locale: readScalar(collector, value.locale, { type: 'string' }, at(path, 'locale')) ?? null,
    timezone: readScalar(collector, value.timezone, { type: 'string' }, at(path, 'timezone')) ?? null,
  };
}

function readRegion(collector, value, path) {
  if (value === undefined) return null;
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  unknownKeys(collector, value, new Set(['include', 'exclude', 'includeArea', 'excludeArea']), path);
  return {
    include: readScalar(collector, value.include, { type: 'stringArray' }, at(path, 'include')) ?? null,
    exclude: readScalar(collector, value.exclude, { type: 'stringArray' }, at(path, 'exclude')) ?? null,
    includeArea: value.includeArea === undefined ? null : readRect(collector, value.includeArea, at(path, 'includeArea')),
    excludeArea: value.excludeArea === undefined ? null : readRect(collector, value.excludeArea, at(path, 'excludeArea')),
  };
}

function readCaptures(collector, value, path) {
  if (value === undefined) return null;
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  unknownKeys(collector, value, new Set(['outDir', 'fresh', 'meta']), path);
  if (value.meta !== undefined && !isRecord(value.meta)) collector.add(at(path, 'meta'), 'bad-type', 'must be an object');
  return {
    outDir: readScalar(collector, value.outDir, { type: 'string', required: true }, at(path, 'outDir')) ?? null,
    fresh: readScalar(collector, value.fresh, { type: 'boolean', default: false }, at(path, 'fresh')) ?? false,
    meta: isRecord(value.meta) ? { ...value.meta } : {},
  };
}

function readVerificationLeg(collector, value, path) {
  if (value === undefined) return null;
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  unknownKeys(collector, value, new Set(['states', 'threshold']), path);
  return {
    states: readScalar(collector, value.states, { type: 'stringArray' }, at(path, 'states')) ?? null,
    threshold: readScalar(collector, value.threshold, { type: 'number', min: 0 }, at(path, 'threshold')) ?? null,
  };
}

function readVerification(collector, value, path) {
  if (value === undefined) return null;
  if (!isRecord(value)) return collector.add(path, 'bad-type', 'must be an object');
  unknownKeys(collector, value, new Set(['standalone', 'paper']), path);
  return {
    standalone: readVerificationLeg(collector, value.standalone, at(path, 'standalone')) ?? null,
    paper: readVerificationLeg(collector, value.paper, at(path, 'paper')) ?? null,
  };
}

function readStepList(collector, value, path, phase) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return collector.add(path, 'bad-type', 'must be an array of steps') ?? [];
  const steps = [];
  for (const [index, entry] of value.entries()) {
    const step = readStep(collector, entry, at(path, index), { phase, index });
    if (step) steps.push(step);
  }
  return steps;
}

/**
 * Validate and normalize a scenario. Returns the normalized scenario; throws
 * `ScenarioValidationError` carrying every violation found, not just the first.
 */
export function validateScenario(raw) {
  const collector = new Collector();
  const scenario = buildScenario(collector, raw);
  if (collector.violations.length > 0) throw new ScenarioValidationError(collector.violations);
  return scenario;
}

/** Non-throwing form: every violation, each with a precise path. */
export function collectScenarioViolations(raw) {
  const collector = new Collector();
  buildScenario(collector, raw);
  return collector.violations;
}

function buildScenario(collector, raw) {
  if (!isRecord(raw)) {
    collector.add('', 'bad-type', 'scenario must be a JSON object');
    return null;
  }

  const allowed = new Set([
    'schemaVersion', 'name', 'description', 'target', 'environment', 'region',
    'preconditions', 'steps', 'captures', 'verification', 'resetPolicy', 'teardown',
  ]);
  unknownKeys(collector, raw, allowed, '');

  if (raw.schemaVersion === undefined) {
    collector.add('schemaVersion', 'missing-field', `is required and must be ${SCENARIO_SCHEMA_VERSION}`);
  } else if (raw.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    collector.add('schemaVersion', 'unsupported-version',
      `must be ${SCENARIO_SCHEMA_VERSION}; received ${JSON.stringify(raw.schemaVersion)}`);
  }

  const name = readScalar(collector, raw.name, { type: 'string', required: true }, 'name');
  const description = readScalar(collector, raw.description, { type: 'string' }, 'description') ?? null;
  const targetBlock = readTargetBlock(collector, raw.target, 'target') ?? { endpoint: null, urlPattern: null, navigateTo: null };
  const environment = readEnvironment(collector, raw.environment, 'environment') ?? null;
  const region = readRegion(collector, raw.region, 'region') ?? null;
  const captures = readCaptures(collector, raw.captures, 'captures') ?? null;
  const verification = readVerification(collector, raw.verification, 'verification') ?? null;
  const resetPolicy = readScalar(collector, raw.resetPolicy, { type: 'enum', values: RESET_POLICIES, default: 'after-scenario' }, 'resetPolicy')
    ?? 'after-scenario';

  const preconditions = readStepList(collector, raw.preconditions, 'preconditions', 'preconditions');
  if (raw.steps === undefined) {
    collector.add('steps', 'missing-field', 'is required and must contain at least one step');
  } else if (Array.isArray(raw.steps) && raw.steps.length === 0) {
    collector.add('steps', 'empty', 'must contain at least one step');
  }
  const steps = readStepList(collector, raw.steps, 'steps', 'steps');
  const teardown = readStepList(collector, raw.teardown, 'teardown', 'teardown');

  const ordered = [...preconditions, ...steps, ...teardown];
  crossCheck(collector, { ordered, environment, captures, verification });

  return Object.freeze({
    [NORMALIZED]: true,
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    name: name ?? null,
    description,
    target: targetBlock,
    environment,
    region,
    resetPolicy,
    captures,
    verification,
    preconditions,
    steps,
    teardown,
  });
}

function pathOfStep(step) {
  return `${step.phase}[${step.index}]`;
}

/** Rules that need the whole document: id uniqueness, ref resolution, bundle presence. */
function crossCheck(collector, { ordered, environment, captures, verification }) {
  const seenIds = new Map();
  const producedBefore = new Set();

  for (const step of ordered) {
    const path = pathOfStep(step);
    if (step.id !== undefined && step.id !== null) {
      if (seenIds.has(step.id)) {
        collector.add(at(path, 'id'), 'duplicate-id', `step id ${JSON.stringify(step.id)} is already used by ${seenIds.get(step.id)}`);
      } else {
        seenIds.set(step.id, path);
      }
    }

    for (const [field, target] of targetsOf(step)) {
      if (!target || target.kind !== 'ref') continue;
      if (!producedBefore.has(target.ref)) {
        collector.add(at(at(path, field), 'ref'), 'unresolved-ref',
          `no earlier step with id ${JSON.stringify(target.ref)} resolved an element; refs may only name a preceding step that targets one`);
      }
    }

    if (ACTIONS[step.action]?.needsEnvironment && !environment) {
      collector.add(path, 'missing-environment',
        `action ${step.action} checks the declared environment, but no environment block is declared`);
    }
    if (ACTIONS[step.action]?.needsBundle && !captures?.outDir) {
      collector.add('captures.outDir', 'missing-field',
        `action ${step.action} at ${path} writes to a bundle, so captures.outDir is required`);
    }

    if (ACTIONS[step.action]?.produces && step.target) producedBefore.add(step.id);
  }

  if (verification && !captures?.outDir) {
    collector.add('captures.outDir', 'missing-field', 'verification reads a bundle, so captures.outDir is required');
  }
}

function* targetsOf(step) {
  if (step.target) yield ['target', step.target];
  for (const [field, value] of Object.entries(step.params ?? {})) {
    if (value && typeof value === 'object' && typeof value.kind === 'string' && TARGET_KINDS.has(value.kind)) {
      yield [field, value];
    }
  }
  if (step.expect?.target) yield ['expect.target', step.expect.target];
}

const TARGET_KINDS = new Set(['specId', 'point', 'role', 'ref']);

export const scenarioTargetKinds = TARGET_KINDS;
