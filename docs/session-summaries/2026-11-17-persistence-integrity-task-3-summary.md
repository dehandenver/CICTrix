# Persistence integrity: Task 3

Local implementation of Task 3 from `docs/plans/2026-11-17-persistence-integrity-repairs.md`.

## Delivered

- Profile writes require a checked returned employee row; zero matches fail.
- Height and weight can be cleared to SQL null without changing omitted fields or losing zero.
- PDS merges confirmed data locally without a duplicate parent write.
- Dirty drafts survive unrelated saves; employee identity changes clear lists/revisions.
- Setup saves await their results, block overlapping writes, and show failures before ordinary advancement.

The existing voluntary Skip escape remains: attempt the partial save, then close with any failure shown on the page. No new layout, tokens, migrations or dependencies.

## Verification and review

DeepSeek/max implemented using the existing DeepSeek key connection; parent Sol/medium over OpenAI OAuth reviewed.

Parent completion rerun: 4 affected service/component files, 52 tests passed; full suite 173 files/1,645 tests passed; TypeScript, scoped ESLint, production build and whitespace checks passed.

No corrective dispatches. The idempotent ref mutation inside a state updater remains a minor review observation, not a claimed fixed bug.

## Remaining boundaries

Real PostgREST update/returned-row behavior and rendered focus/contrast/responsive checks are not verified. Task 2's production-shaped fixtures still need correction and concurrency acceptance is open; its migration did compile locally and its SQL suite passed on the older local schema. Existing permissive ownership policies remain a separate security issue.

Task 4 and later tasks are not started. No push, deployment, production write, email or credential issuance occurred. Unrelated DataTable snapshot remains preserved.
