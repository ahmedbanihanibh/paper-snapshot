const OVERLAY_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'listbox', 'tooltip', 'tree', 'grid']);

export class SurfaceResolutionError extends Error {
  constructor(message, { code = 'ERR_SURFACE_RESOLUTION', candidates = [], evidence = null } = {}) {
    super(message);
    this.name = 'SurfaceResolutionError';
    this.code = code;
    this.candidates = candidates;
    this.evidence = evidence;
  }
}

function area(rect) {
  return Math.max(0, rect?.width ?? 0) * Math.max(0, rect?.height ?? 0);
}

function declaredKind(trigger) {
  const value = trigger?.hasPopup;
  if (!value || value === 'false') return null;
  return value === 'true' ? 'menu' : value;
}

function anchorQuality(anchor) {
  if (!anchor) return { score: 0, evidence: 'no-anchor' };
  const gap = Math.abs(anchor.gap ?? Infinity);
  if (gap <= 16) return { score: 14, evidence: `tight-${anchor.side}-anchor` };
  if (gap <= 64) return { score: 8, evidence: `near-${anchor.side}-anchor` };
  if (gap <= 180) return { score: 2, evidence: `distant-${anchor.side}-anchor` };
  return { score: -10, evidence: 'implausibly-distant-anchor' };
}

/** Pure scoring seam: browser inspection is deliberately separate and testable. */
export function scoreSurfaceCandidate(candidate, { trigger = null, classify = null, anchor = null } = {}) {
  let score = 0;
  const positive = [];
  const negative = [];
  const role = candidate.role ?? null;
  const semanticRole = role && OVERLAY_ROLES.has(role);

  if (candidate.visible === false) {
    score -= 1_000;
    negative.push('not-visible');
  }
  if (semanticRole) {
    score += role === 'dialog' || role === 'alertdialog' ? 48 : 42;
    positive.push(`semantic-role:${role}`);
  }
  if (candidate.innerRole) {
    score += 18;
    positive.push(`semantic-descendant:${candidate.innerRole}`);
  }
  if (candidate.refinedFrom) {
    score += 14;
    positive.push('refined-from-wrapper');
  }
  if (candidate.painted) {
    score += 14;
    positive.push('painted-surface');
  }
  if ((candidate.interactiveDescendants ?? 0) > 0) {
    const points = Math.min(16, 4 + candidate.interactiveDescendants * 2);
    score += points;
    positive.push(`interactive-descendants:${candidate.interactiveDescendants}`);
  }
  if (candidate.portalled) {
    score += 6;
    positive.push('portalled');
  }

  const classification = typeof classify === 'function' ? classify(candidate, trigger) : null;
  const declared = declaredKind(trigger);
  const classifiedKind = classification?.kind ?? candidate.innerRole ?? candidate.role ?? null;
  if (declared && classifiedKind === declared) {
    score += 20;
    positive.push(`matches-trigger:${declared}`);
  } else if (declared && classifiedKind && classifiedKind !== 'overlay') {
    score -= 8;
    negative.push(`trigger-kind-mismatch:${declared}/${classifiedKind}`);
  }

  const anchoring = anchorQuality(anchor);
  score += anchoring.score;
  (anchoring.score >= 0 ? positive : negative).push(anchoring.evidence);

  if (candidate.viewportCoverage >= 0.8 && !semanticRole) {
    score -= 70;
    negative.push(`viewport-wrapper:${candidate.viewportCoverage.toFixed(2)}`);
  }
  if (candidate.backdropLike) {
    score -= 55;
    negative.push('backdrop-like');
  }
  if (candidate.focusGuard) {
    score -= 120;
    negative.push('focus-guard');
  }
  if ((candidate.rect?.width ?? 0) < 8 || (candidate.rect?.height ?? 0) < 8) {
    score -= 80;
    negative.push('measurement-shim-size');
  }
  if (!semanticRole && !candidate.innerRole && !candidate.painted && (candidate.interactiveDescendants ?? 0) === 0) {
    score -= 24;
    negative.push('no-semantic-paint-or-interaction-evidence');
  }

  return {
    ...candidate,
    score,
    classification,
    anchor,
    evidence: { positive, negative },
  };
}

function inspectSurfaceCandidates({ attribute, ids }) {
  const output = {};
  const transparent = (color) => !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
  const interactiveSelector = 'button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[role="button"],[role="menuitem"],[role="option"],[aria-haspopup]';
  for (const id of ids) {
    const element = document.querySelector(`[${attribute}="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const role = element.getAttribute('role') || (element.tagName === 'DIALOG' ? 'dialog' : null);
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    const coverage = Math.max(0, rect.width * rect.height) / viewportArea;
    const visible = rect.width > 0 && rect.height > 0
      && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    const painted = !transparent(style.backgroundColor)
      || style.boxShadow !== 'none'
      || parseFloat(style.borderTopWidth) > 0
      || parseFloat(style.outlineWidth) > 0;
    const interactiveDescendants = element.querySelectorAll(interactiveSelector).length;
    const classText = typeof element.className === 'string' ? element.className.toLowerCase() : '';
    const labelText = `${element.getAttribute('aria-label') || ''} ${element.id || ''} ${classText}`.toLowerCase();
    const backdropLike = coverage >= 0.8
      && !role
      && interactiveDescendants === 0
      && (/backdrop|overlay|scrim/.test(labelText) || style.position === 'fixed');
    const focusGuard = (rect.width <= 2 || rect.height <= 2)
      || (/focus.guard|focus-sentinel|sentinel/.test(labelText))
      || (element.getAttribute('aria-hidden') === 'true' && element.tabIndex >= 0);
    output[id] = {
      visible,
      painted,
      interactiveDescendants,
      viewportCoverage: coverage,
      backdropLike,
      focusGuard,
      position: style.position,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
    };
  }
  return output;
}

function confidenceFor(best, runnerUp, minimumScore) {
  const absolute = Math.max(0, Math.min(1, (best.score - minimumScore + 20) / 100));
  if (!runnerUp) return Math.max(0.7, absolute);
  const separation = Math.max(0, Math.min(1, (best.score - runnerUp.score) / 30));
  return Math.round((absolute * 0.55 + separation * 0.45) * 1000) / 1000;
}

export class SurfaceResolver {
  constructor(driver, {
    classify = null,
    anchorOf = null,
    ambiguityDelta = 6,
    minimumScore = 10,
  } = {}) {
    if (!driver?.page || typeof driver.page.evaluate !== 'function') {
      throw new TypeError('SurfaceResolver requires a driver with page.evaluate().');
    }
    this.driver = driver;
    this.classify = classify;
    this.anchorOf = anchorOf;
    this.ambiguityDelta = ambiguityDelta;
    this.minimumScore = minimumScore;
  }

  async resolve(roots, { trigger = null } = {}) {
    if (!Array.isArray(roots) || roots.length === 0) {
      throw new SurfaceResolutionError('No surface candidates were provided.', {
        code: 'ERR_SURFACE_NOT_FOUND',
      });
    }

    const candidates = [];
    const seen = new Set();
    for (const root of roots) {
      if (!root?.id || seen.has(root.id)) continue;
      seen.add(root.id);
      candidates.push({ ...root });
      const refined = typeof this.driver.refineSurface === 'function'
        ? await this.driver.refineSurface(root.id).catch(() => null)
        : null;
      if (refined?.id && !seen.has(refined.id)) {
        seen.add(refined.id);
        candidates.push({ ...refined, refinedFrom: root.id });
      }
    }

    const inspection = await this.driver.page.evaluate(inspectSurfaceCandidates, {
      attribute: 'data-spec-id',
      ids: candidates.map((candidate) => candidate.id),
    });
    const scored = candidates.map((candidate) => {
      const enriched = { ...candidate, ...(inspection?.[candidate.id] ?? {}) };
      const anchor = typeof this.anchorOf === 'function' ? this.anchorOf(trigger?.rect, enriched.rect) : null;
      return scoreSurfaceCandidate(enriched, {
        trigger,
        classify: this.classify,
        anchor,
      });
    }).sort((left, right) => right.score - left.score || area(left.rect) - area(right.rect) || left.id.localeCompare(right.id));

    const best = scored[0];
    const runnerUp = scored[1] ?? null;
    if (!best || best.score < this.minimumScore) {
      throw new SurfaceResolutionError(`No candidate had enough surface evidence (best score ${best?.score ?? 'none'}).`, {
        code: 'ERR_SURFACE_NOT_FOUND',
        candidates: scored,
      });
    }

    const gap = runnerUp ? best.score - runnerUp.score : Infinity;
    if (runnerUp && gap <= this.ambiguityDelta) {
      throw new SurfaceResolutionError(`Surface resolution is ambiguous: ${best.id} and ${runnerUp.id} are separated by only ${gap} points.`, {
        code: 'ERR_SURFACE_AMBIGUOUS',
        candidates: scored,
        evidence: { gap, ambiguityDelta: this.ambiguityDelta },
      });
    }

    const confidence = confidenceFor(best, runnerUp, this.minimumScore);
    return {
      surface: {
        ...best,
        resolution: {
          confidence,
          score: best.score,
          evidence: best.evidence,
          candidateCount: scored.length,
        },
      },
      confidence,
      candidates: scored.map((candidate) => ({
        id: candidate.id,
        score: candidate.score,
        role: candidate.role ?? null,
        innerRole: candidate.innerRole ?? null,
        rect: candidate.rect,
        refinedFrom: candidate.refinedFrom ?? null,
        evidence: candidate.evidence,
      })),
      evidence: {
        winner: best.id,
        runnerUp: runnerUp?.id ?? null,
        scoreGap: Number.isFinite(gap) ? gap : null,
      },
    };
  }
}

export async function resolveSurface(driver, roots, { trigger = null, ...options } = {}) {
  return new SurfaceResolver(driver, options).resolve(roots, { trigger });
}
