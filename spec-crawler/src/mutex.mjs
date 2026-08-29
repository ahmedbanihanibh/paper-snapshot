export class MutexAbortedError extends Error {
  constructor(reason) {
    super('Mutex acquisition was aborted.');
    this.name = 'MutexAbortedError';
    this.code = 'ERR_MUTEX_ABORTED';
    if (reason !== undefined) this.cause = reason;
  }
}

/** Create an opaque identity callers can pass through nested locked operations. */
export function createMutexToken() {
  return Symbol('spec-crawler-mutex-owner');
}

/**
 * A fair async mutex with explicit-token reentrancy.
 *
 * Reentrancy is deliberately explicit: asynchronous call stacks do not imply
 * ownership. A nested operation must receive and pass the token supplied to its
 * outer callback, preventing accidental lock bypass by unrelated work.
 */
export class AsyncMutex {
  #owner = null;
  #depth = 0;
  #queue = [];

  get locked() {
    return this.#owner !== null;
  }

  get pending() {
    return this.#queue.length;
  }

  acquire({ token = createMutexToken(), signal } = {}) {
    if (token === null || token === undefined) return Promise.reject(new TypeError('Mutex token must be non-null.'));
    if (signal?.aborted) return Promise.reject(new MutexAbortedError(signal.reason));

    if (this.#owner === token) {
      this.#depth += 1;
      return Promise.resolve(this.#releaseFunction(token));
    }

    if (this.#owner === null && this.#queue.length === 0) {
      this.#owner = token;
      this.#depth = 1;
      return Promise.resolve(this.#releaseFunction(token));
    }

    return new Promise((resolve, reject) => {
      const waiter = { token, signal, resolve, reject, onAbort: null };
      if (signal) {
        waiter.onAbort = () => {
          const index = this.#queue.indexOf(waiter);
          if (index === -1) return;
          this.#queue.splice(index, 1);
          reject(new MutexAbortedError(signal.reason));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.#queue.push(waiter);
      // Abort may have happened between the initial check and listener setup.
      if (signal?.aborted) waiter.onAbort();
    });
  }

  async runExclusive(operation, { token = createMutexToken(), signal } = {}) {
    if (typeof operation !== 'function') throw new TypeError('Mutex operation must be a function.');
    const release = await this.acquire({ token, signal });
    try {
      return await operation(token);
    } finally {
      release();
    }
  }

  #releaseFunction(token) {
    let released = false;
    const release = () => {
      if (released) return false;
      released = true;
      return this.#release(token);
    };
    Object.defineProperty(release, 'token', { value: token, enumerable: true });
    return release;
  }

  #release(token) {
    if (this.#owner !== token) return false;
    this.#depth -= 1;
    if (this.#depth > 0) return true;

    this.#owner = null;
    this.#depth = 0;
    while (this.#queue.length > 0) {
      const waiter = this.#queue.shift();
      if (waiter.signal?.aborted) {
        waiter.signal.removeEventListener('abort', waiter.onAbort);
        waiter.reject(new MutexAbortedError(waiter.signal.reason));
        continue;
      }
      if (waiter.signal) waiter.signal.removeEventListener('abort', waiter.onAbort);
      this.#owner = waiter.token;
      this.#depth = 1;
      waiter.resolve(this.#releaseFunction(waiter.token));
      break;
    }
    return true;
  }
}
