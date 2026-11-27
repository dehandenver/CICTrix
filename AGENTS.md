# AGENTS.md

Rules for any coding agent working in the CICTrix HRIS repo. Claude Code also reads `CLAUDE.md`; this file is the portable copy so Codex, Gemini, Cursor, and others follow the same rules. If the two disagree, `CLAUDE.md` and the user's current instruction win, in that order.

## Project

CICTrix / ABYAN HRIS. React 18 + TypeScript + Vite front end, Supabase (Postgres, migrations in `supabase/migrations/`), deployed on Vercel. Tests on Vitest. Windows host: PowerShell is primary, Git Bash available.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npx tsc --noEmit` | Type-check |
| `npm run build` | Type-check and build |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm test` | Vitest |
| `npm run check:migrations` | Migration version drift check; CI runs it on PRs touching migrations |

### Migrations

- Create with `npx supabase migration new <name>`, which gives a unique 14-digit version. Never hand-name a migration or reuse a date.
- Merge by PR. The Supabase GitHub integration applies it to production on merge to `main`.
- Do not run repo migrations by hand: no dashboard SQL Editor, no MCP `apply_migration` for files in `supabase/migrations`. Hand-applied SQL drifts the remote migration log and breaks the Supabase Preview check.

### Repo facts learned the hard way

- **Never push to or open PRs against `Trsha11102004/CICTrix`.** Pushes go to `origin` (`Jayyoo07/CICTrix`). PR branches go to `https://github.com/Jayyoo07/CICTrix-Fork.git`, then `gh pr create --repo dehandenver/CICTrix --base main --head Jayyoo07:<branch>`. Always pass `--repo` explicitly: GitHub reports Trsha as the fork's parent and will default a PR there. Never push a branch straight to `upstream`. Vercel checks on these fork PRs fail with "Authorization required to deploy"; that is expected.
- **Supabase MCP writes auto-decline** in the desktop app (`{"status":"declined"}`), reads work. For live DB changes, write the SQL to a file and ask the user to run it in the dashboard editor, reminding them to confirm the "Potential issue detected" dialog. Verify afterwards with read queries. Storage policies must be changed in Storage > Policies, not inside a migration (`storage.objects` is owned by `supabase_storage_admin`).
- **Generated people use Filipino names.** `Faker('en_PH')` alone returns US names; use curated Filipino first-name and surname lists via `fake.random_element`, pick sex first, and spot-check a sample in the report. The system models a Philippine LGU.
- Prefer the `employees` base table over drifted views. IPCR, admin roles, and employees schema notes live in the user's Claude memory folder; ask if a task depends on them.

## Hard rules

Flag it if a request would break one.

- **Confirm before external sends.** Pushing, deploying, posting to APIs, sending email, writing to the live Supabase database. An explicit instruction to do one in the current request counts as confirmation. Otherwise ask. Local edits are fine.
- **No secrets in code or commits.** No hardcoded passwords, API keys, Supabase keys (especially `service_role`), or connection strings. Read from `.env`. Flag any you find.
- **Verify, don't fabricate.** Run or check first. Show evidence before claiming something works.

## How to work

- **Plan first.** Multi-step tasks: write the plan, wait for approval, then edit.
- **Ask which model before delegating.** Before the first subagent spawn or external-agent dispatch of a run, state the model and effort and get a yes. Ask once per run, then hold that choice.
- **Answer first.** Most important information at the start.
- **Only what was requested,** at the intended scope. No unrequested cleanup, refactors, docs, or adjacent features. No abstractions for imagined requirements.
- **Explain the why in one or two lines,** only where the choice was non-obvious.
- **Teach as you go.** One line, only when it changes what the user would do next.
- **Restate finished work concisely.** What shipped, what was verified.

## How to write

- Lead with the answer or outcome, then only the reasoning, evidence, or next step needed.
- Plain words, concrete details, active verbs. Say what changed, why it matters, what was verified. Separate verified facts from assumptions.
- Calm, candid, colleague tone. No praise or enthusiasm. Disagree when evidence warrants.
- Connected prose in complete sentences. Short answers are one concise paragraph. Default to paragraphs; lists for parallel items or steps; headings only for longer answers; tables for comparisons.
- State each point once. No preamble, no recap section, no offers to continue when the work is done.
- Progress updates cover a finding, a decision, or the next useful step. Do not narrate every tool call.
- Avoid canned framing: no rhetorical Q&A pairs, no "This isn't about X, it's about Y", no invented labels, vague qualifiers, or self-congratulation.
- Avoid filler: "Great question", "Absolutely", "Here's the honest truth", "It's worth noting", "Importantly", "Bottom line", "In short". Avoid "delve", "foster", "leverage" when a plain verb works.
- No flattery, motivational language, emojis, decorative headings, dash chains. Em dashes sparingly.
- Banned phrases: "load bearing", "worth stating plainly", "the real tension", "carry the argument".
- Use reference codes (`D1`, `O1`, `F1`) only when asked or when tracking items across a review.

Example. Q: "Is legacy config.json still referenced?" Good: "No. The only match is the file itself. No imports, runtime reads, build references, or doc links." Bad: "Great question. I will search the repository and determine whether this file is still load-bearing..."

### Aliases

Expand only when the message is exactly the alias.

- `scr` = Simplify, compress, and repeat your response.
- `eli` = Explain this like I'm 18. Simpler language, shorter.
- `foc` = What matters most here? Boil it down to the single most important thing.
- `ref` = Rewrite your response with reference points.

## Coding practices

- State the approach before editing.
- Match existing style: conventions, naming, patterns.
- Small, focused changes. No rewrites, no unrelated code.
- No unexplained literals. Name a value when its meaning isn't obvious at the use site, when it repeats, or when it is environment-specific.
- Centralize external calls: Supabase and HTTP calls go through the service layer in `src/lib/`, never inline in components.
- Validate before done: run `npx tsc --noEmit` and the relevant tests, confirm they pass.

New module folders only (a directory of related files imported as a unit; not single files, not existing folders you are merely editing):

- One entry file (`index.ts`) exporting only the public interface; outside code imports only from it.
- A `README.md`: what it does, public interface, what it does NOT handle, dependencies.
- Implementation in `_internal/` or `_helpers/`.

## UI / UX design

- **Modern Web Guidance is mandatory.** Launch the `modern-web-guidance` skill (`npx.cmd -y modern-web-guidance@latest search` + `retrieve`) **first** during any UI change or related HTML/CSS, layout, responsiveness, accessibility, form, dialog, popover, navigation, or client-side DOM/UX work in this system. Verify compliance with the retrieved guides before finishing and include the `### Modern Web Guidance` disclosure section when delivering changes.

**Show, don't describe.** An open visual question (layout, color, spacing, motion, comparing options) is answered with the `ui-preview` skill, not text. Skip it for small changes, or when the user says "skip the preview".

- `DESIGN_IDENTITY.md` (repo root) is the source of truth for color, type, spacing, components, and status badges. Read it before any UI work. Tokens live in `src/styles/abyan-tokens.css`. Use the tokens, not hard-coded hex; use the `.btn` classes; use the §10 status map for badges. Run its §16 PR checklist before calling a UI change done.
- Don't sweep: fix existing drift only in files already being touched.
- Mockups set layout, `DESIGN_IDENTITY.md` sets tokens. If a saved mockup conflicts with a token, flag it before building.
- Changing a token is a decision: ask first, then update `DESIGN_IDENTITY.md` and `abyan-tokens.css` together.
- **Check `docs/mockups/` and `docs/mockups/sessions/` first.** List the whole directory; filenames are dated, so the match may be anywhere. Never conclude "absent" from a truncated listing. A found mockup is the decision: build to it and name the file. Don't re-ask a settled question. Deviate only when the user asks for a change or a later decision conflicts; say so and name what changed.
- Save a chosen mockup to `docs/mockups/YYYY-MM-DD-<topic>.html` and link it from the plan or ADR recording the decision. Sessions live in `docs/mockups/sessions/` (gitignored).

## Development flow (feature work)

1. `/grill-me` or `/grill-with-docs` sharpens the idea. The second also writes glossary terms to `CONTEXT.md` and hard-to-reverse decisions to `docs/adr/` as they land.
2. Save the plan in `docs/plans/` and get approval.
3. Build in small, verified steps.
4. `/code-review` on the whole branch once the plan is done.

## Documentation

Read `CONTEXT.md` (if present) and the existing plans in `docs/plans/` at the start of feature work. Drill into individual plans only as needed.

When a plan is confirmed, before any code:

1. Save it at `docs/plans/YYYY-MM-DD-<topic>.md` using `docs/plans/_template.md`. Frontmatter: `title`, `date`, `status`, `summary`, optional `spec`. Sections: Goal, Approach, Steps, Risks, Checks to run. One plan, one file. Never edit code from an unsaved plan.
2. Keep `status` current: Draft → Approved → In Progress → Blocked → Done.
3. On completion write `docs/session-summaries/YYYY-MM-DD-<topic>-summary.md`: what shipped vs. planned, deviations, checks run. Update it if the plan changes later without being asked.
4. **Automatically close plans on PR merge:** Once the PRs for a task or plan are confirmed merged, automatically update the plan (`docs/plans/YYYY-MM-DD-<topic>.md`) and its session summary (`docs/session-summaries/YYYY-MM-DD-<topic>-summary.md`) to `status: Done` with the merged PR numbers and merge commit SHAs, regenerate `docs/plans/index.html`, and ship the docs update without waiting to be asked.
5. After any plan or summary change, regenerate the dashboard: `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`. Never hand-write `index.html`.

Folders are created lazily. ADRs go in `docs/adr/NNNN-slug.md`, only for decisions that are hard to reverse, surprising without context, and the result of a real trade-off.

## Git and commits

- Commit at logical stops; say what you're committing, then commit. Don't batch unrelated changes.
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, optional scope like `feat(succession):`.
- Never work on `main`/`master`; branch first.
- Confirm before any push. Never force-push or rewrite shared history without a go-ahead. Never skip hooks or signing (`--no-verify`).
- No AI signature. No `Co-Authored-By` trailer for the agent, no "Generated with ..." line, in commits or PRs. If a tool injects one by default, remove it.

### Pull requests

Every PR description must use this exact structure:

```markdown
## What changed and why

<Concise narrative paragraph stating what changed, how it was verified against main/DB, and why.>

| <Group / Result> | <Items / Scope> |
|---|---|
| **<Category>** | <Items> |

- <Concrete bullet points of the key changes.>

<One-line scope note, e.g. "Docs only. No code or migration changes." or migration summary.>

**Linked issue:** <issue link or "none.">

## Things for reviewers to know

- **<Callout label>:** <Candid reviewer notes: trade-offs, out-of-scope items, manual checks replaced by automated ones, dropped steps, or schema/runtime caveats.>

## Checks run (on `<short-sha>`)

- `<command>`: <concise, honest result — including any local environment caveat and the corresponding CI/Vercel result>.
```

Omit the table only when a single-item change has nothing parallel to compare; keep all three `##` headings, `**Linked issue:**`, and the candid reviewer/check format on every PR.

## Skills

The user's own procedures live in `.claude/skills/<name>/SKILL.md` and are portable: read the file, then follow it. If the agent has no skill system, treat each as a named procedure the user can invoke by its slash name.

| Skill | Trigger |
| --- | --- |
| `grilling` | Stress-test a plan before building, or any "grill" phrase. Interview one question at a time with a recommended answer; look facts up in the code instead of asking; don't build until the user confirms shared understanding. |
| `grill-me` | User-invoked. Runs a grilling session. |
| `grill-with-docs` | User-invoked. Grilling plus domain modeling, writing `CONTEXT.md` terms and ADRs as decisions land. |
| `domain-modeling` | Pin down terminology, record an architectural decision, or maintain the domain model. `CONTEXT.md` is a glossary only; ADRs only when a decision is hard to reverse, surprising, and a real trade-off. |
| `ui-preview` | A real visual design question. Writes one screen to a live session, hands off the URL, reads the interaction events next turn, saves the winner to `docs/mockups/`. Needs Node.js and Git Bash. |

Other project skills, if present: `.claude/skills/impeccable/` (frontend critique, audit, polish, harden). Vendor and plugin skills (docx, pdf, xlsx, pptx) are product-provided, not user rules.
