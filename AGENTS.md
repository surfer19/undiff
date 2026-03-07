# Sage — Agent Context

## Project

Multi-agent code review system for GitHub PRs. Monorepo (pnpm workspaces + Turborepo).

## Stack

- **Runtime:** Node 22, TypeScript, pnpm 10
- **API:** Fastify, Drizzle ORM, PostgreSQL 17
- **AI:** Vercel AI SDK + Anthropic
- **GitHub:** Octokit + GitHub App webhooks

## Conventions

- Containers: **always use Podman**, not Docker.
- Package manager: **pnpm** only (no npm/yarn).
- Environment: secrets in `.env` (see `.env.example`).
- **Never** put secrets, keys, or credentials in any file other than `.env`. Always verify `.env` files are in `.gitignore`.
