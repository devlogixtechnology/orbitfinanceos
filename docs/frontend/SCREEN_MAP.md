# OrbitOS MVP Screen Map

Status: proposed product and interaction map

This map defines the minimum authenticated web routes for the initial MVP. It keeps
the operator journey narrow while preserving a structure that can later support
accounting, close, reporting, and audit workflows.

## Global shell

### Primary navigation

| Label | Route | Purpose |
| --- | --- | --- |
| Overview | `/app/overview` | Current operational posture and urgent work |
| Integrations | `/app/integrations` | Configure and monitor read-only data sources |
| Movements | `/app/movements` | Find normalized movements and inspect state |
| Reconciliation | `/app/reconciliation` | Compare observed and independently verified results |
| Exceptions | `/app/exceptions` | Investigate and manage unresolved work |

### Persistent shell content

- OrbitOS product mark and environment label;
- active tenant name from the authorized session context;
- primary navigation;
- global search entry point when its API exists;
- user menu with role, session, and sign-out;
- light, dark, and system theme preference inside the user menu;
- service degradation banner when the API declares a relevant incident;
- breadcrumbs on detail routes.

The client must not treat a displayed or selected tenant ID as authority. Tenant
switching, if enabled, must establish a new authorized server-side context and
clear all tenant-scoped client caches.

## Route specifications

### Overview

Route: `/app/overview`

Primary question: What needs attention now?

Content:

- integration health summary with freshness;
- active ingestion runs and checkpoint status;
- movements by verification condition;
- latest reconciliation outcome and cutoff;
- open exceptions grouped by severity and age;
- direct links to affected records.

Avoid a decorative dashboard of generic metrics. Every count links to records and
states its cutoff. Missing data renders as unavailable, not zero.

Key states:

- first-time tenant with no integration;
- configured but not yet ingested;
- healthy and current;
- provider degraded;
- stale data;
- reconciliation not yet run;
- open conflicted exceptions.

### Integration list

Route: `/app/integrations`

Primary question: Which data sources are configured and healthy?

Content:

- provider and network;
- configured wallet and token counts;
- latest successful observation;
- current run/checkpoint;
- capability and provider-group status;
- enabled or paused state;
- action to add an authorized integration.

Primary action: `Add integration`

### Integration setup

Route: `/app/integrations/new`

Primary question: Can this read-only source be configured safely?

Steps are named by their task, not numbered as generic stages:

1. Network and provider groups
2. Wallets and token contracts
3. Starting block and finality policy
4. Capability check
5. Review and create

Requirements:

- server-provided options for supported networks and policy versions;
- clear read-only custody boundary;
- labels above every field;
- credentials accepted through approved secret-reference controls only;
- no credential value returned after submission;
- capability failures identify the missing method or mismatch;
- review screen shows exactly what will be monitored.

### Integration detail

Route: `/app/integrations/[integrationId]`

Primary question: Is this integration providing complete and current evidence?

Sections:

- identity and configuration summary;
- provider-group independence and capability status;
- ingestion health, checkpoint, lag, and recent runs;
- allowlisted wallets and tokens;
- recent failures with safe diagnostic references;
- audit history.

Actions depend on permission and API support. Pausing, resuming, editing, and
retesting must explain their operational effect.

### Movement explorer

Route: `/app/movements`

Primary question: Which movement am I looking for, and what is its current state?

Default columns:

- effective time;
- asset;
- exact quantity;
- direction;
- from and to summary;
- transaction hash plus log index;
- execution result;
- finality;
- provider agreement;
- reconciliation state.

Filters:

- time range;
- wallet;
- token contract or asset;
- transaction hash;
- direction;
- execution, finality, agreement, and reconciliation states;
- evidence freshness.

All filters, sort, and pagination are represented in the URL.

### Movement detail

Route: `/app/movements/[movementId]`

Primary question: What happened, and what supports that conclusion?

Layout:

- primary movement facts and exact values;
- separate state matrix for observation, execution, finality, provider agreement,
  and reconciliation;
- source observations and independent evidence references;
- block and transaction anchors;
- fee and fee-payer information when known;
- lineage and policy versions;
- related movements from the same transaction;
- relevant exceptions and audit events.

The transaction hash does not replace movement identity. Log index or another
movement discriminator remains visible and copyable.

### Evidence detail

Routes:

- contextual drawer from a related record;
- full route `/app/evidence/[evidenceId]` for bookmarked investigation.

Primary question: What exact observation was preserved, where did it come from,
and how was it used?

Content:

- digest;
- source and independence group;
- request fingerprint without secret material;
- observed and effective times;
- network and block anchor;
- schema and parser versions;
- lineage edges;
- integrity result;
- safe raw-payload viewer or authorized download.

Large payloads load on demand. Raw evidence is read-only. Provider content is
rendered as inert text, never executable markup.

### Reconciliation list

Route: `/app/reconciliation`

Primary question: What was reconciled at each cutoff, and what remains unresolved?

Content:

- run or result identifier;
- wallet and token scope;
- cutoff;
- observed, verified, matched, unmatched, pending, degraded, and conflicted
  counts;
- exact closing quantity;
- freshness and policy version;
- run status and completion time.

### Reconciliation detail

Route: `/app/reconciliation/[reconciliationId]`

Primary question: Does the position roll-forward agree, and why?

Content:

- scope and cutoff;
- exact opening quantity;
- exact verified changes;
- exact expected closing quantity;
- independently observed closing quantity when available;
- difference without tolerance hiding;
- movement-set comparison;
- excluded pending, degraded, and conflicted items;
- policy and evidence lineage;
- generated exceptions.

Comparison visuals are secondary to exact values. Any chart or compact graphic has
an adjacent accessible table.

### Exception queue

Route: `/app/exceptions`

Primary question: Which unresolved item should be investigated next?

Default columns:

- severity;
- reason;
- affected resource;
- state;
- owner;
- age;
- latest activity;
- due date when governed by policy.

Filters:

- status;
- severity;
- reason family;
- owner;
- wallet or integration;
- asset;
- created and updated ranges;
- unassigned only.

Default ordering is deterministic and documented. It must not imply a materiality
ranking unless a governed materiality policy exists.

### Exception detail

Route: `/app/exceptions/[exceptionId]`

Primary question: What is wrong, what evidence supports it, and what authorized
action is available?

Content:

- concise problem statement;
- state, severity, owner, and timestamps;
- affected movement, integration, or reconciliation records;
- evidence and provider comparison;
- reason code and diagnostic context;
- notes and audit history;
- resolution controls permitted by role and state.

Allowed workflow mutations for the MVP may include owner, status, note, and
resolution reason. They never modify raw evidence, exact source amounts, or
derived movement facts.

## Cross-screen interaction patterns

### Copyable technical value

Display a readable shortened value only when space requires it. The control must
copy the complete original string, expose it to assistive technology, and confirm
success without shifting layout.

### Evidence reference

An evidence reference includes source, observation time, digest prefix, and
integrity state. Selecting it opens the contextual drawer. A full-page action is
available for sustained investigation.

### State matrix

Use a compact labeled matrix when multiple state dimensions apply:

| Dimension | Example values |
| --- | --- |
| Observation | received, quarantined, superseded |
| Execution | successful, failed, unknown |
| Finality | pending, safe, finalized, invalidated |
| Provider agreement | agreed, degraded, conflicted, unavailable |
| Reconciliation | not run, matched, unmatched, excluded |

The API owns the actual enums. The UI maps each supported value explicitly and
uses a safe unknown-state fallback.

### Audit timeline

Audit items show actor, action, timestamp, reason, and relevant before/after
values. System and human actions are visually distinguishable through labels and
icons, not invented avatars.

## Permission behavior

| Capability | Administrator | Read-only operator |
| --- | --- | --- |
| View operational records and evidence | Allowed | Allowed |
| Create or edit an integration | Allowed when API permits | Not allowed |
| Pause, resume, or retest integration | Allowed when API permits | Not allowed |
| Assign or update exception workflow | Allowed when policy permits | Not allowed |
| Modify evidence or derived amounts | Never | Never |

Permissions shown here are a UI planning baseline. Server authorization remains
authoritative. Hidden controls do not replace server-side denial.

## Required route states

Every route must define:

- initial loading;
- background refresh;
- empty healthy;
- empty because of filters;
- partial or stale data;
- degraded dependency;
- malformed or unsupported response;
- forbidden;
- not found without cross-tenant disclosure;
- recoverable error;
- terminal error;
- reduced-motion behavior;
- light and dark theme behavior;
- narrow-screen behavior.

## Deferred route families

The route structure should be able to add these later without making them visible
in the MVP:

```text
/app/subledger
/app/close
/app/reports
/app/audit
/app/assistant
/app/admin
```

Adding a route requires an implemented backend contract, permission model,
non-success states, and acceptance tests. A placeholder navigation item is not a
delivered feature.
