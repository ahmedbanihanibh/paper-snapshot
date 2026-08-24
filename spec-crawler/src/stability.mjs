const DEFAULTS = Object.freeze({
  timeoutMs: 3_000,
  pollIntervalMs: 50,
  quietWindowMs: 100,
  consecutiveSamples: 3,
  maxSampledElements: 500,
  includeSubtree: true,
});

function finiteNumber(value, fallback, { min = 0 } = {}) {
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function normalizeStabilityOptions(options = {}) {
  return {
    timeoutMs: finiteNumber(options.timeoutMs, DEFAULTS.timeoutMs),
    pollIntervalMs: finiteNumber(options.pollIntervalMs, DEFAULTS.pollIntervalMs, { min: 1 }),
    quietWindowMs: finiteNumber(options.quietWindowMs, DEFAULTS.quietWindowMs),
    consecutiveSamples: positiveInteger(options.consecutiveSamples, DEFAULTS.consecutiveSamples),
    maxSampledElements: positiveInteger(options.maxSampledElements, DEFAULTS.maxSampledElements),
    includeSubtree: options.includeSubtree !== false,
    scope: options.scope ?? null,
    throwOnTimeout: options.throwOnTimeout === true,
  };
}

export class StabilityTimeoutError extends Error {
  constructor(evidence) {
    const blockers = evidence?.diagnostics?.blockers?.join(', ') || 'unknown blockers';
    super(`Page did not become stable within ${evidence?.elapsedMs ?? 'the configured timeout'}ms (${blockers}).`);
    this.name = 'StabilityTimeoutError';
    this.code = 'ERR_STABILITY_TIMEOUT';
    this.evidence = evidence;
  }
}

/**
 * Pure helper used by fake-page tests and diagnostics consumers. It intentionally
 * compares opaque browser signatures: the browser sampler owns what is relevant,
 * while this helper owns the consecutive-sample contract.
 */
export function assessStabilitySamples(samples, { consecutiveSamples = DEFAULTS.consecutiveSamples } = {}) {
  let consecutive = 0;
  let previous = null;
  for (const sample of samples ?? []) {
    const ready = sample
      && sample.domQuiet === true
      && sample.fontsReady === true
      && sample.imagesReady === true
      && sample.animationsReady === true;
    if (ready && sample.signature === previous) consecutive += 1;
    else consecutive = ready ? 1 : 0;
    previous = sample?.signature ?? null;
  }
  return {
    stable: consecutive >= consecutiveSamples,
    consecutive,
    required: consecutiveSamples,
    lastSignature: previous,
  };
}

/* Runs wholly in the document so the MutationObserver, image decode promises,
 * and sample clock share one epoch and leave no globals behind. */
async function browserWaitForStable({ scope, options }) {
  const startedAt = performance.now();
  const deadline = startedAt + options.timeoutMs;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const round = (value) => Math.round(value * 1000) / 1000;

  let root;
  if (scope == null) root = document.documentElement;
  else if (typeof scope === 'string') {
    try { root = document.querySelector(scope); } catch { root = null; }
  } else root = scope;
  if (!(root instanceof Element)) {
    return {
      stable: false,
      timedOut: false,
      elapsedMs: round(performance.now() - startedAt),
      scopeFound: false,
      diagnostics: { blockers: ['scope-not-found'], samples: 0 },
    };
  }

  const mutation = { count: 0, lastAt: startedAt };
  const observer = new MutationObserver((records) => {
    mutation.count += records.length;
    mutation.lastAt = performance.now();
  });
  observer.observe(root, {
    subtree: options.includeSubtree,
    childList: true,
    attributes: true,
    characterData: true,
  });

  let fontsReady = !document.fonts || document.fonts.status === 'loaded';
  document.fonts?.ready?.then(() => { fontsReady = true; }, () => { fontsReady = false; });

  const imageDecodes = new Map();
  const imageFailures = new Map();
  const sampled = [];
  let previousSignature = null;
  let consecutive = 0;
  let lastSample = null;

  const elementLabel = (element) => {
    const role = element.getAttribute('role');
    const id = element.id ? `#${element.id}` : '';
    const name = element.getAttribute('aria-label') || element.getAttribute('name') || '';
    return `${element.localName}${id}${role ? `[role=${role}]` : ''}${name ? `[name=${name.slice(0, 80)}]` : ''}`;
  };

  const elementsForSample = () => {
    const elements = [root];
    if (options.includeSubtree) {
      const descendants = root.querySelectorAll('*');
      for (let index = 0; index < descendants.length && elements.length < options.maxSampledElements; index += 1) {
        const element = descendants[index];
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if ((rect.width > 0 || rect.height > 0) && style.display !== 'none' && style.visibility !== 'hidden') {
          elements.push(element);
        }
      }
    }
    return elements;
  };

  const activeAnimations = () => {
    const animations = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
    const relevant = [];
    for (const animation of animations) {
      if (!['running', 'pending'].includes(animation.playState)) continue;
      const effectTarget = animation.effect?.target;
      const target = effectTarget instanceof Element ? effectTarget : effectTarget?.element;
      if (!(target instanceof Element)) continue;
      if (!(target === root || root.contains(target) || target.contains(root))) continue;
      const timing = animation.effect?.getComputedTiming?.() ?? {};
      relevant.push({
        target: `${elementLabel(target)}${effectTarget?.type ? effectTarget.type : ''}`,
        playState: animation.playState,
        currentTime: Number.isFinite(animation.currentTime) ? round(animation.currentTime) : null,
        duration: Number.isFinite(timing.duration) ? round(timing.duration) : String(timing.duration ?? ''),
        iterations: Number.isFinite(timing.iterations) ? timing.iterations : String(timing.iterations ?? ''),
      });
    }
    return relevant;
  };

  const imageState = () => {
    const images = root.matches('img') ? [root] : [...root.querySelectorAll('img')];
    for (const image of images) {
      const decodeState = imageDecodes.get(image);
      if (decodeState === true || decodeState === false) continue;
      if (!image.complete || image.naturalWidth === 0) {
        imageDecodes.set(image, null);
        continue;
      }
      if (typeof image.decode !== 'function') {
        imageDecodes.set(image, true);
        continue;
      }
      imageDecodes.set(image, false);
      Promise.resolve(image.decode()).then(
        () => imageDecodes.set(image, true),
        (error) => {
          // Decoding failed: stop retrying the same promise, but keep the failure
          // as a stability blocker so a broken image cannot be captured as ready.
          imageDecodes.set(image, true);
          imageFailures.set(image, String(error?.message || error || 'decode failed'));
        },
      );
    }
    let pending = 0;
    for (const image of images) {
      const decoded = imageDecodes.get(image);
      if (!image.complete || image.naturalWidth === 0 || decoded !== true) pending += 1;
    }
    return {
      total: images.length,
      pending,
      failed: [...imageFailures].map(([image, error]) => ({ image: elementLabel(image), error })),
    };
  };

  const sample = () => {
    fontsReady = !document.fonts || document.fonts.status === 'loaded';
    const elements = elementsForSample();
    const geometry = [];
    const visual = [];
    const state = [];
    const scroll = [`window:${round(scrollX)},${round(scrollY)}`];

    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      geometry.push(`${index}:${round(rect.x)},${round(rect.y)},${round(rect.width)},${round(rect.height)}`);
      visual.push([
        index,
        style.display,
        style.visibility,
        style.opacity,
        style.transform,
        style.filter,
        style.color,
        style.backgroundColor,
        style.borderTopColor,
        style.borderTopWidth,
        style.borderRadius,
        style.boxShadow,
        style.fontFamily,
        style.fontSize,
        style.fontWeight,
        style.lineHeight,
      ].join(':'));

      const attributes = [];
      for (const attribute of element.attributes) {
        if (attribute.name === 'open'
          || attribute.name === 'hidden'
          || attribute.name.startsWith('aria-')
          || attribute.name === 'data-state'
          || attribute.name === 'data-open'
          || attribute.name === 'data-expanded'
          || attribute.name === 'data-selected'
          || attribute.name === 'data-checked') {
          attributes.push(`${attribute.name}=${attribute.value}`);
        }
      }
      if (attributes.length) state.push(`${index}:${attributes.sort().join('|')}`);
      if ((/(auto|scroll)/).test(`${style.overflowX} ${style.overflowY}`)
        || element.scrollLeft !== 0 || element.scrollTop !== 0) {
        scroll.push(`${index}:${round(element.scrollLeft)},${round(element.scrollTop)},${element.scrollWidth},${element.scrollHeight}`);
      }
    }

    const active = document.activeElement instanceof Element && (document.activeElement === root || root.contains(document.activeElement))
      ? elementLabel(document.activeElement)
      : '';
    const animations = activeAnimations();
    const images = imageState();
    const now = performance.now();
    const domQuiet = now - mutation.lastAt >= options.quietWindowMs;
    const signature = JSON.stringify({ geometry, visual, state, scroll, active });
    return {
      atMs: round(now - startedAt),
      signature,
      domQuiet,
      quietForMs: round(now - mutation.lastAt),
      fontsReady,
      imagesReady: images.pending === 0 && images.failed.length === 0,
      animationsReady: animations.length === 0,
      animations,
      images,
      elementCount: elements.length,
      active,
      scroll,
    };
  };

  try {
    while (true) {
      const current = sample();
      const ready = current.domQuiet && current.fontsReady && current.imagesReady && current.animationsReady;
      if (ready && current.signature === previousSignature) consecutive += 1;
      else consecutive = ready ? 1 : 0;
      previousSignature = current.signature;
      lastSample = current;
      sampled.push({
        atMs: current.atMs,
        domQuiet: current.domQuiet,
        fontsReady: current.fontsReady,
        imagesReady: current.imagesReady,
        animationsReady: current.animationsReady,
        signature: current.signature,
      });
      if (sampled.length > 20) sampled.shift();

      if (consecutive >= options.consecutiveSamples) {
        return {
          stable: true,
          timedOut: false,
          elapsedMs: round(performance.now() - startedAt),
          scopeFound: true,
          consecutiveSamples: consecutive,
          requiredConsecutiveSamples: options.consecutiveSamples,
          diagnostics: {
            blockers: [],
            mutations: mutation.count,
            sampledElements: current.elementCount,
            images: current.images,
            animations: current.animations,
            fontsReady: current.fontsReady,
            quietForMs: current.quietForMs,
            activeElement: current.active,
            scroll: current.scroll,
            samples: sampled.length,
          },
        };
      }

      if (performance.now() >= deadline) {
        const blockers = [];
        if (!current.domQuiet) blockers.push('dom-mutations');
        if (!current.fontsReady) blockers.push('fonts');
        if (!current.imagesReady) blockers.push('images');
        if (!current.animationsReady) blockers.push('animations');
        if (ready && consecutive < options.consecutiveSamples) blockers.push('geometry-style-scroll-state');
        return {
          stable: false,
          timedOut: true,
          elapsedMs: round(performance.now() - startedAt),
          scopeFound: true,
          consecutiveSamples: consecutive,
          requiredConsecutiveSamples: options.consecutiveSamples,
          diagnostics: {
            blockers,
            mutations: mutation.count,
            sampledElements: current.elementCount,
            images: current.images,
            animations: current.animations,
            fontsReady: current.fontsReady,
            quietForMs: current.quietForMs,
            activeElement: current.active,
            scroll: current.scroll,
            samples: sampled.length,
            recentSamples: sampled,
            lastSample: {
              atMs: current.atMs,
              domQuiet: current.domQuiet,
              fontsReady: current.fontsReady,
              imagesReady: current.imagesReady,
              animationsReady: current.animationsReady,
            },
          },
        };
      }
      await sleep(options.pollIntervalMs);
    }
  } finally {
    observer.disconnect();
  }
}

export class StabilityOracle {
  constructor(page, options = {}) {
    if (!page || typeof page.evaluate !== 'function') throw new TypeError('StabilityOracle requires a page with evaluate().');
    this.page = page;
    this.options = normalizeStabilityOptions(options);
  }

  async wait(overrides = {}) {
    const options = normalizeStabilityOptions({ ...this.options, ...overrides });
    const scope = options.scope;
    delete options.scope;
    const evidence = await this.page.evaluate(browserWaitForStable, { scope, options });
    if (evidence?.timedOut && options.throwOnTimeout) throw new StabilityTimeoutError(evidence);
    return evidence;
  }
}

export async function waitForStable(page, options = {}) {
  return new StabilityOracle(page, options).wait();
}

export const stabilityDefaults = DEFAULTS;
