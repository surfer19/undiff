# Technical PRD: Explore Pipeline — Implementation Spec

**Feature:** Explore Pipeline (see [PRD_explore-pipeline.md](PRD_explore-pipeline.md))
**Packages affected:** `@sage/api`, `@sage/shared`, `@sage/web`

---

## Architecture Overview

The Explore Pipeline adds three new subsystems to the existing Sage API:

1. **Options Engine** — receives an explore run, fetches file content from GitHub, calls Anthropic to generate structured options, posts a checkbox comment
2. **Branch Agents** — for each selected option, a parallel AI agent generates code changes and simulated analysis
3. **Orchestrator** — coordinates agent execution, aggregates results, posts summary comment

All AI work runs asynchronously (fire-and-forget from the webhook handler) to avoid blocking GitHub's 10-second webhook timeout.

```
Webhook → persist run → 202 Accepted
                ↓ (async)
        Options Engine → post checkbox comment
                ↓ (user checks boxes)
        Webhook (edited) → detect new selections
                ↓ (async)
        Orchestrator → Branch Agent A | Branch Agent C
                ↓
        Post results comment with web links
```

---

## Implementation Checklist

### Phase 1: Database & Types

- [x] **1.1 — Add `solution_branches` Drizzle table** (`packages/api/src/db/schema.ts`)
  - Columns: `id` (varchar 21, nanoid PK), `run_id` (varchar 21, FK → explore_runs.id), `option_id` (varchar 1), `label` (text), `description` (text), `code` (text — full generated code or unified diff), `new_files` (jsonb — `Record<string, string>`), `pros` (jsonb — `string[]`), `cons` (jsonb — `string[]`), `risk` (varchar 10 — `RiskLevel`), `complexity_delta` (integer), `files_changed` (jsonb — `string[]`), `status` (varchar 20 — `SolutionBranchStatus`), `sandbox` (jsonb — `SandboxResult | null`), `agent_log` (jsonb — `AgentLogEntry[]`), `created_at` (timestamptz, default now), `updated_at` (timestamptz, default now)
  - Approach: Define table in the existing `schema.ts` file alongside `exploreRuns`. Add Drizzle `relations()` for `exploreRuns` → `solutionBranches` (one-to-many).

- [x] **1.2 — Add `AgentLogEntry` interface to shared types** (`packages/shared/src/types.ts`)
  - Shape: `{ step: string, action: string, reasoning: string, outcome: string, durationMs: number }`
  - Add `agentLog: AgentLogEntry[]` to `SolutionBranch` interface
  - Export new type from barrel

- [x] **1.3 — Generate and run DB migration**
  - Run `pnpm --filter @sage/api db:generate` to produce SQL migration for `solution_branches` table
  - Run `pnpm --filter @sage/api db:migrate` to apply
  - Verify migration creates FK constraint and proper column types

- [x] **1.4 — Add `WEB_APP_URL` to env config** (`packages/api/src/config/env.ts`)
  - Add optional `WEB_APP_URL` field to Zod schema, default `http://localhost:5173`
  - Used by comment formatters to build clickable links

- [x] **1.5 — Create GitHub Actions CI pipeline** (`.github/workflows/ci.yml`)
  - Triggers on every PR and push to `main`
  - Runs: `pnpm install` → `pnpm build` → `pnpm lint` → `pnpm typecheck` → `pnpm test` (when tests exist)
  - Uses Node 22, pnpm 10, with dependency caching
  - All boundary checks from the Quality Gates run automatically — a PR cannot merge if CI is red
  - No secrets required for build/lint/typecheck steps (DB and API keys only needed for e2e, added later)

### Phase 2: Checkbox Interaction Model

- [x] **2.1 — Expand webhook action filter** (`packages/api/src/routes/webhooks.ts`)
  - Current: only `action === 'created'` is processed (L108)
  - New logic:
    ```
    if (action === 'created' && user.type !== 'Bot') → existing /explore + /run flow
    if (action === 'edited' && body starts with BOT_COMMENT_PREFIX && user.type !== 'Bot') → checkbox handler
    else → ignore
    ```
  - The `edited` action fires when a user ticks/unticks a checkbox in any GitHub comment. Since Sage's bot comments start with `<!-- sage -->`, we can identify our own comments and parse checkbox state.

- [x] **2.2 — Embed run ID in bot comments**
  - Add `<!-- sage:run:{runId} -->` as the second line of every bot comment (after `<!-- sage -->`)
  - This allows the `edited` handler to extract the associated `explore_runs` row without guessing based on PR/file context

- [x] **2.3 — Create checkbox parser** (`packages/api/src/github/parse-checkboxes.ts`)
  - New module exports `parseCheckboxes(commentBody: string): { runId: string, checkedOptionIds: string[] } | null`
  - Uses two regexes:
    - `RUN_ID_COMMENT_REGEX`: `/<!-- sage:run:(\w+) -->/` → extracts runId
    - `CHECKBOX_OPTION_REGEX`: `/- \[(x| )\] \*\*([A-C])/g` → extracts checked state + option ID
  - Returns `null` if the comment isn't a Sage options comment

- [x] **2.4 — Add checkbox regex patterns to shared constants** (`packages/shared/src/constants.ts`)
  - `CHECKBOX_OPTION_REGEX = /- \[(x| )\] \*\*([A-C])/gi`
  - `RUN_ID_COMMENT_REGEX = /<!-- sage:run:(\w+) -->/`

- [x] **2.5 — Wire `edited` handler in webhook route** (`packages/api/src/routes/webhooks.ts`)
  - When `action === 'edited'` and comment is a Sage comment:
    1. Parse checkboxes → get `{ runId, checkedOptionIds }`
    2. Fetch `explore_run` by `runId`
    3. Compare `checkedOptionIds` against `run.selected_option_ids` to find _newly_ checked options
    4. If no new selections (unchecked, or already processed): ignore
    5. If run is already `'running'`: ignore (guard against concurrent processing)
    6. If new selections: update `selected_option_ids`, set status → `'running'`, kick off orchestrator
  - This approach avoids race conditions by checking current status before dispatching

### Phase 3: Options Engine

- [x] **3.1 — Create AI provider singleton** (`packages/ai/src/provider.ts` — moved to `@sage/ai` package)
  - Initialize `createAnthropic({ apiKey })` from `@ai-sdk/anthropic`
  - Export `getAIProvider(apiKey: string)` as a lazy singleton (same pattern as `getGitHubApp` and `getDb`)

- [x] **3.2 — Create Options Engine** (`packages/ai/src/options-engine.ts` — pure function in `@sage/ai`)
  - Exports: `generateOptions(run: ExploreRun, env: Env): Promise<ExplorationOption[]>`
  - Steps:
    1. Get installation Octokit for the PR's `installationId`
    2. Fetch full file content via `octokit.rest.repos.getContent({ owner, repo, path, ref: headRef })`
    3. Base64-decode the file content
    4. Build system prompt:
       - Role: "You are Sage, a code analysis expert..."
       - Context: full file content, diff hunk, line range
       - If prompt is provided: "The reviewer's concern: {prompt}"
       - If no prompt: "Analyze this code and identify 1–3 potential improvements, issues, or refactoring opportunities"
       - Output format: JSON array of 1–3 options
    5. Call `generateObject()` from `ai` SDK with:
       - Model: `anthropic('claude-sonnet-4-20250514')` (via the provider)
       - Zod schema: array of `ExplorationOption` (min 1, max 3)
       - Temperature: 0.7 (creative but consistent)
    6. Return the validated options array
  - Error handling: catch Anthropic errors, wrap in a domain error with context

- [x] **3.3 — Create DB status-update helper** (`packages/api/src/db/helpers.ts`)
  - `updateRunStatus(db, runId, status, extraFields?)` — single UPDATE that sets `status` + `updated_at = new Date()` + optional extra columns (e.g., `options`, `selected_option_ids`)
  - Used everywhere status transitions happen — keeps updates consistent

- [x] **3.4 — Wire Options Engine to explore handler** (`packages/api/src/routes/webhooks.ts`)
  - Replace the TODO at ~L220 (`// TODO (P1): Kick off the Options Engine`)
  - Implementation:
    ```typescript
    // Fire-and-forget — don't block the 202 response
    runOptionsEngine(runId, command, env).catch((err) => {
      request.log.error({ runId, err }, 'Options engine failed');
    });
    ```
  - The `runOptionsEngine` function (in `options-engine.ts` or a wrapper):
    1. Update status → `'analyzing'`
    2. Call `generateOptions()`
    3. On success: store `options` in DB, update status → `'options_ready'`, post options comment
    4. On failure: update status → `'failed'`, post error comment to PR

- [x] **3.5 — Create options comment formatter** (`packages/api/src/github/comments.ts`)
  - `buildOptionsComment(runId, prompt, options): string`
  - Produces:

    ```markdown
    <!-- sage -->
    <!-- sage:run:abc123 -->

    🔍 **{N} options found** for "{prompt}"

    - [ ] **A — {label}** {★ Recommended if isPreferred}
          {description}
          `Risk: {emoji} {level} · Files: {n} · Complexity: {delta}`

    - [ ] **B — {label}**
          ...

    **Check the boxes above** to explore solutions, or reply `/run A C`.
    ```

  - Risk emoji mapping: `low → 🟢`, `medium → 🟡`, `high → 🔴`
  - Also export `buildErrorComment(runId, message): string` for failures
  - Also update the existing ack comment builder to include `<!-- sage:run:{runId} -->`

### Phase 4: Branch Agents

- [x] **4.1 — Create Branch Agent** (`packages/ai/src/branch-agent.ts` — pure function in `@sage/ai`)
  - Exports: `runBranchAgent(run: ExploreRun, option: ExplorationOption, env: Env): Promise<SolutionBranch>`
  - Steps:
    1. Insert `solution_branches` row with status `'generating'`
    2. Fetch full file content from GitHub (same as Options Engine)
    3. Build prompt:
       - Context: file content, diff hunk, line range, original concern
       - Task: "Implement option {id}: {label}. {description}"
       - Output: code changes (replacement for the selected range or full file rewrite), new files if needed, pros list, cons list, risk assessment, predicted test outcomes
       - Agent logging: "Think step by step. For each step, record what you're doing and why."
    4. Call `generateObject()` with Zod schema matching `SolutionBranch` fields (code, newFiles, pros, cons, risk, complexityDelta, filesChanged, sandbox as simulated `SandboxResult`)
    5. Parse `agentLog` from the AI's chain-of-thought (or structured output)
    6. Update `solution_branches` → status `'completed'`, populate all fields
    7. On failure: update status → `'failed'`, log error
  - Timeout: wrap the AI call with `AbortController` + `SANDBOX_TIMEOUT_MS` (120s)

- [x] **4.2 — Create Orchestrator** (`packages/api/src/ai/orchestrator.ts`)
  - Exports: `runOrchestrator(runId: string, optionIds: string[], env: Env): Promise<void>`
  - Steps:
    1. Fetch `explore_run` from DB
    2. Filter `run.options` to only selected `optionIds`
    3. Run `Promise.allSettled()` across all selected Branch Agents
    4. Tally results: count completed vs failed
    5. If all failed: update run status → `'failed'`, post error comment
    6. If any completed: update run status → `'completed'`, post results comment
  - This is the function called from both the checkbox `edited` handler and the `/run` command handler

- [x] **4.3 — Create results comment formatter** (`packages/api/src/github/comments.ts`)
  - `buildResultsComment(runId, branches: SolutionBranch[], webAppUrl: string): string`
  - Produces:

    ```markdown
    <!-- sage -->
    <!-- sage:run:abc123 -->

    ✅ **{N} solutions analyzed**

    ### A — {label}

    {1-2 sentence summary}
    **Pros:** {bullet list} **Cons:** {bullet list}
    `Risk: 🟢 Low · Files: 2 · Complexity: -3`
    🔗 [View full analysis]({webAppUrl}/explore/{runId}/branch/{branchId})

    ### C — {label}

    ...

    💡 **Recommendation:** Option A offers the best balance of impact and risk.
    ```

- [x] **4.4 — Wire `/run` command to orchestrator** (`packages/api/src/routes/webhooks.ts`)
  - Replace the `/run` stub (L132–148):
    1. Find the most recent `explore_run` for this PR + file where status is `'options_ready'`
    2. Validate selected IDs exist in `run.options`
    3. Update `selected_option_ids` and status → `'running'`
    4. Fire-and-forget: `runOrchestrator(run.id, selectedIds, env)`
    5. Return 202

### Phase 5: Web UI

- [ ] **5.1 — Scaffold `@sage/web` as Vite + React + TypeScript**
  - Initialize with `pnpm create vite` (react-ts template) inside `packages/web/`
  - Add deps: `react-router-dom`, `@tanstack/react-query`, `tailwindcss`, `@tailwindcss/vite`
  - Add `dev` and `build` scripts to `package.json`
  - Configure Vite proxy: `/api` → `http://localhost:4000` (avoids CORS in dev)

- [ ] **5.2 — Add API endpoint for branches** (`packages/api/src/routes/webhooks.ts` or new routes file)
  - `GET /api/explore/:runId/branches` — returns all `solution_branches` rows for a run
  - Existing `GET /api/explore/:runId` returns the run itself

- [ ] **5.3 — Create run overview page** (`packages/web/src/pages/RunOverview.tsx`)
  - Route: `/explore/:runId`
  - Fetches run + branches from API
  - Displays: run status, prompt, options, solution branch cards with status/label/risk
  - Each branch card links to detail page

- [ ] **5.4 — Create solution detail page** (`packages/web/src/pages/SolutionDetail.tsx`)
  - Route: `/explore/:runId/branch/:branchId`
  - Fetches branch data from API
  - Sections:
    - **Code diff** — show original file vs proposed changes (use a diff library like `react-diff-viewer-continued` or custom pre/code blocks)
    - **Pros & cons** — styled lists
    - **Risk & impact** — badges/indicators
    - **Predicted test results** — pass/fail breakdown from `sandbox.testResults`
    - **Agent log** — timeline component showing each `AgentLogEntry` with step, action, reasoning, outcome, duration
    - **Back to PR** link

- [ ] **5.5 — Add Turbo pipeline integration**
  - Ensure `turbo.json` includes `@sage/web` in `dev` and `build` tasks
  - `pnpm dev` starts both API and web concurrently

### Phase 6: Error Handling & Polish

- [ ] **6.1 — AI call timeout and retry**
  - Wrap all `generateObject()` calls with `AbortController` + `SANDBOX_TIMEOUT_MS` timeout
  - On timeout or Anthropic 5xx/rate-limit: retry once with 2-second delay
  - On second failure: mark as failed, proceed

- [ ] **6.2 — Graceful error comments on PR**
  - On Options Engine failure: post "❌ Exploration failed: {friendly message}. Run ID: `{runId}`"
  - On Branch Agent failure: include failed option IDs in results comment alongside successful ones
  - Never expose stack traces or API keys

- [ ] **6.3 — Loop prevention for checkbox edits**
  - Primary guard: `user.type === 'Bot'` check on `edited` events
  - Secondary guard: if `run.status === 'running'`, ignore checkbox changes (prevents concurrent dispatch)
  - Tertiary guard: only process _newly_ checked options by comparing against `selected_option_ids` already in DB

- [ ] **6.4 — Consistent `updated_at` on every status change**
  - All status transitions go through `updateRunStatus()` helper which always sets `updated_at = new Date()`

---

## Quality Gates — Boundary Checks After Each Phase

Every phase must pass **all** boundary checks before moving to the next. This catches regressions early and ensures the codebase stays healthy throughout incremental delivery.

### CI Pipeline (automated on every PR)

All boundary checks are enforced by the GitHub Actions CI workflow (`.github/workflows/ci.yml`). Every PR must pass CI before merge. The pipeline runs:

1. **Install** — `pnpm install --frozen-lockfile` (ensures lockfile is committed)
2. **Build** — `pnpm build` (all packages compile, TypeScript emits zero errors)
3. **Lint** — `pnpm lint` (ESLint across monorepo, zero warnings)
4. **Typecheck** — `pnpm typecheck` (`tsc --noEmit`, strict mode, no implicit any)
5. **Format** — `pnpm format:check` (Prettier — code style consistency)
6. **Test** — `pnpm test` (when test scripts exist — unit + e2e tests added per phase)

If any step fails, the PR is blocked. This ensures boundary checks are not skipped — they run in CI whether or not the developer remembers to run them locally.

### Global Checks (run after every phase — locally and in CI)

These are non-negotiable and must pass at every boundary:

- [ ] `pnpm build` — all packages compile with zero errors (TypeScript builds for `@sage/shared`, `@sage/api`, `@sage/web`)
- [ ] `pnpm lint` — ESLint passes across the entire monorepo with zero warnings
- [ ] `pnpm typecheck` — `tsc --noEmit` passes for every package (strict mode, no implicit any)
- [ ] `pnpm format:check` — Prettier formatting is consistent
- [ ] No secrets, keys, or credentials in any committed file (only in `.env`)
- [ ] CI pipeline passes (GitHub Actions green check on PR)

### Phase 1 Boundary: Database & Types

- [x] `pnpm build` passes — shared types compile, API compiles with new schema
- [x] `pnpm --filter @sage/api db:generate` produces a clean migration (no drift)
- [x] `pnpm --filter @sage/api db:migrate` applies migration without errors
- [ ] E2E: query `solution_branches` table directly (via `psql` or test script) — verify table exists, columns match spec, FK to `explore_runs` is enforced
- [ ] E2E: insert a row into `solution_branches` with all fields → read it back → verify jsonb fields round-trip correctly (`agent_log`, `pros`, `cons`, `new_files`, `sandbox`)
- [x] Existing `test-webhook.sh` still passes (all 7 scenarios — no regressions)

### Phase 2 Boundary: Checkbox Interaction Model

- [x] `pnpm build` + `pnpm lint` + `pnpm typecheck` pass
- [ ] E2E: send a `pull_request_review_comment` webhook with `action: 'created'` + `/explore` command → still returns 202 (existing flow unbroken)
- [ ] E2E: send a webhook with `action: 'edited'` + body starting with `<!-- sage -->` containing checked checkboxes → handler detects checkbox changes and responds correctly
- [ ] E2E: send a webhook with `action: 'edited'` + body that is NOT a Sage comment → returns 200 ignored
- [ ] E2E: send a webhook with `action: 'edited'` + `user.type: 'Bot'` → returns 200 ignored (loop prevention)
- [ ] Unit test: `parseCheckboxes()` with unchecked, partially checked, all checked, missing run ID, malformed comment → correct results or `null`
- [x] Existing `test-webhook.sh` still passes (all 7 scenarios)

### Phase 3 Boundary: Options Engine

- [ ] `pnpm build` + `pnpm lint` + `pnpm typecheck` pass
- [ ] Unit test: `generateOptions()` with mocked Anthropic → returns 1–3 valid `ExplorationOption` objects matching Zod schema
- [ ] Unit test: `generateOptions()` with empty prompt (no concern) → AI still produces options
- [ ] Unit test: `generateOptions()` with Anthropic error → throws domain error, does not leak raw API error
- [ ] Unit test: `buildOptionsComment()` produces valid markdown with `<!-- sage -->`, `<!-- sage:run:{id} -->`, checkboxes, risk badges
- [ ] Unit test: `buildErrorComment()` produces user-friendly message without stack traces
- [ ] Unit test: `updateRunStatus()` sets `status` + `updated_at` and merges extra fields
- [ ] E2E: send `/explore "test concern"` webhook → verify DB row transitions `pending → analyzing → options_ready` (poll `GET /api/explore/:runId`)
- [ ] E2E: verify options comment is posted to GitHub (mock GitHub API or use Smee + real PR)
- [ ] E2E: verify `explore_runs.options` contains 1–3 valid options after completion
- [ ] E2E: on Anthropic failure (simulate timeout) → DB row transitions to `failed`, error comment posted
- [ ] Existing `test-webhook.sh` still passes (no regressions)

### Phase 4 Boundary: Branch Agents

- [ ] `pnpm build` + `pnpm lint` + `pnpm typecheck` pass
- [ ] Unit test: `runBranchAgent()` with mocked Anthropic → returns valid `SolutionBranch` with code, pros, cons, risk, agentLog
- [ ] Unit test: `runBranchAgent()` timeout → marks branch as `failed`, does not hang
- [ ] Unit test: `runOrchestrator()` with 2 options, 1 succeeds + 1 fails → run status `completed`, results comment includes both outcomes
- [ ] Unit test: `runOrchestrator()` with all agents failed → run status `failed`, error comment posted
- [ ] Unit test: `buildResultsComment()` produces valid markdown with per-solution summary, clickable web links, recommendation
- [ ] E2E: send `/explore` → wait for options → send `/run A C` → verify DB transitions `options_ready → running → completed`
- [ ] E2E: verify `solution_branches` rows created for selected options with status `completed`
- [ ] E2E: verify results comment posted with web dashboard links
- [ ] E2E: checkbox flow — edit bot comment to check option A → verify agents kick off, same result as `/run A`
- [ ] E2E: re-check already-processed option → no duplicate agent run
- [ ] Existing `test-webhook.sh` still passes (no regressions)

### Phase 5 Boundary: Web UI

- [ ] `pnpm build` passes for all 3 packages (`@sage/shared`, `@sage/api`, `@sage/web`)
- [ ] `pnpm lint` + `pnpm typecheck` pass (including `@sage/web`)
- [ ] `pnpm --filter @sage/web build` produces a valid production bundle (no build errors)
- [ ] E2E: `GET /api/explore/:runId` returns run with options and status
- [ ] E2E: `GET /api/explore/:runId/branches` returns all solution branches for a run
- [ ] E2E: seed a completed run with branches → open `http://localhost:5173/explore/:runId` → page renders with branch cards
- [ ] E2E: click through to `http://localhost:5173/explore/:runId/branch/:branchId` → detail page renders diff, pros/cons, agent log, test results
- [ ] E2E: visit non-existent run → 404 page or "not found" message (no crash)
- [ ] Existing `test-webhook.sh` still passes (no regressions)

### Phase 6 Boundary: Error Handling & Polish

- [ ] `pnpm build` + `pnpm lint` + `pnpm typecheck` pass — final clean build
- [ ] E2E: simulate Anthropic timeout on Options Engine → retry fires, then fails gracefully → error comment posted, run status `failed`
- [ ] E2E: simulate Anthropic 429 rate-limit on Branch Agent → retry fires with backoff → either succeeds on retry or fails gracefully
- [ ] E2E: bot edits its own comment → webhook with `user.type: 'Bot'` + `action: 'edited'` → ignored (no infinite loop)
- [ ] E2E: user checks checkbox while run is already `running` → ignored (no concurrent dispatch)
- [ ] E2E: full end-to-end flow via Smee tunnel + real GitHub PR: `/explore "concern"` → options comment appears → check box → results comment with web link → click link → web dashboard loads
- [ ] All `test-webhook.sh` scenarios pass (updated with new test cases for checkbox edits)
- [ ] No TypeScript `any` types (strict mode enforced)
- [ ] No `console.log` — all logging goes through Fastify/pino logger
- [ ] CI pipeline is green — all checks pass on the final PR

---

## New Files

| File                                          | Purpose                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                    | GitHub Actions CI — build, lint, typecheck, format, test on every PR |
| `packages/api/src/ai/index.ts`                | Anthropic provider singleton                                         |
| `packages/api/src/ai/options-engine.ts`       | Options generation (AI call + GitHub file fetch)                     |
| `packages/api/src/ai/branch-agent.ts`         | Per-option solution analysis agent                                   |
| `packages/api/src/ai/orchestrator.ts`         | Parallel agent coordinator                                           |
| `packages/api/src/db/helpers.ts`              | `updateRunStatus()` and other DB helpers                             |
| `packages/api/src/github/comments.ts`         | Comment formatters (options, results, errors)                        |
| `packages/api/src/github/parse-checkboxes.ts` | Checkbox state parser for edited comments                            |
| `packages/web/src/pages/RunOverview.tsx`      | Run overview page                                                    |
| `packages/web/src/pages/SolutionDetail.tsx`   | Solution detail page                                                 |

## Modified Files

| File                                  | Changes                                                     |
| ------------------------------------- | ----------------------------------------------------------- |
| `packages/shared/src/types.ts`        | Add `AgentLogEntry`, extend `SolutionBranch`                |
| `packages/shared/src/constants.ts`    | Add `CHECKBOX_OPTION_REGEX`, `RUN_ID_COMMENT_REGEX`         |
| `packages/api/src/db/schema.ts`       | Add `solutionBranches` table + relations                    |
| `packages/api/src/config/env.ts`      | Add `WEB_APP_URL`                                           |
| `packages/api/src/routes/webhooks.ts` | Wire Options Engine, implement `/run`, add `edited` handler |

---

## Key Technical Decisions

| Decision             | Approach                                                    | Rationale                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Async AI execution   | Fire-and-forget from webhook handler                        | GitHub webhooks time out at 10s. AI calls take 10–60s. We persist the run first, ack with 202, then run AI in the background.                                                       |
| Checkbox detection   | Listen for `edited` action on `pull_request_review_comment` | No new webhook event subscription needed. GitHub fires `edited` when a user ticks a checkbox in any comment. We filter to Sage comments via `BOT_COMMENT_PREFIX`.                   |
| Run ID embedding     | `<!-- sage:run:{id} -->` HTML comment in bot messages       | Invisible to users, machine-parseable. Lets the `edited` handler find the DB row without querying by PR/file/line.                                                                  |
| AI structured output | `generateObject()` with Zod schemas                         | Vercel AI SDK enforces output shape at the AI call level. No post-hoc JSON parsing or validation needed. Failures are typed.                                                        |
| Parallel agents      | `Promise.allSettled()`                                      | One agent failure shouldn't kill the entire run. `allSettled` lets us collect partial results.                                                                                      |
| AI-simulated sandbox | AI predicts test/lint outcomes in the same prompt           | Real sandbox (Podman containers) deferred to P2. The AI's prediction gives directional value for P1 without infrastructure complexity.                                              |
| Web framework        | Vite + React                                                | Lightweight, fast dev server, already familiar stack. No SSR needed — this is a simple dashboard.                                                                                   |
| State management     | `@tanstack/react-query`                                     | Handles API fetching, caching, polling (for status updates). No global state store needed for P1.                                                                                   |
| CI enforcement       | GitHub Actions on every PR                                  | Boundary checks (build, lint, typecheck, format, test) run automatically. A red CI blocks merge — no manual gate-checking required. Catches regressions before code reaches `main`. |
