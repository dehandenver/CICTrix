# Persistence integrity: Task 1 checkpoint

Partial delivery of `docs/plans/2026-11-17-persistence-integrity-repairs.md`; Tasks 2–10 remain pending.

## Shipped locally

- Preserve all stored education rows, including repeated College qualifications, Doctorate, and unrecognized legacy levels.
- Ignore only wholly blank new placeholders; reject meaningful partial rows with row/field errors before any save request.
- Share date/range/numeric validation across all seven PDS list services and guard family/background scalar writes when their lists are invalid.
- Keep the existing education-row layout and failure feedback; no redesign.

## Verification

Builder: `deepseek/deepseek-flash#max` (DeepSeek V4.1 Flash 1017, existing API-key connection). Parent review: `openai/gpt-6.1-sol#medium` (OpenAI OAuth).

Parent independently ran:

- PDS service/component/saved-section tests: 3 files / 19 passed.
- Whole current-tree suite: 172 files / 1,619 passed.
- `npx tsc --noEmit`: passed.
- Scoped ESLint on all five changed source/test paths: passed.
- Synthetic-localhost `npm run build`: passed.
- `git diff --check`: passed.

Existing React test diagnostics, Vite CJS/Browserslist warnings, and bundle-size warnings remain. No corrective builder dispatches were needed.

## Boundaries and deviations

Doctorate receives a missing-level placeholder and the existing section description now says “Elementary through Doctorate,” as required by the approved six-level grouping. Eligibility dates are individually validated; no new exam-versus-license-expiry policy was added.

This task does not fix delete/reinsert atomicity or preserve database IDs during saving; Task 2 owns reconciliation. Database acceptance is blocked by an unavailable Docker daemon, and no rendered-browser acceptance was run. No live database writes, deployment, push, email, or real credential issuance occurred.

An unrelated DataTable snapshot is listed modified by Git with no content diff and was left unstaged and untouched.
