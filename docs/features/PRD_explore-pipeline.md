# PRD: Explore Pipeline — AI-Powered Code Exploration & Analysis

**Feature:** `/explore` command → AI options → checkbox selection → parallel analysis → results dashboard
**Priority:** P1
**Status:** Draft

---

## Problem

During code review, developers often spot areas that could be improved but lack time to explore alternatives. They leave vague comments like "maybe refactor this?" without concrete options, leading to unresolved review threads and technical debt accumulation. There's no structured way to quickly evaluate multiple refactoring approaches side by side.

## Solution

Sage's Explore Pipeline lets a reviewer highlight a code range in a PR, type `/explore "concern"` (or just `/explore` to let AI identify issues), and receive 1–3 actionable refactoring options within seconds. Each option includes a label, description, risk level, and estimated impact. The reviewer selects which options to investigate by checking markdown checkboxes directly in the GitHub comment. Sage then dispatches parallel AI agents that analyze each selected option in depth — producing code changes, pros/cons, predicted test outcomes, and a detailed reasoning log. Results are summarized in a PR comment with clickable links to a web dashboard where the team can compare solutions side by side.

## User Stories

### US-1: Explore with a specific concern

> As a **code reviewer**, I want to comment `/explore "this function has too many responsibilities"` on a diff range, so that I receive concrete refactoring proposals tailored to my concern.

### US-2: Explore without a concern (AI-driven)

> As a **code reviewer**, I want to comment `/explore` without specifying a concern, so that AI analyzes the selected code and surfaces potential issues or improvements I may have missed.

### US-3: Select options via checkboxes

> As a **reviewer**, I want to check boxes next to the options I'm interested in (directly in the GitHub comment), so that I can trigger deeper analysis without learning slash commands.

### US-4: Select options via `/run` command

> As a **power user**, I want to reply `/run A C` to select options by letter, so that I have a keyboard-driven alternative to checkboxes.

### US-5: View analysis results in PR

> As a **reviewer**, I want to see a brief summary of each explored solution (pros, cons, risk) posted as a PR comment, so that I can make a quick decision without leaving GitHub.

### US-6: View detailed analysis in web dashboard

> As a **reviewer**, I want to click a link in the PR comment and see a full dashboard page for each solution — including code diff, agent reasoning timeline, predicted test outcomes, and linting analysis — so that I can evaluate the approach in depth before committing to it.

### US-7: Track exploration status

> As a **reviewer**, I want to see real-time status updates (analyzing → options ready → running → completed) so that I know how long to wait.

---

## User Flow

```
1. Reviewer selects code range in PR diff
2. Reviewer comments:  /explore "reduce complexity here"
                   or: /explore  (no concern — AI infers issues)
3. Sage replies: "🔍 Exploring... Run ID: abc123"
4. Sage posts options comment with checkboxes:
   - [ ] A — Extract Helper Function ★ Recommended
   - [ ] B — Inline with Guard Clauses
   - [ ] C — Strategy Pattern
5. Reviewer checks boxes:  [x] A  [x] C
6. Sage detects checkbox change, kicks off agents for A and C
7. Sage posts results summary:
   "✅ 2 solutions analyzed"
   - A: Extract Helper — 🟢 Low risk, 2 files, -3 complexity
   - C: Strategy Pattern — 🔴 High risk, 4 files, +5 complexity
   Each with a clickable link to the web dashboard
8. Reviewer clicks link → sees full diff, pros/cons, agent log, test predictions
```

---

## Acceptance Criteria

### Option Generation

- [ ] `/explore "concern"` triggers AI analysis using the diff hunk and full file as context
- [ ] `/explore` without a concern triggers AI to autonomously identify issues in the selected code
- [ ] AI generates 1–3 options based on relevance (not always forced to 3)
- [ ] Each option includes: label, description, estimated impact (files changed, complexity delta), risk level (low/medium/high), and whether it's the AI's recommended pick
- [ ] Options are posted as a GitHub comment with markdown checkboxes

### Option Selection

- [ ] User can select options by checking checkboxes in the bot's comment
- [ ] User can select options by replying `/run A`, `/run A C`, or `/run all`
- [ ] Both selection methods trigger the same downstream analysis
- [ ] Re-checking a previously processed option does not re-trigger analysis

### Solution Analysis (Branch Agents)

- [ ] Each selected option is analyzed by a parallel AI agent
- [ ] Agent produces: concrete code changes, list of new/modified files, pros and cons, risk assessment, complexity impact
- [ ] Agent predicts: test outcomes (pass/fail counts), potential linting issues, visual impact (P1: AI-simulated, no real execution)
- [ ] Agent logs each reasoning step (what it tried, where it struggled, what it found)
- [ ] Analysis completes within 2 minutes per option

### Results Delivery

- [ ] Summary comment posted to the PR thread with brief per-solution outcome
- [ ] Each solution includes a clickable link to the web dashboard
- [ ] Summary includes pros/cons bullets, risk badges, and an overall recommendation

### Web Dashboard

- [ ] Run overview page (`/explore/:runId`) shows all solutions side by side
- [ ] Solution detail page (`/explore/:runId/branch/:branchId`) shows:
  - [ ] Code diff (original → proposed changes) with syntax highlighting
  - [ ] Pros and cons list
  - [ ] Risk level and complexity impact
  - [ ] Predicted test results
  - [ ] Agent reasoning timeline (step-by-step log with durations)
  - [ ] Link back to the PR comment

### Status Tracking

- [ ] Explore run transitions through statuses: `pending → analyzing → options_ready → running → completed`
- [ ] Failed runs transition to `failed` with a user-friendly error comment on the PR
- [ ] `GET /api/explore/:runId` returns current status for polling

### Error Handling

- [ ] AI failures produce a clear error comment on the PR (no stack traces)
- [ ] Checkbox edits by the bot itself do not trigger re-processing (loop prevention)
- [ ] Duplicate webhook deliveries are ignored

---

## Scope & Boundaries

### In Scope (P1)

- Options Engine (AI-powered option generation)
- Checkbox-based option selection in GitHub comments
- `/run` command as fallback selection method
- Branch Agents (parallel AI analysis per option)
- AI-simulated sandbox (predicted test/lint outcomes, no real execution)
- Results comment with web dashboard links
- Basic web dashboard (run overview + solution detail pages)
- Status tracking and error comments

### Out of Scope (P2+)

- Real sandbox execution (Podman containers running tests, taking screenshots)
- Visual regression detection (before/after screenshots)
- Delivery modes (creating actual branches, commits, or PRs from solutions)
- Multi-file PR context (currently: diff hunk + single file only)
- Web dashboard authentication
- Email/Slack notifications
- Analytics and usage tracking

---

## Success Metrics

| Metric                                        | Target                 |
| --------------------------------------------- | ---------------------- |
| Time from `/explore` to options comment       | < 30 seconds           |
| Time from option selection to results comment | < 2 minutes per option |
| Options generated per explore run             | 1–3 (AI decides)       |
| Agent analysis completion rate                | > 95% (non-failure)    |
| User clicks through to web dashboard          | Trackable via link     |

---

## Dependencies

| Dependency                                            | Status                      |
| ----------------------------------------------------- | --------------------------- |
| GitHub App with `pull_request_review_comment` webhook | ✅ Configured               |
| GitHub App permissions: PRs (R/W), Contents (R)       | ✅ Configured               |
| Anthropic API key                                     | ✅ Available                |
| `@ai-sdk/anthropic` + `ai` packages                   | ✅ Installed (not yet used) |
| PostgreSQL database                                   | ✅ Running                  |
| Smee webhook tunnel (dev)                             | ✅ Running                  |
| Web app hosting (production)                          | ❌ Not yet planned          |
