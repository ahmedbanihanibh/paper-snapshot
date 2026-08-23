/**
 * Tier 4 — motion capture.
 *
 * The static tiers record what a surface looks like at rest and when open. This
 * records how it gets between the two: declared timing and keyframes where the
 * platform exposes them, plus a measured per-frame curve that holds regardless
 * of technique.
 *
 * Declared data is the spec; measured data is the proof. When they disagree the
 * measurement wins, because it is what the user actually sees — and the
 * disagreement is itself the finding (a spring library reporting a bogus
 * `duration`, an interrupted transition, a reduced-motion override).
 */

/** Pull the translate/scale components out of a computed `matrix(...)`. */
function decomposeMatrix(transform) {
  if (!transform || transform === 'none') return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const values = transform.match(/matrix(3d)?\(([^)]+)\)/);
  if (!values) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const parts = values[2].split(',').map(Number);
  if (values[1]) {
    // matrix3d: column-major 4x4.
    return { x: parts[12], y: parts[13], scaleX: Math.hypot(parts[0], parts[1]), scaleY: Math.hypot(parts[4], parts[5]) };
  }
  const [a, b, c, d, e, f] = parts;
  return { x: e, y: f, scaleX: Math.hypot(a, b), scaleY: Math.hypot(c, d) };
}

/** First number in a CSS value, so arbitrary properties can be tracked numerically. */
const firstNumber = (value) => {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

/**
 * Numeric tracks per animated node.
 *
 * Beyond the fixed transform/opacity/rect set, every property the recorder was
 * told to watch — learned from the animation's own keyframes — gets a track too.
 * Without that, an app animating clip-path or filter reports "no numeric
 * change" for an animation that visibly moved.
 */
function tracksOf(samples, id) {
  const track = { t: [], x: [], y: [], scaleX: [], scaleY: [], opacity: [], w: [], h: [] };
  const extra = {};

  for (const sample of samples) {
    const node = sample.nodes?.[id];
    if (!node) continue;
    const matrix = decomposeMatrix(node.transform);
    track.t.push(sample.t);
    track.x.push(matrix.x);
    track.y.push(matrix.y);
    track.scaleX.push(matrix.scaleX);
    track.scaleY.push(matrix.scaleY);
    track.opacity.push(Number(node.opacity));
    track.w.push(node.rect.w);
    track.h.push(node.rect.h);

    for (const [property, value] of Object.entries(node.props ?? {})) {
      if (property === 'transform' || property === 'opacity') continue;
      const numeric = firstNumber(value);
      if (numeric === null) continue;
      (extra[property] ??= []).push(numeric);
    }
  }

  // Only keep extras sampled on every frame, so series stay aligned with `t`.
  for (const [property, series] of Object.entries(extra)) {
    if (series.length === track.t.length) track[property] = series;
  }
  return track;
}

/**
 * Did the value pass its resting point and come back?
 *
 * This is the spring test. A cubic-bezier fit of an overshooting curve is
 * confidently wrong — the shape needs stiffness/damping, not control points.
 */
function overshootOf(series) {
  if (series.length < 4) return 0;
  const start = series[0];
  const end = series[series.length - 1];
  const span = end - start;
  if (Math.abs(span) < 1e-3) return 0;
  const extreme = span > 0 ? Math.max(...series) : Math.min(...series);
  return Math.max(0, (extreme - end) / span);
}

/**
 * When the value starts and stops moving, in recorder time.
 *
 * Duration is the difference, never the settle time alone. Recording has to
 * start before the trigger — a CDP click round-trips through the browser, and a
 * 200ms transition is half spent by the time the call returns — so the recorder
 * clock starts well before any motion does. Reporting settle-from-zero silently
 * adds the click latency to every duration and makes real declared timings look
 * wrong.
 */
function motionWindow(track, series) {
  if (series.length < 3) return { onsetMs: null, settleMs: null, durationMs: null };
  const start = series[0];
  const end = series[series.length - 1];
  const span = Math.abs(end - start);
  if (span < 1e-3) return { onsetMs: null, settleMs: null, durationMs: null };

  let onsetIndex = 0;
  for (let index = 0; index < series.length; index += 1) {
    if (Math.abs(series[index] - start) > span * 0.02) { onsetIndex = Math.max(0, index - 1); break; }
  }

  let settleIndex = series.length - 1;
  for (let index = series.length - 1; index > 0; index -= 1) {
    if (Math.abs(series[index] - end) > span * 0.02) { settleIndex = Math.min(index + 1, series.length - 1); break; }
  }

  const onsetMs = track.t[onsetIndex];
  const settleMs = track.t[settleIndex];
  return { onsetMs, settleMs, durationMs: Math.max(0, settleMs - onsetMs) };
}

/**
 * Spring constants from the shape of the curve.
 *
 * Overshoot ratio gives the damping ratio; the settle time gives the natural
 * frequency. Both are approximations of a second-order response, good enough to
 * hand to Framer Motion and refine by eye — and far better than pretending an
 * overshooting curve is an ease-out.
 */
function fitSpring(overshoot, settleMs) {
  const ratio = Math.min(0.99, Math.max(0.01, overshoot));
  const logDecrement = Math.log(1 / ratio);
  const damping = logDecrement / Math.sqrt(Math.PI ** 2 + logDecrement ** 2);
  const seconds = Math.max(0.05, (settleMs ?? 300) / 1000);
  // 4 time constants ≈ settled.
  const omega = 4 / (damping * seconds);
  const mass = 1;
  return {
    type: 'spring',
    stiffness: Math.round(omega ** 2 * mass),
    damping: Math.round(2 * damping * omega * mass),
    mass,
  };
}

/** Turn one recording into a spec. */
export function analyseRecording(recording, meta = {}) {
  const { declared = [], samples = [] } = recording ?? {};
  const ids = Array.from(new Set(samples.flatMap((sample) => Object.keys(sample.nodes ?? {}))));

  // Sampling resolution bounds how precise any measurement can be; it is part
  // of the result rather than a hidden assumption.
  const intervals = samples.slice(1).map((sample, index) => sample.t - samples[index].t).filter((gap) => gap > 0);
  const frameIntervalMs = intervals.length ? intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)] : 16.7;

  const nodes = ids.map((id) => {
    const track = tracksOf(samples, id);
    const properties = {};

    const keys = Array.from(new Set(['x', 'y', 'scaleX', 'scaleY', 'opacity', 'w', 'h', ...Object.keys(track).filter((k) => k !== 't')]));
    for (const key of keys) {
      const series = track[key];
      if (!series.length) continue;
      const from = series[0];
      const to = series[series.length - 1];
      if (Math.abs(to - from) < (key === 'opacity' ? 0.01 : 0.5)) continue;
      const overshoot = overshootOf(series);
      const window = motionWindow(track, series);
      // `w`/`h` come from getBoundingClientRect, not from the animated property.
      // A rect only moves once the driving value passes the natural content
      // size — animate min-height from 262 to 637 on content that is already
      // 303 tall and the rect sits still for the first third. Reading that as a
      // delay invents a stagger that does not exist, so derived tracks are
      // labelled and excluded from timing inference.
      const derived = key === 'w' || key === 'h';
      properties[key] = {
        source: derived ? 'rect (derived)' : 'css',
        from: +from.toFixed(2),
        to: +to.toFixed(2),
        durationMs: window.durationMs === null ? null : Math.round(window.durationMs),
        onsetMs: window.onsetMs === null ? null : Math.round(window.onsetMs),
        overshoot: +overshoot.toFixed(3),
      };
    }

    // The element's own transition declaration, taken from the first frame.
    const firstFrame = samples.find((sample) => sample.nodes?.[id]?.transition)?.nodes?.[id]?.transition ?? null;
    // `transition-property` is frequently a shorthand — `padding`, `border`,
    // `background` — while measurements arrive as longhands (`padding-top`).
    // Comparing the two directly labels a genuinely driven property as a
    // consequence, and a consequence is written instantly, which destroys the
    // animation. Linear's composer wrapper declares `transition: padding` and
    // animates padding-top/bottom, so this is not a hypothetical.
    const SHORTHANDS = {
      padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
      margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
      inset: ['top', 'right', 'bottom', 'left'],
      border: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
      background: ['background-color', 'background-image', 'background-position', 'background-size'],
      font: ['font-size', 'font-weight', 'font-family'],
    };

    const declaredNames = (firstFrame?.property ?? '')
      .split(',').map((name) => name.trim()).filter((name) => name && name !== 'none');
    const drivenProperties = new Set(declaredNames);
    for (const name of declaredNames) {
      for (const longhand of SHORTHANDS[name] ?? []) drivenProperties.add(longhand);
    }
    for (const [key, value] of Object.entries(properties)) {
      // `w`/`h` are rect observations; map them to the box properties a clone
      // would write so the driven/consequence split is meaningful.
      const cssName = key === 'w' ? 'width' : key === 'h' ? 'height' : key;
      value.driven = drivenProperties.has(cssName) || drivenProperties.has('all');
      value.role = value.driven ? 'driven' : 'consequence';
    }

    /**
     * Which rendered dimension this element's animated constraint controls.
     *
     * Mid-transition, an element whose rendered height equals its own
     * `min-height` is the element the animation drives. If the value merely
     * appears on a descendant, that descendant is being pushed and putting the
     * animation there leaves the real subject offset by the surrounding chrome
     * for the whole transition — endpoints land correctly while the middle is
     * wrong, which is indistinguishable from a bad easing curve.
     */
    const px = (value) => { const n = Number.parseFloat(value); return Number.isFinite(n) ? n : null; };
    const owns = (() => {
      const moving = samples.filter((sample) => sample.nodes?.[id]?.constraints);
      if (moving.length < 3) return null;
      const test = (dimension, constraint) => {
        let matched = 0; let counted = 0;
        for (const sample of moving) {
          const node = sample.nodes[id];
          const limit = px(node.constraints[constraint]);
          const rendered = dimension === 'height' ? node.rect.h : node.rect.w;
          if (limit == null || limit <= 0) continue;
          counted += 1;
          if (Math.abs(limit - rendered) <= 2) matched += 1;
        }
        return counted >= 3 && matched / counted >= 0.5;
      };
      const out = [];
      if (test('height', 'minHeight')) out.push('height ← its own min-height');
      if (test('width', 'maxWidth')) out.push('width ← its own max-width');
      return out.length ? out : null;
    })();

    const declaredHere = declared.filter((entry) => entry.id === id);
    // Prefer real CSS property tracks for timing; fall back to rect only if
    // nothing else was sampled.
    const cssProps = Object.values(properties).filter((p) => p.source === 'css');
    const timingSource = cssProps.length ? cssProps : Object.values(properties);
    const measuredMs = Math.max(0, ...timingSource.map((p) => p.durationMs ?? 0));

    // A stagger is only credible between two CSS-sampled properties. Rect
    // tracks are consequences, not causes.
    const cssOnsets = Object.entries(properties)
      .filter(([, value]) => value.source === 'css' && value.onsetMs != null)
      .map(([key, value]) => [key, value.onsetMs]);
    const stagger = cssOnsets.length > 1
      ? Math.round(Math.max(...cssOnsets.map(([, v]) => v)) - Math.min(...cssOnsets.map(([, v]) => v)))
      : 0;
    const worstOvershoot = Math.max(0, ...Object.values(properties).map((p) => p.overshoot));

    // Declared easing is the source of truth when the platform gives one; the
    // spring fit is only for curves nothing declared.
    const declaredTiming = declaredHere.find((entry) => entry.computedTiming?.duration)?.computedTiming ?? null;
    const fit = worstOvershoot > 0.02
      ? fitSpring(worstOvershoot, measuredMs)
      : (declaredTiming
        ? { type: 'tween', duration: declaredTiming.duration, easing: declaredTiming.easing }
        : { type: 'tween', duration: measuredMs, easing: 'unknown — no declared timing, curve did not overshoot' });

    return {
      id,
      properties,
      declared: declaredHere.map(({ property, animationName, type, computedTiming, keyframes }) => ({
        type, property, animationName, timing: computedTiming, keyframes,
      })),
      measured: { durationMs: measuredMs, overshoot: +worstOvershoot.toFixed(3), frames: track.t.length, staggerMs: stagger },
      transition: firstFrame,
      driven: Array.from(drivenProperties),
      owns,
      fit,
      // Declared timing, when it exists, is exact — it is the value the engine
      // was given. Sampling is not: a 180ms transition observed at ~26ms per
      // frame yields about seven points, and the onset/settle thresholds clip
      // both ends. So declared wins on a non-overshooting curve, and the
      // measurement serves as a sanity check. Only a gross mismatch means
      // something real (an interrupted animation, a reduced-motion override, or
      // a spring library reporting a duration it does not honour).
      agreement: declaredTiming?.duration
        ? (Math.abs(declaredTiming.duration - measuredMs) <= Math.max(2 * frameIntervalMs, declaredTiming.duration * 0.5)
          ? 'declared timing confirmed by measurement'
          : `declared ${Math.round(declaredTiming.duration)}ms vs measured ${Math.round(measuredMs)}ms — investigate; measurement is sampled at ~${Math.round(frameIntervalMs)}ms/frame`)
        : 'nothing declared; measured only — treat duration as approximate',
    };
  }).filter((node) => Object.keys(node.properties).length > 0 || node.declared.length > 0);

  return {
    ...meta,
    nodeCount: nodes.length,
    frames: samples.length,
    frameIntervalMs: +frameIntervalMs.toFixed(1),
    nodes,
    emit: nodes.map((node) => ({ id: node.id, ...emitCode(node) })),
  };
}

/** Ready-to-paste implementations of one node's motion. */
export function emitCode(node) {
  const props = node.properties;
  const TRANSFORM_KEYS = new Set(['x', 'y', 'scaleX', 'scaleY']);
  const RECT_KEYS = new Set(['w', 'h']);

  const transformAt = (edge) => [
    props.x ? `translateX(${props.x[edge]}px)` : null,
    props.y ? `translateY(${props.y[edge]}px)` : null,
    props.scaleX || props.scaleY ? `scale(${(props.scaleX?.[edge] ?? 1).toFixed(3)}, ${(props.scaleY?.[edge] ?? 1).toFixed(3)})` : null,
  ].filter(Boolean).join(' ');

  // Dimensional and arbitrary CSS properties are first-class here. Linear's
  // maximize drives width/max-width/min-height directly and never touches
  // transform, so a transform-and-opacity-only emitter produced empty output for
  // an animation that was fully measured.
  // Only emit transitions for properties the element actually drives. A
  // consequence written directly applies instantly and pre-empts the animation.
  const isDriven = ([, value]) => value.driven !== false;
  const consequences = Object.entries(props).filter(([, value]) => value.driven === false).map(([key]) => key);
  const explicit = Object.entries(props)
    .filter(isDriven)
    .filter(([key]) => !TRANSFORM_KEYS.has(key) && !RECT_KEYS.has(key) && key !== 'opacity');
  const explicitNames = new Set(explicit.map(([key]) => key));
  // rect width/height are only worth emitting when nothing explicit covers them.
  const fromRect = [
    props.w && !explicitNames.has('width') ? ['width', props.w] : null,
    props.h && !explicitNames.has('height') ? ['height', props.h] : null,
  ].filter(Boolean);

  const dimensional = [...explicit, ...fromRect];
  const unit = (key, value) => (key === 'opacity' || key === 'z-index' || key === 'flex-grow' ? `${value}` : `${value}px`);

  const duration = Math.round(node.fit.duration ?? node.measured.durationMs);
  const easing = node.fit.easing && node.fit.easing !== 'linear' ? node.fit.easing : 'ease-out';

  const animatedProperties = [
    transformAt('from') || transformAt('to') ? 'transform' : null,
    props.opacity ? 'opacity' : null,
    ...dimensional.map(([key]) => key),
  ].filter(Boolean);

  const declarations = (edge) => [
    transformAt(edge) ? `  transform: ${transformAt(edge)};` : null,
    props.opacity ? `  opacity: ${props.opacity[edge]};` : null,
    ...dimensional.map(([key, value]) => `  ${key}: ${unit(key, value[edge])};`),
  ].filter(Boolean).join('\n');

  const css = node.fit.type === 'spring'
    ? `/* Overshoots (${node.measured.overshoot}) — a spring, not a bezier.\n   CSS cannot express this faithfully; use the JS variant below. */\n.surface[data-state="closed"] {\n${declarations('from')}\n}\n.surface[data-state="open"] {\n${declarations('to')}\n}`
    : `.surface {\n  transition: ${animatedProperties.map((property) => `${property} ${duration}ms ${easing}`).join(', ')};\n}\n.surface[data-state="closed"] {\n${declarations('from')}\n}\n.surface[data-state="open"] {\n${declarations('to')}\n}`;

  const motionValues = (edge) => ({
    ...(props.x ? { x: props.x[edge] } : {}),
    ...(props.y ? { y: props.y[edge] } : {}),
    ...(props.scaleX ? { scale: props.scaleX[edge] } : {}),
    ...(props.opacity ? { opacity: props.opacity[edge] } : {}),
    ...Object.fromEntries(dimensional.map(([key, value]) => [
      key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
      key === 'opacity' ? value[edge] : value[edge],
    ])),
  });

  const framerMotion = {
    initial: motionValues('from'),
    animate: motionValues('to'),
    transition: node.fit.type === 'spring'
      ? { type: 'spring', stiffness: node.fit.stiffness, damping: node.fit.damping, mass: node.fit.mass }
      : { duration: duration / 1000, ease: easing },
  };

  // Per-property timings that differ materially are part of the design, not
  // noise: Linear's maximize finishes height in ~171ms while width runs the full
  // ~284ms, and collapsing that to one duration loses the feel.
  const perProperty = Object.entries(props)
    .filter(([, value]) => value.durationMs != null)
    .map(([key, value]) => ({ property: key, durationMs: value.durationMs }));
  const spread = perProperty.length
    ? Math.max(...perProperty.map((p) => p.durationMs)) - Math.min(...perProperty.map((p) => p.durationMs))
    : 0;

  const notes = [];
  if (consequences.length) {
    notes.push(`Observed but NOT animated by this element: ${consequences.join(', ')}. These follow from layout — write them instantly (or not at all). Driving a consequence applies it on the first frame and destroys the animation.`);
  }
  if (props.w || props.h) {
    notes.push('Size changes during this animation: it is a layout transition. Animate the dimensional properties directly (as emitted), or use a layout-animation primitive — transform alone will not reproduce it.');
  }
  if (spread > 60) {
    notes.push(`Properties do not finish together (${spread}ms spread): ${perProperty.map((p) => `${p.property} ${p.durationMs}ms`).join(', ')}. Emitting one duration for all of them changes the feel.`);
  }

  return { css, framerMotion, perProperty, note: notes.join(' ') || null };
}

/**
 * Record the motion produced by one interaction.
 *
 * The recorder is installed before the trigger because a CDP click round-trips
 * through the browser; by the time it returns, a 200ms transition has already
 * spent its most informative frames.
 */
export async function captureAnimation(driver, { triggerId, keys, maxMs = 2000, settleFirst = true } = {}) {
  if (settleFirst) await driver.settle(120, 1500);

  await driver.startAnimationRecorder(maxMs);

  if (keys) await driver.page.keyboard.press(keys);
  else if (triggerId) {
    if (!await driver.clickById(triggerId)) throw new Error(`No element with spec id ${triggerId}.`);
  } else throw new Error('captureAnimation needs a triggerId or keys.');

  const recording = await driver.readAnimationRecorder(maxMs);
  return analyseRecording(recording, { trigger: triggerId ?? keys, via: keys ? 'press' : 'click' });
}
