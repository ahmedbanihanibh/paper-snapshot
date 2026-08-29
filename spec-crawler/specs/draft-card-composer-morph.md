# Draft card → composer origin morph (Linear)

Measured live 2026-08-12, linear.app/test-2-org-ahead/drafts, rAF recorder
over CDP (card at x238.5 y98 w378 h140; final panel x341 y94 w750).

## Measured values
- Panel animates **scale 0.8 → 1** and **opacity 0 → 1**.
- **transform-origin = the clicked card's center** (solved from frames:
  origin-x 427.5 vs card center-x 427.7; origin-y ≈ card lower half —
  y solve noisy because panel auto-height settled during entry).
- Visible motion ≈ **240ms**, exponential-decay tail (spring-like;
  scale .8 → .9766 in first ~20ms of motion, then decay to 1) —
  `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out) is the tween fit.
- Declared CSS animations on the panel: opacity 0→1 (ease) — the scale
  ride is scripted (WAAPI/JS), not a CSS class.
- No overlay dim behind the composer (measured separately; see
  --modal-shadow note in repo globals.css).

## Entry path
Drafts page → click a draft card → composer opens restoring the draft.

## Not measured
- Exact spring parameters (fit by tween approximation only).
- The close direction back to the card (not recorded; implemented as the
  symmetric scale 1→0.8 fade-out — assumption, flagged).
- Reduced-motion behavior.
