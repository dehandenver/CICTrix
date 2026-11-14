---
title: Succession V2 Candidate Unblocking & Evidence Review Reconnection Roadmap
date: 2026-10-28
status: Done
summary: Fix candidate discovery in Succession V2 using department text lookup and multi-tier PDS fallbacks to populate successors immediately, and outline the future roadmap for reconnecting manual reviews and Security Phase 4A.
---

## Goal

Succession Planning V2 immediately discovers eligible department employees and populates the Ranked Candidates table using verified base profile data (tenure from date hired, training history, education, eligibility, IPCR scores) without failing on empty manual review tables. A structured roadmap is established to progressively reintroduce granular PDS reviews and security controls.

## Approach

1. **Discovery Alignment:** Fix `fetchSuccessionPoolV2` to resolve `critical_positions.department_id` to its name via `departments`, query `employees` using `department = deptName` and `status = 'Active'`, and apply standard exclusions (incumbent, same-title peers, probationary staff).
2. **Multi-Tier Fallbacks:**
   - Experience: Use `employee_work_experience` if present; if empty, compute City Hall tenure from `employees.date_hired`.
   - Education: Use `employee_education`; if empty, fall back to `employees.highest_educational_attainment`.
   - Eligibility: Use `employee_eligibility`; if empty, fall back to `employees.eligibility`.
   - Performance: Use `getLatestOverallScores` for IPCR overall ratings.
3. **Review Bypass / Auto-Scoring:** When manual review rows are disabled or unseeded, treat available evidence records as approved so candidates can be evaluated and ranked immediately under V2 fixed weights (30% Perf, 20% Exp, 20% Train, 15% Edu, 15% Elig).
4. **Future Reconnection Phases:**
   - Phase 1: Granular PDS data collection across departments.
   - Phase 2: Security Phase 4A implementation (office-scoped RLS and server authorization).
   - Phase 3: Progressive badging ("Provisional" vs "Audited") and snapshot staleness detection.

## Steps

1. Create working branch `fix/succession-v2-auto-fallback` from `upstream/main`.
2. Update `src/lib/api/successionPipelineV2.ts` to implement department name resolution, candidate discovery exclusions, multi-tier data fallbacks, and review bypass.
3. Update `src/components/SuccessionPlanningPage.tsx` to handle the unblocked pool and suppress the empty review prompt when reviews are bypassed.
4. Update unit and integration tests in `src/lib/api/successionPipelineV2.test.ts` and `src/components/SuccessionPlanningPage.v2.test.tsx`.
5. Run checks:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - `npm run check:migrations`
   - `npm run build`
6. Verify live rendering with Vite dev/preview.

## Risks

- **Qualification Exclusions:** Candidates failing minimum experience or training hours will be excluded from the ranked pool. Handled by displaying the excluded count and specific reasons below the table.
- **Tenure Approximations:** Relying on `date_hired` treats all City Hall service as relevant experience until granular work records are filed. Documented as a provisional score.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run check:migrations`
- `npm run build`

## Status check 2026-11-14

Done for Steps 1–6, through `2026-10-28-succession-v2-auto-fallback.md` (code `8aa7a3f`; summary `docs/session-summaries/2026-10-28-succession-v2-auto-fallback-summary.md`). `fetchSuccessionPoolV2` in `src/lib/api/successionPipelineV2.ts` reads `date_hired`, `highest_educational_attainment` and `eligibility`, with the tenure fallback. The reconnection roadmap (granular PDS collection, Security Phase 4A, Provisional/Audited badges, staleness checks) is future work and was not started. Its Phase 2 is the security plan's Phase 4A. A docs-only copy is on branch `docs/succession-v2-reconnection-roadmap`.
