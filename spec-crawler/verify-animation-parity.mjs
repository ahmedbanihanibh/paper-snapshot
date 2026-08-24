#!/usr/bin/env node
/**
 * Compare an implementation's transition against the live original, frame for
 * frame. Legacy flags and JSON/stdout output are preserved.
 */

import { parseArgs } from 'node:util';
import { buildSharedTimeline } from './src/filmstrip.mjs';

const { values } = parseArgs({
  options: {
    reference: { type: 'string' },
    'reference-toggle': { type: 'string' },
    'reference-panel': { type: 'string' },
    candidate: { type: 'string' },
    'candidate-toggle': { type: 'string' },
    'candidate-panel': { type: 'string' },
    endpoint: { type: 'string', default: 'http://127.0.0.1:9222' },
    width: { type: 'string', default: '1440' },
    height: { type: 'string', default: '900' },
    tolerance: { type: 'string', default: '2' },
  },
});

for (const key of ['reference', 'reference-toggle', 'reference-panel', 'candidate', 'candidate-toggle', 'candidate-panel']) {
  if (!values[key]) throw new Error(`--${key} is required`);
}

const FRACTIONS = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
const metrics = { width: Number(values.width), height: Number(values.height) };
const tolerance = Number(values.tolerance);
if (!Number.isFinite(metrics.width) || metrics.width <= 0 || !Number.isFinite(metrics.height) || metrics.height <= 0) throw new Error('--width and --height must be positive numbers');
if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('--tolerance must be a non-negative number');

async function withPage(endpoint, match, { width, height }, fn) {
  const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(10000) });
  const list = await response.json();
  const target = list.find((item) => item.type === 'page' && item.url.includes(match));
  if (!target) throw new Error(`No page matching ${match}`);
  if (typeof WebSocket !== 'function') throw new Error('This Node runtime does not expose WebSocket; run the parity CLI on a runtime with the built-in WebSocket client.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error(`Timed out opening a CDP socket to ${match}`)); }, 10000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error(`Could not open a CDP socket to ${match}`)); };
  });

  let nextId = 0;
  const pending = new Map();
  const rejectPending = (message) => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error(message)); }
    pending.clear();
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  };
  socket.onclose = () => rejectPending(`CDP socket to ${match} closed`);
  socket.onerror = () => rejectPending(`CDP socket to ${match} failed`);

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id); reject(new Error(`${method} timed out`));
    }, 40000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw');
    return result.result.value;
  };

  await call('Page.bringToFront').catch(() => {});
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 600));

  try { return await fn({ evaluate, call }); }
  finally {
    rejectPending(`CDP session for ${match} ended`);
    socket.close();
  }
}

const sharedTimelineSource = buildSharedTimeline.toString();
const trace = (toggleSelector, panelSelector) => `(async () => {
  const buildSharedTimeline = (${sharedTimelineSource});
  const toggle = document.querySelector(${JSON.stringify(toggleSelector)});
  if (!toggle) return { error: 'toggle selector matched nothing' };

  for (let i = 0; i < 60 && document.getAnimations().some(a => a.playState === 'running'); i += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const before = new Map(document.getAnimations().map(animation => [animation, {
    playState: animation.playState,
    currentTime: Number(animation.currentTime),
    startTime: Number(animation.startTime),
  }]));
  const selected = [];
  let result;
  try {
    toggle.click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const panelMatches = document.querySelectorAll(${JSON.stringify(panelSelector)});
    if (panelMatches.length !== 1) return { error: 'panel selector matched ' + panelMatches.length + ' elements; expected exactly one' };
    const panel = panelMatches[0];

    const targetIdentity = (target) => {
      if (target === panel) return 'subject';
      if (panel.contains(target)) {
        const parts = []; let node = target;
        while (node && node !== panel) {
          const parent = node.parentElement;
          parts.push(parent ? Array.prototype.indexOf.call(parent.children, node) : 0);
          node = parent;
        }
        return 'subject/' + parts.reverse().join('/');
      }
      if (target?.contains?.(panel)) {
        let depth = 0; let node = panel;
        while (node && node !== target) { depth += 1; node = node.parentElement; }
        return 'ancestor:' + depth;
      }
      return 'unrelated';
    };
    const excluded = [];
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming?.() ?? {};
      const rawTiming = animation.effect?.getTiming?.() ?? {};
      const target = animation.effect?.target ?? null;
      const baseline = before.get(animation);
      const restarted = baseline && (
        (baseline.playState !== 'running' && animation.playState === 'running')
        || (Number.isFinite(baseline.currentTime) && Number(animation.currentTime) + 1 < baseline.currentTime)
        || (Number.isFinite(baseline.startTime) && Number(animation.startTime) !== baseline.startTime)
      );
      const descriptor = {
        animation,
        target,
        targetIdentity: targetIdentity(target),
        property: animation.transitionProperty ?? null,
        animationName: animation.animationName ?? null,
        // Preserve a non-numeric duration verbatim. A duration of 'auto' (scroll
        // and view-timeline driven animations) became NaN and then null, so two
        // animations resolving 'auto' very differently compared EQUAL and fed a
        // false timingMatch. Number(x) || 0 likewise turns a NaN delay into a
        // confident 0.
        duration: typeof rawTiming.duration === 'number'
          ? rawTiming.duration
          : (Number.isFinite(Number(rawTiming.duration)) ? Number(rawTiming.duration) : (rawTiming.duration ?? null)),
        delay: Number.isFinite(Number(rawTiming.delay)) ? Number(rawTiming.delay) : null,
        endDelay: Number.isFinite(Number(rawTiming.endDelay)) ? Number(rawTiming.endDelay) : null,
        activeDuration: Number(timing.activeDuration),
        easing: timing.easing ?? rawTiming.easing ?? null,
        iterations: Number(timing.iterations ?? rawTiming.iterations) || 1,
        iterationStart: Number(rawTiming.iterationStart) || 0,
        direction: rawTiming.direction ?? 'normal',
        fill: rawTiming.fill ?? timing.fill ?? 'none',
        playbackRate: Number(animation.playbackRate) || 1,
      };
      let reason = null;
      if (!Number.isFinite(descriptor.activeDuration) || descriptor.activeDuration <= 0) reason = 'non-finite or zero active duration';
      else if (baseline && !restarted) reason = 'present before interaction';
      else if (!(target === panel || panel.contains(target) || target?.contains?.(panel))) reason = 'unrelated target';
      if (reason) excluded.push({ property: descriptor.property, reason });
      else selected.push(descriptor);
    }
    if (!selected.length) return { error: 'the toggle started no causal animation for the panel', excluded };

    selected.forEach(({ animation }) => animation.pause());
    const descriptors = selected.map(({ animation: _animation, target: _target, ...descriptor }, index) => ({ animationId: 'animation-' + (index + 1), ...descriptor }));
    const timeline = buildSharedTimeline(descriptors);
    if (!(timeline.durationMs > 0)) return { error: 'causal animations had no finite positive timeline', excluded };

    const rows = [];
    for (const fraction of ${JSON.stringify(FRACTIONS)}) {
      const elapsed = timeline.at(fraction);
      selected.forEach(({ animation }) => { animation.currentTime = elapsed; });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const box = panel.getBoundingClientRect();
      rows.push({ f: fraction, atMs: elapsed, w: +box.width.toFixed(1), h: +box.height.toFixed(1), top: +box.y.toFixed(1) });
    }
    const props = selected.map(({ animation, targetIdentity: identity }) => identity + ':' + (animation.transitionProperty || animation.animationName || '?')).sort();
    result = {
      duration: timeline.durationMs,
      rows,
      // The distinct set, not descriptors[0]. getAnimations() order is arbitrary,
      // so a panel easing opacity with ease-out and height with a custom bezier
      // reported whichever the engine happened to enumerate first, as though it
      // were the animation's easing.
      easing: (() => {
        const distinct = [...new Set(descriptors.map((d) => d.easing).filter(Boolean))];
        return distinct.length === 0 ? null : distinct.length === 1 ? distinct[0] : distinct.join(' + ');
      })(),
      props,
      animations: timeline.animations,
      selection: { included: descriptors.map(({ animationId, property }) => ({ animationId, property, reason: 'causal panel target' })), excluded },
    };
    return result;
  } catch (cause) {
    return { error: String(cause?.message ?? cause) };
  } finally {
    for (const { animation } of selected) {
      try { animation.play(); animation.finish?.(); } catch { /* best-effort per animation */ }
    }
  }
})()`;

const direction = (rows) => {
  const first = rows[0]; const last = rows.at(-1);
  return Math.sign(last.w - first.w) || Math.sign(last.h - first.h) || Math.sign(last.top - first.top);
};

const reference = await withPage(values.endpoint, values.reference, metrics,
  ({ evaluate }) => evaluate(trace(values['reference-toggle'], values['reference-panel'])));
let candidate = await withPage(values.endpoint, values.candidate, metrics,
  ({ evaluate }) => evaluate(trace(values['candidate-toggle'], values['candidate-panel'])));
if (!reference.error && !candidate.error && direction(reference.rows) !== direction(candidate.rows)) {
  console.error('candidate started from the opposite state — re-running it the other way');
  candidate = await withPage(values.endpoint, values.candidate, metrics,
    ({ evaluate }) => evaluate(trace(values['candidate-toggle'], values['candidate-panel'])));
}

if (reference.error || candidate.error) {
  console.error(`reference: ${reference.error ?? 'ok'}\ncandidate: ${candidate.error ?? 'ok'}`);
  process.exit(1);
}

console.error(`reference   ${reference.duration}ms  ${reference.easing}`);
console.error(`            ${reference.props.join(' | ')}`);
console.error(`candidate   ${candidate.duration}ms  ${candidate.easing}`);
console.error(`            ${candidate.props.join(' | ')}`);

const propsMatch = JSON.stringify(reference.props) === JSON.stringify(candidate.props);
if (!propsMatch) console.error('\n✗ different properties or elements animate');
if (direction(reference.rows) !== direction(candidate.rows)) {
  console.error('\n✗ the two runs moved in opposite directions and a retry did not fix it — the deltas below are not a fidelity measurement.');
  process.exit(1);
}

let worst = 0;
console.error('\n  f      reference w×h @top        candidate w×h @top         Δw     Δh   Δtop');
for (const [index, fraction] of FRACTIONS.entries()) {
  const a = reference.rows[index]; const b = candidate.rows[index];
  const dw = +(b.w - a.w).toFixed(1); const dh = +(b.h - a.h).toFixed(1); const dt = +(b.top - a.top).toFixed(1);
  const delta = Math.max(Math.abs(dw), Math.abs(dh), Math.abs(dt)); worst = Math.max(worst, delta);
  console.error(`  ${String(fraction).padEnd(6)}${String(a.w).padStart(6)}×${String(a.h).padEnd(7)}@${String(a.top).padEnd(8)}`
    + `${String(b.w).padStart(6)}×${String(b.h).padEnd(7)}@${String(b.top).padEnd(8)}`
    + `${String(dw).padStart(6)}${String(dh).padStart(7)}${String(dt).padStart(7)}  ${delta > tolerance ? '✗' : '✓'}`);
}

const canonicalAnimations = (animations) => animations.map((animation) => ({
  target: animation.targetIdentity,
  property: animation.property,
  animationName: animation.animationName,
  duration: Number.isFinite(animation.duration) ? +animation.duration.toFixed(3) : animation.duration,
  // An unknown value stays unknown here too, so two animations with unparseable
  // timing do not both round to 0 and compare equal.
  delay: Number.isFinite(animation.delay) ? +animation.delay.toFixed(3) : animation.delay,
  endDelay: Number.isFinite(animation.endDelay) ? +animation.endDelay.toFixed(3) : animation.endDelay,
  activeDuration: Number.isFinite(animation.activeDuration) ? +animation.activeDuration.toFixed(3) : animation.activeDuration,
  easing: animation.easing,
  iterations: animation.iterations,
  iterationStart: animation.iterationStart,
  direction: animation.direction,
  fill: animation.fill,
  playbackRate: animation.playbackRate,
})).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const timingMatch = Math.abs(reference.duration - candidate.duration) <= 0.01
  && JSON.stringify(canonicalAnimations(reference.animations)) === JSON.stringify(canonicalAnimations(candidate.animations));
const pass = propsMatch && timingMatch && worst <= tolerance;
console.error(`\nworst delta ${worst}px  —  ${pass ? 'PASS' : 'FAIL'}`);
console.log(JSON.stringify({ pass, worst, propsMatch, timingMatch, reference, candidate }));
if (!pass) process.exitCode = 1;
