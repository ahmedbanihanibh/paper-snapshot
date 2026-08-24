/**
 * Human- and machine-readable implementation contracts for captured motion.
 * Existing fields remain intact; exact CSS endpoints, typed interpolation, causal
 * selection, and per-property timing are additive.
 */

const fmt = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value);
const endpoint = (value, edge) => value?.[edge === 'from' ? 'fromCss' : 'toCss'] ?? fmt(value?.[edge]);

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

function transitionDeclaration(transition) {
  const properties = splitCssList(transition?.property).filter(Boolean);
  if (!properties.length || properties.every((property) => property === 'none')) return null;
  const durations = splitCssList(transition.duration);
  const easings = splitCssList(transition.easing);
  const delays = splitCssList(transition.delay);
  return properties.map((property, index) => {
    const duration = durations[index % Math.max(1, durations.length)] || '0s';
    const easing = easings[index % Math.max(1, easings.length)] || 'ease';
    const delay = delays[index % Math.max(1, delays.length)] || '0s';
    return `${property} ${duration} ${easing}${delay !== '0s' && delay !== '0ms' ? ` ${delay}` : ''}`;
  }).join(', ');
}

/** Markdown contract for one captured state's animation. */
export function animationContract(state) {
  const animation = state.animation;
  if (!animation?.nodes?.length) return null;
  const nodes = animation.nodes.filter((node) => Object.keys(node.properties ?? {}).length);
  if (!nodes.length) return null;

  const lines = [];
  lines.push(`# ${state.id} — animation contract`, '');
  lines.push('Captured from a live app. Reproduce this motion exactly; do not re-derive it.', '');
  lines.push(`- trigger: ${state.trigger?.label ? `"${state.trigger.label}"` : '(unknown)'}`);
  lines.push(`- surface: ${state.kind ?? 'surface'}${state.rect ? ` · ${Math.round(state.rect.width)}×${Math.round(state.rect.height)}` : ''}`);
  lines.push(`- sampling: ${animation.frames} frames @ ${Number.isFinite(animation.frameIntervalMs) ? `~${animation.frameIntervalMs}ms` : 'an unknown interval (too few samples to observe one)'}`);
  lines.push('');

  if (animation.selection) {
    lines.push('## Causal animation scope', '');
    const included = animation.selection.included ?? [];
    const excluded = animation.selection.excluded ?? [];
    lines.push(`Included ${included.length} animation${included.length === 1 ? '' : 's'}; excluded ${excluded.length} ambient or unrelated animation${excluded.length === 1 ? '' : 's'}.`);
    lines.push('');
    for (const item of included) lines.push(`- include \`${item.animationId}\`${item.nodeId ? ` on \`${item.nodeId}\`` : ''}: ${item.reason}`);
    for (const item of excluded) lines.push(`- exclude \`${item.animationId}\`${item.nodeId ? ` on \`${item.nodeId}\`` : ''}: ${item.reason}`);
    lines.push('');
  }

  for (const [index, node] of nodes.entries()) {
    const driven = Object.entries(node.properties).filter(([, value]) => value.driven && value.emittable !== false && value.interpolation !== 'unsupported');
    const consequences = Object.entries(node.properties).filter(([, value]) => !value.driven);
    lines.push(`## Element ${index + 1} (${node.id})`, '');

    if (node.owns?.length) {
      lines.push(`**This element OWNS: ${node.owns.join(', ')}.**`, '');
      lines.push('Put the animation on *this* element. Measured mid-transition, its');
      lines.push('rendered size tracks its own constraint — so the constraint is what drives');
      lines.push('the box. Applying it to a child instead leaves this element offset by the');
      lines.push('surrounding chrome for the whole transition: endpoints land correctly while');
      lines.push('the middle is wrong, which looks exactly like a bad easing curve.', '');
    }

    const transition = transitionDeclaration(node.transition);
    if (transition) {
      lines.push('**Reuse this transition verbatim — do not write your own:**', '', '```css');
      lines.push(`transition: ${transition};`, '```', '');
    }

    if (!driven.length && !node.transition?.property) {
      lines.push('> **Incomplete capture.** No `transition-property` was recorded for this');
      lines.push('> element, so driven properties could not be identified. Re-capture with a');
      lines.push('> current build before implementing — the properties below are observations,');
      lines.push('> not instructions.', '');
    }

    if (driven.length) {
      lines.push('**ANIMATE these** — the element declares a transition for them:', '');
      lines.push('| property | from | to | interpolation | timing |', '|---|---|---|---|---|');
      for (const [key, value] of driven) {
        const timing = value.timing;
        const timingText = timing
          ? `${timing.durationMs ?? '—'}ms${timing.delayMs ? ` + ${timing.delayMs}ms delay` : ''}${timing.easing ? ` · ${timing.easing}` : ''}`
          : (value.durationMs != null ? `${value.durationMs}ms measured` : '—');
        lines.push(`| \`${key}\` | ${endpoint(value, 'from')} | ${endpoint(value, 'to')} | ${value.interpolation ?? 'legacy numeric'}${value.valueType ? ` (${value.valueType})` : ''} | ${timingText} |`);
      }
      lines.push('');
    }

    if (consequences.length) {
      lines.push('**DO NOT animate these** — they change because layout responded:', '');
      for (const [key, value] of consequences) {
        lines.push(`- \`${key}\` ${endpoint(value, 'from')} → ${endpoint(value, 'to')}${value.source ? ` _(${value.source})_` : ''}${value.interpolation && value.interpolation !== 'numeric' ? ` — ${value.interpolation}` : ''}`);
      }
      lines.push('');
      lines.push('Write them instantly, or leave them to layout. Driving one applies it on');
      lines.push('the first frame and pre-empts the animation. Setting an upper bound');
      lines.push('(`max-*`) or a plain `width`/`height` instantly is safe — rendered width is');
      lines.push('`min(width, max-width)`, so a tweening `max-width` still drives it. Setting a');
      lines.push('`min-*` floor instantly is **not**: it forces the final size immediately.', '');
    }

    const unsupported = Object.entries(node.properties).filter(([, value]) => value.interpolation === 'unsupported');
    if (unsupported.length) {
      lines.push('> **Unsupported replay tracks.** These values were preserved exactly but not');
      lines.push('> emitted as interpolated CSS because doing so would invent invalid motion:');
      for (const [key, value] of unsupported) lines.push(`> - \`${key}\`: ${endpoint(value, 'from')} → ${endpoint(value, 'to')}${value.reason ? ` (${value.reason})` : ''}`);
      lines.push('');
    }

    if (node.measured?.staggerMs) lines.push(`Stagger between driven properties: ${node.measured.staggerMs}ms.`, '');
  }

  lines.push('## Acceptance test', '');
  if (state.referenceFilmstrip?.frames?.length) {
    lines.push('The original was filmstripped at fixed progress points. Your implementation');
    lines.push('must reproduce this table. Property-level checks are not sufficient — they');
    lines.push('pass while a landmark sits still for half the animation and then jumps.', '');
    lines.push('| progress | size | footer from bottom |', '|---|---|---|');
    for (const frame of state.referenceFilmstrip.frames) lines.push(`| ${Math.round(frame.progress * 100)}% | ${frame.subject?.w}×${frame.subject?.h} | ${frame.footerFromBottom ?? '—'} |`);
    lines.push('');
    lines.push('A landmark holding a constant offset throughout is what correct looks like.');
    lines.push('One that holds still and then lurches means a property is being applied');
    lines.push('instantly instead of animated.');
  } else {
    lines.push('No reference filmstrip was captured for this state. Before trusting any');
    lines.push('implementation, run `verify_animation` against the original and against your');
    lines.push('clone, and compare the tables.');
  }
  lines.push('', 'Verify with `verify_animation` (spec-crawler MCP), or:', '', '```bash');
  lines.push('node build-prototype.mjs --bundle <this bundle> --collapsed <id> --maximized <id>');
  lines.push('```', '');
  return lines.join('\n');
}

/** Machine-enforceable counterpart to animationContract. */
export function animationChecklist(state) {
  const nodes = (state.animation?.nodes ?? []).filter((node) => Object.keys(node.properties ?? {}).length);
  if (!nodes.length) return null;
  return {
    id: state.id,
    trigger: state.trigger?.label ?? null,
    requiredNodes: nodes.map((node) => ({
      node: node.id,
      transition: node.transition?.property ?? null,
      // null, not 0. This is the machine-enforceable checklist: a required
      // duration of 0 for a node whose duration was never established reads as
      // "this must be instant" and would be enforced as such.
      durationMs: Number.isFinite(node.fit?.duration ?? node.measured?.durationMs)
        ? Math.round(node.fit?.duration ?? node.measured?.durationMs)
        : null,
      easing: node.fit?.easing ?? null,
      owns: node.owns ?? null,
      animate: Object.entries(node.properties).filter(([, value]) => value.driven && value.emittable !== false && value.interpolation !== 'unsupported').map(([property, value]) => ({
        property,
        from: value.from,
        to: value.to,
        fromCss: value.fromCss ?? null,
        toCss: value.toCss ?? null,
        valueType: value.valueType ?? null,
        interpolation: value.interpolation ?? 'legacy numeric',
        unit: value.unit ?? null,
        durationMs: value.timing?.durationMs ?? value.durationMs ?? null,
        delayMs: value.timing?.delayMs ?? null,
        easing: value.timing?.easing ?? null,
      })),
      doNotAnimate: Object.entries(node.properties).filter(([, value]) => !value.driven).map(([property]) => property),
      unsupported: Object.entries(node.properties).filter(([, value]) => value.interpolation === 'unsupported').map(([property, value]) => ({ property, fromCss: value.fromCss ?? null, toCss: value.toCss ?? null, reason: value.reason ?? null })),
    })),
    reference: state.referenceFilmstrip ?? null,
    causal: state.animation?.selection ?? null,
  };
}
