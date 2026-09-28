# OrbitOS Back-end Development Plan

Status: proposed implementation plan

Depends on: approved identity, infrastructure, and first-network operating decisions

## Outcome

Build the minimum authoritative OrbitOS back end that lets an authenticated,
authorized operator complete the initial control journey:

`configure a read-only integration -> ingest and preserve evidence -> normalize exact movements -> independently verify -> reconcile positions -> investigate exceptions`

The first release is a bounded proof of the control path, not the complete
accounting platform. It must remain compatible with later multi-chain,
double-entry accounting, close, reporting, ERP, and governed-AI capabilities
without claiming that those capabilities already exist.

## Current baseline

The repository currently provides:

- a strict TypeScript, pnpm, and Turborepo workspace;
- a health-only Fastify API;
- Zod runtime contracts for provider-neutral canonical records;
- exact BigInt-backed decimal operations;
- an in-memory evidence/replay adapter for tests;
- Kysely and `pg` database bootstrap code; and
- a proposed PostgreSQL tenant/evidence migration with structural checks.

The current migration has not yet been proven against a live PostgreSQL instance.
Authentication, a durable evidence object store, operational APIs, external
connectors, verification, reconciliation, exception workflows, and deployment
remain unimplemented.

## Scope

### Included in the first back-end release

- authenticated, server-derived tenant context;
- tenant-safe organizations, memberships, roles, integrations, and audit events;
- PostgreSQL migrations, row-level security, tenant-safe foreign keys, and real
  database integration tests;
- read-only integration configuration using secret references rather than stored
  credentials;
- durable raw-evidence storage with exact bytes, digest, provenance, acquisition
  time, network anchor, and parser/schema versions;
- bounded ingestion, checkpoints, leases, retries, quarantine, and replay-safe
  idempotency;
- one certified EVM-native and fungible-token movement path;
- exact normalization of movements and applicable network fees;
- independent evidence groups, versioned verification policy, finality, provider
  disagreement, and reorganization handling;
- movement, position, and roll-forward reconciliation;
- stable, deduplicated exceptions and an auditable operator workflow;
- versioned API contracts required by the MVP front end;
- redacted telemetry, health/readiness checks, recovery procedures, and release
  evidence.

### Explicitly excluded from the first release

- wallet private keys, signing, transaction submission, trading, staking, or
  withdrawal approval;
- broad multi-chain or arbitrary-token support;
- full accounting policy, valuation, journals, close, ERP posting, and financial
  statements;
- tax-lot, NAV, regulatory filing, or production compliance certification;
- autonomous AI decisions or AI in a financial control path;
- public self-service onboarding, billing, or mobile applications;
- claims of general production readiness or audit certification.

Excluded work requires a separately approved slice. Unsupported activity must be
preserved as evidence and surfaced explicitly rather than silently guessed or
dropped.

## Architecture direction

Start with a modular platform deployed as a small number of units:

```text
apps/api                 authenticated HTTP API and health/readiness
apps/worker              durable ingestion and control jobs
apps/connector-worker    provider-facing read-only acquisition
packages/canonical-model authoritative runtime domain contracts
packages/exact-values    exact quantities, prices, FX, and rounding primitives
packages/evidence-core   evidence identity, integrity, replay, and lineage
packages/database        migrations, tenant context, repositories, outbox/inbox
packages/authz           tenant and resource authorization policies
packages/verification-core
packages/reconciliation-core
packages/observability
connectors/<provider>    provider-specific adapters behind shared contracts
tests/                   integration, security, recovery, and end-to-end suites
```

These are target boundaries, not a requirement to create every directory at
once. Add a package only when a delivered vertical slice needs it. Core financial
packages must not import provider-specific SDKs or types.

PostgreSQL is authoritative for operational and financial metadata. Exact raw
payloads belong in controlled, versioned S3-compatible storage with relational
metadata and lineage in PostgreSQL. Redis is transient only. Durable events and
resumable workflows should follow the project baseline, but their concrete
deployment must be recorded in an architecture decision and justified by an
executable workflow rather than added as empty infrastructure.

## Non-negotiable rules

1. Tenant identity comes from authenticated authorization, never from a trusted
   request header, URL parameter, body field, or browser storage value.
2. Preserve exact raw evidence before parsing or transformation. Record origin,
   digest, observed/effective time, tenant, source revision, and processing
   versions.
3. A provider lifecycle state is not verification. Verification, finality,
   reconciliation, restriction, classification, valuation, accounting readiness,
   and export state remain separate dimensions.
4. A network transaction can contain many movements, and several observations can
   describe the same movement. Deduplicate financial effects without discarding
   independent evidence or conflicting revisions.
5. Use integer atomic units and arbitrary-precision decimals. Financial API values
   are strings and never pass through JavaScript `number`.
6. Treat delivery as at least once. Ingestion, normalization, verification,
   reconciliation, audit, and later posting must be idempotent.
7. Provider disagreement, missing history, unsupported finality, and outages yield
   pending, degraded, conflicted, or exception states, never fabricated success.
8. Reorganizations preserve old evidence, invalidate affected derived assertions,
   and trigger deterministic reprocessing.
9. Credentials are environment- and tenant-scoped secret references. They never
   appear in evidence payloads, database plaintext, logs, fixtures, API responses,
   or model prompts.
10. Product AI cannot establish truth by assertion, bypass policy, access secrets,
    or silently mutate controlled financial state.

## Authoritative model boundaries

Do not collapse these records into one transaction table or one status field:

- tenant, membership, role, legal entity, book, and access policy;
- integration, source account, monitored address, asset identity, and ownership
  mapping;
- acquisition delivery, immutable evidence, and source revision;
- canonical network transaction, action, movement, and fee;
- economic event and relationships between observations and movements;
- verification decision, reconciliation result, restriction, and exception;
- audit event, processing version, and lineage edge;
- later: policy, valuation, journal, approval, close snapshot, and export batch.

Natural identities must include tenant and source scope. Asset symbols are labels,
not keys. Transaction hashes do not identify individual log-, trace-, output-, or
instruction-level movements.

## API contract direction

Use runtime-validated request and response schemas and generate OpenAPI from the
authoritative contracts. Do not maintain a competing hand-written API model.

Initial resource groups:

- session and authorized tenant context;
- integrations, capabilities, health, and ingestion runs;
- movements and evidence lineage;
- verification decisions and their policy/evidence inputs;
- reconciliation runs, summaries, differences, and position roll-forwards;
- exceptions, assignment, notes, resolution reasons, and history;
- audit events; and
- administrative health/readiness endpoints with no tenant data.

API conventions:

- one documented error envelope with a request/correlation ID;
- cursor pagination for growing collections;
- explicit UTC instants and reporting cutoff/timezone fields;
- string serialization for exact values and lossless indices;
- idempotency or correlation keys for retryable commands;
- optimistic version checks for operator workflow mutations;
- no credential echo, raw storage URL construction, or resource-existence leak;
- unknown required states fail validation, while compatible optional extensions
  remain preservable.

## Delivery phases

### Phase 0: decisions, contracts, and database proof

Deliverables:

- verify the current migration against a real PostgreSQL instance and non-bypass
  application roles;
- prove row-level security, transaction-local tenant context, pooled-connection
  reset behavior, tenant-safe foreign keys, and cross-tenant denial;
- select and record authentication, identity-provider, object-storage, secret,
  event, workflow, and deployment decisions;
- define versioned schemas for integrations, ingestion, movements, evidence,
  verification, reconciliation, exceptions, and audit events;
- establish synthetic golden fixtures and trace each MVP acceptance criterion to
  an automated test or review artifact;
- specify the first certified network, asset, provider-independence, finality,
  and reorganization policies in private operating documentation.

Exit criteria:

- clean-database migration and rollback/rebuild paths work;
- missing or invalid tenant context fails closed in API and database tests;
- all MVP screens map to a versioned API contract and permission;
- no unresolved decision blocks the first authenticated evidence write.

### Phase 1: authenticated tenant and durable evidence slice

Deliverables:

- implement session-to-membership resolution and resource-level authorization;
- persist tenant-scoped integration configuration using secret references;
- implement controlled object storage and append-only evidence metadata;
- make evidence/database/event publication crash-recoverable with an outbox/inbox
  or an equivalently tested design;
- record configuration and administrative audit events;
- expose integration capability and health contracts without leaking secrets.

Exit criteria:

- an authorized tenant can configure a read-only integration;
- a second tenant cannot observe or mutate it through API, worker, database,
  storage, cache, or audit paths;
- exact evidence bytes are written before derived records and can be retrieved by
  digest and authorized lineage reference;
- a crash at each storage/publication boundary can be diagnosed and recovered.

### Phase 2: replay-safe acquisition and normalization

Deliverables:

- implement the shared connector capability and source-record contracts;
- verify network identity and supported historical/finality capabilities;
- add bounded range acquisition, checkpoints, leases, overlap, retries, rate
  limits, quarantine, and dead-letter diagnosis;
- normalize individual fungible-token movements using a stable network,
  transaction, and movement discriminator;
- preserve multiple movements per transaction, zero-value and mint/burn-shaped
  events, failed execution, fees, and actual fee-payer evidence;
- retain parser, schema, connector, and source revisions on derived records.

Exit criteria:

- interruption and restart resume without gaps or duplicate economic effects;
- repeated and out-of-order deliveries retain attestations while producing one
  canonical movement where appropriate;
- large exact quantities round-trip without binary floating-point conversion;
- malformed required fields remain preserved and quarantined, not promoted to a
  successful movement;
- every normalized field is traceable to evidence and a processing version.

### Phase 3: independent verification and reorganization safety

Deliverables:

- implement a versioned verification policy with declared provider-independence
  groups;
- evaluate inclusion, execution, canonical anchor, finality, asset, amount,
  parties, fees, freshness, and provider agreement separately;
- preserve supporting and conflicting evidence and machine-readable reason codes;
- model pending, verified, degraded, conflicted, superseded, and invalidated
  decisions with immutable history;
- detect changed canonical anchors and reprocess affected derived state.

Exit criteria:

- duplicate endpoints from one independence group cannot satisfy quorum;
- provider outage remains pending/degraded and disagreement becomes conflicted;
- illegal state shortcuts are rejected;
- a reorganization fixture preserves the old branch, invalidates stale results,
  and creates the new result without duplicate quantities;
- disabling one concrete connector leaves provider-neutral core tests usable.

### Phase 4: reconciliation and exception operations

Deliverables:

- compare source observations with independently verified canonical movements;
- calculate exact quantity roll-forwards by tenant, monitored account, asset, and
  explicit cutoff;
- compare opening, classified changes, and closing state without double-counting
  fees or internal movements;
- create stable exceptions for missing, extra, amount, identity, finality,
  provider, reorganization, and unsupported-data differences;
- implement authorized assignment, notes, status, and resolution-reason updates;
- expose query contracts required by reconciliation and exception screens.

Exit criteria:

- the approved dataset agrees exactly with an independent test oracle;
- pending, degraded, and conflicted movements cannot enter a reconciled position
  as verified facts;
- rerunning reconciliation does not multiply cases;
- operators cannot edit source evidence or derived quantities;
- every workflow change records actor, time, reason, and before/after state.

### Phase 5: integration, security, and operational hardening

Deliverables:

- integrate the API, workers, storage, database, and front end through the real
  staging-shaped path;
- add redacted structured logs, correlation IDs, metrics, traces, alerts, and
  dependency-aware readiness;
- exercise provider disagreement, timeouts, rate limits, malformed data, worker
  crashes, object-store failures, database recovery, and replay;
- validate least privilege, secret rotation, migration, backup/restore, rollback,
  payload/range limits, and audit coverage;
- publish operator and recovery runbooks plus known capability limits;
- assemble acceptance evidence for the release decision.

Exit criteria:

- the complete operator journey passes automated browser tests against the real
  staging path;
- tenant-isolation, evidence-integrity, replay, recovery, reorganization, and
  exact-reconciliation tests pass on the release revision;
- no open critical security or correctness defect remains;
- rollback and restoration have been rehearsed rather than only documented;
- release scope and unsupported behavior are explicit.

## Testing strategy

### Unit and property tests

- exact arithmetic, scale, signs, rounding, and serialization;
- natural identities and deduplication rules;
- state transitions and policy evaluation;
- position roll-forward invariants;
- provider-independence grouping;
- audit and exception deduplication.

### Database integration tests

- migrations on a clean and previously migrated database;
- actual application roles, RLS, `FORCE ROW LEVEL SECURITY`, and tenant-safe
  foreign keys;
- pooled-connection tenant-context reset;
- uniqueness and idempotency under concurrency;
- append-only evidence and immutable decision history;
- outbox/inbox recovery at transaction boundaries.

### Connector and contract tests

- network and capability discovery;
- request authentication redaction;
- pagination/range limits, retry, and `Retry-After` behavior;
- duplicate, stale, out-of-order, malformed, and revised responses;
- golden fixtures for multiple movements, failure, fees, large values, and
  unsupported activity;
- schema compatibility and OpenAPI generation.

### Security and end-to-end tests

- cross-tenant and role-negative access through API, workers, storage, exports,
  logs, and caches;
- identifier enumeration and resource-existence leakage;
- secret exposure, untrusted payload rendering, and outbound-request controls;
- interruption/resume, provider disagreement, reorganization, and restoration;
- the critical configure-to-evidence-to-reconciliation-to-exception journey.

Mocks alone do not establish tenant isolation, persistence atomicity, provider
compatibility, or recovery behavior.

## Observability and operations

Every request and job needs a correlation ID and tenant-safe structured context.
Logs must be redacted. Metrics should include ingestion lag, checkpoint age,
provider health, evidence failures, verification results, reconciliation duration,
exception counts, queue/workflow age, retries, and dead-letter volume without
leaking tenant-sensitive labels.

Health reports process availability. Readiness verifies required dependencies
without exposing credentials or customer data. Operational documentation must
cover provider outage, partial storage failure, stuck leases, quarantine replay,
reorganization response, database restore, migration rollback, secret rotation,
and safe service degradation.

## Later controlled expansion

After the first control path is accepted, extend in bounded slices:

1. additional certified network families and provider adapters;
2. ownership and economic-event classification;
3. versioned pricing, FX, and valuation policies;
4. balanced, immutable double-entry journals and controlled corrections;
5. period close, reproducible snapshots, reporting, and generic ERP export;
6. governed AI tools for read, investigation, proposals, and simulations;
7. pilot-specific integrations and operating policies.

Accounting, valuation, and AI work must not begin by bypassing unresolved policy
or the deterministic evidence and authorization foundations.

## Definition of done

A back-end slice is done only when:

- its authoritative contracts and persistence changes are versioned;
- tenant and resource authorization is enforced in API, domain, database, worker,
  storage, event, cache, and tool paths that the slice uses;
- exact values remain exact and are serialized as strings;
- evidence and policy lineage can explain every derived assertion;
- duplicate, retry, conflict, crash, and unsupported-data behavior is tested;
- migrations, recovery, observability, and redaction are implemented;
- the integrated consumer uses the real API rather than fixture-only behavior;
- documentation states delivered and unsupported behavior accurately;
- relevant lint, type, unit, contract, integration, and end-to-end checks pass;
- confidential project material is absent from tracked and staged files; and
- `pnpm guard:public` plus an independent staged/tracked-file inspection pass
  before commit or push.
