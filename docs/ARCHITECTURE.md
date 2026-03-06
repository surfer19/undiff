# Sage — Architecture Overview

Sage is a multi-agent solution explorer that plugs into GitHub pull-request
reviews. A reviewer types `/explore "question"` on a code range, and Sage
generates multiple refactoring options, each validated in a sandbox, so the
team can pick the best path forward.

---

## System Context

```mermaid
graph LR
    Dev((Developer)) -->|review comment<br/>/explore or /run| GH[GitHub]
    GH -->|webhook| Smee[Smee Tunnel]
    Smee -->|forward| API["Sage API<br/>(Fastify)"]
    API -->|read/write| DB[(PostgreSQL)]
    API -->|generate options| AI[Anthropic Claude]
    API -->|reply comment /<br/>create branch| GH
```

---

## Monorepo Layout

```
sage/
├── packages/
│   ├── api/         # Fastify server — webhooks, AI orchestration, DB
│   ├── shared/      # Types, constants, regex shared across packages
│   └── web/         # (future) Dashboard UI
├── docs/            # Project documentation
├── scripts/         # Dev helper scripts
├── docker-compose.yml   # Postgres + Smee tunnel services
└── turbo.json       # Turborepo pipeline config
```

```mermaid
graph TD
    subgraph Monorepo
        API["@sage/api"]
        Shared["@sage/shared"]
        Web["@sage/web"]
    end
    API -->|depends on| Shared
    Web -.->|will depend on| Shared
```

---

## Request Flow

When a developer posts a `/explore` or `/run` command on a PR review comment,
the following sequence executes:

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant Smee as Smee Tunnel
    participant API as Sage API
    participant DB as PostgreSQL
    participant AI as Anthropic Claude

    Dev->>GH: Post review comment "/explore ..."
    GH->>Smee: pull_request_review_comment webhook
    Smee->>API: POST /webhooks/github

    API->>API: Verify signature & deduplicate
    API->>API: Parse /explore command

    API->>DB: INSERT explore_run (status: pending)
    API->>GH: Reply "🔍 Exploring..."
    API-->>GH: 202 Accepted

    Note over API,AI: P1 — Options Engine (async)
    API->>AI: Send diff hunk + prompt
    AI-->>API: 3 exploration options
    API->>DB: UPDATE explore_run (status: options_ready)
    API->>GH: Post options comment (A / B / C)

    Dev->>GH: "/run A C"
    GH->>Smee: webhook
    Smee->>API: POST /webhooks/github

    Note over API,AI: P1 — Branch Agents (parallel)
    API->>AI: Generate solution for option A
    API->>AI: Generate solution for option C
    AI-->>API: Code changes
    API->>DB: UPDATE explore_run (status: completed)
    API->>GH: Create suggestion / branch / PR
```

---

## API Internals

```mermaid
graph TD
    subgraph Fastify Server
        Req[Incoming Request] --> Parser[Raw Body Parser]
        Parser --> Router

        Router -->|GET /health| Health[Health Check]
        Router -->|POST /webhooks/github| WH[Webhook Handler]
        Router -->|GET /api/explore/:runId| Status[Run Status]

        WH --> SigVerify[Signature Verification]
        SigVerify --> Dedup[Delivery Dedup]
        Dedup --> EventFilter[Event Filter<br/>pull_request_review_comment only]
        EventFilter --> CmdParse[Command Parser<br/>/explore or /run regex]
        CmdParse --> Persist[Persist to DB]
        Persist --> Ack[Post Ack Comment]
    end

    Ack -.->|future| Engine[Options Engine]
    Engine -.->|future| Agents[Branch Agents]
```

---

## Data Model

```mermaid
erDiagram
    EXPLORE_RUNS {
        varchar id PK "nanoid (21 chars)"
        jsonb pr_ref "owner, repo, number, installationId"
        text file_path
        jsonb line_range "start, end"
        text diff_hunk
        varchar head_ref
        text prompt
        varchar status "pending → analyzing → options_ready → running → completed | failed"
        bigint comment_id
        jsonb options "ExplorationOption[]"
        jsonb selected_option_ids "string[]"
        varchar picked_branch_id "FK nullable"
        varchar delivery_mode "suggest | commit | pr"
        timestamp created_at
        timestamp updated_at
    }
```

### Explore Run Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: /explore received
    pending --> analyzing: Options Engine starts
    analyzing --> options_ready: 3 options generated
    options_ready --> running: /run command received
    running --> completed: Agents finish
    analyzing --> failed: AI error
    running --> failed: Agent error
    completed --> [*]
    failed --> [*]
```

---

## Infrastructure (Local Dev)

```mermaid
graph LR
    subgraph Host Machine
        API["Sage API<br/>:4000"]
        Turbo["Turborepo<br/>(pnpm dev)"]
    end

    subgraph Podman Containers
        PG["PostgreSQL 17<br/>:5432"]
        SM["Smee Client<br/>(node:22-alpine)"]
    end

    Cloud["smee.io"] -->|SSE| SM
    SM -->|POST /webhooks/github| API
    API -->|queries| PG
    Turbo -->|runs| API

    GH["GitHub"] -->|webhook POST| Cloud
```

| Service   | Runs In          | Started By                |
| --------- | ---------------- | ------------------------- |
| PostgreSQL | Podman container | `podman compose up`       |
| Smee       | Podman container | `podman compose --profile tunnel up` |
| Sage API   | Host (Node 22)   | `turbo dev`               |

One command: **`pnpm dev:up`** starts everything.

---

## Tech Stack

| Layer       | Technology                          |
| ----------- | ----------------------------------- |
| Runtime     | Node 22, TypeScript                 |
| API         | Fastify 5                           |
| Database    | PostgreSQL 17, Drizzle ORM          |
| AI          | Vercel AI SDK + Anthropic (Claude)  |
| GitHub      | Octokit, GitHub App webhooks        |
| Build       | Turborepo, tsup, pnpm 10           |
| Containers  | Podman                              |
