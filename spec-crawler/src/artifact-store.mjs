import * as nodeFs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { computeLayeredHashes, computeManifestHashes, hashCanonical, sha256 } from './hashes.mjs';
import { normalizeManifest, serializeManifest, validateManifest } from './manifest.mjs';

const STAGING_PREFIX = '.artifact-stage-';
const STAGING_NAME_PATTERN = /^\.artifact-stage-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const COMMIT_LOCK_NAME = '.artifact-commit-lock';
const OWNED_DIRECTORIES = ['frames', 'shots', 'jsx', 'states', 'debug', 'contracts'];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const LAYER_NAMES = ['topology', 'state', 'layout', 'visual', 'content', 'environment', 'artifact'];

function bytesOf(data, encoding = 'utf8') {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data, encoding);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('Artifact data must be a string, Buffer, or typed array');
}

export function assertSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('Artifact path must be a safe relative path');
  if (value.includes('\0') || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new TypeError(`Artifact path must be a safe relative path: ${value}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new TypeError(`Artifact path must be a safe relative path: ${value}`);
  }
  const first = value.split('/')[0];
  if (value === 'spec.json' || first.startsWith(STAGING_PREFIX)) {
    throw new TypeError(`Artifact path is reserved and not a safe relative path: ${value}`);
  }
  return value;
}

export function readPngDimensions(data) {
  const bytes = bytesOf(data);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new TypeError('PNG artifact has an invalid PNG signature');
  }
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new TypeError('PNG artifact is missing a valid IHDR header');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) throw new TypeError('PNG intrinsic dimensions must be positive');
  return { width, height };
}

export function describeArtifact({ id, kind, path: relativePath, data, encoding = 'utf8' }) {
  if (typeof id !== 'string' || id.length === 0) throw new TypeError('Artifact id must be a non-empty string');
  assertSafeRelativePath(relativePath);
  const bytes = bytesOf(data, encoding);
  const descriptor = {
    id,
    kind: kind ?? 'artifact',
    path: relativePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };

  if (relativePath.endsWith('.html') || kind === 'frame') {
    if (bytes.toString('utf8').trim().length === 0) throw new TypeError(`Artifact ${id} must contain non-empty HTML`);
  }
  if (relativePath.endsWith('.png') || kind === 'shot') Object.assign(descriptor, readPngDimensions(bytes));
  if (relativePath.endsWith('.json')) {
    try { JSON.parse(bytes.toString('utf8')); } catch (cause) {
      throw new TypeError(`Artifact ${id} contains invalid JSON: ${cause.message}`, { cause });
    }
  }
  return descriptor;
}

function assertRect(rect, stateId) {
  if (!rect || typeof rect !== 'object') throw new TypeError(`State ${stateId} requires a positive finite rect`);
  for (const coordinate of ['x', 'y']) {
    if (!Number.isFinite(rect[coordinate])) throw new TypeError(`State ${stateId} rect.${coordinate} must be finite`);
  }
  for (const dimension of ['width', 'height']) {
    if (!Number.isFinite(rect[dimension]) || rect[dimension] <= 0) {
      throw new TypeError(`State ${stateId} rect must have a positive finite ${dimension}`);
    }
  }
}

function expectedArtifactKind(field) {
  if (field === 'frame') return 'frame';
  if (field === 'jsx') return 'jsx';
  if (field === 'states') return 'state-matrix';
  if (field === 'contract') return 'contract';
  if (field === 'checklist') return 'contract-checklist';
  if (field === 'shot' || field.startsWith('shots.')) return 'shot';
  return undefined;
}

function referencedPaths(state) {
  const references = [];
  for (const field of ['frame', 'jsx', 'shot', 'states', 'contract', 'checklist']) {
    if (state[field] !== undefined && state[field] !== null) references.push([field, state[field]]);
  }
  for (const [kind, value] of Object.entries(state.shots ?? {})) {
    if (value !== undefined && value !== null) references.push([`shots.${kind}`, value]);
  }
  return references;
}

function sameDescriptor(expected, actual) {
  return expected.id === actual.id
    && expected.kind === actual.kind
    && expected.path === actual.path
    && expected.bytes === actual.bytes
    && expected.sha256 === actual.sha256
    && (expected.width ?? null) === (actual.width ?? null)
    && (expected.height ?? null) === (actual.height ?? null);
}

function validateLayeredHashes(hashes, stateId) {
  if (!hashes || typeof hashes !== 'object') throw new TypeError(`State ${stateId} is missing layered hashes`);
  for (const layer of LAYER_NAMES) {
    if (!SHA256_PATTERN.test(hashes[layer] ?? '')) throw new TypeError(`State ${stateId} has an invalid ${layer} hash`);
  }
  const expectedArtifact = hashCanonical({
    topology: hashes.topology,
    state: hashes.state,
    layout: hashes.layout,
    visual: hashes.visual,
    content: hashes.content,
    environment: hashes.environment,
  });
  if (hashes.artifact !== expectedArtifact) throw new TypeError(`State ${stateId} artifact hash mismatch`);
}

function flattenManifestArtifacts(manifest) {
  return manifest.states.flatMap((state) => state.artifacts ?? []);
}

function parseJsonArtifact(bytes, relativePath) {
  if (!bytes) throw new Error(`Referenced JSON artifact is missing: ${relativePath}`);
  try { return JSON.parse(bytes.toString('utf8')); } catch (cause) {
    throw new TypeError(`Referenced JSON artifact is invalid: ${relativePath}`, { cause });
  }
}

function collectManifestReferences(manifest) {
  const result = new Set();
  for (const state of manifest.states) {
    for (const [, relativePath] of referencedPaths(state)) {
      if (typeof relativePath === 'string') result.add(relativePath);
    }
  }
  return result;
}

export class ArtifactStore {
  constructor(outDir, { fs = {}, seams = {} } = {}) {
    this.outDir = path.resolve(outDir);
    this.fs = { ...nodeFs, ...fs };
    this.seams = seams;
    this.abandonedStaging = [];
    this.cleanupWarnings = [];
    this.fs.mkdirSync(this.outDir, { recursive: true });
    this.#assertDirectory(this.outDir);
    if (this.#entryExists(this.manifestPath)) this.loadManifest();
    this.#recoverAbandonedTransactions();
  }

  get manifestPath() { return path.join(this.outDir, 'spec.json'); }

  loadManifest() {
    if (!this.#entryExists(this.manifestPath)) return null;
    const stat = this.fs.lstatSync(this.manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe manifest path: ${this.manifestPath}`);
    return readManifestWith(this.fs, this.manifestPath);
  }

  clear() {
    // Reading first is intentional: malformed manifests are evidence, not an
    // invitation to reinterpret the directory as empty and erase it.
    if (this.#entryExists(this.manifestPath)) this.loadManifest();
    for (const directory of OWNED_DIRECTORIES) this.fs.rmSync(path.join(this.outDir, directory), { recursive: true, force: true });
    this.fs.rmSync(this.manifestPath, { force: true });
  }

  commit(transaction, maybeArtifacts) {
    return this.#withCommitLock(() => {
      this.#recoverAbandonedTransactions();
      return this.#commitUnlocked(transaction, maybeArtifacts);
    });
  }

  #commitUnlocked(transaction, maybeArtifacts) {
    const manifest = transaction?.manifest ?? transaction;
    const artifacts = transaction?.manifest ? (transaction.artifacts ?? []) : (maybeArtifacts ?? []);
    validateManifest(manifest);

    const current = this.loadManifest();
    if (current && manifest.manifestRevision !== current.manifestRevision + 1) {
      throw new Error(`Manifest revision conflict: current is ${current.manifestRevision}, attempted ${manifest.manifestRevision}`);
    }

    const prepared = artifacts.map((artifact) => {
      const data = bytesOf(artifact.data, artifact.encoding);
      const descriptor = describeArtifact({ ...artifact, data });
      if (artifact.sha256 !== undefined && artifact.sha256 !== descriptor.sha256) {
        throw new TypeError(`Artifact ${artifact.id} hash mismatch`);
      }
      if (artifact.bytes !== undefined && artifact.bytes !== descriptor.bytes) {
        throw new TypeError(`Artifact ${artifact.id} byte length mismatch`);
      }
      if (artifact.width !== undefined && artifact.width !== descriptor.width) {
        throw new TypeError(`Artifact ${artifact.id} intrinsic width mismatch`);
      }
      if (artifact.height !== undefined && artifact.height !== descriptor.height) {
        throw new TypeError(`Artifact ${artifact.id} intrinsic height mismatch`);
      }
      return { descriptor, data };
    });

    this.#validateTransaction(manifest, prepared);

    const transactionId = randomUUID();
    const stageName = `${STAGING_PREFIX}${transactionId}`;
    const stageDir = path.join(this.outDir, stageName);
    this.fs.mkdirSync(stageDir, { recursive: false });
    try {
      for (const { descriptor, data } of prepared) {
        const stagedPath = path.join(stageDir, ...descriptor.path.split('/'));
        this.#ensureParentDirectory(stagedPath, stageDir);
        this.#writeDurably(stagedPath, data);
      }
      const stagedManifest = path.join(stageDir, 'spec.json');
      this.#writeDurably(stagedManifest, serializeManifest(manifest));

      // Preflight every destination before exposing any artifact. The journal
      // records ownership so rollback never deletes a matching pre-existing file.
      const plans = [];
      for (const { descriptor, data } of prepared) {
        const destination = this.#resolveArtifactPath(descriptor.path);
        this.#ensureParentDirectory(destination, this.outDir);
        const existed = this.#entryExists(destination);
        if (existed) {
          const stat = this.fs.lstatSync(destination);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe artifact destination: ${descriptor.path}`);
          if (!this.fs.readFileSync(destination).equals(data)) throw new Error(`Artifact destination collision: ${descriptor.path}`);
        }
        plans.push({ descriptor, destination, existed });
      }
      const journal = {
        transactionId,
        targetRevision: manifest.manifestRevision,
        artifacts: plans.map(({ descriptor, existed }) => ({
          path: descriptor.path,
          sha256: descriptor.sha256,
          created: !existed,
        })),
      };
      this.#writeDurably(path.join(stageDir, 'transaction.json'), `${JSON.stringify(journal, null, 2)}\n`);
      this.#syncDirectory(stageDir);

      const renamedParents = new Set();
      for (const [index, { descriptor, destination, existed }] of plans.entries()) {
        const stagedPath = path.join(stageDir, ...descriptor.path.split('/'));
        if (existed) {
          this.fs.rmSync(stagedPath, { force: true });
          continue;
        }
        this.seams.beforeArtifactRename?.({ from: stagedPath, to: destination, artifact: descriptor, index });
        this.fs.renameSync(stagedPath, destination);
        renamedParents.add(path.dirname(destination));
      }
      for (const parent of renamedParents) this.#syncDirectory(parent);

      const latest = this.loadManifest();
      if ((latest?.manifestRevision ?? null) !== (current?.manifestRevision ?? null)) {
        throw new Error(`Manifest revision changed during transaction; expected ${current?.manifestRevision ?? 'none'}, found ${latest?.manifestRevision ?? 'none'}`);
      }
      this.seams.beforeManifestRename?.({ from: stagedManifest, to: this.manifestPath, manifest });
      this.fs.renameSync(stagedManifest, this.manifestPath);
      this.#syncDirectory(this.outDir);

      // The rename above is the commit point: the manifest is durable and the
      // state IS written. Everything after it is housekeeping, and housekeeping
      // must never be able to report the commit as failed — a caller that sees a
      // throw here retries a capture that already landed, minting a second id for
      // one state. Faults are recorded, not raised.
      const cleanupFaults = [];
      try {
        this.seams.afterManifestRename?.({ path: this.manifestPath, manifest });
      } catch (error) {
        cleanupFaults.push({ step: 'afterManifestRename', message: String(error?.message ?? error) });
      }
      try {
        this.fs.rmSync(stageDir, { recursive: true, force: true });
      } catch (error) {
        cleanupFaults.push({ step: 'removeStagingDirectory', path: stageDir, message: String(error?.message ?? error) });
      }
      this.lastCommitFaults = cleanupFaults;
      return this.manifestPath;
    } catch (error) {
      // Leave the transaction journal in place. The next store instance can
      // distinguish an unpublished transaction from a committed one and recover.
      throw error;
    }
  }

  writeManifest(manifest) {
    return this.commit({ manifest, artifacts: [] });
  }

  #validateTransaction(manifest, prepared) {
    const stagedByPath = new Map();
    for (const entry of prepared) {
      if (stagedByPath.has(entry.descriptor.path)) throw new TypeError(`Duplicate artifact path: ${entry.descriptor.path}`);
      stagedByPath.set(entry.descriptor.path, entry);
    }

    const artifactIds = new Set();
    const artifactPaths = new Set();
    const bytesByPath = new Map();
    const descriptors = flattenManifestArtifacts(manifest);
    for (const descriptor of descriptors) {
      if (!descriptor || typeof descriptor !== 'object') throw new TypeError('Artifact descriptor must be an object');
      if (artifactIds.has(descriptor.id)) throw new TypeError(`Duplicate artifact id: ${descriptor.id}`);
      artifactIds.add(descriptor.id);
      assertSafeRelativePath(descriptor.path);
      if (artifactPaths.has(descriptor.path)) throw new TypeError(`Duplicate artifact path: ${descriptor.path}`);
      artifactPaths.add(descriptor.path);
      if (!SHA256_PATTERN.test(descriptor.sha256 ?? '')) throw new TypeError(`Artifact ${descriptor.id} has an invalid hash`);

      const staged = stagedByPath.get(descriptor.path);
      let actual;
      let bytes;
      if (staged) {
        actual = staged.descriptor;
        bytes = staged.data;
      } else {
        const absolute = this.#resolveArtifactPath(descriptor.path);
        if (!this.fs.existsSync(absolute)) throw new Error(`Referenced artifact is missing: ${descriptor.path}`);
        const stat = this.fs.lstatSync(absolute);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Referenced artifact is unsafe: ${descriptor.path}`);
        bytes = this.fs.readFileSync(absolute);
        actual = describeArtifact({ id: descriptor.id, kind: descriptor.kind, path: descriptor.path, data: bytes });
      }
      if (!sameDescriptor(descriptor, actual)) throw new TypeError(`Artifact ${descriptor.id} hash mismatch or metadata mismatch`);
      bytesByPath.set(descriptor.path, bytes);
    }

    for (const state of manifest.states) {
      if (!state.frame) throw new Error(`State ${state.id} is missing its frame reference`);
      if (!Array.isArray(state.artifacts) || state.artifacts.length === 0) {
        throw new Error(`State ${state.id} is missing artifact descriptors`);
      }
      assertRect(state.rect, state.id);
      const byPath = new Map(state.artifacts.map((artifact) => [artifact.path, artifact]));
      for (const [field, relativePath] of referencedPaths(state)) {
        assertSafeRelativePath(relativePath);
        const descriptor = byPath.get(relativePath);
        if (!descriptor) throw new Error(`State ${state.id} reference ${field} has no artifact descriptor: ${relativePath}`);
        const expectedKind = expectedArtifactKind(field);
        if (expectedKind && descriptor.kind !== expectedKind) {
          throw new Error(`State ${state.id} reference ${field} must point to a ${expectedKind} artifact`);
        }
      }
      if (state.shotRequired !== false && !state.shots?.surface && !state.shot) {
        throw new Error(`State ${state.id} requires a surface shot`);
      }
      validateLayeredHashes(state.hashes, state.id);
      const frameBytes = state.frame ? bytesByPath.get(state.frame) : undefined;
      const jsxBytes = state.jsx ? bytesByPath.get(state.jsx) : undefined;
      const shots = {};
      for (const [kind, relativePath] of Object.entries(state.shots ?? {})) shots[kind] = bytesByPath.get(relativePath);
      if (state.shot && !shots.surface) shots.surface = bytesByPath.get(state.shot);
      const cssStates = state.states ? parseJsonArtifact(bytesByPath.get(state.states), state.states) : undefined;
      const checklist = state.checklist ? parseJsonArtifact(bytesByPath.get(state.checklist), state.checklist) : undefined;
      const computed = computeLayeredHashes({
        state,
        frame: { paperHtml: frameBytes?.toString('utf8') ?? '', jsx: jsxBytes?.toString('utf8') },
        shots,
        cssStates,
        contract: state.contract ? bytesByPath.get(state.contract)?.toString('utf8') : undefined,
        checklist,
        provenance: state.provenance ?? {},
      });
      for (const layer of LAYER_NAMES) {
        if (state.hashes[layer] !== computed[layer]) throw new TypeError(`State ${state.id} ${layer} hash mismatch`);
      }
    }

    for (const { descriptor } of prepared) {
      if (!artifactPaths.has(descriptor.path)) throw new Error(`Staged artifact is not referenced by the manifest: ${descriptor.path}`);
    }

    if (manifest.artifacts !== undefined) {
      if (!Array.isArray(manifest.artifacts)) throw new TypeError('Manifest artifacts must be an array');
      if (manifest.artifacts.length !== descriptors.length) throw new TypeError('Manifest artifact index does not match state artifacts');
      const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
      const indexedIds = new Set();
      for (const descriptor of manifest.artifacts) {
        if (indexedIds.has(descriptor.id)) throw new TypeError(`Duplicate artifact id in manifest index: ${descriptor.id}`);
        indexedIds.add(descriptor.id);
        const stateDescriptor = byId.get(descriptor.id);
        if (!stateDescriptor || !sameDescriptor(descriptor, stateDescriptor)) {
          throw new TypeError(`Manifest artifact index mismatch for ${descriptor.id ?? '(missing id)'}`);
        }
      }
    }

    if (manifest.hashes !== undefined) {
      const expected = computeManifestHashes(manifest);
      for (const layer of LAYER_NAMES) {
        if (manifest.hashes[layer] !== expected[layer]) throw new TypeError(`Manifest ${layer} hash mismatch`);
      }
    }
  }

  #withCommitLock(operation) {
    const lockPath = path.join(this.outDir, COMMIT_LOCK_NAME);
    const token = randomUUID();
    let fd;
    try {
      fd = this.fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error(`Artifact store commit already in progress: ${this.outDir}`);
      throw error;
    }
    try {
      this.fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, token })}\n`);
      this.fs.fsyncSync(fd);
    } finally {
      this.fs.closeSync(fd);
    }
    this.#syncDirectory(this.outDir);

    try {
      return operation();
    } finally {
      try {
        const stat = this.fs.lstatSync(lockPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe artifact commit lock: ${lockPath}`);
        const owner = JSON.parse(this.fs.readFileSync(lockPath, 'utf8'));
        if (owner.token !== token || owner.pid !== process.pid) throw new Error(`Artifact commit lock ownership changed: ${lockPath}`);
        this.fs.rmSync(lockPath);
        this.#syncDirectory(this.outDir);
      } catch (error) {
        this.cleanupWarnings.push(error);
      }
    }
  }

  #resolveArtifactPath(relativePath) {
    assertSafeRelativePath(relativePath);
    const absolute = path.resolve(this.outDir, ...relativePath.split('/'));
    if (absolute === this.outDir || !absolute.startsWith(`${this.outDir}${path.sep}`)) {
      throw new TypeError(`Artifact path escapes bundle: ${relativePath}`);
    }
    this.#assertSafePathComponents(relativePath);
    return absolute;
  }

  #assertSafePathComponents(relativePath) {
    let current = this.outDir;
    const segments = relativePath.split('/');
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      if (!this.#entryExists(current)) return;
      const stat = this.fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Artifact path contains a symbolic link: ${relativePath}`);
      if (index < segments.length - 1 && !stat.isDirectory()) {
        throw new Error(`Artifact path has a non-directory parent: ${relativePath}`);
      }
    }
  }

  #entryExists(entryPath) {
    try {
      this.fs.lstatSync(entryPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  #ensureParentDirectory(filePath, root) {
    const parent = path.dirname(filePath);
    const relative = path.relative(root, parent);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Directory escapes artifact root: ${parent}`);
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if (this.fs.existsSync(current)) {
        this.#assertDirectory(current);
      } else {
        this.fs.mkdirSync(current);
      }
    }
  }

  #assertDirectory(directory) {
    const stat = this.fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe artifact directory: ${directory}`);
  }

  #writeDurably(filePath, data) {
    this.fs.writeFileSync(filePath, data, { flag: 'wx' });
    const fd = this.fs.openSync(filePath, 'r');
    try { this.fs.fsyncSync(fd); } finally { this.fs.closeSync(fd); }
  }

  #syncDirectory(directory) {
    let fd;
    try {
      fd = this.fs.openSync(directory, 'r');
      this.fs.fsyncSync(fd);
    } catch (error) {
      if (!['EINVAL', 'ENOTSUP', 'EBADF'].includes(error.code)) throw error;
    } finally {
      if (fd !== undefined) this.fs.closeSync(fd);
    }
  }

  #recoverAbandonedTransactions() {
    const entries = this.fs.readdirSync(this.outDir, { withFileTypes: true });
    const stageNames = entries.filter((entry) => STAGING_NAME_PATTERN.test(entry.name)).map((entry) => entry.name).sort();
    if (stageNames.length === 0) return;

    const current = this.#entryExists(this.manifestPath) ? this.loadManifest() : null;
    const referenced = current ? collectManifestReferences(current) : new Set();

    for (const stageName of stageNames) {
      const stageDir = path.join(this.outDir, stageName);
      const stat = this.fs.lstatSync(stageDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe abandoned staging entry: ${stageName}`);
      const journalPath = path.join(stageDir, 'transaction.json');
      if (!this.#entryExists(journalPath)) {
        this.abandonedStaging.push({ name: stageName, status: 'unpublished' });
        this.fs.rmSync(stageDir, { recursive: true, force: true });
        continue;
      }
      const journalStat = this.fs.lstatSync(journalPath);
      if (!journalStat.isFile() || journalStat.isSymbolicLink()) throw new Error(`Unsafe abandoned staging journal: ${journalPath}`);

      let journal;
      try { journal = JSON.parse(this.fs.readFileSync(journalPath, 'utf8')); } catch (cause) {
        throw new Error(`Invalid abandoned staging journal: ${journalPath}`, { cause });
      }
      const expectedTransactionId = STAGING_NAME_PATTERN.exec(stageName)?.[1];
      if (journal.transactionId !== expectedTransactionId
        || !Number.isSafeInteger(journal.targetRevision)
        || journal.targetRevision < 0
        || !Array.isArray(journal.artifacts)) {
        throw new Error(`Invalid abandoned staging journal: ${journalPath}`);
      }

      for (const artifact of journal.artifacts) {
        assertSafeRelativePath(artifact.path);
        if (!SHA256_PATTERN.test(artifact.sha256 ?? '') || typeof artifact.created !== 'boolean') {
          throw new Error(`Invalid abandoned artifact entry in ${journalPath}`);
        }
      }
      const publishedArtifacts = new Map(flattenManifestArtifacts(current ?? { states: [] })
        .map((artifact) => [artifact.path, artifact.sha256]));
      const published = Boolean(current
        && current.manifestRevision >= journal.targetRevision
        && journal.artifacts.every((artifact) => {
          if (publishedArtifacts.get(artifact.path) !== artifact.sha256) return false;
          const destination = this.#resolveArtifactPath(artifact.path);
          return this.#entryExists(destination) && sha256(this.fs.readFileSync(destination)) === artifact.sha256;
        }));
      if (!published) {
        const removedParents = new Set();
        for (const artifact of journal.artifacts) {
          if (!artifact.created || referenced.has(artifact.path)) continue;
          const destination = this.#resolveArtifactPath(artifact.path);
          if (!this.#entryExists(destination)) continue;
          const destinationStat = this.fs.lstatSync(destination);
          if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) throw new Error(`Unsafe abandoned artifact: ${artifact.path}`);
          if (sha256(this.fs.readFileSync(destination)) === artifact.sha256) {
            this.fs.rmSync(destination);
            removedParents.add(path.dirname(destination));
          }
        }
        for (const parent of removedParents) this.#syncDirectory(parent);
      }

      this.abandonedStaging.push({ name: stageName, status: published ? 'published' : 'rolled-back' });
      this.fs.rmSync(stageDir, { recursive: true, force: true });
    }
  }
}

function readManifestWith(fs, filePath) {
  let source;
  try { source = fs.readFileSync(filePath, 'utf8'); } catch (error) {
    error.message = `Unable to read manifest ${filePath}: ${error.message}`;
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(source); } catch (cause) {
    throw new SyntaxError(`Malformed manifest JSON at ${filePath}: ${cause.message}`, { cause });
  }
  try {
    return normalizeManifest(parsed);
  } catch (cause) {
    throw new TypeError(`Invalid manifest at ${filePath}: ${cause.message}`, { cause });
  }
}
