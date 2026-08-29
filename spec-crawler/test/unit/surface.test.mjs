import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SurfaceResolutionError,
  SurfaceResolver,
  scoreSurfaceCandidate,
} from '../../src/surface.mjs';

const classify = (surface, trigger) => ({
  kind: trigger?.hasPopup === 'true' ? 'menu' : (trigger?.hasPopup || surface.innerRole || surface.role || 'overlay'),
});
const anchorOf = (triggerRect, surfaceRect) => ({
  side: 'bottom', align: 'start',
  gap: surfaceRect.y - (triggerRect.y + triggerRect.height),
  triggerRect, surfaceRect,
});

test('surface scoring penalizes viewport wrappers and prefers the painted semantic dialog', async () => {
  const roots = [{
    id: 'wrapper', role: null, innerRole: 'dialog', portalled: true,
    rect: { x: 0, y: 0, width: 1440, height: 900 },
  }];
  const dialog = {
    id: 'dialog', role: 'dialog', innerRole: null, portalled: false,
    rect: { x: 420, y: 180, width: 600, height: 360 },
  };
  const driver = {
    page: {
      evaluate: async () => ({
        wrapper: { visible: true, painted: false, interactiveDescendants: 2, viewportCoverage: 1, backdropLike: true, focusGuard: false },
        dialog: { visible: true, painted: true, interactiveDescendants: 4, viewportCoverage: 0.17, backdropLike: false, focusGuard: false },
      }),
    },
    refineSurface: async () => dialog,
  };

  const result = await new SurfaceResolver(driver, { classify, anchorOf }).resolve(roots, {
    trigger: { hasPopup: 'dialog', rect: { x: 430, y: 120, width: 80, height: 32 } },
  });

  assert.equal(result.surface.id, 'dialog');
  assert.equal(result.surface.resolution.candidateCount, 2);
  assert.ok(result.confidence > 0.7);
  assert.ok(result.candidates.find((candidate) => candidate.id === 'wrapper').evidence.negative.includes('backdrop-like'));
});

test('surface resolver rejects close ambiguous ties and records both candidates', async () => {
  const roots = [
    { id: 'one', role: 'menu', rect: { x: 10, y: 40, width: 200, height: 120 }, portalled: true },
    { id: 'two', role: 'menu', rect: { x: 12, y: 40, width: 200, height: 120 }, portalled: true },
  ];
  const driver = {
    page: { evaluate: async () => Object.fromEntries(roots.map(({ id }) => [id, {
      visible: true, painted: true, interactiveDescendants: 3,
      viewportCoverage: 0.02, backdropLike: false, focusGuard: false,
    }])) },
    refineSurface: async () => null,
  };

  await assert.rejects(
    new SurfaceResolver(driver, { classify, anchorOf }).resolve(roots, {
      trigger: { hasPopup: 'true', rect: { x: 10, y: 8, width: 80, height: 28 } },
    }),
    (error) => {
      assert.ok(error instanceof SurfaceResolutionError);
      assert.equal(error.code, 'ERR_SURFACE_AMBIGUOUS');
      assert.equal(error.candidates.length, 2);
      return true;
    },
  );
});

test('focus guards cannot win even when portalled', () => {
  const scored = scoreSurfaceCandidate({
    id: 'guard', role: null, innerRole: null, portalled: true,
    rect: { x: 0, y: 0, width: 1, height: 1 },
    visible: true, painted: false, interactiveDescendants: 0,
    viewportCoverage: 0, backdropLike: false, focusGuard: true,
  });

  assert.ok(scored.score < 0);
  assert.ok(scored.evidence.negative.includes('focus-guard'));
});
