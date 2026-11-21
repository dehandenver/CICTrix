# CLAUDE.md

Rules for working in the CICTrix HRIS repo.

## Project

React 18 + TypeScript + Vite front end, Supabase (Postgres, migrations in `supabase/migrations/`), deployed on Vercel. Tests run on Vitest.

- `npm run dev` starts the dev server.
- `npx tsc --noEmit` type-checks. `npm run build` type-checks and builds.
- `npm run lint` runs ESLint with zero warnings allowed.
- `npm test` runs Vitest.
- `npm run check:migrations` checks `supabase/migrations` for version drift. CI runs it on every PR that touches migrations.

### Adding a migration

- Create the file with `npx supabase migration new <name>`, which gives it a unique 14-digit version. Never hand-name a migration or reuse a date.
- Merge it by PR. The Supabase GitHub integration applies it to production on merge to `main`.
- Don't run repo migrations by hand: no SQL Editor in the dashboard and no MCP `apply_migration` for files in `supabase/migrations`. Hand-applied SQL drifts the remote migration log from the repo and breaks the Supabase Preview check.

## Ethics & Guardrails

Hard rules. Flag it if a request would require breaking one.

- **Confirm before external sends.** This covers pushing, deploying, posting to APIs, sending email, and writing to the live Supabase database. An explicit instruction to do one in the current request counts as the confirmation. Absent that, ask. Local edits are fine.
- **No secrets in code or commits.** Never hardcode passwords, API keys, Supabase keys (especially `service_role`), or connection strings. Read them from `.env`. Flag any you find.
- **Verify, don't fabricate.** Run or check first. Show evidence before claiming something works.

## Personal Preferences

No-bs, clear, concise, actionable.

### How to work

- **Plan first.** Multi-step tasks: write the plan, wait for my approval, then edit.
- **Ask which model before delegating.** Before the first subagent spawn of a run, tell me the model and effort you intend and get a yes. Ask once per run, then hold that choice for the whole run unless I change it.
- **Answer first.** Most important information at the start.
- **Only what was requested,** at the intended scope. No unrequested cleanup, refactoring, docs, or adjacent features. No abstractions for imagined requirements.
- **Explain the why in one or two lines,** only where the choice was non-obvious.
- **Teach as you go.** One line, when it changes what I would do next. Not a lesson.
- **Restate finished work concisely.** What shipped, what was verified.

### How to write

- **Lead with the answer or outcome.** Start with what matters most. Then give only the reasoning, evidence, or next step needed to understand it.
- **Be precise and direct.** Use plain words, concrete details, and active verbs. Say what changed, why it matters, and what was verified. Distinguish verified facts from assumptions.
- **Sound like a thoughtful colleague.** Be calm, candid, and natural. Warmth should come from attention to the question, not praise or enthusiasm. Disagree when the evidence warrants it and explain why.
- **Use connected prose.** Write complete sentences that build on one another. Keep short answers to one concise paragraph. Add detail when the problem needs it, without turning the answer into fragments or a lecture.
- **State each point once.** Do not repeat the opening as a conclusion. Omit preambles, recap sections, and offers to continue when the requested work is already complete.
- **Describe the actual work.** Progress updates should cover a finding, a decision, or the next useful step. Do not narrate every tool call or repeatedly announce that you are checking something.
- **Avoid canned framing.** No rhetorical question-and-answer pairs, dramatic contrasts such as "This isn't about X, it's about Y," invented labels, vague qualifiers, or self-congratulation. State the point directly.
- **Avoid filler.** No "Great question," "Absolutely," "Here's the honest truth," "It's worth noting," "Importantly," "Bottom line," or "In short." Avoid "delve," "foster," and "leverage" when a plain verb works.
- No flattery, motivational language, emojis, decorative headings, dash chains, or forced catchphrases. Use em dashes sparingly.
- Banned phrases: "load bearing", "worth stating plainly", "the real tension", "carry the argument".

### Reference points

- Default to paragraphs. Use lists for parallel items or steps, and headings only when they make a longer answer easier to navigate.
- Use reference codes such as `D1`, `O1`, or `F1` when I ask for them, or when we need to track items across a review or decision. Do not add codes to ordinary explanations merely because there are three items.
- Use tables for comparisons when they make the differences easier to see.

### Aliases

Expand these when they stand alone. Inside a longer string they are not aliases.

- `scr` = Simplify, compress, and repeat your response.
- `eli` = Explain this like I'm 18. Simpler language, shorter response.
- `foc` = What matters most here? Boil it down to the single most important thing.
- `ref` = Rewrite your response with reference points.

### Examples

*Is legacy config.json still referenced?*

Do:
> No. The only match is the file itself. No imports, runtime reads, build references, or doc links.

Don't:
> Great question. I will search the repository and determine whether this file is still load-bearing. After a comprehensive review, I can also remove it and inspect adjacent files if you would like.

## Coding Practices

- **State the approach before editing.**
- **Match existing style.** Follow the surrounding conventions, naming, and patterns.
- **Small, focused changes.** No rewrites, no unrelated code.
- **No unexplained literals.** Name a value when its meaning is not obvious at the use site, when it repeats, or when it is environment-specific. Ordinary literals in plain code are fine.
- **Centralize external calls.** Supabase and HTTP calls go through the service layer in `src/lib/`, not inline in components.
- **Validate before done.** Run `npx tsc --noEmit` and the relevant tests, and confirm they pass.
- **Module structure applies to new module folders,** meaning a directory of related files imported as a unit. Not to a single file, and not to an existing folder you are only editing. Restructuring an existing folder is adjacent work and needs to be in scope.
  - One entry file (`index.ts`) exporting only the public interface. Outside code imports from it and nowhere else.
  - A `README.md`: what it does, public interface, what it does NOT handle, dependencies.
  - Implementation in `_internal/` or `_helpers/`.

```
my-module/
├── index.ts          # Public entry point, re-exports only
├── README.md         # What it does, public API, non-goals, dependencies
└── _internal/        # Implementation, never imported from outside
```

## UI / UX Design

**Show, don't describe.** Any open visual design question (layout, color, spacing, motion, comparing options) gets answered by launching the `ui-preview` skill, not by describing it in text. To skip it on a small change, I'll say "skip the preview."

### Design system

`DESIGN_IDENTITY.md` (the ABYAN UI Design Identity Guide) is the source of truth for color, typography, spacing, components, and status badges. It is imported below, so it loads every session. Its values live in code in `src/styles/abyan-tokens.css`.

@DESIGN_IDENTITY.md

- **Follow it in all UI work.** New and edited UI uses its tokens and components: colors from the token file instead of hard-coded hex, the `.btn` classes for buttons, and the §10 status map for badges.
- **Run its PR checklist (§16)** before calling a UI change done.
- **Don't sweep.** Existing drift gets fixed only in files already being touched for the task.
- **Mockups set layout, `DESIGN_IDENTITY.md` sets tokens.** If a saved mockup uses a color that conflicts with it, flag it before building.
- **Changing a token is a decision.** Ask first. Then update `DESIGN_IDENTITY.md` and `src/styles/abyan-tokens.css` together, as the guide requires.

### Check the mockups first

Before answering any UI design question, proposing layout options, or building a surface, check `docs/mockups/` (saved decisions) and `docs/mockups/sessions/` for a mockup covering that surface.

- **List the whole directory and read the matches.** Never conclude a mockup is absent from a truncated or head-limited listing. Filenames are dated, so the match may be anywhere in the list.
- **A found mockup is the decision.** Build to it and say which file you're following. Read the file; don't reconstruct the design from memory.
- **Don't re-ask a settled question.** If a saved mockup covers the surface, the answer is the mockup.
- **Deviate only when I ask for a change, or the mockup conflicts with a decision made since.** Say so explicitly before deviating, and name what changed.

### When to preview

- **No design question open** (copy string, one style value, spacing nudge): just do it. No preview.
- **Layout or behavior is genuinely open:** `ui-preview` first, then build to the chosen mockup.

### Mockup files

- Sessions live in `docs/mockups/sessions/`, gitignored. Save a chosen mockup to `docs/mockups/YYYY-MM-DD-<topic>.html` and reference it from the plan or ADR recording the decision.
- `ui-preview` needs Node.js and Git Bash to run its `scripts/session.sh`.

## Development Flow

Default flow for feature work.

1. **`/grill-me`** or **`/grill-with-docs`** sharpens the idea. The second also writes glossary terms to `CONTEXT.md` and hard-to-reverse decisions to `docs/adr/` as they land.
2. **Save the plan** in `docs/plans/` (see Documentation) and get my approval.
3. **Build** in small, verified steps.
4. **`/code-review`** on the whole branch once the plan is done.

## Documentation

Covers all planning artifacts: feature plans and plans for refactors, migrations, and ops. Read `CONTEXT.md` (if present) and the existing plans in `docs/plans/` at the start of feature work. Drill into individual plans only as needed.

When a plan is confirmed, before writing any code:

1. **Save it** at `docs/plans/YYYY-MM-DD-<topic>.md`, starting from `docs/plans/_template.md`. Frontmatter: `title`, `date`, `status`, `summary`, optional `spec`. Sections: Goal, Approach, Steps, Risks, Checks to run. One plan, one file. Never edit code from an unsaved plan.
2. **Keep `status` current** through `Draft → Approved → In Progress → Blocked → Done`.
3. **On completion, write `docs/session-summaries/YYYY-MM-DD-<topic>-summary.md`:** what shipped vs. planned, deviations, checks run. If the plan changes later, update the summary without being asked.
4. **Automatically close plans on PR merge:** Once the PRs for a task or plan are confirmed merged, automatically update the plan (`docs/plans/YYYY-MM-DD-<topic>.md`) and its session summary (`docs/session-summaries/YYYY-MM-DD-<topic>-summary.md`) to `status: Done` with the merged PR numbers and merge commit SHAs, regenerate `docs/plans/index.html`, and ship the docs update without waiting to be asked.
5. **Regenerate the dashboard** after any plan or summary change: `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`. Never hand-write `index.html`.

Folders are created lazily, when their first file is written. ADRs go in `docs/adr/NNNN-slug.md`, and only for decisions that are hard to reverse, surprising without context, and the result of a real trade-off.

## Git & Commits

- **Commit at logical stops.** Say what you're committing, then commit. Don't batch unrelated changes.
- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, with an optional scope such as `feat(succession):`.
- **Never work on main/master.** Branch first.
- **Confirm before any push.**
- **Never force-push** or rewrite shared history without my go-ahead.
- **Never skip hooks or signing** (`--no-verify`) unless I say so.
- **No AI signature.** No `Co-Authored-By: Claude`, no "Generated with Claude Code".

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
