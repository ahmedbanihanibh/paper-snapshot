/**
 * The spec bundle — the compatibility facade over the durable artifact store.
 *
 * Layout:
 *   <out>/spec.json          index of every captured state
 *   <out>/frames/<id>.html   Paper-pasteable HTML (inline computed styles)
 *   <out>/shots/<id>.png     screenshot of that state
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ArtifactStore, assertSafeRelativePath, describeArtifact, readPngDimensions } from './artifact-store.mjs';
import { animationContract, animationChecklist } from './contract.mjs';
import { canonicalize, computeLayeredHashes, computeManifestHashes } from './hashes.mjs';
import { incrementManifestRevision, normalizeManifest } from './manifest.mjs';

const ROOT_MANAGED_FIELDS = new Set([
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
const HASH_LAYERS = ['topology', 'state', 'layout', 'visual', 'content', 'environment', 'artifact'];

export class Bundle {
  #states = [];
  #hashes = new Set();
  #manifest;
  #nextSequence = 1;
  #store;
  #now;

  /**
   * @param {string} outDir
   * @param {object} meta
   * @param {{fresh?: boolean, now?: () => string, storeOptions?: object}} [options]
   *
   * Resuming remains the default. `fresh: true` is the only destructive mode,
   * and even it refuses to erase evidence behind a malformed manifest.
   */
  constructor(outDir, meta = {}, { fresh = false, now = () => new Date().toISOString(), storeOptions = {} } = {}) {
    this.outDir = path.resolve(outDir);
    this.#now = now;
    this.#store = new ArtifactStore(this.outDir, storeOptions);

    let existing = this.#store.loadManifest();
    if (fresh) {
      if (existing) {
        const provenance = { format: 'spec-crawler-artifact', ...(existing.provenance ?? {}) };
        const validatedStates = existing.states.map((state) => this.#hydrateState(state, provenance));
        assertUniqueArtifacts(validatedStates);
        validateExistingManifestIndexes(existing, validatedStates);
      }
      this.#store.clear();
      existing = null;
    } else if (!existing) {
      // Preserve the original clean-start behavior for ownerless leftovers. An
      // interrupted store transaction is handled safely before this point.
      this.#store.clear();
    }

    mkdirSync(path.join(this.outDir, 'frames'), { recursive: true });
    mkdirSync(path.join(this.outDir, 'shots'), { recursive: true });

    const cleanMeta = {};
    for (const [key, value] of Object.entries(meta ?? {})) if (!ROOT_MANAGED_FIELDS.has(key)) cleanMeta[key] = value;
    this.meta = cleanMeta;

    const baseProvenance = {
      sourceSchemaVersion: existing?.provenance?.sourceSchemaVersion ?? 2,
      format: 'spec-crawler-artifact',
      ...(existing?.provenance ?? {}),
      ...(meta?.provenance ?? {}),
    };

    this.#manifest = existing ?? normalizeManifest({
      ...cleanMeta,
      schemaVersion: 2,
      manifestRevision: 0,
      provenance: baseProvenance,
      stateCount: 0,
      states: [],
    });
    this.#manifest = { ...this.#manifest, ...cleanMeta, provenance: baseProvenance };
    this.cssSpec = existing?.cssSpec;
    this.crawlReport = existing?.crawlReport;

    if (existing) {
      this.#states = existing.states.map((state) => this.#hydrateState(state, baseProvenance));
      assertUniqueArtifacts(this.#states);
      validateExistingManifestIndexes(existing, this.#states);
      for (const state of this.#states) if (state.hash) this.#hashes.add(state.hash);
      this.resumed = this.#states.length;
    } else {
      this.#states = [];
      this.resumed = 0;
    }
    this.#nextSequence = nextSequence(this.#states);
  }

  /** True if a structurally identical legacy state was already captured. */
  seen(hash) {
    return hash ? this.#hashes.has(hash) : false;
  }

  /**
   * Add one capture and durably publish it before returning.
   *
   * The call shape is unchanged: bare screenshot buffers are still surface
   * shots, and `shot` remains the compatibility alias for `shots.surface`.
   */
  add(state, frame, shots, cssStates) {
    const images = Buffer.isBuffer(shots) ? { surface: shots } : (shots ?? {});
    if (!images.surface) throw new Error(`State ${state?.name ?? '(unnamed)'} requires a surface shot`);

    const id = `${String(this.#nextSequence).padStart(3, '0')}-${slug(state?.name)}`;
    const { record, artifacts } = this.#buildState(id, state ?? {}, frame ?? {}, images, cssStates);
    const states = [...this.#states, record];
    const manifest = this.#buildManifest(states);

    this.#store.commit({ manifest, artifacts });
    this.#states = states;
    this.#manifest = manifest;
    this.#nextSequence += 1;
    if (record.hash) this.#hashes.add(record.hash);
    return record;
  }

  /** Attach the Tier 1 CSS-state report; it describes states rather than capturing frames. */
  setCssSpec(cssSpec) {
    this.cssSpec = cssSpec;
  }

  /** Screenshot of a trigger that produced nothing, for diagnosis. */
  addDebugShot(label, shot) {
    if (!shot) return undefined;
    mkdirSync(path.join(this.outDir, 'debug'), { recursive: true });
    const rel = path.posix.join('debug', `${slug(label)}.png`);
    writeFileSync(path.join(this.outDir, ...rel.split('/')), shot);
    return rel;
  }

  /** Attach the Tier 2 crawl report, including why each trigger came up empty. */
  setCrawlReport(report) {
    this.crawlReport = report;
  }

  get states() { return this.#states; }

  /** Atomically publish current metadata, including a valid zero-state CSS-only bundle. */
  write() {
    const manifest = this.#buildManifest(this.#states);
    this.#store.commit({ manifest, artifacts: [] });
    this.#manifest = manifest;
    return path.join(this.outDir, 'spec.json');
  }

  #buildState(id, state, frame, images, cssStates) {
    const paperHtml = frame.paperHtml ?? '';
    const artifacts = [];
    const descriptors = [];
    const addArtifact = (kind, relativePath, data, artifactId) => {
      const descriptor = describeArtifact({ id: artifactId, kind, path: relativePath, data });
      artifacts.push({ ...descriptor, data });
      descriptors.push(descriptor);
      return descriptor;
    };

    const framePath = path.posix.join('frames', `${id}.html`);
    addArtifact('frame', framePath, paperHtml, `${id}:frame`);

    let jsxPath;
    if (frame.jsx !== undefined && frame.jsx !== null) {
      jsxPath = path.posix.join('jsx', `${id}.jsx`);
      addArtifact('jsx', jsxPath, frame.jsx, `${id}:jsx`);
    }

    const shotPaths = {};
    const normalizedImages = {};
    for (const kind of Object.keys(images).sort()) {
      const buffer = images[kind];
      if (!buffer) continue;
      const suffix = kind === 'surface' ? '' : `@${kind}`;
      const relativePath = path.posix.join('shots', `${id}${suffix}.png`);
      addArtifact('shot', relativePath, buffer, `${id}:shot:${kind}`);
      shotPaths[kind] = relativePath;
      normalizedImages[kind] = buffer;
    }
    if (!shotPaths.surface) throw new Error(`State ${id} requires a surface shot`);

    const surfaceDimensions = readPngDimensions(normalizedImages.surface);
    const rect = normalizeRect(state.rect, surfaceDimensions);

    let statesPath;
    if (cssStates !== undefined && cssStates !== null) {
      statesPath = path.posix.join('states', `${id}.json`);
      addArtifact('state-matrix', statesPath, prettyCanonicalJson(cssStates), `${id}:states`);
    }

    let contractPath;
    let checklistPath;
    let contract;
    let checklist;
    const contractState = { id, ...state, rect };
    contract = animationContract(contractState);
    if (contract) {
      contractPath = path.posix.join('contracts', `${id}.md`);
      addArtifact('contract', contractPath, contract, `${id}:contract`);
      checklist = animationChecklist(contractState);
      if (checklist) {
        checklistPath = path.posix.join('contracts', `${id}.checklist.json`);
        addArtifact('contract-checklist', checklistPath, prettyCanonicalJson(checklist), `${id}:checklist`);
      }
    }

    const provenance = {
      ...this.#manifest.provenance,
      ...(state.provenance ?? {}),
    };
    const stateForHash = { ...state, rect };
    const hashes = computeLayeredHashes({
      state: stateForHash,
      frame: { paperHtml, jsx: frame.jsx },
      shots: normalizedImages,
      cssStates,
      contract,
      checklist,
      provenance,
    });

    const record = {
      id,
      ...state,
      rect,
      frame: framePath,
      jsx: jsxPath,
      shot: shotPaths.surface,
      shots: shotPaths,
      states: statesPath,
      contract: contractPath,
      checklist: checklistPath,
      bytes: String(paperHtml).length,
      hashes,
      artifacts: descriptors,
      provenance,
    };
    return { record, artifacts };
  }

  #hydrateState(input, rootProvenance) {
    const state = { ...input };
    const existingIds = new Set();
    const existingPaths = new Set();
    for (const artifact of state.artifacts ?? []) {
      if (existingIds.has(artifact.id)) throw new Error(`Duplicate artifact id while resuming state ${state.id}: ${artifact.id}`);
      if (existingPaths.has(artifact.path)) throw new Error(`Duplicate artifact path while resuming state ${state.id}: ${artifact.path}`);
      existingIds.add(artifact.id);
      existingPaths.add(artifact.path);
    }
    const existingByPath = new Map((state.artifacts ?? []).map((artifact) => [artifact.path, artifact]));
    const descriptors = [];
    const artifactPaths = new Set();
    const addExisting = (kind, relativePath, fallbackId) => {
      if (!relativePath || artifactPaths.has(relativePath)) return undefined;
      const bytes = readBundleArtifact(this.outDir, relativePath);
      const existingDescriptor = existingByPath.get(relativePath);
      const descriptor = describeArtifact({
        id: existingDescriptor?.id ?? fallbackId,
        kind: existingDescriptor?.kind ?? kind,
        path: relativePath,
        data: bytes,
      });
      if (existingDescriptor && !descriptorsEqual(existingDescriptor, descriptor)) {
        throw new Error(`Artifact hash mismatch while resuming ${relativePath}`);
      }
      descriptors.push(descriptor);
      artifactPaths.add(relativePath);
      return bytes;
    };

    if (!state.frame) throw new Error(`State ${state.id} is missing its frame reference`);
    const frameBytes = addExisting('frame', state.frame, `${state.id}:frame`);
    const jsxBytes = addExisting('jsx', state.jsx, `${state.id}:jsx`);

    const shotPaths = { ...(state.shots ?? {}) };
    if (state.shot && !shotPaths.surface) shotPaths.surface = state.shot;
    if (shotPaths.surface && !state.shot) state.shot = shotPaths.surface;
    if (!shotPaths.surface) throw new Error(`State ${state.id} requires a surface shot`);
    const shotBytes = {};
    for (const kind of Object.keys(shotPaths).sort()) {
      shotBytes[kind] = addExisting('shot', shotPaths[kind], `${state.id}:shot:${kind}`);
    }
    state.shots = shotPaths;

    const cssBytes = addExisting('state-matrix', state.states, `${state.id}:states`);
    const contractBytes = addExisting('contract', state.contract, `${state.id}:contract`);
    if (!state.checklist && state.contract?.endsWith('.md')) {
      const inferred = state.contract.replace(/\.md$/, '.checklist.json');
      if (bundleArtifactExists(this.outDir, inferred)) state.checklist = inferred;
    }
    const checklistBytes = addExisting('contract-checklist', state.checklist, `${state.id}:checklist`);

    // Preserve additional future artifact kinds while still verifying their bytes.
    for (const artifact of state.artifacts ?? []) addExisting(artifact.kind, artifact.path, artifact.id);

    const surfaceDimensions = readPngDimensions(shotBytes.surface);
    state.rect = normalizeRect(state.rect, surfaceDimensions);
    const provenance = { ...rootProvenance, ...(state.provenance ?? {}) };
    const cssStates = cssBytes ? JSON.parse(cssBytes.toString('utf8')) : undefined;
    const checklist = checklistBytes ? JSON.parse(checklistBytes.toString('utf8')) : undefined;
    const computedHashes = computeLayeredHashes({
      state,
      frame: { paperHtml: frameBytes.toString('utf8'), jsx: jsxBytes?.toString('utf8') },
      shots: shotBytes,
      cssStates,
      contract: contractBytes?.toString('utf8'),
      checklist,
      provenance,
    });
    if (state.hashes && !hashSetsEqual(state.hashes, computedHashes)) {
      throw new Error(`Layered hash mismatch while resuming state ${state.id}`);
    }

    return {
      ...state,
      hashes: computedHashes,
      artifacts: descriptors,
      provenance,
    };
  }

  #buildManifest(states) {
    const revision = incrementManifestRevision(this.#manifest);
    const artifacts = states.flatMap((state) => state.artifacts ?? []);
    const candidate = {
      ...this.#manifest,
      ...this.meta,
      schemaVersion: 2,
      manifestRevision: revision,
      capturedAt: this.#now(),
      stateCount: states.length,
      states,
      crawlReport: this.crawlReport,
      cssSpec: this.cssSpec,
      artifacts,
      provenance: this.#manifest.provenance,
    };
    candidate.hashes = computeManifestHashes(candidate);
    return normalizeManifest(candidate);
  }
}

const slug = (value) => String(value ?? 'state').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'state';

function nextSequence(states) {
  let maximum = 0;
  for (const state of states) {
    const match = /^(\d+)-/.exec(state.id ?? '');
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum + 1;
}

function normalizeRect(rect, fallback) {
  const width = rect?.width ?? rect?.w ?? fallback.width;
  const height = rect?.height ?? rect?.h ?? fallback.height;
  const normalized = {
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
    width,
    height,
  };
  for (const coordinate of ['x', 'y']) {
    if (!Number.isFinite(normalized[coordinate])) throw new TypeError(`rect.${coordinate} must be finite`);
  }
  for (const dimension of ['width', 'height']) {
    if (!Number.isFinite(normalized[dimension]) || normalized[dimension] <= 0) {
      throw new TypeError(`rect must have a positive finite ${dimension}`);
    }
  }
  return normalized;
}

function prettyCanonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function bundleArtifactPath(bundleDir, relativePath) {
  assertSafeRelativePath(relativePath);
  const root = path.resolve(bundleDir);
  const absolute = path.resolve(root, ...relativePath.split('/'));
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`Artifact path escapes bundle: ${relativePath}`);
  let current = root;
  const segments = relativePath.split('/');
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Artifact path contains a symbolic link: ${relativePath}`);
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(`Artifact path has a non-directory parent: ${relativePath}`);
    }
  }
  return absolute;
}

function bundleArtifactExists(bundleDir, relativePath) {
  const absolute = bundleArtifactPath(bundleDir, relativePath);
  if (!existsSync(absolute)) return false;
  const stat = lstatSync(absolute);
  return stat.isFile() && !stat.isSymbolicLink();
}

function readBundleArtifact(bundleDir, relativePath) {
  const absolute = bundleArtifactPath(bundleDir, relativePath);
  if (!existsSync(absolute)) throw new Error(`Referenced artifact is missing: ${relativePath}`);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Referenced artifact is unsafe: ${relativePath}`);
  return readFileSync(absolute);
}

function descriptorsEqual(expected, actual) {
  return expected.id === actual.id
    && expected.kind === actual.kind
    && expected.path === actual.path
    && expected.bytes === actual.bytes
    && expected.sha256 === actual.sha256
    && (expected.width ?? null) === (actual.width ?? null)
    && (expected.height ?? null) === (actual.height ?? null);
}

function hashSetsEqual(left, right) {
  return HASH_LAYERS.every((layer) => left[layer] === right[layer]);
}

function validateExistingManifestIndexes(manifest, states) {
  const descriptors = states.flatMap((state) => state.artifacts ?? []);
  if (manifest.artifacts !== undefined) {
    if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== descriptors.length) {
      throw new Error('Manifest artifact index does not match state artifacts');
    }
    const actualById = new Map(descriptors.map((artifact) => [artifact.id, artifact]));
    for (const artifact of manifest.artifacts) {
      const actual = actualById.get(artifact.id);
      if (!actual || !descriptorsEqual(artifact, actual)) throw new Error(`Manifest artifact index mismatch for ${artifact.id}`);
    }
  }
  if (manifest.hashes !== undefined) {
    const expected = computeManifestHashes({ ...manifest, states });
    if (!hashSetsEqual(manifest.hashes, expected)) throw new Error('Manifest layered hash mismatch');
  }
}

function assertUniqueArtifacts(states) {
  const ids = new Set();
  const paths = new Set();
  for (const state of states) {
    for (const artifact of state.artifacts ?? []) {
      if (ids.has(artifact.id)) throw new Error(`Duplicate artifact id while resuming bundle: ${artifact.id}`);
      if (paths.has(artifact.path)) throw new Error(`Duplicate artifact path while resuming bundle: ${artifact.path}`);
      ids.add(artifact.id);
      paths.add(artifact.path);
    }
  }
}

/**
 * Put a captured frame on the macOS clipboard in Paper's paste format.
 */
export function copyFrameToPaper(bundleDir, stateId) {
  // Every other manifest read goes through the same guard; this one did not, and
  // it is the path that ends in `osascript` writing to the system clipboard.
  const manifestPath = path.join(bundleDir, 'spec.json');
  const manifestStat = lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error(`Unsafe manifest path: ${manifestPath}`);
  }
  const spec = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const needle = String(stateId);
  const state = spec.states.find((candidate) => candidate.id === needle)
    ?? spec.states.find((candidate) => candidate.id.startsWith(needle))
    ?? spec.states.find((candidate) => candidate.id.endsWith(needle))
    ?? spec.states.find((candidate) => candidate.id.includes(needle));

  if (!state) {
    throw new Error(`No state matching "${needle}". Available:\n${spec.states.map((s) => `  ${s.id}`).join('\n')}`);
  }

  const framePath = bundleArtifactPath(bundleDir, state.frame);
  if (!existsSync(framePath)) throw new Error(`Frame file missing: ${framePath}`);

  const html = `<x-paper-html>${readFileSync(framePath, 'utf8')}</x-paper-html>`;
  const hex = Buffer.from(html, 'utf8').toString('hex').toUpperCase();
  execFileSync('osascript', ['-e', `set the clipboard to «data HTML${hex}»`]);
  return state;
}
