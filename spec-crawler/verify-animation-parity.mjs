#!/usr/bin/env node
/**
 * Compare an implementation's transition against the live original, frame for frame.
 *
 *   node verify-animation-parity.mjs \
 *     --reference linear.app --reference-toggle '[aria-label="Expand"]' \
 *     --reference-panel '[role=dialog] > div > div' \
 *     --candidate localhost:5178 --candidate-toggle '[data-part="toggle"]' \
 *     --candidate-panel '[data-part="panel"]'
 *
 * Matching endpoints and a matching easing string do not prove matching motion —
 * the same curve applied to the wrong property, or to the wrong element, lands
 * correctly at both ends and diverges in the middle. This freezes both
 * transitions and seeks each to the same progress fractions, so the comparison
 * is of position and size at identical points along the curve.
 *
 * It talks raw CDP rather than going through Playwright: connectOverCDP
 * enumerates every target in the browser and blocks if any one of them is
 * unresponsive, which a single wedged tab is enough to cause.
 */

import { parseArgs } from 'node:util';

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

for (const key of ['reference', 'reference-toggle', 'reference-panel',
  'candidate', 'candidate-toggle', 'candidate-panel']) {
  if (!values[key]) throw new Error(`--${key} is required`);
}

const FRACTIONS = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];

async function withPage(endpoint, match, { width, height }, fn) {
  const list = await (await fetch(`${endpoint}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && t.url.includes(match));
  if (!target) throw new Error(`No page matching ${match}`);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error(`Could not open a CDP socket to ${match}`));
  });

  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} timed out`)); }
    }, 40000);
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw');
    return result.result.value;
  };

  // requestAnimationFrame does not fire in a background tab, so a seek loop that
  // waits on it never resolves and reads as a hung browser.
  await call('Page.bringToFront').catch(() => {});
  // Both pages may size themselves in viewport units, in which case unequal
  // window heights alone make the two curves disagree.
  await call('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false }).catch(() => {});
  // Let that reflow land. Triggering a transition on the same frame captures its
  // start value from the pre-resize layout — a position offset that decays to
  // zero, which looks exactly like an easing mismatch.
  await new Promise((resolve) => { setTimeout(resolve, 600); });

  try { return await fn({ evaluate, call }); } finally { socket.close(); }
}

const trace = (toggleSel, panelSel) => `(async () => {
  const panel = document.querySelector(${JSON.stringify(panelSel)});
  const toggle = document.querySelector(${JSON.stringify(toggleSel)});
  if (!panel) return { error: 'panel selector matched nothing' };
  if (!toggle) return { error: 'toggle selector matched nothing' };

  // Go animation-quiet first: starting while a previous transition is still
  // finishing captures that one as "fresh" and reports a trajectory running in
  // the wrong direction entirely.
  for (let i = 0; i < 60 && document.getAnimations().some(a => a.playState === 'running'); i += 1) {
    await new Promise(r => setTimeout(r, 50));
  }

  const before = new Set(document.getAnimations());
  toggle.click();
  await new Promise(r => requestAnimationFrame(r));
  const fresh = document.getAnimations().filter(a => !before.has(a));
  if (!fresh.length) return { error: 'the toggle started no animation' };

  fresh.forEach(a => a.pause());
  const duration = Math.max(...fresh.map(a => a.effect.getComputedTiming().activeDuration));
  const rows = [];
  for (const f of ${JSON.stringify(FRACTIONS)}) {
    fresh.forEach(a => { a.currentTime = duration * f; });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const b = panel.getBoundingClientRect();
    rows.push({ f, w: +b.width.toFixed(1), h: +b.height.toFixed(1), top: +b.y.toFixed(1) });
  }
  fresh.forEach(a => a.play());

  return { duration, rows,
    easing: fresh[0].effect.getComputedTiming().easing,
    props: fresh.map(a => (a.effect.target.tagName || '?').toLowerCase() + ':' + (a.transitionProperty || '?')).sort() };
})()`;

const metrics = { width: Number(values.width), height: Number(values.height) };
const direction = (rows) => Math.sign(rows.at(-1).w - rows[0].w) || Math.sign(rows.at(-1).h - rows[0].h);

const reference = await withPage(values.endpoint, values.reference, metrics,
  ({ evaluate }) => evaluate(trace(values['reference-toggle'], values['reference-panel'])));

// The candidate toggles whatever state it is in, and each run leaves it flipped,
// so consecutive invocations alternate direction. Rather than require the caller
// to reset it, run again when the directions disagree: the second run
// necessarily starts from the opposite state.
let candidate = await withPage(values.endpoint, values.candidate, metrics,
  ({ evaluate }) => evaluate(trace(values['candidate-toggle'], values['candidate-panel'])));
if (!reference.error && !candidate.error
  && direction(reference.rows) !== direction(candidate.rows)) {
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

// Which properties animate on which elements is the finding that endpoint
// comparison cannot produce, so it is reported whether or not it matches.
const propsMatch = JSON.stringify(reference.props) === JSON.stringify(candidate.props);
if (!propsMatch) console.error('\n✗ different properties or elements animate');

// Each side toggles whatever state it happens to be in, so one can expand while
// the other collapses. Every per-frame delta is then enormous and meaningless,
// and the obvious reading — "the motion is completely wrong" — is not the bug.
if (direction(reference.rows) !== direction(candidate.rows)) {
  console.error('\n✗ the two runs moved in opposite directions and a retry did not fix it — '
    + 'the deltas below are not a fidelity measurement.');
  process.exit(1);
}

const tolerance = Number(values.tolerance);
let worst = 0;
console.error('\n  f      reference w×h @top        candidate w×h @top         Δw     Δh   Δtop');
for (const [index, f] of FRACTIONS.entries()) {
  const a = reference.rows[index];
  const b = candidate.rows[index];
  const dw = +(b.w - a.w).toFixed(1);
  const dh = +(b.h - a.h).toFixed(1);
  const dt = +(b.top - a.top).toFixed(1);
  const delta = Math.max(Math.abs(dw), Math.abs(dh), Math.abs(dt));
  worst = Math.max(worst, delta);
  console.error(`  ${String(f).padEnd(6)}${String(a.w).padStart(6)}×${String(a.h).padEnd(7)}@${String(a.top).padEnd(8)}`
    + `${String(b.w).padStart(6)}×${String(b.h).padEnd(7)}@${String(b.top).padEnd(8)}`
    + `${String(dw).padStart(6)}${String(dh).padStart(7)}${String(dt).padStart(7)}  ${delta > tolerance ? '✗' : '✓'}`);
}

const pass = propsMatch && worst <= tolerance
  && reference.duration === candidate.duration && reference.easing === candidate.easing;
console.error(`\nworst delta ${worst}px  —  ${pass ? 'PASS' : 'FAIL'}`);
console.log(JSON.stringify({ pass, worst, propsMatch, reference, candidate }));
if (!pass) process.exitCode = 1;
