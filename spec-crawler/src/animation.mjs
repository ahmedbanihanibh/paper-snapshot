/**
 * Tier 4 — motion capture and typed CSS motion analysis.
 *
 * The public result shape is intentionally additive. Numeric `from`/`to`,
 * `properties`, `fit`, `transition`, `owns`, and emitted CSS/Framer Motion stay
 * available to old consumers; exact CSS endpoints and interpolation metadata are
 * carried beside them so a replay never invents units or corrupts compound CSS.
 */

const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const DIMENSION_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]+)$/i;
const LENGTH_UNITS = new Set(['px', 'em', 'rem', '%', 'vw', 'vh', 'vmin', 'vmax', 'svw', 'svh', 'lvw', 'lvh', 'dvw', 'dvh', 'cm', 'mm', 'q', 'in', 'pt', 'pc', 'ch', 'ex', 'cap', 'ic', 'lh', 'rlh']);
const ANGLE_UNITS = new Set(['deg', 'grad', 'rad', 'turn']);
const TIME_UNITS = new Set(['ms', 's']);
const COLOR_KEYWORDS = new Set(['transparent', 'currentcolor', 'black', 'silver', 'gray', 'grey', 'white', 'maroon', 'red', 'purple', 'fuchsia', 'green', 'lime', 'olive', 'yellow', 'navy', 'blue', 'teal', 'aqua']);
const DISCRETE_KEYWORDS = new Set(['none', 'auto', 'normal', 'initial', 'inherit', 'unset', 'revert', 'revert-layer', 'block', 'inline', 'inline-block', 'flex', 'grid', 'hidden', 'visible']);
const FILTER_FUNCTIONS = new Set(['blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale', 'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia']);
const CLIP_FUNCTIONS = new Set(['inset', 'circle']);

const cleanCss = (value) => String(value ?? '').trim();
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const formatNumber = (value) => Number.isFinite(Number(value)) ? String(round(Number(value), 4)) : String(value);

function isColor(value) {
  const lower = value.toLowerCase();
  if (COLOR_KEYWORDS.has(lower) || /^#[\da-f]{3,8}$/i.test(value)) return true;
  const match = value.match(/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\((.*)\)$/i);
  if (!match || !match[2].trim() || /[;{}]/.test(match[2])) return false;
  const functionName = match[1].toLowerCase();
  const body = match[2];
  if (functionName === 'rgb' || functionName === 'rgba') return /^[\d\s.,+\-/%e]+$/i.test(body);
  if (functionName === 'hsl' || functionName === 'hsla' || functionName === 'hwb') return /^[\d\s.,+\-/%e]*(?:deg|grad|rad|turn)?[\d\s.,+\-/%e]*$/i.test(body);
  if (['lab', 'lch', 'oklab', 'oklch'].includes(functionName)) return /^[\d\s.,+\-/%e]*(?:deg|grad|rad|turn|none)?[\d\s.,+\-/%e]*$/i.test(body);
  // color()/color-mix() include a color-space identifier and potentially named
  // colors; keep their grammar conservative and reject structural delimiters.
  return /^[\w\s.,+\-/%#]+$/i.test(body);
}

function scalar(value) {
  if (NUMBER_RE.test(value)) return { numeric: Number(value), unit: '', scalarKind: 'number' };
  const match = value.match(DIMENSION_RE);
  if (!match) return null;
  const unit = match[2].toLowerCase();
  if (LENGTH_UNITS.has(unit)) return { numeric: Number(match[1]), unit, scalarKind: 'length' };
  if (ANGLE_UNITS.has(unit)) return { numeric: Number(match[1]), unit, scalarKind: 'angle' };
  if (TIME_UNITS.has(unit)) return { numeric: Number(match[1]), unit, scalarKind: 'time' };
  return null;
}

/** Parse a CSS value without projecting a compound value onto its first number. */
export function parseMotionValue(property, input) {
  const css = cleanCss(input);
  const lowerProperty = String(property ?? '').toLowerCase();
  if (!css) return { kind: 'unsupported', interpolation: 'unsupported', css, emittable: false, reason: 'empty CSS value' };

  // Registration metadata is not exposed by getComputedStyle. A scalar-looking
  // unregistered custom property is still discrete, so mark it as a candidate;
  // the series analyser upgrades it only when sampled intermediate values prove
  // continuous interpolation.
  if (lowerProperty.startsWith('--')) {
    const customScalar = scalar(css);
    if (customScalar) return {
      kind: 'custom-property', syntaxKind: customScalar.scalarKind,
      interpolation: 'numeric-candidate', numeric: customScalar.numeric, unit: customScalar.unit,
      css, emittable: true,
    };
    if (isColor(css)) return { kind: 'custom-property', syntaxKind: 'color', interpolation: 'discrete', css, emittable: true };
  }

  if (isColor(css)) return { kind: 'color', interpolation: 'color', css, emittable: true };

  const parsedScalar = scalar(css);
  if (parsedScalar) {
    return {
      kind: parsedScalar.scalarKind,
      interpolation: 'numeric',
      numeric: parsedScalar.numeric,
      unit: parsedScalar.unit,
      css,
      emittable: true,
    };
  }

  const functionMatch = css.match(/^([a-z-]+)\(\s*([^()]*)\s*\)$/i);
  if (functionMatch) {
    const functionName = functionMatch[1].toLowerCase();
    const argument = functionMatch[2].trim();
    const argumentScalar = scalar(argument);

    if (lowerProperty === 'filter' || lowerProperty === 'backdrop-filter') {
      const zero = argumentScalar?.numeric === 0 && argumentScalar?.unit === '';
      const validArgument = functionName === 'blur'
        ? argumentScalar && (argumentScalar.scalarKind === 'length' && argumentScalar.unit !== '%' || zero)
        : functionName === 'hue-rotate'
          ? argumentScalar && (argumentScalar.scalarKind === 'angle' || zero)
          : argumentScalar && (argumentScalar.scalarKind === 'number' || argumentScalar.unit === '%');
      if (!FILTER_FUNCTIONS.has(functionName) || functionName === 'drop-shadow' || !validArgument) {
        return { kind: 'unsupported', interpolation: 'unsupported', css, emittable: false, reason: 'only one grammar-valid scalar filter function is supported' };
      }
      return {
        kind: 'filter', interpolation: 'numeric', numeric: argumentScalar.numeric, unit: argumentScalar.unit,
        css, emittable: true, functionName, prefix: `${functionName}(`, suffix: ')', scalarKind: argumentScalar.scalarKind,
      };
    }

    if (lowerProperty === 'clip-path') {
      const validArgument = argumentScalar && (argumentScalar.scalarKind === 'length' || (argumentScalar.scalarKind === 'number' && argumentScalar.numeric === 0));
      if (!CLIP_FUNCTIONS.has(functionName) || !validArgument) {
        return { kind: 'unsupported', interpolation: 'unsupported', css, emittable: false, reason: 'only one length/percentage scalar inset() or circle() clip path is supported' };
      }
      return {
        kind: 'clip-path', interpolation: 'numeric', numeric: argumentScalar.numeric, unit: argumentScalar.unit,
        css, emittable: true, functionName, prefix: `${functionName}(`, suffix: ')', scalarKind: argumentScalar.scalarKind,
      };
    }

    // Functions outside the deliberately supported set are preserved as raw
    // evidence. They are valid CSS, but claiming scalar interpolation would be a
    // repeat of the first-number bug.
    return { kind: 'raw', interpolation: 'discrete', css, emittable: true, reason: 'compound function preserved verbatim' };
  }

  if (DISCRETE_KEYWORDS.has(css.toLowerCase())) {
    return { kind: 'discrete', interpolation: 'discrete', css, emittable: true };
  }

  if (/['"]/.test(css) || /\s/.test(css) || css.includes(',')) {
    // Multi-function filter/clip-path values need a component parser before they
    // can be replayed as motion. Keep the evidence, but do not emit a misleading
    // transition from one arbitrary scalar.
    if (lowerProperty === 'filter' || lowerProperty === 'backdrop-filter' || lowerProperty === 'clip-path') {
      return { kind: 'unsupported', interpolation: 'unsupported', css, emittable: false, reason: 'compound value has multiple components' };
    }
    return { kind: 'raw', interpolation: 'discrete', css, emittable: true, reason: 'quoted or compound value preserved verbatim' };
  }

  if (lowerProperty.startsWith('--')) {
    return { kind: 'raw', interpolation: 'discrete', css, emittable: true, reason: 'unregistered custom property syntax' };
  }

  return { kind: 'unsupported', interpolation: 'unsupported', css, emittable: false, reason: 'unrecognised CSS value syntax' };
}

/** Serialize a parsed value, optionally after replacing its scalar. */
export function serializeMotionValue(value) {
  if (!value) return '';
  if (value.interpolation !== 'numeric' || value.numeric == null) return value.css;
  const body = `${formatNumber(value.numeric)}${value.unit ?? ''}`;
  return value.prefix ? `${value.prefix}${body}${value.suffix ?? ''}` : body;
}

/** Pull translate/scale components out of a computed matrix. */
function decomposeMatrix(transform) {
  if (!transform || transform === 'none') return { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };
  const values = transform.match(/matrix(3d)?\(([^)]+)\)/);
  if (!values) return { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };
  const parts = values[2].split(',').map(Number);
  if (values[1]) return {
    x: parts[12], y: parts[13], rotate: Math.atan2(parts[1], parts[0]) * 180 / Math.PI,
    scaleX: Math.hypot(parts[0], parts[1]), scaleY: Math.hypot(parts[4], parts[5]),
  };
  const [a, b, c, d, e, f] = parts;
  return { x: e, y: f, rotate: Math.atan2(b, a) * 180 / Math.PI, scaleX: Math.hypot(a, b), scaleY: Math.hypot(c, d) };
}

function compatibleTypedSeries(property, cssValues) {
  const parsed = cssValues.map((value) => parseMotionValue(property, value));
  const first = parsed[0];
  const numeric = first?.interpolation === 'numeric'
    && parsed.every((value) => value.interpolation === 'numeric'
      && value.kind === first.kind && value.unit === first.unit
      && value.prefix === first.prefix && value.suffix === first.suffix);
  if (numeric) return { parsed, kind: first.kind, interpolation: 'numeric', emittable: true, unit: first.unit ?? '', values: parsed.map((value) => value.numeric) };

  const customNumericCandidate = first?.interpolation === 'numeric-candidate'
    && parsed.every((value) => value.interpolation === 'numeric-candidate'
      && value.kind === 'custom-property' && value.syntaxKind === first.syntaxKind && value.unit === first.unit);
  if (customNumericCandidate) {
    const values = parsed.map((value) => value.numeric);
    const distinct = new Set(values.map((value) => formatNumber(value))).size;
    const continuouslyObserved = distinct >= 3;
    return {
      parsed, kind: 'custom-property', syntaxKind: first.syntaxKind,
      interpolation: continuouslyObserved ? 'numeric' : 'discrete',
      emittable: true, unit: first.unit ?? '',
      values: continuouslyObserved ? values : cssValues,
      reason: continuouslyObserved ? 'continuous interpolation observed in sampled frames' : 'registration unproven; treated as discrete',
    };
  }

  const allColor = parsed.every((value) => value.kind === 'color');
  if (allColor) return { parsed, kind: 'color', interpolation: 'color', emittable: true, unit: null, values: cssValues };

  const unsupported = parsed.some((value) => value.interpolation === 'unsupported')
    || new Set(parsed.map((value) => value.kind)).size > 1;
  return {
    parsed,
    kind: unsupported ? 'unsupported' : first.kind,
    interpolation: unsupported ? 'unsupported' : 'discrete',
    emittable: !unsupported && parsed.every((value) => value.emittable),
    unit: null,
    values: cssValues,
    reason: parsed.find((value) => value.reason)?.reason ?? (unsupported ? 'incompatible value types across frames' : null),
  };
}

function tracksOf(samples, id) {
  const track = { t: [], x: [], y: [], rotate: [], scaleX: [], scaleY: [], opacity: [], w: [], h: [] };
  const cssSeries = {};

  for (const sample of samples) {
    const node = sample.nodes?.[id];
    if (!node) continue;
    const matrix = decomposeMatrix(node.transform);
    track.t.push(sample.t);
    track.x.push(matrix.x); track.y.push(matrix.y); track.rotate.push(matrix.rotate);
    track.scaleX.push(matrix.scaleX); track.scaleY.push(matrix.scaleY);
    track.opacity.push(Number(node.opacity));
    track.w.push(node.rect?.w ?? 0); track.h.push(node.rect?.h ?? 0);
    for (const [property, value] of Object.entries(node.props ?? {})) {
      if (property === 'transform' || property === 'opacity') continue;
      (cssSeries[property] ??= []).push(cleanCss(value));
    }
  }

  const typed = {};
  for (const [property, values] of Object.entries(cssSeries)) {
    if (values.length === track.t.length) typed[property] = compatibleTypedSeries(property, values);
  }
  return { track, typed };
}

function overshootOf(series) {
  if (series.length < 4) return 0;
  const start = series[0]; const end = series.at(-1); const span = end - start;
  if (Math.abs(span) < 1e-3) return 0;
  const extreme = span > 0 ? Math.max(...series) : Math.min(...series);
  return Math.max(0, (extreme - end) / span);
}

function motionWindow(track, series) {
  if (series.length < 3) return { onsetMs: null, settleMs: null, durationMs: null };
  const start = series[0]; const end = series.at(-1); const span = Math.abs(end - start);
  if (span < 1e-3) return { onsetMs: null, settleMs: null, durationMs: null };
  let onsetIndex = 0;
  for (let index = 0; index < series.length; index += 1) {
    if (Math.abs(series[index] - start) > span * 0.02) { onsetIndex = Math.max(0, index - 1); break; }
  }
  let settleIndex = series.length - 1;
  for (let index = series.length - 1; index > 0; index -= 1) {
    if (Math.abs(series[index] - end) > span * 0.02) { settleIndex = Math.min(index + 1, series.length - 1); break; }
  }
  const onsetMs = track.t[onsetIndex]; const settleMs = track.t[settleIndex];
  return { onsetMs, settleMs, durationMs: Math.max(0, settleMs - onsetMs) };
}

function discreteWindow(track, values) {
  if (values.length < 2 || values.every((value) => value === values[0])) return { onsetMs: null, settleMs: null, durationMs: null };
  let onsetIndex = values.findIndex((value) => value !== values[0]);
  onsetIndex = Math.max(0, onsetIndex - 1);
  let settleIndex = values.length - 1;
  for (let index = values.length - 2; index >= 0; index -= 1) {
    if (values[index] !== values.at(-1)) { settleIndex = Math.min(values.length - 1, index + 1); break; }
  }
  return { onsetMs: track.t[onsetIndex], settleMs: track.t[settleIndex], durationMs: Math.max(0, track.t[settleIndex] - track.t[onsetIndex]) };
}

function fitSpring(overshoot, settleMs) {
  const ratio = Math.min(0.99, Math.max(0.01, overshoot));
  const logDecrement = Math.log(1 / ratio);
  const damping = logDecrement / Math.sqrt(Math.PI ** 2 + logDecrement ** 2);
  const seconds = Math.max(0.05, (settleMs ?? 300) / 1000);
  const omega = 4 / (damping * seconds);
  return { type: 'spring', stiffness: Math.round(omega ** 2), damping: Math.round(2 * damping * omega), mass: 1 };
}

function splitCssList(value) {
  const out = []; let current = ''; let depth = 0;
  for (const char of String(value ?? '')) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) { out.push(current.trim()); current = ''; } else current += char;
  }
  if (current.trim() || !out.length) out.push(current.trim());
  return out;
}

function cssTimeToMs(value) {
  const match = cleanCss(value).match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(ms|s)$/i);
  if (!match) return null;
  return Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1);
}

const SHORTHANDS = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  border: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  background: ['background-color', 'background-image', 'background-position', 'background-size'],
  font: ['font-size', 'font-weight', 'font-family'],
};

function transitionTiming(transition, property) {
  if (!transition) return null;
  const properties = splitCssList(transition.property).filter(Boolean);
  if (!properties.length || properties.every((value) => value === 'none')) return null;
  const durations = splitCssList(transition.duration);
  const easings = splitCssList(transition.easing);
  const delays = splitCssList(transition.delay);
  const cssProperty = ['x', 'y', 'scaleX', 'scaleY'].includes(property) ? 'transform' : property;
  let index = -1;
  for (let candidate = 0; candidate < properties.length; candidate += 1) {
    const name = properties[candidate];
    if (name === cssProperty || name === 'all' || (SHORTHANDS[name] ?? []).includes(cssProperty)) index = candidate;
  }
  if (index < 0) return null;
  return {
    property: properties[index],
    durationMs: cssTimeToMs(durations[index % Math.max(1, durations.length)]) ?? null,
    easing: easings[index % Math.max(1, easings.length)] || null,
    delayMs: cssTimeToMs(delays[index % Math.max(1, delays.length)]) ?? 0,
  };
}

function animationIdentity(entry) {
  return entry?.animationId ?? [entry?.id ?? '?', entry?.type ?? '?', entry?.property ?? '', entry?.animationName ?? ''].join('|');
}

/**
 * Restrict a recorder payload to animations causally allowed by the caller.
 * Entries that cannot be selected are retained in `selection.excluded` with a
 * reason, while the legacy `declared` and `samples` arrays remain readable.
 */
export function scopeRecording(recording, {
  beforeAnimationIds = [],
  allowedNodeIds = [],
  subjectNodeIds = [],
  relatedNodeIds = [],
  allowedSelectors = [],
  subjectSelectors = [],
  relatedSelectors = [],
} = {}) {
  const source = recording ?? { declared: [], samples: [] };
  const before = new Set(beforeAnimationIds);
  const allowedIds = new Set([...allowedNodeIds, ...subjectNodeIds, ...relatedNodeIds].filter(Boolean));
  const selectors = new Set([...allowedSelectors, ...subjectSelectors, ...relatedSelectors].filter(Boolean));
  const constrained = allowedIds.size > 0 || selectors.size > 0;
  const included = []; const excluded = [];

  for (const entry of source.declared ?? []) {
    const animationId = animationIdentity(entry);
    const descriptor = { animationId, nodeId: entry.id ?? null, property: entry.property ?? null };
    if (before.has(animationId)) excluded.push({ ...descriptor, reason: 'present before interaction' });
    else if (constrained && !allowedIds.has(entry.id) && !selectors.has(entry.selector)) excluded.push({ ...descriptor, reason: 'unrelated target' });
    else included.push({ ...descriptor, reason: constrained ? 'allowed causal target' : 'fresh animation' });
  }

  // Old synthetic recordings can contain samples without declarations. With no
  // causal constraints, preserve them exactly rather than erasing legacy data.
  const includedIds = new Set(included.map((entry) => entry.nodeId).filter(Boolean));
  const keepAllSamples = !constrained && !(source.declared ?? []).length;
  const declared = (source.declared ?? []).filter((entry) => included.some((item) => item.animationId === animationIdentity(entry)));
  const samples = (source.samples ?? []).map((sample) => ({
    ...sample,
    nodes: keepAllSamples ? { ...(sample.nodes ?? {}) } : Object.fromEntries(Object.entries(sample.nodes ?? {}).filter(([id]) => includedIds.has(id))),
  }));

  return { ...source, declared, samples, selection: { included, excluded, constrained } };
}

/** Turn one recording into a typed, backwards-compatible motion spec. */
export function analyseRecording(recording, meta = {}) {
  const { declared = [], samples = [], selection = null } = recording ?? {};
  const ids = Array.from(new Set(samples.flatMap((sample) => Object.keys(sample.nodes ?? {}))));
  const intervals = samples.slice(1).map((sample, index) => sample.t - samples[index].t).filter((gap) => gap > 0).sort((a, b) => a - b);
  const frameIntervalMs = intervals.length ? intervals[Math.floor(intervals.length / 2)] : 16.7;

  const nodes = ids.map((id) => {
    const { track, typed } = tracksOf(samples, id);
    const properties = {};
    const base = {
      x: { series: track.x, valueType: 'length', unit: 'px', cssProperty: 'transform' },
      y: { series: track.y, valueType: 'length', unit: 'px', cssProperty: 'transform' },
      rotate: { series: track.rotate, valueType: 'angle', unit: 'deg', cssProperty: 'transform' },
      scaleX: { series: track.scaleX, valueType: 'number', unit: '', cssProperty: 'transform' },
      scaleY: { series: track.scaleY, valueType: 'number', unit: '', cssProperty: 'transform' },
      opacity: { series: track.opacity, valueType: 'number', unit: '', cssProperty: 'opacity' },
      w: { series: track.w, valueType: 'length', unit: 'px', cssProperty: 'width', derived: true },
      h: { series: track.h, valueType: 'length', unit: 'px', cssProperty: 'height', derived: true },
    };

    for (const [key, info] of Object.entries(base)) {
      const series = info.series;
      if (!series.length || series.some((value) => !Number.isFinite(value))) continue;
      const from = series[0]; const to = series.at(-1);
      const threshold = key === 'opacity' || key.startsWith('scale') ? 0.005 : 0.5;
      if (Math.abs(to - from) < threshold && overshootOf(series) < 0.02) continue;
      const window = motionWindow(track, series);
      properties[key] = {
        source: info.derived ? 'rect (derived)' : 'css',
        from: round(from, 2), to: round(to, 2),
        fromCss: `${round(from, 2)}${info.unit}`, toCss: `${round(to, 2)}${info.unit}`,
        valueType: info.valueType, interpolation: 'numeric', unit: info.unit, emittable: true, cssProperty: info.cssProperty,
        durationMs: window.durationMs == null ? null : Math.round(window.durationMs),
        onsetMs: window.onsetMs == null ? null : Math.round(window.onsetMs),
        overshoot: round(overshootOf(series), 3),
      };
    }

    for (const [property, info] of Object.entries(typed)) {
      const cssValues = info.parsed.map((value) => value.css);
      const changed = cssValues.some((value) => value !== cssValues[0]);
      if (!changed) continue;
      const numeric = info.interpolation === 'numeric';
      const window = numeric ? motionWindow(track, info.values) : discreteWindow(track, cssValues);
      const fromParsed = info.parsed[0]; const toParsed = info.parsed.at(-1);
      properties[property] = {
        source: 'css',
        from: numeric ? round(info.values[0], 4) : fromParsed.css,
        to: numeric ? round(info.values.at(-1), 4) : toParsed.css,
        fromCss: fromParsed.css, toCss: toParsed.css,
        valueType: info.kind, interpolation: info.interpolation, unit: info.unit,
        emittable: info.emittable, reason: info.reason ?? null,
        durationMs: window.durationMs == null ? null : Math.round(window.durationMs),
        onsetMs: window.onsetMs == null ? null : Math.round(window.onsetMs),
        overshoot: numeric ? round(overshootOf(info.values), 3) : 0,
        serialization: numeric && fromParsed.prefix ? { prefix: fromParsed.prefix, suffix: fromParsed.suffix ?? '' } : null,
      };
    }

    const declaredHere = declared.filter((entry) => entry.id === id);
    const firstFrame = samples.find((sample) => sample.nodes?.[id]?.transition)?.nodes?.[id]?.transition ?? null;
    const fallbackDeclaredNames = splitCssList(firstFrame?.property).filter((name) => name && name !== 'none');
    const effectDrivenNames = new Set();
    const toKebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    for (const entry of declaredHere) {
      if (entry.type === 'CSSTransition' && entry.property) effectDrivenNames.add(entry.property);
      for (const keyframe of entry.keyframes ?? []) {
        for (const key of Object.keys(keyframe)) {
          if (!['composite', 'computedOffset', 'easing', 'offset'].includes(key)) effectDrivenNames.add(toKebab(key));
        }
      }
    }
    // `transition-property` on the element is itself an authored declaration: a
    // property named there is driven whether or not a matching CSSTransition was
    // still running when the recorder sampled `getAnimations()`. Recording one
    // animation per property is racy — a short colour fade routinely finishes
    // before a longer size transition is enumerated — and treating the ones that
    // finished first as layout consequences silently drops them from the emitted
    // code. Effects and the shorthand are therefore unioned, not preferred.
    const authoredNames = new Set(fallbackDeclaredNames);
    const declaredNames = [...new Set([...effectDrivenNames, ...fallbackDeclaredNames])];
    const drivenProperties = new Set(declaredNames);
    for (const name of declaredNames) for (const longhand of SHORTHANDS[name] ?? []) drivenProperties.add(longhand);

    for (const [key, value] of Object.entries(properties)) {
      const cssName = value.cssProperty ?? (key === 'w' ? 'width' : key === 'h' ? 'height' : key);
      value.driven = drivenProperties.has(cssName) || drivenProperties.has('all');
      value.role = value.driven ? 'driven' : 'consequence';
      const hasMatchingTransition = declaredHere.some((entry) => entry.type === 'CSSTransition'
        && (entry.property === cssName || entry.property === 'all' || (SHORTHANDS[entry.property] ?? []).includes(cssName)));
      const authored = authoredNames.has(cssName) || authoredNames.has('all')
        || [...authoredNames].some((name) => (SHORTHANDS[name] ?? []).includes(cssName));
      value.timing = !declaredHere.length || hasMatchingTransition || authored
        ? transitionTiming(firstFrame, key)
        : null;
    }

    const px = (value) => { const number = Number.parseFloat(value); return Number.isFinite(number) ? number : null; };
    const owns = (() => {
      const moving = samples.filter((sample) => sample.nodes?.[id]?.constraints);
      if (moving.length < 3) return null;
      const test = (dimension, constraint) => {
        let matched = 0; let counted = 0;
        for (const sample of moving) {
          const node = sample.nodes[id]; const limit = px(node.constraints[constraint]);
          const rendered = dimension === 'height' ? node.rect.h : node.rect.w;
          if (limit == null || limit <= 0) continue;
          counted += 1; if (Math.abs(limit - rendered) <= 2) matched += 1;
        }
        return counted >= 3 && matched / counted >= 0.5;
      };
      const out = [];
      if (test('height', 'minHeight')) out.push('height ← its own min-height');
      if (test('width', 'maxWidth')) out.push('width ← its own max-width');
      return out.length ? out : null;
    })();

    const cssProps = Object.values(properties).filter((property) => property.source === 'css');
    const timingSource = cssProps.length ? cssProps : Object.values(properties);
    const measuredMs = Math.max(0, ...timingSource.map((property) => property.durationMs ?? 0));
    const cssOnsets = Object.entries(properties).filter(([, value]) => value.source === 'css' && value.onsetMs != null).map(([key, value]) => [key, value.onsetMs]);
    const stagger = cssOnsets.length > 1 ? Math.round(Math.max(...cssOnsets.map(([, value]) => value)) - Math.min(...cssOnsets.map(([, value]) => value))) : 0;
    const worstOvershoot = Math.max(0, ...Object.values(properties).map((property) => property.overshoot ?? 0));
    const declaredEntry = declaredHere.find((entry) => entry.computedTiming?.duration != null) ?? null;
    const declaredTiming = declaredEntry?.computedTiming ?? null;
    const direction = declaredEntry?.timing?.direction ?? 'normal';
    const fit = worstOvershoot > 0.02
      ? fitSpring(worstOvershoot, measuredMs)
      : (declaredTiming
        ? { type: 'tween', duration: declaredTiming.duration, easing: declaredTiming.easing, direction }
        : { type: 'tween', duration: measuredMs, easing: 'unknown — no declared timing, curve did not overshoot', direction });

    return {
      id, properties,
      declared: declaredHere.map(({ property, animationName, type, computedTiming, keyframes, timing }) => ({ type, property, animationName, timing: computedTiming, rawTiming: timing ?? null, keyframes })),
      measured: { durationMs: measuredMs, overshoot: round(worstOvershoot, 3), frames: track.t.length, staggerMs: stagger },
      transition: firstFrame, driven: Array.from(drivenProperties), owns, fit,
      agreement: declaredTiming?.duration != null
        ? (Math.abs(declaredTiming.duration - measuredMs) <= Math.max(2 * frameIntervalMs, declaredTiming.duration * 0.5)
          ? 'declared timing confirmed by measurement'
          : `declared ${Math.round(declaredTiming.duration)}ms vs measured ${Math.round(measuredMs)}ms — investigate; measurement is sampled at ~${Math.round(frameIntervalMs)}ms/frame`)
        : 'nothing declared; measured only — treat duration as approximate',
    };
  }).filter((node) => Object.keys(node.properties).length > 0 || node.declared.length > 0);

  const result = { ...meta, nodeCount: nodes.length, frames: samples.length, frameIntervalMs: round(frameIntervalMs, 1), nodes, emit: nodes.map((node) => ({ id: node.id, ...emitCode(node) })) };
  if (selection) result.selection = selection;
  return result;
}

function cssEndpoint(property, value, edge) {
  const exact = value[edge === 'from' ? 'fromCss' : 'toCss'];
  if (exact != null) return exact;
  const endpoint = value[edge];
  if (value.serialization) return `${value.serialization.prefix}${formatNumber(endpoint)}${value.unit ?? ''}${value.serialization.suffix}`;
  if (value.unit != null) return `${formatNumber(endpoint)}${value.unit}`;
  // Legacy captures had no typed metadata. Preserve their old dimensional
  // fallback, but never apply it to newly typed values.
  return ['opacity', 'z-index', 'flex-grow', 'scaleX', 'scaleY'].includes(property) ? String(endpoint) : `${endpoint}px`;
}

/** Ready-to-paste implementations of one node's motion. */
export function emitCode(node) {
  const props = node.properties ?? {};
  const TRANSFORM_KEYS = new Set(['x', 'y', 'rotate', 'scaleX', 'scaleY']);
  const RECT_KEYS = new Set(['w', 'h']);

  // `rotate`, `scale` and `translate` are independent CSS properties as well as
  // transform components, and the two are not interchangeable: folding an
  // authored `rotate: 90deg` into `transform: rotate(90deg)` overwrites whatever
  // the element's own `transform` holds. Only tracks decomposed from the matrix
  // carry `cssProperty: 'transform'`, so that is what selects the shorthand.
  const isTransformComponent = (key) => TRANSFORM_KEYS.has(key) && props[key]?.cssProperty === 'transform';
  const component = (key) => (isTransformComponent(key) ? props[key] : null);
  const transformAt = (edge) => [
    component('x') ? `translateX(${cssEndpoint('x', props.x, edge)})` : null,
    component('y') ? `translateY(${cssEndpoint('y', props.y, edge)})` : null,
    component('rotate') ? `rotate(${cssEndpoint('rotate', props.rotate, edge)})` : null,
    component('scaleX') || component('scaleY')
      ? `scale(${Number(component('scaleX')?.[edge] ?? 1).toFixed(3)}, ${Number(component('scaleY')?.[edge] ?? 1).toFixed(3)})`
      : null,
  ].filter(Boolean).join(' ');

  const isDriven = ([, value]) => value.driven !== false;
  const consequences = Object.entries(props).filter(([, value]) => value.driven === false).map(([key]) => key);
  const unsupported = Object.entries(props).filter(([, value]) => value.emittable === false).map(([key]) => key);
  const explicit = Object.entries(props)
    .filter(isDriven)
    .filter(([, value]) => value.emittable !== false)
    .filter(([key]) => !isTransformComponent(key) && !RECT_KEYS.has(key) && key !== 'opacity');
  const explicitNames = new Set(explicit.map(([key]) => key));
  const fromRect = [props.w && props.w.driven !== false && !explicitNames.has('width') ? ['width', props.w] : null, props.h && props.h.driven !== false && !explicitNames.has('height') ? ['height', props.h] : null].filter(Boolean);
  const dimensional = [...explicit, ...fromRect];
  const defaultDuration = Math.max(0, Math.round(node.fit?.duration ?? node.measured?.durationMs ?? 0));
  const defaultEasing = node.fit?.easing && !String(node.fit.easing).startsWith('unknown') ? node.fit.easing : 'ease-out';

  const animationEntries = [];
  if (transformAt('from') || transformAt('to')) {
    const parts = ['x', 'y', 'rotate', 'scaleX', 'scaleY'].map(component).filter(Boolean);
    animationEntries.push(['transform', parts.find((part) => part.timing)?.timing, parts]);
  }
  if (props.opacity && props.opacity.driven !== false && props.opacity.emittable !== false) animationEntries.push(['opacity', props.opacity.timing, [props.opacity]]);
  for (const [property, value] of dimensional) animationEntries.push([property, value.timing, [value]]);

  const transitionParts = animationEntries.map(([property, timing, values]) => {
    const measured = Math.max(0, ...values.map((value) => value.durationMs ?? 0));
    const durationMs = timing?.durationMs ?? (measured || defaultDuration);
    const easing = timing?.easing ?? defaultEasing;
    const delayMs = timing?.delayMs ?? 0;
    return `${property} ${Math.round(durationMs)}ms ${easing}${delayMs ? ` ${Math.round(delayMs)}ms` : ''}`;
  });

  const declarations = (edge) => [
    transformAt(edge) ? `  transform: ${transformAt(edge)};` : null,
    props.opacity && props.opacity.driven !== false && props.opacity.emittable !== false ? `  opacity: ${cssEndpoint('opacity', props.opacity, edge)};` : null,
    ...dimensional.map(([property, value]) => `  ${property}: ${cssEndpoint(property, value, edge)};`),
  ].filter(Boolean).join('\n');

  const stateCss = `.surface[data-state="closed"] {\n${declarations('from')}\n}\n.surface[data-state="open"] {\n${declarations('to')}\n}`;
  const css = node.fit?.type === 'spring'
    ? `/* Overshoots (${node.measured?.overshoot ?? 0}) — a spring, not a bezier.\n   CSS cannot express this faithfully; use the JS variant below. */\n${stateCss}`
    : `${transitionParts.length ? `.surface {\n  transition: ${transitionParts.join(', ')};\n}\n` : ''}${stateCss}`;

  const motionKey = (property) => property.startsWith('--') ? property : property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const motionValue = (property, value, edge) => {
    if (value.valueType === 'number' || TRANSFORM_KEYS.has(property) || property === 'opacity') return value[edge];
    return cssEndpoint(property, value, edge);
  };
  const motionValues = (edge) => ({
    ...(component('x') ? { x: props.x[edge] } : {}),
    ...(component('y') ? { y: props.y[edge] } : {}),
    ...(component('rotate') ? { rotate: props.rotate[edge] } : {}),
    ...(component('scaleX') ? { scaleX: props.scaleX[edge] } : {}),
    ...(component('scaleY') ? { scaleY: props.scaleY[edge] } : {}),
    ...(props.opacity && props.opacity.driven !== false && props.opacity.emittable !== false ? { opacity: props.opacity[edge] } : {}),
    ...Object.fromEntries(dimensional.map(([property, value]) => [motionKey(property), motionValue(property, value, edge)])),
  });
  const initial = motionValues('from'); const animate = motionValues('to');
  const hasMotionValues = Object.keys(initial).length > 0 || Object.keys(animate).length > 0;
  const framerTransition = !hasMotionValues ? {}
    : node.fit?.type === 'spring'
      ? { type: 'spring', stiffness: node.fit.stiffness, damping: node.fit.damping, mass: node.fit.mass }
      : (() => {
        const perValue = {};
        for (const [property, timing, values] of animationEntries) {
          const measured = Math.max(0, ...values.map((value) => value.durationMs ?? 0));
          const durationMs = timing?.durationMs ?? (measured || defaultDuration);
          const entry = { duration: durationMs / 1000, ease: timing?.easing ?? defaultEasing };
          if (timing?.delayMs) entry.delay = timing.delayMs / 1000;
          perValue[property === 'transform' ? 'default' : motionKey(property)] = entry;
        }
        return animationEntries.length > 1 ? perValue : (Object.values(perValue)[0] ?? {});
      })();

  const perProperty = animationEntries.map(([property, timing, values]) => ({
    property,
    durationMs: timing?.durationMs ?? (Math.max(0, ...values.map((value) => value.durationMs ?? 0)) || defaultDuration),
    delayMs: timing?.delayMs ?? 0,
    easing: timing?.easing ?? defaultEasing,
  }));
  const spread = perProperty.length ? Math.max(...perProperty.map((item) => item.durationMs)) - Math.min(...perProperty.map((item) => item.durationMs)) : 0;
  const notes = [];
  if (consequences.length) notes.push(`Observed but NOT animated by this element: ${consequences.join(', ')}. These follow from layout — write them instantly (or not at all). Driving a consequence applies it on the first frame and destroys the animation.`);
  if (unsupported.length) notes.push(`Unsupported compound/discrete tracks were retained as evidence but not emitted: ${unsupported.join(', ')}.`);
  if (props.w || props.h) notes.push('Size changes during this animation: it is a layout transition. Animate the dimensional properties directly (as emitted), or use a layout-animation primitive — transform alone will not reproduce it.');
  if (spread > 60) notes.push(`Properties do not finish together (${spread}ms spread): ${perProperty.map((item) => `${item.property} ${item.durationMs}ms`).join(', ')}. Emitting one duration for all of them changes the feel.`);

  return { css, framerMotion: { initial, animate, transition: framerTransition }, perProperty, note: notes.join(' ') || null };
}

async function resolveAllowedNodeIds(page, selectors) {
  if (!selectors.length) return [];
  return page.evaluate((wanted) => wanted.flatMap((selector) => {
    try { return Array.from(document.querySelectorAll(selector)).map((element) => element.getAttribute('data-spec-id')).filter(Boolean); }
    catch { return []; }
  }), selectors);
}

/** Record the motion produced by one interaction, with optional causal scope. */
export async function captureAnimation(driver, {
  triggerId, keys, maxMs = 2000, settleFirst = true,
  beforeAnimationIds = [], allowedNodeIds = [], subjectNodeIds = [], relatedNodeIds = [],
  allowedSelectors = [], subjectSelectors = [], relatedSelectors = [],
} = {}) {
  if (settleFirst) await driver.settle(120, 1500);
  const observedBefore = await driver.page.evaluate(() => document.getAnimations().map((animation) => {
    const target = animation.effect?.target ?? null;
    const id = target?.getAttribute?.('data-spec-id') ?? null;
    return [id ?? '?', animation.constructor?.name ?? 'Animation', animation.transitionProperty ?? '', animation.animationName ?? ''].join('|');
  })).catch(() => []);
  await driver.startAnimationRecorder(maxMs);
  if (keys) await driver.page.keyboard.press(keys);
  else if (triggerId) {
    if (!await driver.clickById(triggerId)) throw new Error(`No element with spec id ${triggerId}.`);
  } else throw new Error('captureAnimation needs a triggerId or keys.');

  const recording = await driver.readAnimationRecorder(maxMs);
  const selectorIds = await resolveAllowedNodeIds(driver.page, [...allowedSelectors, ...subjectSelectors, ...relatedSelectors]);
  const scoped = scopeRecording(recording, {
    beforeAnimationIds: Array.from(new Set([...observedBefore, ...beforeAnimationIds])),
    allowedNodeIds: [...allowedNodeIds, ...selectorIds], subjectNodeIds, relatedNodeIds,
    allowedSelectors, subjectSelectors, relatedSelectors,
  });
  return analyseRecording(scoped, { trigger: triggerId ?? keys, via: keys ? 'press' : 'click' });
}
