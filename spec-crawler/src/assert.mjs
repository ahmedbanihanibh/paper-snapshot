/**
 * Preconditions for measurements.
 *
 * The worst failure mode in this toolkit is not an error — it is an action that
 * silently does not happen, followed by a measurement that looks entirely
 * plausible. Two answers were sent to another agent as fact this way:
 *
 *   - `keyboard.type()` without focusing the input first typed into nothing, so
 *     "blur discards the folder name" was measured on an empty field. Blur
 *     actually commits.
 *   - a drag whose source lookup matched a suggestion chip in the content area
 *     rather than the sidebar row, so "child indent" was measured from a drag
 *     that never occurred.
 *
 * Neither threw. Both produced numbers. The fix is not more care — it is
 * asserting that the precondition took effect before trusting anything after it.
 */

/** Type into a field and verify the value actually landed. */
export async function typeInto(driver, selector, text, { delay = 80 } = {}) {
  const handle = await driver.page.$(selector);
  if (!handle) throw new Error(`typeInto: no element matches ${selector}`);

  // Focus by clicking the field itself. Typing at the page level goes to
  // whatever happens to hold focus, which is frequently nothing.
  await handle.click();
  await driver.page.keyboard.type(text, { delay });

  const value = await driver.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? (el.value ?? el.textContent ?? '') : null;
  }, selector);

  if (value !== text) {
    throw new Error(`typeInto: expected ${JSON.stringify(text)} in ${selector}, field holds ${JSON.stringify(value)}. `
      + 'The keystrokes did not reach the field — any measurement after this would describe an empty input.');
  }
  return value;
}

/** Resolve an element by visible text, constrained to a region, and fail loudly on ambiguity. */
export async function elementByText(driver, text, { within, exact = true } = {}) {
  const matches = await driver.page.evaluate(({ needle, box, isExact }) => {
    const hits = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length) continue;
      const label = (el.textContent || '').trim();
      const ok = isExact ? label === needle : label.includes(needle);
      if (!ok) continue;
      const r = el.getBoundingClientRect();
      if (box && (r.x < box.x1 || r.x > box.x2 || r.y < box.y1 || r.y > box.y2)) continue;
      hits.push({ id: el.getAttribute('data-spec-id'), x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height) });
    }
    return hits;
  }, { needle: text, box: within ?? null, isExact: exact });

  if (!matches.length) {
    throw new Error(`elementByText: nothing matches ${JSON.stringify(text)}${within ? ' within the given box' : ''}.`);
  }
  if (matches.length > 1 && !within) {
    // Silent first-match selection is how a sidebar row lookup returned a
    // suggestion chip 700px away in the content area.
    throw new Error(`elementByText: ${matches.length} elements match ${JSON.stringify(text)} `
      + `at ${matches.map((m) => `(${m.x},${m.y})`).join(' ')}. Pass \`within\` to disambiguate.`);
  }
  return matches[0];
}

/**
 * Run an action and assert a *named* observable changed.
 *
 * "Did anything change?" is useless against a live app — timestamps tick,
 * animations run, element counts drift, so a no-op passes every time. The first
 * version of this guard did exactly that and failed its own test. The caller has
 * to say what should change, and that statement is the whole value: it forces
 * the expectation to be explicit before the action runs.
 *
 * @param {Function} probe returns any JSON-comparable value read from the page
 */
export async function actAndExpectChange(driver, action, { probe, label = 'observable', settleMs = 600 } = {}) {
  if (typeof probe !== 'function') {
    throw new Error('actAndExpectChange requires a probe: state what should change, or the check is vacuous.');
  }

  const before = await probe();
  await action();
  await driver.settle(200, settleMs + 2000);
  const after = await probe();

  if (JSON.stringify(before) === JSON.stringify(after)) {
    throw new Error(`actAndExpectChange: ${label} is unchanged (${JSON.stringify(before)}). `
      + 'The action did not take effect, so anything measured now describes the state before it.');
  }
  return { before, after };
}

/** Drag one element to another and confirm the source actually moved. */
export async function dragAndVerify(driver, { fromId, toId, steps = 10 } = {}) {
  const rectOf = async (id) => {
    const handle = await driver.page.$(`[data-spec-id="${id}"]`);
    const box = handle && await handle.boundingBox();
    if (!box) throw new Error(`dragAndVerify: ${id} has no box`);
    return box;
  };

  const from = await rectOf(fromId);
  const to = await rectOf(toId);

  await driver.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await driver.page.mouse.down();
  await driver.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8, { steps: 3 });
  await driver.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await driver.page.mouse.up();
  await driver.settle(300, 3000);

  const after = await rectOf(fromId).catch(() => null);
  const moved = !after || Math.abs(after.y - from.y) > 4 || Math.abs(after.x - from.x) > 4;
  if (!moved) {
    throw new Error(`dragAndVerify: ${fromId} is still at (${Math.round(from.x)},${Math.round(from.y)}) after the drag. `
      + 'Nothing was reordered, so any "after" measurement is the unchanged list.');
  }
  return { from: { x: Math.round(from.x), y: Math.round(from.y) },
    to: after ? { x: Math.round(after.x), y: Math.round(after.y) } : null };
}
