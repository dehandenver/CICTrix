---
title: Bring the General Services Office up to the imported-office standard (summary)
date: 2026-10-21
plan: docs/plans/2026-10-21-gso-postings-fixup.md
---

Written 2026-11-12 from a code, git and read-only database audit. No summary was recorded when the work shipped.

## What shipped

- `scripts/gso-postings-fixup/` with `gso_sheet.csv`, `generate.py` and the generated `gso_postings_fixup.sql`. PR #23 merged (commit `c81cc3e`).
- The SQL ran live. OCGSO exists with one active weighting row, and all 24 GSO posts carry full posting content (0 posts without a summary). Posts were updated in place by office and title, so post and seat IDs were kept (G3).
- GSO employees followed separately in PR #24 (`feat/gso-employees`), as G6 planned.

## Deviations from the plan

- G4 opened the 5 posts with a vacant seat. On 2026-11-12, **0 GSO posts are Open**. The likely cause is later work: the vacancy open/close model (`20261022131331`) and the rule that a vacancy needs a vacant plantilla (`20261027134156`), or someone closed them by hand. The cause was not traced.

## Checks run

- Audit 2026-11-12: read-only SELECTs confirmed OCGSO, its weighting and the 24 filled-in posts.
- Not checked: the count of 5 child divisions under OCGSO, and the public vacancy list in the browser.
