# OrbitOS

OrbitOS is an early-stage TypeScript workspace for evidence-backed digital-asset
financial controls.

This public repository currently contains only the engineering foundation:

- a Fastify health-only API;
- provider-neutral runtime contracts;
- exact decimal arithmetic;
- a synthetic evidence ingestion/replay adapter; and
- a proposed PostgreSQL tenant/evidence migration.

It is not a production accounting system and has no live integrations,
deployment, or custody capabilities.

## Development

Use Node.js 24.21.0 and pnpm 11.19.0.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm schema:check
pnpm build
```

Run the minimal API locally with:

```powershell
pnpm --filter @orbitos/api dev
```

The API exposes `GET /health` at `http://127.0.0.1:3000/health`.

## Back-end planning

The proposed delivery sequence from the current foundation to the first
authenticated evidence, verification, reconciliation, and exception workflow is
documented in the [back-end development plan](docs/backend/IMPLEMENTATION_PLAN.md).

## Front-end planning

The authenticated web application has not been scaffolded yet. Its proposed
design language, implementation sequence, and MVP route map are documented in:

- [DESIGN.md](DESIGN.md)
- [Front-end development plan](docs/frontend/IMPLEMENTATION_PLAN.md)
- [MVP screen map](docs/frontend/SCREEN_MAP.md)

## Repository operations

Branching, pull-request review, protected `staging` integration, releases,
rollback, and pull-request health are defined in the
[GitHub operations plan](docs/operations/GITHUB_OPERATIONS.md).

## Repository boundary

Business source documents, internal planning, and local coding-agent context are
intentionally excluded from version control. PDFs and private agent Markdown must
never be added to this repository, including with `git add --force`.

Before committing or pushing, run:

```powershell
pnpm guard:public
```

To enable the included local Git safety hooks after cloning:

```powershell
git config core.hooksPath .githooks
```

No license has been selected yet.
