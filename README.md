# OrbitOS

OrbitOS is an early-stage TypeScript workspace for evidence-backed digital-asset
financial controls.

This public repository currently contains an early engineering foundation:

- a Fastify API with process health and a versioned, fail-closed session route;
- tenant-scoped integration API contracts with permission checks, audit output,
  and fail-closed durable-persistence behavior;
- first-party password authentication with memory-hard hashes, opaque revocable
  sessions, lockout controls, and server-derived tenant context;
- a server-rendered Next.js application shell with tenant identity, dual themes,
  delivered-route navigation, and controlled loading/error/empty states;
- a reseller control plane for platform-owned tenant provisioning, tenant-owned
  customer workspaces, custom domains, governed user/role creation, and separate
  platform-to-tenant and tenant-to-customer billing records;
- a BSC JSON-RPC evidence-boundary client with chain-identity checks, bounded
  retry/timeout behavior, rate-limit backoff, validated independent-provider
  fallback, durable raw-response evidence, golden fixtures, and a repeatable
  two-provider mainnet/testnet capability probe;
- bounded, checkpointed ingestion runs with renewable exclusive leases, safe
  resume/stop controls, quarantine, replay-safe movement identities, and exact
  BEP-20/native-fee normalization;
- authenticated integration create/edit/enable/disable controls plus run history,
  exact movement list/detail, and explicit unverified-state presentation;
- versioned independent verification across distinct provider operators, separate
  inclusion/execution/finality/agreement dimensions, BSC safe/finalized-tag or
  confirmation policies, immutable decision history, and reorg invalidation;
- exact BigInt position roll-forwards that exclude incomplete verification,
  idempotent reconciliation results, and stable deduplicated exceptions;
- tenant-authorized reconciliation and exception APIs plus browser list/detail,
  assignment, status, note, resolution, and immutable audit-history views;
- provider-neutral runtime contracts;
- exact decimal arithmetic;
- a synthetic evidence ingestion/replay adapter;
- a filesystem-backed, content-addressed raw-evidence store; and
- PostgreSQL tenant/evidence, authentication, integration, ingestion, verification,
  reconciliation, and exception migrations with executable embedded-PostgreSQL
  row-level-security and replay tests.

It is not a production accounting system and has no custody or payment-processing
capabilities.

## Development

Use Node.js 24.21.0 and pnpm 11.19.0.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:browser
pnpm schema:check
pnpm probe:bsc
pnpm build
```

### Database and staging account

OrbitOS uses PostgreSQL for tenant, authentication, session, integration, audit,
and evidence metadata. Create a database, copy the variable names from
`.env.example` into your secret manager or local environment, and run:

```powershell
pnpm db:migrate
$env:ORBITOS_BOOTSTRAP_PASSWORD = "<a unique password of at least 12 characters>"
pnpm auth:bootstrap-staging
```

The bootstrap is repeatable. It creates or rotates the platform Super Admin credential
for `orbitos@devlogix.com.pk` without writing the password to the repository or
printing it. Remove the password environment variable after the command. The
database connection used for migrations must be permitted to create the `orbit`
schema; the application connection needs access only to the migrated OrbitOS
tables. `ORBITOS_EVIDENCE_ROOT` selects the local content-addressed raw-evidence
directory and defaults to `.orbitos/evidence`.

For staging object storage, use a private Supabase Storage bucket in the same
staging project. The free plan currently includes 1 GB of storage and the service
offers an S3-compatible API. OrbitOS includes a tested server-only Supabase
Storage adapter that writes tenant-prefixed, content-addressed objects without
upsert. Supabase Storage does not currently support S3 object versioning, so this
is suitable for staging verification, not the final production immutability/WORM
control. Never expose a Supabase secret/service key to the browser. See the
[Storage pricing](https://supabase.com/docs/guides/storage/pricing),
[S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility),
and [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)
guides.

Run the minimal API locally with:

```powershell
pnpm --filter @orbitos/api dev
```

The API exposes process liveness at `GET /health`, dependency readiness at
`GET /ready`, tenant-safe Prometheus metrics at `GET /metrics`, and an
authenticated `GET /v1/session` contract plus tenant-scoped
integration, bounded-run, exact movement, and reseller control-plane contracts. The default
authenticator denies every credential. Setting `DATABASE_URL` activates the
first-party session service, PostgreSQL integration/ingestion/verification/
reconciliation repositories, and append-only audit/evidence catalog. Completed
bounded ingestion automatically rechecks each movement through every configured
independence group before a verified decision can be recorded. The web application exchanges credentials server-to-server
and stores only an opaque session token in an HTTP-only cookie. Production must
terminate TLS and leave secure cookies enabled.

For staging evidence storage, configure `SUPABASE_URL`, a server-only
`SUPABASE_SECRET_KEY`, and an existing private `SUPABASE_EVIDENCE_BUCKET`.
Supplying only one of the URL/key pair fails startup rather than silently falling
back to local storage. Operational probes, alert thresholds, incident response,
deployment, and rollback are documented in the
[operator runbook](docs/operations/OPERATOR_RUNBOOK.md).

## Back-end planning

The proposed delivery sequence from the current foundation to the first
authenticated evidence, verification, reconciliation, and exception workflow is
documented in the [back-end development plan](docs/backend/IMPLEMENTATION_PLAN.md).
The live-provider requirements and latest public-endpoint probe results are recorded in
the [BSC capability matrix](docs/backend/BSC_CAPABILITY_MATRIX.md).
The reseller hierarchy, exact role matrix, permission keys, domain boundary, and
two-sided billing model are documented in the
[reseller control-plane guide](docs/backend/reseller-control-plane.md).

## Front-end planning

The authenticated application now includes Overview, Integrations, Movements,
Reconciliation, Exceptions, Tenants, Customers, Users & Roles, Domains, and Billing.
Its design language, remaining implementation sequence, and
MVP route map are documented in:

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
