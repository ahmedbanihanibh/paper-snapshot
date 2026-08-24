import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSharedTimeline,
  cleanupFilmstripInPage,
  filmstrip,
  readFilmstripStateInPage,
  seekFilmstripInPage,
  selectCausalAnimationDescriptors,
} from '../../src/filmstrip.mjs';

test('causal selection separates triggered animations from ambient work', () => {
  const selected = selectCausalAnimationDescriptors([
    { animationId: 'before', nodeId: 'spinner', activeDuration: 1000 },
    { animationId: 'panel', nodeId: 'dialog', activeDuration: 180 },
    { animationId: 'ticker', nodeId: 'ticker', activeDuration: 500 },
  ], { beforeAnimationIds: ['before'], allowedNodeIds: ['dialog'] });

  assert.deepEqual(selected.included.map((item) => item.animationId), ['panel']);
  assert.ok(selected.excluded.some((item) => item.animationId === 'before' && item.reason === 'present before interaction'));
  assert.ok(selected.excluded.some((item) => item.animationId === 'ticker' && item.reason === 'unrelated target'));
});

test('shared timeline includes delay and active duration for staggered animations', () => {
  const timeline = buildSharedTimeline([
    { animationId: 'a', delay: 0, activeDuration: 180 },
    { animationId: 'b', delay: 60, activeDuration: 240 },
    { animationId: 'reverse', delay: 20, activeDuration: 100, direction: 'reverse' },
  ]);
  assert.equal(timeline.durationMs, 300);
  assert.equal(timeline.animations[1].startMs, 60);
  assert.equal(timeline.animations[1].endMs, 300);
  assert.equal(timeline.animations[2].direction, 'reverse');
  assert.equal(timeline.at(0.5), 150);
});

function fakeDriver({ state, throwOnScreenshot = false } = {}) {
  const calls = { seeks: [], cleanups: 0, clicks: 0, screenshots: 0 };
  const page = {
    keyboard: { press: async () => {} },
    waitForFunction: async () => {},
    evaluate: async (fn, argument) => {
      if (fn === readFilmstripStateInPage) return state;
      if (fn === seekFilmstripInPage) { calls.seeks.push(argument); return true; }
      if (fn === cleanupFilmstripInPage) { calls.cleanups += 1; return { cleaned: true, resumed: state?.selection?.included?.length ?? 0 }; }
      return true;
    },
    screenshot: async () => {
      calls.screenshots += 1;
      if (throwOnScreenshot) throw new Error('capture failed');
      return Buffer.from('png');
    },
  };
  return {
    driver: { page, clickById: async () => { calls.clicks += 1; return true; } },
    calls,
  };
}

test('filmstrip seeks selected animations on one interaction timeline and cleans exactly once', async () => {
  const state = {
    armed: false,
    selection: {
      included: [
        { animationId: 'a', nodeId: 'dialog', delay: 0, activeDuration: 100 },
        { animationId: 'b', nodeId: 'dialog', delay: 50, activeDuration: 200 },
      ],
      excluded: [{ animationId: 'ambient', reason: 'unrelated target' }],
    },
  };
  const { driver, calls } = fakeDriver({ state });
  const result = await filmstrip(driver, { triggerId: 'toggle', subjectId: 'dialog', strict: true, progress: [0, 0.5, 1], settleMs: 0 });

  assert.equal(result.durationMs, 250);
  assert.deepEqual(result.frames.map((frame) => frame.atMs), [0, 125, 250]);
  assert.deepEqual(calls.seeks.map((seek) => seek.timelineMs), [0, 125, 250]);
  assert.equal(calls.cleanups, 1);
  assert.equal(result.selection.excluded[0].animationId, 'ambient');
});

test('strict mode rejects no causal animation and still performs exact cleanup', async () => {
  const { driver, calls } = fakeDriver({ state: { armed: true, selection: { included: [], excluded: [] } } });
  await assert.rejects(
    filmstrip(driver, { triggerId: 'toggle', subjectSelector: '#panel', strict: true, progress: [0], settleMs: 0 }),
    /no causal animations/i,
  );
  assert.equal(calls.cleanups, 1);
  assert.equal(calls.screenshots, 0);
});

test('frame failure resumes animations and removes filmstrip state in finally', async () => {
  const state = { armed: false, selection: { included: [{ animationId: 'a', nodeId: 'dialog', delay: 0, activeDuration: 100 }], excluded: [] } };
  const { driver, calls } = fakeDriver({ state, throwOnScreenshot: true });
  await assert.rejects(filmstrip(driver, { triggerId: 'toggle', progress: [0], settleMs: 0 }), /capture failed/);
  assert.equal(calls.cleanups, 1);
});
