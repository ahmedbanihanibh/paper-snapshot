import { AsyncMutex } from './mutex.mjs';
import {
  FileLeaseManager,
  bundleLeaseKey,
  cdpTargetLeaseKey,
} from './lease.mjs';
import { createRuntimeIdentity } from './runtime-identity.mjs';

export class RuntimeClosedError extends Error {
  constructor(state = 'closed') {
    super(`Crawler runtime is ${state} and cannot accept new work.`);
    this.name = 'RuntimeClosedError';
    this.code = 'ERR_RUNTIME_CLOSED';
    this.state = state;
  }
}

function operationArguments(nameOrOperation, operationOrOptions, maybeOptions) {
  if (typeof nameOrOperation === 'function') {
    return {
      name: nameOrOperation.name || 'anonymous',
      operation: nameOrOperation,
      options: operationOrOptions ?? {},
    };
  }
  if (typeof nameOrOperation !== 'string' || typeof operationOrOptions !== 'function') {
    throw new TypeError('invokeExclusive expects an operation function, optionally preceded by a name.');
  }
  return { name: nameOrOperation, operation: operationOrOptions, options: maybeOptions ?? {} };
}

/**
 * Owns process-local crawler state without knowing anything about MCP handlers.
 * Stateful handlers enter through invokeExclusive; explicit tokens allow helper
 * operations to re-enter that same critical section without deadlocking.
 */
export class CrawlerRuntime {
  #identity;
  #mutex;
  #leaseManager;
  #driver;
  #bundle;
  #explorer;
  #leases = new Set();
  #state = 'open';
  #activeOperation = null;
  #closePromise = null;

  constructor({
    identity = createRuntimeIdentity(),
    mutex = new AsyncMutex(),
    leaseManager = new FileLeaseManager(),
    driver = null,
    bundle = null,
    explorer = null,
  } = {}) {
    this.#identity = identity;
    this.#mutex = mutex;
    this.#leaseManager = leaseManager;
    this.#driver = driver;
    this.#bundle = bundle;
    this.#explorer = explorer;
  }

  get identity() {
    return this.#identity;
  }

  get driver() {
    return this.#driver;
  }

  set driver(value) {
    this.#assertOpen();
    this.#driver = value;
  }

  get bundle() {
    return this.#bundle;
  }

  set bundle(value) {
    this.#assertOpen();
    this.#bundle = value;
  }

  get explorer() {
    return this.#explorer;
  }

  set explorer(value) {
    this.#assertOpen();
    this.#explorer = value;
  }

  get closed() {
    return this.#state === 'closed';
  }

  readStatus() {
    return {
      state: this.#state,
      activeOperation: this.#activeOperation,
      queuedOperations: this.#mutex.pending,
      slots: {
        driver: this.#driver !== null && this.#driver !== undefined,
        bundle: this.#bundle !== null && this.#bundle !== undefined,
        explorer: this.#explorer !== null && this.#explorer !== undefined,
      },
      leases: [...this.#leases].map((lease) => ({
        kind: lease.kind,
        keyHash: lease.keyHash,
        ownerToken: lease.ownerToken,
      })),
      identity: this.#identity,
    };
  }

  status() {
    return this.readStatus();
  }

  invokeExclusive(nameOrOperation, operationOrOptions, maybeOptions) {
    const { name, operation, options } = operationArguments(nameOrOperation, operationOrOptions, maybeOptions);
    if (this.#state !== 'open') return Promise.reject(new RuntimeClosedError(this.#state));
    const { token, signal } = options;
    return this.#mutex.runExclusive(async (heldToken) => {
      this.#assertOpen();
      const previousOperation = this.#activeOperation;
      this.#activeOperation = name;
      try {
        return await operation(heldToken, this);
      } finally {
        this.#activeOperation = previousOperation;
      }
    }, { token, signal });
  }

  acquireLease(key, options = {}) {
    const { token, signal, ...leaseOptions } = options;
    return this.invokeExclusive('lease.acquire', async () => {
      const lease = await this.#leaseManager.acquire(key, leaseOptions);
      this.#leases.add(lease);
      return lease;
    }, { token, signal });
  }

  acquireBundleLease(bundlePath, options = {}) {
    const { cwd, ...runtimeOptions } = options;
    return this.acquireLease(bundleLeaseKey(bundlePath, { cwd }), runtimeOptions);
  }

  acquireCdpTargetLease(endpoint, targetId, options = {}) {
    return this.acquireLease(cdpTargetLeaseKey(endpoint, targetId), options);
  }

  releaseLease(lease, options = {}) {
    if (!this.#leases.has(lease)) return Promise.resolve(false);
    const { token, signal } = options;
    return this.invokeExclusive('lease.release', async () => {
      if (!this.#leases.has(lease)) return false;
      const released = await lease.release();
      if (released || lease.released) this.#leases.delete(lease);
      return released;
    }, { token, signal });
  }

  /**
   * Stop accepting work immediately, wait for the current critical section, then
   * close slots and release ownership. The same promise is returned on every call.
   */
  close({ token } = {}) {
    if (this.#closePromise) return this.#closePromise;
    this.#state = 'closing';
    this.#closePromise = this.#mutex.runExclusive(async () => {
      const errors = [];
      const closedResources = new Set();
      for (const resource of [this.#explorer, this.#bundle, this.#driver]) {
        if (!resource || closedResources.has(resource)) continue;
        closedResources.add(resource);
        if (typeof resource.close !== 'function') continue;
        try {
          await resource.close();
        } catch (error) {
          errors.push(error);
        }
      }
      this.#explorer = null;
      this.#bundle = null;
      this.#driver = null;

      for (const lease of [...this.#leases]) {
        try {
          const released = await lease.release();
          if (!released && !lease.released) errors.push(new Error(`Failed to release ${lease.kind ?? 'unknown'} lease.`));
        } catch (error) {
          errors.push(error);
        } finally {
          this.#leases.delete(lease);
        }
      }
      if (typeof this.#leaseManager.close === 'function') {
        try {
          const releasedAll = await this.#leaseManager.close();
          if (releasedAll === false) errors.push(new Error('Lease manager could not release every lease.'));
        } catch (error) {
          errors.push(error);
        }
      }

      this.#state = 'closed';
      this.#activeOperation = null;
      if (errors.length > 0) throw new AggregateError(errors, 'Crawler runtime closed with cleanup errors.');
    }, { token }).catch((error) => {
      // Keep the runtime terminal even when cleanup reports an error; callers may
      // safely retry close and receive the same promise without running it twice.
      this.#state = 'closed';
      throw error;
    });
    return this.#closePromise;
  }

  #assertOpen() {
    if (this.#state !== 'open') throw new RuntimeClosedError(this.#state);
  }
}
