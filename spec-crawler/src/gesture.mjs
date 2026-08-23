/**
 * Tier 5 — gesture capture.
 *
 * A drag is not a trigger and a surface. It is a continuous interaction whose
 * interesting states exist only *during* the gesture: the lifted row, the
 * portalled drag overlay, the insertion indicator, the siblings translating out
 * of the way, and the settle on release. None of them are reachable by clicking
 * something and waiting.
 *
 * Real pointer input is mandatory. Drag libraries listen for pointerdown /
 * pointermove with genuine coordinates and a movement threshold; synthetic
 * events produce nothing at all, which reads as "this element isn't draggable"
 * rather than as a missing capability.
 */

/**
 * Sample the state of the whole page mid-gesture, including portalled overlays.
 *
 * The screenshot is annotated in-page before capture: the dragged element in
 * red, anything that only exists during the gesture in blue. A bare drag frame
 * shows a sidebar with something floating over it and leaves the reader to work
 * out which box is the overlay, which is the indicator, and where the source
 * row went — the same problem annotation solved for static surfaces.
 */
async function phaseSnapshot(driver, label, phase, { sourceId, baseline } = {}) {
  await driver.settle(80, 700);
  const surfaces = await driver.harvestSurfaces();
  const transient = surfaces.filter((s) => !baseline?.has(s.id));

  await driver.page.evaluate(({ source, marks, caption }) => {
    document.getElementById('__spec_annotations__')?.remove();
    const layer = document.createElement('div');
    layer.id = '__spec_annotations__';
    Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });

    const draw = (element, colour, text) => {
      if (!element) return;
      const r = element.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const box = document.createElement('div');
      Object.assign(box.style, { position: 'fixed', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`,
        height: `${r.height}px`, outline: `2px solid ${colour}`, outlineOffset: '1px', borderRadius: '3px' });
      const tag = document.createElement('div');
      tag.textContent = text;
      Object.assign(tag.style, { position: 'fixed', left: `${r.x}px`, top: `${Math.max(0, r.y - 18)}px`,
        font: '600 10px ui-monospace, monospace', color: '#fff', background: colour, padding: '1px 5px',
        borderRadius: '3px', whiteSpace: 'nowrap' });
      layer.append(box, tag);
    };

    draw(document.querySelector(`[data-spec-id="${source}"]`), '#e5484d', 'source');
    for (const id of marks) draw(document.querySelector(`[data-spec-id="${id}"]`), '#3e63dd', 'drag-only');

    const label = document.createElement('div');
    label.textContent = caption;
    Object.assign(label.style, { position: 'fixed', left: '12px', top: '12px', font: '600 12px ui-monospace, monospace',
      color: '#fff', background: '#000000cc', padding: '4px 8px', borderRadius: '4px' });
    layer.appendChild(label);
    document.body.appendChild(layer);
  }, { source: sourceId ?? null, marks: transient.map((s) => s.id).slice(0, 6), caption: `${label} · ${Math.round(phase * 100)}%` });

  const shot = await driver.screenshot();
  await driver.page.evaluate(() => document.getElementById('__spec_annotations__')?.remove());

  return {
    label,
    phase,
    surfaces: surfaces.map(({ id, role, rect, portalled, label: text }) => ({ id, role, rect, portalled, label: text?.slice(0, 40) })),
    transient: transient.map((s) => s.id),
    shot,
  };
}

/**
 * Drag one element onto another, recording each phase.
 *
 * @param {object} driver
 * @param {{fromId: string, toId?: string, toPoint?: {x: number, y: number}, steps?: number, holdMs?: number}} options
 */
export async function captureDrag(driver, { fromId, toId, toPoint, steps = 10, holdMs = 120 } = {}) {
  const from = await driver.page.$(`[data-spec-id="${fromId}"]`);
  if (!from) throw new Error(`Drag source ${fromId} not found.`);
  const source = await from.boundingBox();
  if (!source) throw new Error(`Drag source ${fromId} has no box.`);

  let target = toPoint;
  if (!target && toId) {
    const to = await driver.page.$(`[data-spec-id="${toId}"]`);
    const box = to && await to.boundingBox();
    if (!box) throw new Error(`Drag target ${toId} not found.`);
    target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  if (!target) throw new Error('captureDrag needs toId or toPoint.');

  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const phases = [];

  await driver.page.mouse.move(start.x, start.y);
  const restSurfaces = await driver.harvestSurfaces();
  const baseline = new Set(restSurfaces.map((s) => s.id));
  phases.push(await phaseSnapshot(driver, 'hover', 0, { sourceId: fromId, baseline }));

  await driver.page.mouse.down();
  // Libraries require movement past a threshold before a drag starts, so a
  // press alone leaves the row un-lifted. Nudge first, then report the grab.
  await driver.page.mouse.move(start.x, start.y + 6, { steps: 2 });
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  phases.push(await phaseSnapshot(driver, 'grab', 0.05, { sourceId: fromId, baseline }));

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await driver.page.mouse.move(
      start.x + (target.x - start.x) * t,
      start.y + (target.y - start.y) * t,
      { steps: 3 },
    );
    // Only a few frames are worth keeping — start, middle, and just before the
    // drop, where the insertion indicator has settled on its final slot.
    if (step === 1 || step === Math.ceil(steps / 2) || step === steps) {
      phases.push(await phaseSnapshot(driver, `drag-${Math.round(t * 100)}%`, t, { sourceId: fromId, baseline }));
    }
  }

  await driver.page.mouse.up();
  phases.push(await phaseSnapshot(driver, 'drop', 1, { sourceId: fromId, baseline }));
  await driver.settle(200, 2000);
  phases.push(await phaseSnapshot(driver, 'settled', 1, { sourceId: fromId, baseline }));

  // Anything that appeared only while the button was down is the drag overlay —
  // usually a portalled clone with its own elevation and transform.
  const dragOnly = phases.filter((p) => p.phase > 0 && p.phase < 1)
    .flatMap((p) => p.surfaces.filter((s) => !baseline.has(s.id)));

  return {
    from: fromId,
    to: toId ?? target,
    phases: phases.map(({ shot, ...rest }) => rest),
    shots: Object.fromEntries(phases.map((p) => [p.label, p.shot])),
    dragOverlay: dragOnly.length
      ? { ids: [...new Set(dragOnly.map((s) => s.id))], note: 'Surfaces present only while dragging — the overlay/indicator.' }
      : null,
  };
}

/**
 * Drag one row through every slot in a list.
 *
 * Each drop is a separate mutation of real data, so the caller decides whether
 * that is acceptable; this only reports what each position looked like.
 */
export async function captureDragMatrix(driver, { fromId, targetIds, onDrop } = {}) {
  const results = [];
  for (const [index, toId] of targetIds.entries()) {
    const drag = await captureDrag(driver, { fromId, toId }).catch((cause) => ({ error: String(cause?.message ?? cause) }));
    results.push({ slot: index, toId, ...drag });
    if (onDrop) await onDrop(drag, index);
  }
  return results;
}
