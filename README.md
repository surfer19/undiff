# sage

> Multi-Agent Solution Explorer for GitHub Code Review

A reviewer selects problematic code in a GitHub PR, triggers an exploration, and receives **multiple AI-generated solutions** — each built, tested, and visually verified in an isolated sandbox. They pick one, and it lands back in the PR.

## How It Works

1. **Trigger** — Reviewer selects lines in a PR diff and posts `/explore "prompt"`
2. **Options** — AI proposes 1–3 strategies; reviewer picks which to run
3. **Parallel Agents** — Each strategy runs in an isolated sandbox (clone → build → test → screenshot)
4. **Compare** — Side-by-side comparison: code diffs, build/test results, visual previews
5. **Deliver** — Pick a solution → it lands in the PR as a suggested change, commit, or new PR

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- [Podman](https://podman.io/) (for local PostgreSQL)
- A [GitHub App](#github-app-setup) configured for your test repo

### Setup

```bash
# Clone the repo
git clone https://github.com/surfer19/sage.git
cd sage

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Fill in your GitHub App credentials and database URL

# Start local database
podman compose up -d

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### GitHub App Setup

See [docs/GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md) for step-by-step instructions.

## Project Structure

```
sage/
├── packages/
│   ├── api/          # Fastify backend — webhooks, orchestration, API
│   ├── shared/       # Shared TypeScript types and utilities
│   └── web/          # React comparison page (future)
├── docs/             # Design documents and setup guides
├── turbo.json        # Turborepo task config
└── pnpm-workspace.yaml
```

## Tech Stack

| Layer     | Technology                       |
| --------- | -------------------------------- |
| Runtime   | Node.js + TypeScript             |
| Framework | Fastify                          |
| Database  | PostgreSQL + Drizzle ORM         |
| LLM       | Vercel AI SDK + Anthropic Claude |
| GitHub    | Octokit                          |
| Monorepo  | pnpm workspaces + Turborepo      |

## Scripts

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `pnpm dev`        | Start all packages in dev mode |
| `pnpm build`      | Build all packages             |
| `pnpm lint`       | Lint all packages              |
| `pnpm typecheck`  | Type-check all packages        |
| `pnpm format`     | Format all files with Prettier |
| `pnpm db:migrate` | Run database migrations        |
| `pnpm db:studio`  | Open Drizzle Studio            |

## License

[MIT](LICENSE)
