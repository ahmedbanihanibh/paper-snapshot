# Dashboard workspace chrome — Linear model

Source: Paper file Open grove (`01M0JG34H5ZKFDPTV1J120YDXQ`) artboards
`16S-0` (issue detail, 1432×723) and `2U5-0` (inbox, 1432×900), plus
`specs/sidebar-row-wash.md` (measured 2026-08-10 at 1440×900).

Live attach 2026-08-21: Edge CDP at `http://127.0.0.1:9222` (not
`localhost` / `::1`). Tab `https://linear.app/test-workspace-bb/team/TES/all`,
title "Test workspace bb › All issues", viewport **1432×723**. Bundle:
`spec-crawler/spec-linear-workspace` state `001-workspace-all-issues-rest`.

## Measured (live CDP + prior specs)

| | |
|---|---|
| sidebar width | **244px**, full viewport height |
| scene (`main`) | **1180×679 at (244, 8)** — 8px top inset |
| scene header | 88px tall at (245, 9): title row + view tabs |
| agent dock | chips at **y=691**, 28px, scene column only (not under sidebar) |
| workspace switcher | 142×28 at (12, 16) |
| search / create | 28×28 at x=172 / x=204, y=16 |
| nav row | 220×28 at x=12; My issues y=61, Inbox y=90 (29px pitch) |
| row wash | 220×28, radius 8px, 12px inset from sidebar edges |
| row pitch | 29px |
| label | 13px / 500 |
| hover wash | paints same frame (no background transition) |
| selected hover | **same** as selected rest |

## How it was reached

Issue-detail and Inbox captures in Open grove; sidebar-row-wash.md live
Linear measurement.

## Not measured this session

- Live CDP hover/focus matrix on Linear (debug browser did not stay up)
- Agent prompt-chip row contents (captured as screenshots only)
- Light-theme pair of the workspace chrome
