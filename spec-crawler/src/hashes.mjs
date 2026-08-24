import { createHash } from 'node:crypto';

const VOLATILE_PROVENANCE_KEYS = new Set([
  'capturedAt',
  'createdAt',
  'generatedAt',
  'startedAt',
  'endedAt',
  'updatedAt',
  'timestamp',
  'timestamps',
  'runId',
  'sessionId',
  'transactionId',
  'pid',
]);

function isVolatileProvenanceKey(key) {
  if (VOLATILE_PROVENANCE_KEYS.has(key)) return true;
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return /^(captured|created|generated|started|ended|updated)at$/.test(normalized)
    || /^(elapsed|duration)(ms|millis|milliseconds)?$/.test(normalized)
    || /^(run|session|transaction)id$/.test(normalized)
    || normalized === 'timestamp'
    || normalized === 'pid'
    || normalized === 'nonce';
}

const STATE_LAYER_OMIT = new Set([
  'artifacts',
  'bytes',
  'capturedAt',
  'contract',
  'checklist',
  'frame',
  'hash',
  'hashes',
  'id',
  'jsx',
  'layout',
  'provenance',
  'rect',
  'shot',
  'shots',
  'states',
]);

/**
 * Convert a JSON value to a recursively key-sorted value.
 *
 * Unsupported JSON values are rejected rather than being silently coerced. That
 * makes a digest failure local and visible instead of allowing two unlike inputs
 * to collapse to the same serialized representation.
 */
export function canonicalize(value) {
  const ancestors = new Set();

  const visit = (current, inArray = false) => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new TypeError('Canonical JSON does not support non-finite numbers');
      return Object.is(current, -0) ? 0 : current;
    }
    if (typeof current === 'undefined') {
      if (inArray) return null;
      return undefined;
    }
    if (typeof current === 'bigint' || typeof current === 'function' || typeof current === 'symbol') {
      throw new TypeError(`Canonical JSON does not support ${typeof current} values`);
    }
    if (Buffer.isBuffer(current) || ArrayBuffer.isView(current)) {
      throw new TypeError('Canonical JSON does not support binary values; hash the bytes separately');
    }
    if (!Array.isArray(current)) {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Canonical JSON requires plain objects; received ${current.constructor?.name ?? 'unknown object'}`);
      }
    }
    if (ancestors.has(current)) throw new TypeError('Canonical JSON does not support cyclic values');

    ancestors.add(current);
    let result;
    if (Array.isArray(current)) {
      result = current.map((entry) => visit(entry, true));
    } else {
      result = {};
      for (const key of Object.keys(current).sort()) {
        const entry = visit(current[key], false);
        if (entry !== undefined) Object.defineProperty(result, key, {
          value: entry,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    ancestors.delete(current);
    return result;
  };

  return visit(value);
}

/** Deterministic compact JSON suitable for hashing and durable manifests. */
export function canonicalJson(value) {
  const normalized = canonicalize(value);
  if (normalized === undefined) throw new TypeError('Canonical JSON requires a defined root value');
  return JSON.stringify(normalized);
}

/** SHA-256 as a lowercase hexadecimal string. */
export function sha256(value) {
  if (!(typeof value === 'string' || Buffer.isBuffer(value) || ArrayBuffer.isView(value))) {
    throw new TypeError('sha256 expects a string, Buffer, or typed array');
  }
  return createHash('sha256').update(value).digest('hex');
}

export function hashCanonical(value) {
  return sha256(canonicalJson(value));
}

/** Remove run-specific facts while retaining reproducibility-relevant facts. */
export function stableProvenance(value) {
  const visit = (current) => {
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== 'object') return current;
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Provenance requires plain objects; received ${current.constructor?.name ?? 'unknown object'}`);
    }
    const result = {};
    for (const key of Object.keys(current).sort()) {
      if (!isVolatileProvenanceKey(key)) Object.defineProperty(result, key, {
        value: visit(current[key]),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  };
  return visit(value ?? {});
}

function tagsFromHtml(html) {
  if (!html) return [];
  const tags = [];
  const pattern = /<\/?([a-zA-Z][\w:-]*)\b[^>]*?>/g;
  for (const match of String(html).matchAll(pattern)) {
    const source = match[0];
    tags.push(`${source.startsWith('</') ? '/' : ''}${match[1].toLowerCase()}`);
  }
  return tags;
}

function stableStateDescriptor(state = {}) {
  const result = {};
  for (const key of Object.keys(state).sort()) {
    if (!STATE_LAYER_OMIT.has(key)) Object.defineProperty(result, key, {
      value: state[key], enumerable: true, configurable: true, writable: true,
    });
  }
  return result;
}

function visualDescriptor(shots = {}) {
  const result = {};
  for (const kind of Object.keys(shots).sort()) {
    const bytes = shots[kind];
    if (bytes != null) Object.defineProperty(result, kind, {
      value: sha256(bytes), enumerable: true, configurable: true, writable: true,
    });
  }
  return result;
}

/**
 * Compute the seven independently useful digest layers for a captured artifact.
 * The final artifact digest composes the other six, so a collision in the legacy
 * `state.hash` cannot collapse captures whose pixels or content differ.
 */
export function computeLayeredHashes({ state = {}, frame = {}, shots = {}, cssStates, contract, checklist, provenance = {} } = {}) {
  const topology = hashCanonical({
    kind: state.kind ?? null,
    tags: tagsFromHtml(frame.paperHtml),
    topology: state.topology ?? state.structure ?? null,
  });
  const stateHash = hashCanonical(stableStateDescriptor(state));
  const layout = hashCanonical({
    rect: state.rect ?? null,
    layout: state.layout ?? null,
  });
  const visual = hashCanonical(visualDescriptor(shots));
  const content = hashCanonical({
    paperHtml: frame.paperHtml ?? '',
    jsx: frame.jsx ?? null,
    cssStates: cssStates ?? null,
    contract: contract ?? null,
    checklist: checklist ?? null,
  });
  const environment = hashCanonical(stableProvenance(provenance));
  const artifact = hashCanonical({ topology, state: stateHash, layout, visual, content, environment });

  return { topology, state: stateHash, layout, visual, content, environment, artifact };
}

export const layeredHashes = computeLayeredHashes;

const MANIFEST_HASH_OMIT = new Set([
  'artifacts',
  'capturedAt',
  'crawlReport',
  'cssSpec',
  'hashes',
  'manifestRevision',
  'provenance',
  'schemaVersion',
  'stateCount',
  'states',
]);

/** Compute bundle-level layers, including the zero-state CSS-only case. */
export function computeManifestHashes(manifest = {}) {
  const states = manifest.states ?? [];
  const metadata = {};
  for (const key of Object.keys(manifest).sort()) {
    if (!MANIFEST_HASH_OMIT.has(key)) Object.defineProperty(metadata, key, {
      value: manifest[key], enumerable: true, configurable: true, writable: true,
    });
  }
  const topology = hashCanonical(states.map((entry) => entry.hashes?.topology ?? null));
  const state = hashCanonical(states.map((entry) => entry.hashes?.state ?? null));
  const layout = hashCanonical(states.map((entry) => entry.hashes?.layout ?? null));
  const visual = hashCanonical(states.map((entry) => entry.hashes?.visual ?? null));
  const content = hashCanonical({
    states: states.map((entry) => entry.hashes?.content ?? null),
    cssSpec: manifest.cssSpec ?? null,
    crawlReport: manifest.crawlReport ?? null,
    metadata,
  });
  const environment = hashCanonical({
    states: states.map((entry) => entry.hashes?.environment ?? null),
    provenance: stableProvenance(manifest.provenance ?? {}),
  });
  const artifact = hashCanonical({ topology, state, layout, visual, content, environment });
  return { topology, state, layout, visual, content, environment, artifact };
}
