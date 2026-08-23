/**
 * Frame-accurate visual verification of an animation.
 *
 * Measuring a few properties proves the endpoints and the curve; it does not
 * prove the *frames*. A clone can hit 750→820 on the right easing and still show
 * a footer that snaps at the end, or content that reflows at the wrong moment.
 * Only looking at matched intermediate frames catches that.
 *
 * Rather than screenshotting on a timer — which drifts, since a capture costs
 * tens of milliseconds — this pauses every running animation and seeks each one
 * to an explicit progress point. Frames are therefore exact and directly
 * comparable between two implementations, however fast either machine is.
 */

/** Trigger, freeze, and sample the animation at the given progress points. */
export async function filmstrip(driver, {
  triggerId,
  keys,
  progress = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1],
  subjectId = null,
  settleMs = 900,
  onFrame = null,
} = {}) {
  // Freeze on the very next frame after the trigger, before the transition has
  // travelled anywhere. Seeking is only meaningful from a paused state.
  await driver.page.evaluate(() => {
    window.__filmstrip = { armed: true };
    const arm = () => {
      if (!window.__filmstrip?.armed) return;
      // Only time-driven animations are seekable, and only they belong to the
      // interaction being measured.
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        try { return Number(a.effect?.getComputedTiming?.().activeDuration) > 0; } catch { return false; }
      });
      if (running.length) {
        for (const animation of running) animation.pause();
        window.__filmstrip.animations = running;
        window.__filmstrip.armed = false;
        return;
      }
      requestAnimationFrame(arm);
    };
    requestAnimationFrame(arm);
  });

  if (keys) await driver.page.keyboard.press(keys);
  else if (triggerId) await driver.clickById(triggerId);
  else throw new Error('filmstrip needs a triggerId or keys.');

  // Give the arming loop a moment to catch the animations it needs to pause.
  await driver.page.waitForFunction(() => window.__filmstrip && !window.__filmstrip.armed, null, { timeout: 2000 })
    .catch(() => { /* nothing animated; frames will simply be identical */ });

  const durations = await driver.page.evaluate(() => (window.__filmstrip?.animations ?? [])
    .map((animation) => Number(animation.effect?.getComputedTiming?.().activeDuration) || 0));
  const duration = Math.max(0, ...durations);

  const frames = [];
  for (const point of progress) {
    await driver.page.evaluate((fraction) => {
      for (const animation of window.__filmstrip?.animations ?? []) {
        try {
          const timing = animation.effect?.getComputedTiming?.();
          const active = Number(timing?.activeDuration) || 0;
          if (!active) continue;
          // Seek each animation on its own timeline, so a staggered property
          // lands where it genuinely is at this moment rather than at its own
          // fraction.
          animation.currentTime = active * fraction;
        } catch {
          // Progress-based animations (scroll- and view-timeline driven) reject
          // absolute times. Real apps have them running incidentally; they are
          // not part of the transition under test, so skipping them is correct
          // rather than merely tolerant.
        }
      }
    }, point);
    const frame = { progress: point, atMs: Math.round(duration * point), png: await driver.page.screenshot() };
    // Sampled while still frozen at this point, so measurements and pixels
    // describe the same instant.
    if (onFrame) frame.sample = await onFrame(point);
    frames.push(frame);
  }

  // Hand control back and let it finish, so the page is left in a real state.
  await driver.page.evaluate(() => {
    for (const animation of window.__filmstrip?.animations ?? []) { animation.play(); animation.finish?.(); }
    delete window.__filmstrip;
  }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, settleMs));

  return { durationMs: duration, frames };
}

/**
 * Measure a set of named elements: position AND size.
 *
 * Position is not optional. A clone can match size and internal offsets at every
 * frame while its top edge travels a completely different path — which is
 * exactly what happens when the original animates a wrapper's padding and the
 * clone centres with `place-items-center`. Landmarks that only measured size let
 * that pass seven frames at a time.
 */
export async function probe(driver, selectors) {
  return driver.page.evaluate((map) => {
    const out = {};
    for (const [name, selector] of Object.entries(map)) {
      const element = document.querySelector(selector);
      if (!element) { out[name] = null; continue; }
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      out[name] = {
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height),
        paddingTop: styles.paddingTop, paddingBottom: styles.paddingBottom,
        minHeight: styles.minHeight, maxWidth: styles.maxWidth,
      };
    }
    return out;
  }, selectors);
}

/** Backwards-compatible single-subject probe. */
export async function landmarks(driver, subjectSelector = '#subject') {
  return driver.page.evaluate((selector) => {
    const subject = document.querySelector(selector) ?? document.body;
    const box = subject.getBoundingClientRect();
    const texts = Array.from(subject.querySelectorAll('*'))
      .filter((element) => element.children.length === 0 && (element.textContent ?? '').trim())
      .map((element) => ({ text: element.textContent.trim().slice(0, 24), rect: element.getBoundingClientRect() }));
    const find = (pattern) => texts.find((entry) => pattern.test(entry.text));
    const create = find(/^create issue$/i);
    return {
      subject: { w: Math.round(box.width), h: Math.round(box.height) },
      // Position, so a wrong path cannot pass a size-only check.
      top: Math.round(box.top),
      footerFromBottom: create ? Math.round(box.bottom - create.rect.bottom) : null,
    };
  }, subjectSelector);
}
