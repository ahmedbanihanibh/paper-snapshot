/**
 * The implementation contract that ships inside the bundle.
 *
 * A capture is frequently produced by one agent and implemented by another, in a
 * different session, which has never read the skill. Anything known only to the
 * capturing agent is therefore lost — and the losses are not subtle: driving a
 * property the element does not transition applies it on the first frame and
 * destroys the animation, while the endpoints and easing still measure as
 * correct.
 *
 * So the contract states, in the bundle, exactly what to animate and what not to,
 * and carries the reference filmstrip as an acceptance test. An implementer does
 * not need to be told how any of this was learned; they need a target table to
 * reproduce.
 */

const fmt = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value);

/** Markdown contract for one captured state's animation. */
export function animationContract(state) {
  const animation = state.animation;
  if (!animation?.nodes?.length) return null;

  const nodes = animation.nodes.filter((node) => Object.keys(node.properties ?? {}).length);
  if (!nodes.length) return null;

  const lines = [];
  lines.push(`# ${state.id} — animation contract`);
  lines.push('');
  lines.push(`Captured from a live app. Reproduce this motion exactly; do not re-derive it.`);
  lines.push('');
  lines.push(`- trigger: ${state.trigger?.label ? `"${state.trigger.label}"` : '(unknown)'}`);
  lines.push(`- surface: ${state.kind ?? 'surface'}${state.rect ? ` · ${Math.round(state.rect.width)}×${Math.round(state.rect.height)}` : ''}`);
  lines.push(`- sampling: ${animation.frames} frames @ ~${animation.frameIntervalMs}ms`);
  lines.push('');

  for (const [index, node] of nodes.entries()) {
    const driven = Object.entries(node.properties).filter(([, value]) => value.driven);
    const consequences = Object.entries(node.properties).filter(([, value]) => !value.driven);

    lines.push(`## Element ${index + 1} (${node.id})`);
    lines.push('');

    if (node.owns?.length) {
      lines.push(`**This element OWNS: ${node.owns.join(', ')}.**`);
      lines.push('');
      lines.push('Put the animation on *this* element. Measured mid-transition, its');
      lines.push('rendered size tracks its own constraint — so the constraint is what drives');
      lines.push('the box. Applying it to a child instead leaves this element offset by the');
      lines.push('surrounding chrome for the whole transition: endpoints land correctly while');
      lines.push('the middle is wrong, which looks exactly like a bad easing curve.');
      lines.push('');
    }

    if (node.transition?.property && node.transition.property !== 'none') {
      lines.push('**Reuse this transition verbatim — do not write your own:**');
      lines.push('');
      lines.push('```css');
      lines.push(`transition: ${node.transition.property} ${node.transition.duration} ${node.transition.easing}${node.transition.delay && node.transition.delay !== '0s' ? ` ${node.transition.delay}` : ''};`);
      lines.push('```');
      lines.push('');
    }

    // A node where nothing is driven means the transition data never reached the
    // analysis — usually an older capture. Saying so is far better than an
    // implementer reading "animate nothing" as a finished spec.
    if (!driven.length && !node.transition?.property) {
      lines.push('> **Incomplete capture.** No `transition-property` was recorded for this');
      lines.push('> element, so driven properties could not be identified. Re-capture with a');
      lines.push('> current build before implementing — the properties below are observations,');
      lines.push('> not instructions.');
      lines.push('');
    }

    if (driven.length) {
      lines.push('**ANIMATE these** — the element declares a transition for them:');
      lines.push('');
      lines.push('| property | from | to |');
      lines.push('|---|---|---|');
      for (const [key, value] of driven) lines.push(`| \`${key}\` | ${fmt(value.from)} | ${fmt(value.to)} |`);
      lines.push('');
    }

    if (consequences.length) {
      lines.push('**DO NOT animate these** — they change because layout responded:');
      lines.push('');
      for (const [key, value] of consequences) {
        lines.push(`- \`${key}\` ${fmt(value.from)} → ${fmt(value.to)}${value.source ? ` _(${value.source})_` : ''}`);
      }
      lines.push('');
      lines.push('Write them instantly, or leave them to layout. Driving one applies it on');
      lines.push('the first frame and pre-empts the animation. Setting an upper bound');
      lines.push('(`max-*`) or a plain `width`/`height` instantly is safe — rendered width is');
      lines.push('`min(width, max-width)`, so a tweening `max-width` still drives it. Setting a');
      lines.push('`min-*` floor instantly is **not**: it forces the final size immediately.');
      lines.push('');
    }

    if (node.measured?.staggerMs) {
      lines.push(`Stagger between driven properties: ${node.measured.staggerMs}ms.`);
      lines.push('');
    }
  }

  lines.push('## Acceptance test');
  lines.push('');
  if (state.referenceFilmstrip?.frames?.length) {
    lines.push('The original was filmstripped at fixed progress points. Your implementation');
    lines.push('must reproduce this table. Property-level checks are not sufficient — they');
    lines.push('pass while a landmark sits still for half the animation and then jumps.');
    lines.push('');
    lines.push('| progress | size | footer from bottom |');
    lines.push('|---|---|---|');
    for (const frame of state.referenceFilmstrip.frames) {
      lines.push(`| ${Math.round(frame.progress * 100)}% | ${frame.subject?.w}×${frame.subject?.h} | ${frame.footerFromBottom ?? '—'} |`);
    }
    lines.push('');
    lines.push('A landmark holding a constant offset throughout is what correct looks like.');
    lines.push('One that holds still and then lurches means a property is being applied');
    lines.push('instantly instead of animated.');
  } else {
    lines.push('No reference filmstrip was captured for this state. Before trusting any');
    lines.push('implementation, run `verify_animation` against the original and against your');
    lines.push('clone, and compare the tables.');
  }
  lines.push('');
  lines.push('Verify with `verify_animation` (spec-crawler MCP), or:');
  lines.push('');
  lines.push('```bash');
  lines.push('node build-prototype.mjs --bundle <this bundle> --collapsed <id> --maximized <id>');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

/**
 * The same contract as a checklist a verifier can enforce.
 *
 * A prose contract is only as good as whoever reads it — and it is skippable,
 * which is how an implementation ends up covering two of four animated nodes
 * while passing every check that was run. This lists each node and the
 * properties it drives so `verify_animation` can report coverage rather than
 * relying on diligence.
 */
export function animationChecklist(state) {
  const nodes = (state.animation?.nodes ?? []).filter((node) => Object.keys(node.properties ?? {}).length);
  if (!nodes.length) return null;
  return {
    id: state.id,
    trigger: state.trigger?.label ?? null,
    requiredNodes: nodes.map((node) => ({
      node: node.id,
      transition: node.transition?.property ?? null,
      durationMs: Math.round(node.fit?.duration ?? node.measured?.durationMs ?? 0),
      easing: node.fit?.easing ?? null,
      owns: node.owns ?? null,
      animate: Object.entries(node.properties).filter(([, v]) => v.driven).map(([k, v]) => ({ property: k, from: v.from, to: v.to })),
      doNotAnimate: Object.entries(node.properties).filter(([, v]) => !v.driven).map(([k]) => k),
    })),
    reference: state.referenceFilmstrip ?? null,
  };
}
