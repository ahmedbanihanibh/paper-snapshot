import { readFileSync } from 'node:fs';
import { canonicalize } from './hashes.mjs';

export const MANIFEST_SCHEMA_VERSION = 2;
export const LEGACY_MANIFEST_SCHEMA_VERSION = 1;

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`manifestRevision must be a non-negative safe integer; received ${String(value)}`);
  }
}

/** Validate the parts of the manifest that must be trustworthy before IO. */
export function validateManifest(manifest) {
  if (!isRecord(manifest)) throw new TypeError('Manifest must be a JSON object');
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new TypeError(`Manifest schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
  }
  assertRevision(manifest.manifestRevision);
  if (!Array.isArray(manifest.states)) throw new TypeError('Manifest states must be an array');

  const ids = new Set();
  for (const [index, state] of manifest.states.entries()) {
    if (!isRecord(state)) throw new TypeError(`Manifest state at index ${index} must be an object`);
    if (typeof state.id !== 'string' || state.id.length === 0) throw new TypeError(`Manifest state at index ${index} has no id`);
    if (ids.has(state.id)) throw new TypeError(`Duplicate state id: ${state.id}`);
    ids.add(state.id);
  }

  if (manifest.stateCount !== manifest.states.length) {
    throw new TypeError(`stateCount ${manifest.stateCount} does not match states.length ${manifest.states.length}`);
  }
  if (!isRecord(manifest.provenance)) throw new TypeError('Manifest provenance must be an object');
  if (!Number.isSafeInteger(manifest.provenance.sourceSchemaVersion)
    || manifest.provenance.sourceSchemaVersion < 1
    || manifest.provenance.sourceSchemaVersion > MANIFEST_SCHEMA_VERSION) {
    throw new TypeError('Manifest provenance.sourceSchemaVersion must identify a supported schema');
  }
  return manifest;
}

/**
 * Upgrade an on-disk manifest without discarding fields unknown to this version.
 * Unversioned manifests are the v1 format shipped by the original crawler.
 */
export function normalizeManifest(raw, { provenance = {} } = {}) {
  if (!isRecord(raw)) throw new TypeError('Manifest must be a JSON object');

  const sourceSchemaVersion = raw.schemaVersion ?? LEGACY_MANIFEST_SCHEMA_VERSION;
  if (!Number.isSafeInteger(sourceSchemaVersion) || sourceSchemaVersion < 1) {
    throw new TypeError(`Invalid manifest schemaVersion: ${String(sourceSchemaVersion)}`);
  }
  if (sourceSchemaVersion > MANIFEST_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported manifest schemaVersion ${sourceSchemaVersion}; this build supports up to ${MANIFEST_SCHEMA_VERSION}`);
  }

  const legacy = raw.schemaVersion === undefined;
  if (!legacy) {
    for (const field of ['manifestRevision', 'states', 'stateCount', 'provenance']) {
      if (!Object.hasOwn(raw, field)) throw new TypeError(`Schema v2 manifest is missing required field: ${field}`);
    }
  }

  const states = legacy && raw.states === undefined ? [] : raw.states;
  if (!Array.isArray(states)) throw new TypeError('Manifest states must be an array');
  const manifestRevision = legacy ? (raw.manifestRevision ?? 0) : raw.manifestRevision;
  assertRevision(manifestRevision);

  const existingProvenance = legacy && raw.provenance === undefined ? {} : raw.provenance;
  if (!isRecord(existingProvenance)) throw new TypeError('Manifest provenance must be an object');
  if (!isRecord(provenance)) throw new TypeError('Additional provenance must be an object');

  const normalized = {
    ...raw,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    manifestRevision,
    provenance: {
      sourceSchemaVersion,
      ...existingProvenance,
      ...provenance,
    },
    stateCount: legacy ? states.length : raw.stateCount,
    states: states.map((state) => isRecord(state) ? { ...state } : state),
  };

  return validateManifest(normalized);
}

export function readManifest(filePath) {
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch (error) {
    error.message = `Unable to read manifest ${filePath}: ${error.message}`;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new SyntaxError(`Malformed manifest JSON at ${filePath}: ${cause.message}`, { cause });
  }

  try {
    return normalizeManifest(parsed);
  } catch (cause) {
    throw new TypeError(`Invalid manifest at ${filePath}: ${cause.message}`, { cause });
  }
}

/** Stable, human-readable manifest bytes. */
export function serializeManifest(manifest) {
  validateManifest(manifest);
  return `${JSON.stringify(canonicalize(manifest), null, 2)}\n`;
}

export function incrementManifestRevision(manifest) {
  const current = manifest.manifestRevision ?? 0;
  assertRevision(current);
  if (current === Number.MAX_SAFE_INTEGER) throw new RangeError('manifestRevision cannot be incremented safely');
  return current + 1;
}
