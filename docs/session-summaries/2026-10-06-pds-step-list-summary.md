# PDS step list: session summary

Plan: `docs/plans/2026-10-06-pds-step-list.md`. Mockup: `docs/mockups/2026-10-06-pds-step-list.html`.

## Shipped vs. planned

- **Step list component** (`src/modules/employee/PdsStepList.tsx`, `pds-step-list.css`, `PdsStepList.test.tsx`): as planned. Vertical numbered list at ≥1024px; compact strip (step count, segmented bar, prev/current/next, jump select) below.
- **PDS section** (`PersonalDataSheetSection.tsx`): pill tabs replaced by the step list in a two-column layout; `SUB_TABS` gained numerals I–IX; `savedIds` follows the approved checkmark rule. All nine save handlers mark only on success.
- **Saved-section predicates**: `getInitiallySavedSections` (exported for tests) in the same file. Field choices: personal = place of birth (HR enters the name at hire, so the name alone would check it for everyone; the hire flow never sets place of birth); family = spouse/parent names or children; education = a row with a school; list sections = non-empty list; otherInfo = skills/distinctions/memberships; background = any answered yes/no question, gov ID type, or references.

## Deviations

- Dot numerals are 12px, not the mockup's 10px/8px, to respect the 12px type floor. "VIII" fits the 24px dot (measured).
- CSS uses `var(--token, #hex)` fallbacks because `abyan-tokens.css` is scoped to `.abyan-ds`/`.rsp-ds` and the employee page is outside it.
- Review fixes: compact-strip spans now inherit color (the legacy global `span`/`button:hover` rule in `globals.css`, DESIGN_IDENTITY §17 item 8, made them dark and disabled buttons look enabled); prev/current/next share width equally so the Next button no longer overflows at 375px; removed a duplicate 16px margin under the strip.
- Added `PersonalDataSheetSection.savedSections.test.ts` for the predicates (review finding: untested logic).

## Open

- `npm run lint` fails repo-wide: no ESLint config file exists (pre-existing, also on `main`).
- Not checked inside the logged-in employee portal (login goes to the live Supabase project). The component was mounted on the dev server with the real global CSS and checked at 375, 768, 1024 and 1280px.

## Checks run

- `npx tsc --noEmit`: pass.
- `npm test`: 13 files, 141 tests pass.
- Browser (dev server, real CSS): desktop list renders per mockup; compact strip colors correct (enabled `#363EE8`, disabled grey); no horizontal overflow at 375px for any of the nine steps; layout switches at 1024px.
- Opus review: 1 confirmed defect (fixed), 1 product question (resolved: Personal Information now keys on place of birth), 1 low-risk note (no change: single-user portal), 1 test gap (fixed).
