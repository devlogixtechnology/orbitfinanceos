# OrbitOS MVP operator runbook

Status: Sprint 4 release-candidate operating baseline

This runbook covers the narrow read-only BSC/BEP-20 MVP. It does not authorize
custody, signing, chain writes, production release, or a claim of regulatory or
audit certification.

## Required runtime configuration

The API fails closed when only one half of the Supabase Storage configuration is
present. Supply secrets through the deployment secret manager, never through the
repository or browser-visible variables.

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | Least-privilege `orbitos_app` PostgreSQL connection |
| `SUPABASE_URL` | Staging Supabase project URL when managed evidence storage is used |
| `SUPABASE_SECRET_KEY` | Server-only Storage credential; never use a publishable or browser variable |
| `SUPABASE_EVIDENCE_BUCKET` | Private bucket name; defaults to `orbitos-evidence-staging` |
| `ORBITOS_EVIDENCE_ROOT` | Local fallback evidence root when Supabase Storage is not configured |
| `ORBITOS_MAX_INGESTION_BLOCKS` | Maximum inclusive block span for one run; defaults to `2000` |

Create the staging bucket as private before deployment. Do not add public bucket
policies. The application writes immutable, tenant-prefixed, content-addressed
objects and uses the bucket-detail endpoint for a non-mutating readiness check.

## Probes and metrics

- `GET /health` is process liveness only. A `200` does not mean the service can
  reach PostgreSQL, evidence storage, or BSC providers.
- `GET /ready` checks PostgreSQL, the configured evidence store, and both BSC
  network provider sets with a bounded timeout. `unavailable` produces `503`.
  Reduced provider redundancy is reported as `degraded` without leaking an
  endpoint, credential, tenant, or error message.
- `GET /metrics` exposes Prometheus text for request counts/duration and
  dependency ready/degraded/failure signals. Labels are limited to method,
  route, status class, and dependency name; tenant IDs are prohibited.
- Every response includes `X-Request-Id`. A valid inbound value may be continued;
  otherwise the API generates a UUID. Use this identifier to join API logs and
  incident evidence.

The in-process metrics registry resets when an instance restarts. The deployment
platform must scrape and retain metrics externally. Run lag, exception inventory,
and evidence-lineage completeness remain database/report queries until their
tenant-safe aggregate collectors are added; do not represent them as currently
exported metrics.

## Alert baseline

Configure alerts in the deployment platform. These thresholds are the release
baseline, not application-side paging logic.

| Signal | Threshold | Action |
|---|---|---|
| Readiness unavailable | Any required dependency at `0` for two consecutive probes | Page release/operator owner; stop new runs |
| Provider degraded | Degraded for 5 minutes | Warn operator; inspect both independent groups before accepting verification |
| Provider unavailable | Any required network has no healthy provider | Page; pause affected ingestion and verification |
| Evidence storage unavailable | Any failed check or evidence write | Page immediately; stop transformation/reconciliation for affected input |
| API 5xx rate | More than 2% over 5 minutes with at least 20 requests | Page; correlate by route and request ID |
| API 429 rate | Sustained increase over 5 minutes | Investigate abuse or undersized approved limits; do not disable limits during an incident |

## Deployment checklist

1. Identify the immutable commit and previous known-good release.
2. Run lint, typecheck, unit/integration tests, migration/schema checks, browser
   tests, secret scan, and public-boundary guard on that commit.
3. Confirm the staging bucket is private and inspectable with the new server-only
   secret. Confirm the browser bundle contains no secret key.
4. Apply forward-only database migrations with a migration-capable role. The
   runtime role must remain least privilege and must not own or bypass RLS.
5. Deploy the API and web application. Require `/health` and `/ready` to pass.
6. Sign in as the staging operator, configure only the approved allowlist, run a
   bounded fixture/Testnet range, inspect evidence and verification, reconcile,
   and exercise one exception transition.
7. Record the commit, migration set, probe evidence, smoke-test request IDs,
   known limits, and named release decision.

## Rollback and restoration

Application rollback redeploys the previous immutable release; it never rewrites
Git history. Database migrations are forward-only. If a release must be reversed,
deploy compatible prior code or ship a reviewed compensating migration. Never
delete evidence, verification history, reconciliation history, or audit events to
make an older build appear compatible.

For a database recovery rehearsal:

1. restore the managed backup into an isolated non-production target;
2. apply the committed migrations to the target;
3. run tenant-isolation, RLS, replay, reconciliation, and evidence-lineage checks;
4. compare counts and content digests to the recorded pre-rehearsal inventory;
5. record duration, operator, result, and any recovery point/data gap.

Do not redirect production traffic to a restored target until credentials have
been rotated where required and the release group records approval.

## Incident procedures

### Provider degradation or disagreement

Pause acceptance of new verified facts for the affected network. Preserve raw
responses and provider-group identities, retry only within bounded policy, and
route disagreement to the existing conflict workflow. Never reduce the required
independent quorum to clear an alert.

### Evidence storage failure

Stop the affected ingestion path before transformation. Preserve the run and
checkpoint as pending/degraded, restore storage access, verify the bucket remains
private, then replay from the last durable checkpoint. Confirm content digests
and that replay creates no duplicate movement or audit side effect.

### Database outage or recovery

Remove the instance from readiness, stop workers, and avoid manual table edits.
After service returns, verify migrations and RLS, resume from durable checkpoints,
and reconcile the approved range again. Any missing evidence or cross-tenant
result is P0 and blocks release.

### Reorganization

Preserve the old branch and prior decision, append an invalidation, ingest the new
canonical branch, and create a new decision/reconciliation result. Do not update
historical evidence or quantities in place.

### Secret rotation

Create the replacement in the secret manager, deploy consumers with the new
value, verify readiness and a bounded smoke path, then revoke the old value.
Rotate database and Storage credentials independently. For the staging login,
set `ORBITOS_BOOTSTRAP_PASSWORD` only for `pnpm auth:bootstrap-staging`, then
remove it from the operator environment.

## Release stop conditions

Stop or issue no-go for any cross-tenant exposure, secret leak, evidence loss or
mutation, false verified/reconciled result, failed replay/reorg/recovery proof,
open P0, or P1 that contradicts retained MVP scope. Passing local tests cannot
substitute for deployed staging evidence and named Product/Control/Release owner
acceptance.
