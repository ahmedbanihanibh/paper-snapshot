import { constants, realpathSync } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const OWNER_FILE = 'owner.json';
const LEASE_FORMAT = 1;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
const VALID_KINDS = new Set(['bundle', 'cdp-target']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function makeLeaseKey(kind, resource) {
  if (!VALID_KINDS.has(kind)) throw new TypeError(`Unsupported lease kind: ${kind}`);
  assertString(resource, 'Lease resource');
  return Object.freeze({ kind, resource, hash: sha256(`${kind}\0${resource}`) });
}

function canonicalFilesystemPath(value, cwd) {
  const absolute = path.resolve(cwd, value);
  let cursor = absolute;
  const missingSegments = [];
  while (true) {
    try {
      return path.join(realpathSync.native(cursor), ...missingSegments);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) return absolute;
      missingSegments.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

/** Canonical identity for one output bundle. Raw paths never become filenames. */
export function bundleLeaseKey(bundlePath, { cwd = process.cwd() } = {}) {
  assertString(bundlePath, 'Bundle path');
  return makeLeaseKey('bundle', canonicalFilesystemPath(bundlePath, cwd));
}

/** Canonical identity for one CDP target at one endpoint. */
export function cdpTargetLeaseKey(endpoint, targetId) {
  assertString(endpoint, 'CDP endpoint');
  assertString(targetId, 'CDP target id');
  let normalizedEndpoint;
  try {
    const url = new URL(endpoint);
    url.hash = '';
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    normalizedEndpoint = url.toString();
  } catch {
    normalizedEndpoint = endpoint.trim().replace(/\/+$/, '');
  }
  return makeLeaseKey('cdp-target', JSON.stringify([normalizedEndpoint, targetId]));
}

function normalizeLeaseKey(key) {
  if (!key || typeof key !== 'object') throw new TypeError('Lease key must be created by bundleLeaseKey or cdpTargetLeaseKey.');
  return makeLeaseKey(key.kind, key.resource);
}

/** A basename containing only a kind label and a SHA-256 digest. */
export function leaseDirectoryName(key) {
  const normalized = normalizeLeaseKey(key);
  return `${normalized.kind}-${normalized.hash}`;
}

export class LeaseConflictError extends Error {
  constructor(key, owner = null, reason = 'resource is already leased') {
    super(`Cannot acquire ${key.kind} lease: ${reason}.`);
    this.name = 'LeaseConflictError';
    this.code = 'ERR_LEASE_CONFLICT';
    this.kind = key.kind;
    this.keyHash = key.hash;
    this.owner = owner;
  }
}

function defaultProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    // EPERM proves that a process exists even though it cannot be signalled.
    if (error?.code === 'EPERM') return true;
    return null;
  }
}

function ownerIsValid(owner, key) {
  return owner
    && owner.format === LEASE_FORMAT
    && owner.kind === key.kind
    && owner.keyHash === key.hash
    && typeof owner.ownerToken === 'string'
    && owner.ownerToken.length > 0
    && Number.isSafeInteger(owner.pid)
    && owner.pid > 0
    && typeof owner.hostname === 'string'
    && owner.hostname.length > 0
    && typeof owner.createdAt === 'string'
    && typeof owner.heartbeatAt === 'string';
}

async function readOwner(directory, key) {
  const ownerPath = path.join(directory, OWNER_FILE);
  let handle;
  try {
    handle = await open(ownerPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile()) return null;
    const parsed = JSON.parse(await handle.readFile('utf8'));
    return ownerIsValid(parsed, key) ? parsed : null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function timestamp(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Lease clock returned an invalid time.');
  return date.toISOString();
}

class FileLease {
  #manager;
  #timer = null;
  #released = false;

  constructor(manager, { key, leasePath, owner, heartbeatIntervalMs }) {
    this.#manager = manager;
    this.key = key;
    this.kind = key.kind;
    this.keyHash = key.hash;
    this.path = leasePath;
    this.ownerToken = owner.ownerToken;
    this.owner = Object.freeze({ ...owner });

    if (heartbeatIntervalMs > 0) {
      this.#timer = setInterval(() => {
        this.heartbeat().catch(() => {});
      }, heartbeatIntervalMs);
      this.#timer.unref?.();
    }
  }

  get released() {
    return this.#released;
  }

  async heartbeat() {
    if (this.#released) return false;
    return this.#manager.heartbeat(this);
  }

  async release() {
    if (this.#released) return false;
    const released = await this.#manager.release(this);
    if (released) {
      this.#released = true;
      if (this.#timer) clearInterval(this.#timer);
      this.#timer = null;
    }
    return released;
  }

  _markReleased() {
    this.#released = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}

/**
 * Cross-process leases backed by atomic directory creation.
 *
 * Recovery is intentionally narrow: only a well-formed lease owned by a PID
 * proven dead on this same host can be reaped. Heartbeat age alone is never a
 * reason to steal a lease, and unknown/remote/malformed owners remain conflicts.
 */
export class FileLeaseManager {
  #rootPromise = null;
  #active = new Set();

  constructor({
    rootDir = path.join(os.tmpdir(), 'spec-crawler-leases'),
    pid = process.pid,
    hostname = os.hostname(),
    now = () => new Date(),
    randomUUID = nodeRandomUUID,
    processAlive = defaultProcessAlive,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  } = {}) {
    this.rootDir = path.resolve(assertString(rootDir, 'Lease root directory'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError('Lease owner pid must be a positive safe integer.');
    this.pid = pid;
    this.hostname = assertString(hostname, 'Lease hostname');
    this.now = now;
    this.randomUUID = randomUUID;
    this.processAlive = processAlive;
    if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs < 0) {
      throw new TypeError('heartbeatIntervalMs must be a non-negative number.');
    }
    this.heartbeatIntervalMs = heartbeatIntervalMs;
  }

  get activeCount() {
    return this.#active.size;
  }

  acquireBundle(bundlePath, options) {
    return this.acquire(bundleLeaseKey(bundlePath, options), options);
  }

  acquireCdpTarget(endpoint, targetId, options) {
    return this.acquire(cdpTargetLeaseKey(endpoint, targetId), options);
  }

  async acquire(inputKey, { metadata = null, heartbeatIntervalMs = this.heartbeatIntervalMs } = {}) {
    const key = normalizeLeaseKey(inputKey);
    const root = await this.#root();
    const leasePath = path.join(root, leaseDirectoryName(key));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await mkdir(leasePath, { mode: 0o700 });
        return await this.#initializeLease(key, leasePath, metadata, heartbeatIntervalMs);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }

      const recovered = await this.#recoverIfDead(key, leasePath, root);
      if (!recovered) {
        const owner = await readOwner(leasePath, key);
        throw new LeaseConflictError(key, owner, owner ? 'resource is already leased' : 'existing lease cannot be safely inspected');
      }
    }
    throw new LeaseConflictError(key, await readOwner(leasePath, key), 'lease changed repeatedly during recovery');
  }

  async #initializeLease(key, leasePath, extraMetadata, heartbeatIntervalMs) {
    const now = timestamp(this.now);
    const owner = {
      format: LEASE_FORMAT,
      kind: key.kind,
      keyHash: key.hash,
      ownerToken: assertString(this.randomUUID(), 'Lease owner token'),
      pid: this.pid,
      hostname: this.hostname,
      createdAt: now,
      heartbeatAt: now,
      ...(extraMetadata && typeof extraMetadata === 'object' ? { metadata: extraMetadata } : {}),
    };

    try {
      await this.#writeNewOwner(leasePath, owner);
    } catch (error) {
      await rm(leasePath, { recursive: true, force: true }).catch(() => {});
      throw error;
    }

    const lease = new FileLease(this, { key, leasePath, owner, heartbeatIntervalMs });
    this.#active.add(lease);
    return lease;
  }

  async #writeNewOwner(leasePath, owner) {
    const ownerPath = path.join(leasePath, OWNER_FILE);
    const handle = await open(ownerPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async #root() {
    this.#rootPromise ??= (async () => {
      await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
      const info = await lstat(this.rootDir);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('Lease root must be a real directory, not a symbolic link.');
      }
      return realpath(this.rootDir);
    })();
    return this.#rootPromise;
  }

  async #recoverIfDead(key, leasePath, root) {
    let info;
    try {
      info = await lstat(leasePath);
    } catch (error) {
      if (error?.code === 'ENOENT') return true;
      return false;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) return false;

    const observed = await readOwner(leasePath, key);
    if (!observed || observed.hostname !== this.hostname) return false;
    const alive = await this.processAlive(observed.pid);
    if (alive !== false) return false;

    const quarantine = path.join(root, `.reap-${key.hash}-${sha256(this.randomUUID()).slice(0, 16)}`);
    try {
      await rename(leasePath, quarantine);
    } catch (error) {
      return error?.code === 'ENOENT';
    }

    const movedOwner = await readOwner(quarantine, key);
    const stillDead = movedOwner?.ownerToken === observed.ownerToken
      && await this.processAlive(observed.pid) === false;
    if (!stillDead) {
      await rename(quarantine, leasePath).catch(() => {});
      return false;
    }
    await rm(quarantine, { recursive: true, force: true });
    return true;
  }

  async heartbeat(lease) {
    if (!this.#active.has(lease)) return false;
    const ownerPath = path.join(lease.path, OWNER_FILE);
    let handle;
    try {
      handle = await open(ownerPath, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
      const info = await handle.stat();
      if (!info.isFile()) return false;
      const current = JSON.parse(await handle.readFile('utf8'));
      if (!ownerIsValid(current, lease.key) || current.ownerToken !== lease.ownerToken) return false;
      current.heartbeatAt = timestamp(this.now);
      const content = `${JSON.stringify(current)}\n`;
      await handle.truncate(0);
      await handle.write(content, 0, 'utf8');
      await handle.sync();
      return true;
    } catch {
      return false;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async release(lease) {
    if (!this.#active.has(lease)) return false;
    const key = normalizeLeaseKey(lease.key);
    const observed = await readOwner(lease.path, key);
    if (observed?.ownerToken !== lease.ownerToken) return false;

    const root = await this.#root();
    const quarantine = path.join(root, `.release-${key.hash}-${sha256(this.randomUUID()).slice(0, 16)}`);
    try {
      await rename(lease.path, quarantine);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.#active.delete(lease);
        lease._markReleased();
      }
      return false;
    }

    const movedOwner = await readOwner(quarantine, key);
    if (movedOwner?.ownerToken !== lease.ownerToken) {
      await rename(quarantine, lease.path).catch(() => {});
      return false;
    }

    await rm(quarantine, { recursive: true, force: true });
    this.#active.delete(lease);
    lease._markReleased();
    return true;
  }

  async releaseAll() {
    const results = await Promise.allSettled([...this.#active].map((lease) => lease.release()));
    return results.every((result) => result.status === 'fulfilled' && result.value === true);
  }

  close() {
    return this.releaseAll();
  }
}

export { FileLease };
