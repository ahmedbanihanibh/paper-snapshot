/**
 * Frame-accurate, causally scoped visual verification of an animation.
 *
 * Selected animations share one interaction clock. Each animation receives the
 * same elapsed time, so its own delay, active duration, iterations, fill, and
 * direction remain browser-owned rather than being normalised away.
 */

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

/** Pure selector used by recording analysis and unit tests. */
export function selectCausalAnimationDescriptors(descriptors, {
  beforeAnimationIds = [], allowedNodeIds = [], subjectNodeIds = [], relatedNodeIds = [],
} = {}) {
  const before = new Set(beforeAnimationIds);
  const allowed = new Set([...allowedNodeIds, ...subjectNodeIds, ...relatedNodeIds].filter(Boolean));
  const constrained = allowed.size > 0;
  const included = []; const excluded = [];
  for (const descriptor of descriptors ?? []) {
    const item = { ...descriptor };
    if (before.has(item.animationId)) excluded.push({ ...item, reason: 'present before interaction' });
    else if (!(finite(item.activeDuration) > 0)) excluded.push({ ...item, reason: 'non-finite or zero active duration' });
    else if (constrained && !allowed.has(item.nodeId)) excluded.push({ ...item, reason: 'unrelated target' });
    else included.push({ ...item, reason: constrained ? 'allowed causal target' : 'fresh animation' });
  }
  return { included, excluded, constrained };
}

/** Build the common interaction timeline used by filmstrip and parity CLI. */
export function buildSharedTimeline(descriptors = []) {
  // Keep this helper self-contained: the raw-CDP parity CLI serializes the exact
  // same implementation into the page rather than maintaining a divergent copy.
  const toFinite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const animations = descriptors.map((descriptor) => {
    const delay = toFinite(descriptor.delay) ?? 0;
    const activeDuration = toFinite(descriptor.activeDuration) ?? 0;
    return {
      ...descriptor,
      delay,
      activeDuration,
      startMs: delay,
      endMs: delay + activeDuration,
      direction: descriptor.direction ?? 'normal',
    };
  });
  const durationMs = Math.max(0, ...animations.map((animation) => animation.endMs));
  return { durationMs, animations, at: (progress) => durationMs * Number(progress) };
}

/** Browser-side arming function. Must remain self-contained for page.evaluate. */
export function armFilmstripInPage(options = {}) {
  const {
    beforeAnimationIds = [], allowedNodeIds = [], subjectId = null, relatedNodeIds = [],
    allowedSelectors = [], subjectSelector = null, relatedSelectors = [],
    discoveryFrames = 2, completion = 'finish',
  } = options;

  if (window.__filmstrip) {
    try {
      for (const animation of window.__filmstrip.animations ?? []) animation.play?.();
      for (const [animation, snapshot] of window.__filmstrip.frozen ?? []) {
        animation.playbackRate = snapshot.playbackRate;
        animation.currentTime = snapshot.currentTime;
        if (snapshot.playState === 'running' || snapshot.playState === 'pending') animation.play?.();
        else animation.pause?.();
      }
    } catch { /* replaced below */ }
    delete window.__filmstrip;
  }

  window.__specFilmstripAnimationIds ??= new WeakMap();
  window.__specFilmstripAnimationCounter ??= 0;
  const animationId = (animation) => {
    let id = window.__specFilmstripAnimationIds.get(animation);
    if (!id) {
      id = `film-${++window.__specFilmstripAnimationCounter}`;
      window.__specFilmstripAnimationIds.set(animation, id);
    }
    return id;
  };
  const targetId = (target) => target?.getAttribute?.('data-spec-id') ?? null;

  const invalidSelectors = [];
  for (const selector of [subjectSelector, ...allowedSelectors, ...relatedSelectors].filter(Boolean)) {
    try { document.querySelectorAll(selector); }
    catch { invalidSelectors.push(selector); }
  }

  const allowedIds = new Set([...allowedNodeIds, ...relatedNodeIds, subjectId].filter(Boolean));
  const constrained = allowedIds.size > 0 || Boolean(subjectSelector) || allowedSelectors.length > 0 || relatedSelectors.length > 0;
  const explicitBefore = new Set(beforeAnimationIds);
  const baseline = new Map();
  const frozen = new Map();
  const freezeAmbient = (animation) => {
    if (frozen.has(animation)) return;
    const snapshot = {
      playState: animation.playState,
      currentTime: animation.currentTime,
      playbackRate: animation.playbackRate,
    };
    frozen.set(animation, snapshot);
    try { animation.pause(); } catch { frozen.delete(animation); }
  };
  for (const animation of document.getAnimations()) {
    const id = animationId(animation);
    baseline.set(animation, { id, playState: animation.playState, currentTime: Number(animation.currentTime), startTime: Number(animation.startTime) });
    freezeAmbient(animation);
  }

  const state = {
    armed: true,
    animations: [],
    selection: { included: [], excluded: [], constrained, invalidSelectors },
    baseline,
    frozen,
    completion,
    discoveredFrames: 0,
  };
  window.__filmstrip = state;

  const describe = (animation) => {
    const timing = animation.effect?.getComputedTiming?.() ?? {};
    const rawTiming = animation.effect?.getTiming?.() ?? {};
    const target = animation.effect?.target ?? null;
    return {
      animationId: animationId(animation),
      nodeId: targetId(target),
      targetTag: target?.tagName?.toLowerCase?.() ?? null,
      property: animation.transitionProperty ?? null,
      animationName: animation.animationName ?? null,
      delay: Number(rawTiming.delay) || 0,
      activeDuration: Number(timing.activeDuration),
      endTime: Number(timing.endTime),
      easing: timing.easing ?? rawTiming.easing ?? null,
      direction: rawTiming.direction ?? 'normal',
      iterations: timing.iterations ?? rawTiming.iterations ?? 1,
    };
  };
  const resolveRoots = () => {
    const roots = [];
    if (subjectId) {
      const matches = Array.from(document.querySelectorAll('[data-spec-id]')).filter((element) => element.getAttribute('data-spec-id') === subjectId);
      if (matches.length > 1) return { error: `Explicit filmstrip subject id ${subjectId} matched ${matches.length} elements; expected exactly one.`, roots };
      if (matches.length === 0) return { pending: true, roots };
      roots.push(matches[0]);
    }
    if (subjectSelector) {
      if (invalidSelectors.includes(subjectSelector)) return { error: `Explicit filmstrip subject selector is invalid: ${subjectSelector}`, roots };
      const matches = Array.from(document.querySelectorAll(subjectSelector));
      if (matches.length > 1) return { error: `Explicit filmstrip subject ${subjectSelector} matched ${matches.length} elements; expected exactly one.`, roots };
      if (matches.length === 0) return { pending: true, roots };
      roots.push(matches[0]);
    }
    for (const selector of [...allowedSelectors, ...relatedSelectors]) {
      if (invalidSelectors.includes(selector)) continue;
      roots.push(...document.querySelectorAll(selector));
    }
    return { pending: false, roots };
  };
  const related = (target, descriptor, roots) => {
    if (!constrained) return true;
    if (descriptor.nodeId && allowedIds.has(descriptor.nodeId)) return true;
    return roots.some((root) => root === target || root.contains(target) || target?.contains?.(root));
  };
  const excludedById = new Set();
  const excludedRecords = new Map();
  const includedById = new Set();
  const recordExcluded = (descriptor, reason, permanent = true) => {
    excludedRecords.set(descriptor.animationId, { ...descriptor, reason });
    state.selection.excluded = Array.from(excludedRecords.values());
    if (permanent) excludedById.add(descriptor.animationId);
  };

  const arm = () => {
    if (window.__filmstrip !== state || !state.armed) return;
    const resolved = resolveRoots();
    if (resolved.error) { state.error = resolved.error; state.armed = false; return; }
    // A dialog or popover subject may be mounted by the trigger. Wait for it
    // rather than falling back to the document or selecting ambient work.
    if (resolved.pending) { requestAnimationFrame(arm); return; }
    const roots = resolved.roots;
    let foundThisFrame = false;
    for (const animation of document.getAnimations()) {
      const descriptor = describe(animation);
      const id = descriptor.animationId;
      if (includedById.has(id) || excludedById.has(id)) continue;
      const target = animation.effect?.target ?? null;
      const original = baseline.get(animation);
      const restarted = original
        && (animation.playState === 'running' || animation.playState === 'pending')
        && (frozen.has(animation)
          || original.playState !== 'running'
          || (Number.isFinite(original.currentTime) && Number(animation.currentTime) + 1 < original.currentTime));

      let reason = null;
      if (explicitBefore.has(id)) reason = 'present before interaction (explicit id)';
      else if (!Number.isFinite(descriptor.activeDuration) || descriptor.activeDuration <= 0) reason = 'non-finite or zero active duration';
      else if (original && !restarted) reason = 'present before interaction';
      else if (animation.playState !== 'running' && animation.playState !== 'pending') reason = 'not running after interaction';
      else if (!related(target, descriptor, roots)) reason = 'unrelated target';

      if (reason) {
        // Freeze excluded animations too, so whole-page screenshots cannot drift
        // because an ambient cursor/spinner advanced between captures.
        freezeAmbient(animation);
        // A baseline Animation object can be restarted by the interaction on a
        // later frame. Keep that exclusion revisitable; explicit-before,
        // unsupported, and unrelated tracks are final.
        recordExcluded(descriptor, reason, !(original && !restarted));
        continue;
      }

      excludedRecords.delete(id);
      state.selection.excluded = Array.from(excludedRecords.values());
      // A restarted baseline object is now causal; do not restore its pre-trigger
      // time during ambient cleanup.
      frozen.delete(animation);
      includedById.add(id);
      foundThisFrame = true;
      try { animation.pause(); } catch {
        recordExcluded(descriptor, 'animation could not be paused');
        includedById.delete(id); continue;
      }
      state.animations.push(animation);
      state.selection.included.push({ ...descriptor, reason: constrained ? 'allowed causal target' : (restarted ? 'restarted after interaction' : 'fresh animation') });
    }

    if (state.animations.length) {
      state.discoveredFrames += 1;
      if (state.discoveredFrames >= Math.max(1, discoveryFrames)) {
        state.armed = false;
        return;
      }
    } else if (foundThisFrame) state.discoveredFrames = 1;
    requestAnimationFrame(arm);
  };
  requestAnimationFrame(arm);
  return { armed: true, constrained, baselineCount: baseline.size };
}

/** Browser-side serializable state read. */
export function readFilmstripStateInPage() {
  const state = window.__filmstrip;
  if (!state) return null;
  return { armed: state.armed, selection: state.selection, discoveredFrames: state.discoveredFrames, error: state.error ?? null };
}

/** Browser-side shared-clock seek. */
export async function seekFilmstripInPage({ timelineMs }) {
  const state = window.__filmstrip;
  if (!state) throw new Error('Filmstrip state is missing.');
  for (const animation of state.animations ?? []) {
    try { animation.currentTime = timelineMs; }
    catch (cause) { throw new Error(`Could not seek selected animation: ${cause?.message ?? cause}`); }
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return true;
}

/** Browser-side transactional cleanup. Only selected animations are touched. */
export function cleanupFilmstripInPage({ completion = null } = {}) {
  const state = window.__filmstrip;
  if (!state) return { cleaned: true, resumed: 0, errors: [] };
  const policy = completion ?? state.completion ?? 'finish';
  const errors = []; let resumed = 0;
  try {
    state.armed = false;
    for (const animation of state.animations ?? []) {
      try {
        animation.play?.();
        resumed += 1;
        if (policy === 'finish') animation.finish?.();
      } catch (cause) { errors.push(String(cause?.message ?? cause)); }
    }
    for (const [animation, snapshot] of state.frozen ?? []) {
      try {
        animation.playbackRate = snapshot.playbackRate;
        animation.currentTime = snapshot.currentTime;
        if (snapshot.playState === 'running' || snapshot.playState === 'pending') animation.play?.();
        else animation.pause?.();
      } catch (cause) { errors.push(`ambient restore: ${String(cause?.message ?? cause)}`); }
    }
  } finally {
    delete window.__filmstrip;
  }
  return { cleaned: true, resumed, errors };
}

/** Trigger, freeze, and sample selected animations at fixed progress points. */
export async function filmstrip(driver, {
  triggerId,
  keys,
  progress = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1],
  subjectId = null,
  subjectSelector = null,
  relatedNodeIds = [],
  relatedSelectors = [],
  allowedNodeIds = [],
  allowedSelectors = [],
  beforeAnimationIds = [],
  strict = false,
  settleMs = 900,
  discoveryFrames = 2,
  completion = 'finish',
  onFrame = null,
} = {}) {
  if (strict && !subjectId && !subjectSelector) throw new Error('Strict filmstrip mode requires an explicit subjectId or subjectSelector.');
  if (!keys && !triggerId) throw new Error('filmstrip needs a triggerId or keys.');

  let triggered = false;
  let result = null;
  let primaryError = null;
  try {
    await driver.page.evaluate(armFilmstripInPage, {
      beforeAnimationIds, allowedNodeIds, subjectId, relatedNodeIds,
      allowedSelectors, subjectSelector, relatedSelectors,
      discoveryFrames, completion,
    });

    if (keys) await driver.page.keyboard.press(keys);
    else if (!await driver.clickById(triggerId)) throw new Error(`No element with spec id ${triggerId}.`);
    triggered = true;

    await driver.page.waitForFunction(() => window.__filmstrip && !window.__filmstrip.armed, null, { timeout: 2000 }).catch(() => {});
    const state = await driver.page.evaluate(readFilmstripStateInPage);
    if (state?.error) throw new Error(state.error);
    const included = state?.selection?.included ?? [];
    if (!included.length) {
      if (strict) throw new Error('No causal animations were selected for the explicit subject.');
      result = { status: 'no-causal-animations', noAnimations: true, durationMs: 0, frames: [], selection: state?.selection ?? { included: [], excluded: [] } };
    } else {
      const timeline = buildSharedTimeline(included);
      if (!(timeline.durationMs > 0)) {
        if (strict) throw new Error('No causal animations had a finite positive interaction timeline.');
        result = { status: 'no-causal-animations', noAnimations: true, durationMs: 0, frames: [], selection: state.selection, animations: timeline.animations };
      } else {
        const frames = [];
        for (const point of progress) {
          const timelineMs = timeline.at(point);
          await driver.page.evaluate(seekFilmstripInPage, { timelineMs });
          const frame = { progress: point, atMs: Math.round(timelineMs), png: await driver.page.screenshot() };
          if (onFrame) frame.sample = await onFrame(point, timelineMs);
          frames.push(frame);
        }
        result = { status: 'captured', durationMs: timeline.durationMs, frames, animations: timeline.animations, selection: state.selection };
      }
    }
  } catch (cause) {
    primaryError = cause;
  }

  const cleanup = await driver.page.evaluate(cleanupFilmstripInPage, { completion })
    .catch((cause) => ({ cleaned: false, errors: [String(cause?.message ?? cause)] }));
  if (triggered && settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
  const cleanupErrors = cleanup?.errors ?? [];
  if (primaryError && cleanupErrors.length) {
    throw new AggregateError([primaryError, ...cleanupErrors.map((message) => new Error(message))], 'Filmstrip capture and cleanup both failed.');
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length && strict) throw new Error(`Filmstrip cleanup failed: ${cleanupErrors.join('; ')}`);
  return { ...result, cleanup };
}

/** Measure named elements: position and size. */
export async function probe(driver, selectors) {
  return driver.page.evaluate((map) => {
    const out = {};
    for (const [name, selector] of Object.entries(map)) {
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1) { out[name] = null; continue; }
      const element = matches[0];
      const rect = element.getBoundingClientRect(); const styles = getComputedStyle(element);
      out[name] = {
        x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
        paddingTop: styles.paddingTop, paddingBottom: styles.paddingBottom,
        minHeight: styles.minHeight, maxWidth: styles.maxWidth,
      };
    }
    return out;
  }, selectors);
}

/** Backwards-compatible single-subject probe without explicit-subject fallback. */
export async function landmarks(driver, subjectSelector = null) {
  return driver.page.evaluate((selector) => {
    let subject;
    if (selector == null) subject = document.body;
    else {
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1) throw new Error(`Explicit landmark subject ${selector} matched ${matches.length} elements; expected exactly one.`);
      [subject] = matches;
    }
    const box = subject.getBoundingClientRect();
    const texts = Array.from(subject.querySelectorAll('*'))
      .filter((element) => element.children.length === 0 && (element.textContent ?? '').trim())
      .map((element) => ({ text: element.textContent.trim().slice(0, 24), rect: element.getBoundingClientRect() }));
    const create = texts.find((entry) => /^create issue$/i.test(entry.text));
    return {
      subject: { w: Math.round(box.width), h: Math.round(box.height) },
      top: Math.round(box.top),
      footerFromBottom: create ? Math.round(box.bottom - create.rect.bottom) : null,
    };
  }, subjectSelector);
}
