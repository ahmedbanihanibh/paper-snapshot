export const TARGET_ID_ATTRIBUTE = 'data-spec-id';

const leasesByPage = new WeakMap();

function pageOf(driverOrPage) {
  const page = driverOrPage?.page ?? driverOrPage;
  if (!page || typeof page.evaluate !== 'function') throw new TypeError('TargetLease requires a driver or page with evaluate().');
  return page;
}

function requireExpectation(expect) {
  if (typeof expect !== 'string' || expect.trim().length === 0) {
    throw new TargetLeaseError('A non-empty expect value is required to acquire a target lease.', {
      code: 'ERR_TARGET_EXPECT_REQUIRED',
      reason: 'expect-required',
    });
  }
  return expect.trim();
}

export class TargetLeaseError extends Error {
  constructor(message, { code = 'ERR_TARGET_LEASE', reason = 'target-invalid', evidence = null } = {}) {
    super(message);
    this.name = 'TargetLeaseError';
    this.code = code;
    this.reason = reason;
    this.evidence = evidence;
  }
}

function resolveTargetInPage({ source, assignedSpecId, expect, previous, attribute, retag }) {
  const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
  const digest = (value) => {
    // FNV-1a is not a security primitive; it is a compact deterministic label
    // identity that can be computed synchronously in every browser context.
    let hash = 0x811c9dc5;
    const string = normalize(value);
    for (let index = 0; index < string.length; index += 1) {
      hash ^= string.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const escapeAttribute = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const bySpecId = (id) => id ? document.querySelector(`[${attribute}="${escapeAttribute(id)}"]`) : null;
  const boundary = (leaf) => {
    if (!leaf) return null;
    const landmark = leaf.closest('[data-list-row],[role="row"],[role="option"],[role="menuitem"],[role="dialog"],[role="alertdialog"],[role="listitem"],a[href],li,button');
    if (landmark) return { element: landmark, via: 'landmark' };
    let node = leaf;
    const leafRect = leaf.getBoundingClientRect();
    while (node.parentElement) {
      const parentRect = node.parentElement.getBoundingClientRect();
      const grew = parentRect.width > Math.max(1, leafRect.width) * 4
        || parentRect.height > Math.max(1, leafRect.height) * 4;
      if (grew) break;
      node = node.parentElement;
    }
    return { element: node, via: 'width-boundary' };
  };
  const matchesExpectation = (element, label) => {
    const wanted = expect.toLowerCase();
    if (label.toLowerCase().includes(wanted) || element.tagName.toLowerCase() === wanted) return true;
    try { return element.matches(expect); } catch { return false; }
  };
  const stableAttributes = (element) => {
    const names = ['id', 'role', 'aria-label', 'aria-labelledby', 'name', 'type', 'href', 'title', 'placeholder', 'data-testid', 'data-test-id', 'data-list-row', 'data-list-key'];
    const result = {};
    for (const name of names) {
      if (!element.hasAttribute(name)) continue;
      let value = normalize(element.getAttribute(name));
      if (name === 'href') {
        try {
          const url = new URL(value, location.href);
          value = `${url.origin}${url.pathname}${url.search}`;
        } catch { /* retain authored value */ }
      }
      result[name] = value.slice(0, 240);
    }
    return result;
  };
  const landmarkOf = (element) => ({
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') || null,
    id: element.id || null,
    testId: element.getAttribute('data-testid') || element.getAttribute('data-test-id') || null,
    labelDigest: digest(element.getAttribute('aria-label') || element.getAttribute('title') || ''),
  });
  const descriptor = (element, via) => {
    const label = normalize(element.getAttribute('aria-label') || element.innerText || element.textContent || '');
    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const landmarks = [];
    let ancestor = element.parentElement;
    while (ancestor && landmarks.length < 6) {
      if (ancestor.id || ancestor.getAttribute('role') || ancestor.getAttribute('aria-label')
        || ancestor.getAttribute('data-testid') || ['MAIN', 'NAV', 'ASIDE', 'HEADER', 'FOOTER', 'BODY'].includes(ancestor.tagName)) {
        landmarks.push(landmarkOf(ancestor));
      }
      ancestor = ancestor.parentElement;
    }
    return {
      specId: assignedSpecId,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || (element.tagName === 'DIALOG' ? 'dialog' : null),
      label: label.slice(0, 120),
      labelDigest: digest(label),
      stableAttributes: stableAttributes(element),
      rect: {
        x: +rect.x.toFixed(1), y: +rect.y.toFixed(1),
        width: +rect.width.toFixed(1), height: +rect.height.toFixed(1),
      },
      ancestorLandmarks: landmarks,
      documentEpoch: String(performance.timeOrigin),
      display: styles.display,
      href: element.getAttribute('href'),
      via,
    };
  };
  const sameRecord = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

  let resolved = null;
  if (source.x != null && source.y != null) {
    resolved = boundary(document.elementFromPoint(source.x, source.y));
  } else if (source.specId) {
    const element = bySpecId(source.specId);
    resolved = element ? { element, via: 'spec-id' } : null;
  }
  if (!resolved?.element) {
    return {
      ok: false,
      reason: 'not-found',
      message: source.x != null
        ? `nothing at (${source.x}, ${source.y}) — the point is over a gap or outside the viewport`
        : `target ${source.specId ?? assignedSpecId} is no longer in the document`,
    };
  }

  const label = normalize(resolved.element.getAttribute('aria-label') || resolved.element.innerText || resolved.element.textContent || '');
  if (!matchesExpectation(resolved.element, label)) {
    return {
      ok: false,
      reason: 'expect-mismatch',
      message: `target resolved to <${resolved.element.tagName.toLowerCase()}> "${label.slice(0, 60)}", which does not match expect="${expect}"`,
      resolved: { tag: resolved.element.tagName.toLowerCase(), label: label.slice(0, 120) },
    };
  }

  const current = descriptor(resolved.element, resolved.via);
  if (previous) {
    const mismatches = [];
    if (current.documentEpoch !== previous.documentEpoch) mismatches.push('document-epoch');
    if (current.tag !== previous.tag) mismatches.push('tag');
    if (current.role !== previous.role) mismatches.push('role');
    if (current.labelDigest !== previous.labelDigest) mismatches.push('label-digest');
    if (!sameRecord(current.stableAttributes, previous.stableAttributes)) mismatches.push('stable-attributes');
    if (!sameRecord(current.ancestorLandmarks, previous.ancestorLandmarks)) mismatches.push('ancestor-landmarks');
    if (mismatches.length) {
      return {
        ok: false,
        reason: 'identity-mismatch',
        message: `target identity changed (${mismatches.join(', ')}) — refusing a recycled or replacement element`,
        mismatches,
        expected: previous,
        resolved: current,
      };
    }
  }

  if (retag) {
    const existing = bySpecId(assignedSpecId);
    if (existing && existing !== resolved.element) existing.removeAttribute(attribute);
    resolved.element.setAttribute(attribute, assignedSpecId);
  }
  return { ok: true, descriptor: current };
}

function mapFor(page) {
  let map = leasesByPage.get(page);
  if (!map) {
    map = new Map();
    leasesByPage.set(page, map);
  }
  return map;
}

export class TargetLease {
  #page;
  #snapshot;

  constructor(page, { source, expect, snapshot }) {
    this.#page = page;
    this.source = Object.freeze({ ...source });
    this.expect = expect;
    this.#snapshot = Object.freeze(snapshot);
  }

  static async acquire(driverOrPage, { x = null, y = null, specId = null, expect, assignedSpecId = null } = {}) {
    const page = pageOf(driverOrPage);
    const requiredExpect = requireExpectation(expect);
    const hasPoint = Number.isFinite(x) && Number.isFinite(y);
    if (!hasPoint && !specId) {
      throw new TargetLeaseError('Target acquisition requires coordinates or a specId.', {
        code: 'ERR_TARGET_SOURCE_REQUIRED',
        reason: 'source-required',
      });
    }

    let id = assignedSpecId ?? specId;
    if (!id || hasPoint) {
      if (!id) {
        id = await page.evaluate(() => {
          const root = document.documentElement;
          const next = Number(root.dataset.specPointCounter || '0') + 1;
          root.dataset.specPointCounter = String(next);
          return `pt${next}`;
        });
      }
    }
    const source = hasPoint ? { x, y, specId: null } : { x: null, y: null, specId };
    const result = await page.evaluate(resolveTargetInPage, {
      source,
      assignedSpecId: id,
      expect: requiredExpect,
      previous: null,
      attribute: TARGET_ID_ATTRIBUTE,
      retag: true,
    });
    if (!result?.ok) {
      throw new TargetLeaseError(result?.message || 'Target acquisition failed.', {
        code: result?.reason === 'expect-mismatch' ? 'ERR_TARGET_EXPECT_MISMATCH' : 'ERR_TARGET_NOT_FOUND',
        reason: result?.reason,
        evidence: result,
      });
    }

    const lease = new TargetLease(page, { source, expect: requiredExpect, snapshot: result.descriptor });
    mapFor(page).set(id, lease);
    return lease;
  }

  get page() { return this.#page; }
  get specId() { return this.#snapshot.specId; }
  get snapshot() { return this.#snapshot; }

  async revalidate({ retag = true } = {}) {
    const result = await this.#page.evaluate(resolveTargetInPage, {
      source: this.source,
      assignedSpecId: this.specId,
      expect: this.expect,
      previous: this.#snapshot,
      attribute: TARGET_ID_ATTRIBUTE,
      retag,
    });
    if (!result?.ok) {
      const code = result?.reason === 'identity-mismatch'
        ? 'ERR_TARGET_RECYCLED'
        : result?.reason === 'expect-mismatch'
          ? 'ERR_TARGET_EXPECT_MISMATCH'
          : 'ERR_TARGET_NOT_FOUND';
      throw new TargetLeaseError(result?.message || 'Target lease revalidation failed.', {
        code,
        reason: result?.reason,
        evidence: result,
      });
    }
    // Rect and via may legitimately change while semantic identity may not. Keep
    // the acquisition identity immutable, but return the live measurement.
    return result.descriptor;
  }

  ensureTagged() {
    return this.revalidate({ retag: true });
  }
}

export async function acquireTargetLease(driverOrPage, options) {
  return TargetLease.acquire(driverOrPage, options);
}

export function getTargetLease(driverOrPage, specId) {
  return mapFor(pageOf(driverOrPage)).get(specId) ?? null;
}

export function forgetTargetLease(driverOrPage, specId) {
  return mapFor(pageOf(driverOrPage)).delete(specId);
}
