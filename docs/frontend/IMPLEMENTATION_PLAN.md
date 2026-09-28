# OrbitOS Front-end Development Plan

Status: proposed implementation plan

Depends on: versioned operational API contracts and authenticated tenant context

## Outcome

Build a minimal, authoritative OrbitOS web application that lets an authorized
operator complete the initial MVP journey:

`configure integration -> inspect health -> review movements and evidence -> run or inspect reconciliation -> investigate exceptions`

The front-end is not accepted on fixture-only behavior. Fixtures unblock parallel
work, but the critical path must be integrated with the tenant-scoped API and real
evidence flow before release.

## Scope

### Included

- authenticated application shell;
- server-derived tenant context;
- integration setup and health;
- movement list and detail;
- evidence detail and lineage;
- verification dimensions;
- reconciliation summary and detail;
- exception queue, investigation, and authorized workflow updates;
- audit history for operator actions;
- loading, empty, stale, degraded, error, and unauthorized states;
- keyboard access and responsive web behavior;
- browser tests for the critical operator path.

### Excluded from this plan

- custody, signing, transaction submission, trading, or withdrawals;
- full accounting, journals, valuation, close, ERP posting, and statements;
- AI classification or autonomous operator actions;
- public onboarding, billing, mobile applications, or broad localization;
- decorative marketing pages;
- enabled navigation for backend capabilities that do not exist.

## Technical baseline

The repository currently has no `apps/web` package. Front-end implementation
should add it as a bounded workspace package only when development begins.

Proposed baseline:

| Area | Direction |
| --- | --- |
| Framework | Next.js App Router with strict TypeScript and React |
| Rendering | Server-rendered shell and initial reads, client islands for interactive workflows |
| Styling | Semantic CSS variables with Tailwind CSS v4 utilities |
| Themes | Light, dark, and system preferences resolved before first paint |
| Accessible primitives | Radix UI primitives, customized to `DESIGN.md` |
| Icons | Phosphor Icons, one family only |
| Dense tables | TanStack Table when native table composition is insufficient |
| Validation | Shared Zod schemas or generated schemas from the authoritative API contract |
| Forms | React Hook Form only if configuration complexity warrants it |
| Remote state | A typed API layer; add TanStack Query only for polling, mutation, and cache needs |
| Motion | CSS transitions by default; no animation dependency for the MVP baseline |
| Tests | Vitest, Testing Library, axe checks, and Playwright for critical browser paths |

Before importing any package, verify the root and web package manifests, choose a
compatible pinned version, and record it in the lockfile. Do not add a component
system that competes with the custom OrbitOS tokens.

## Front-end architecture

```text
apps/web/
  app/
    (auth)/
    (app)/
      layout.tsx
      overview/
      integrations/
      movements/
      reconciliation/
      exceptions/
  components/
    app-shell/
    data-display/
    feedback/
    forms/
    investigation/
    navigation/
  features/
    integrations/
    movements/
    evidence/
    reconciliation/
    exceptions/
  lib/
    api/
    auth/
    exact-values/
    formatting/
    permissions/
  styles/
    tokens.css
    globals.css
  test/
    fixtures/
    contracts/
    browser/
```

Feature modules own route-specific composition and domain presentation. Shared
components remain domain-neutral. API transport, authorization checks, exact-value
formatting, and telemetry stay outside visual components.

## Contract-first rules

1. The server derives tenant identity from the authenticated session. Route params,
   query params, headers, and browser storage are not trusted tenant authority.
2. Every resource schema carries explicit state dimensions. The front-end must not
   infer `verified` from a provider status.
3. Financial and chain quantities arrive as strings and remain strings through
   formatting and copy actions.
4. Timestamps include absolute UTC values and explicit display timezone rules.
5. Evidence and audit references use opaque IDs. The UI does not construct storage
   URLs or expose secret request context.
6. Mutations require explicit permission and return an authoritative updated
   resource or version conflict.
7. Unknown enum values render as `Unsupported state` with diagnostic context. They
   must not fall through to a success style.

## Delivery phases

### Phase 0: decisions and contracts

Deliverables:

- confirm the critical operator journey and role permissions;
- approve route map and responsive priority;
- define API schemas for integrations, ingestion health, movements, evidence,
  verification, reconciliation, exceptions, and audit events;
- define fixture ownership and contract versioning;
- choose and pin front-end dependencies;
- turn both theme palettes in `DESIGN.md` into implementation-ready semantic CSS
  variables;
- define server-readable theme persistence and no-flash first-paint behavior.

Exit criteria:

- every MVP screen maps to an API contract and permission;
- fixture examples cover success, empty, pending, degraded, conflicted, stale,
  unauthorized, and malformed responses;
- no open design decision blocks the shell.

### Phase 1: application shell and quality harness

Deliverables:

- create `apps/web` and connect it to the workspace build;
- implement authenticated routing and fail-closed tenant context;
- build sidebar, top bar, page header, breadcrumbs, and responsive navigation;
- implement dual-theme tokens, theme preference control, typography, focus styles,
  buttons, fields, badges, panels, tables, skeletons, empty states, and error
  boundaries;
- establish component tests, accessibility checks, and browser-test infrastructure;
- add safe telemetry boundaries with redaction.

Exit criteria:

- an authenticated tenant-scoped route renders in the staging-shaped environment;
- unauthenticated and unauthorized paths fail without resource disclosure;
- shell keyboard navigation and focus order pass automated and manual checks in
  both themes;
- system, light, and dark preferences render without a hydration mismatch or
  visible theme flash;
- deliberate test and accessibility failures block CI.

### Phase 2: integrations, health, movements, and evidence

Deliverables:

- integration list, setup flow, capability check, and detail health view;
- ingestion run state, checkpoint, provider-group health, and freshness display;
- movement list with search, filters, sort, pagination, and exact amounts;
- movement detail with separate observation, execution, finality, provider
  agreement, and reconciliation states;
- evidence drawer and full evidence route with digest, source, observation time,
  block anchor, policy version, and safe raw payload inspection;
- copy actions for addresses, hashes, IDs, and exact quantities.

Exit criteria:

- credentials never return in API payloads, UI state, logs, or snapshots;
- multiple transfer logs in one transaction remain separately addressable;
- zero-value, mint/burn-shaped, failed, pending, and conflicted examples render
  correctly;
- a movement can be traced to its preserved evidence from the browser.

### Phase 3: reconciliation and exception operations

Deliverables:

- reconciliation summary by wallet, token contract, and cutoff;
- observed versus independently verified movement comparison;
- position roll-forward with exact opening, changes, and closing values;
- exception queue with saved URL filters and stable sort behavior;
- exception detail with evidence, reason, impact, owner, status, notes, and history;
- authorized owner, status, note, and resolution-reason mutations;
- optimistic feedback only where rollback and version conflict are handled safely.

Exit criteria:

- pending, degraded, conflicted, matched, and unmatched are distinguishable without
  reading raw data;
- rerunning reconciliation does not multiply visible exceptions;
- manual actions cannot edit source evidence or derived financial amounts;
- mutation history identifies actor, time, reason, and before/after state;
- role-negative and cross-tenant browser tests pass.

### Phase 4: hardening and acceptance

Deliverables:

- integrate all critical views with the real staging data path;
- complete loading, empty, stale, degraded, conflict, timeout, and recovery states;
- test provider disagreement, delayed evidence, reorg invalidation, and partial
  service failure in the UI;
- run accessibility, responsive, browser, performance, and redaction reviews;
- capture UAT evidence for the approved operator journey;
- document runbook steps for front-end rollback and cache invalidation.

Exit criteria:

- the complete critical path passes browser automation against staging;
- stakeholder review confirms that uncertainty and evidence are understandable;
- no P0 or P1 front-end defects remain;
- key pages meet the performance budgets below;
- no confidential files, secrets, tenant data, or private planning material appear
  in source control or build artifacts.

## Component delivery order

Build components in the order required by real screens:

1. tokens, typography, focus, layout primitives;
2. button, link, field, select, checkbox, badge, tooltip;
3. skeleton, empty state, inline alert, error boundary;
4. application shell and navigation;
5. data table, filter bar, pagination, copyable value;
6. state matrix and evidence reference;
7. drawer, dialog, tabs, timeline;
8. reconciliation comparison and exception workflow components;
9. charts only after exact-value summaries and tables work.

Do not build a large abstract component catalog before the critical screens expose
real needs.

## State and data strategy

### URL state

Search, filters, sort, pagination, selected date/cutoff, and shareable tab state
belong in the URL. This makes investigations reproducible and supports authorized
sharing.

### Server state

The API remains authoritative. Cache only tenant-scoped results and clear them on
tenant/session changes. Poll health and run status with bounded intervals and stop
polling when the page is hidden or the terminal state is reached.

### Local state

Use local component state for transient presentation such as an open drawer or an
unsubmitted form. Do not copy remote records into global client state without a
specific need.

### Mutation behavior

- Require an idempotency or correlation key when the API contract supports it.
- Disable repeat submission while a mutation is pending.
- Show version conflicts inline and preserve the operator's draft.
- Refetch authoritative state after workflow changes.
- Use toasts only for transient confirmation. Validation and domain conflicts stay
  next to the affected control.

## Testing strategy

### Unit and component

- exact-value formatting without numeric conversion;
- state-to-label and state-to-tone mapping;
- unknown and missing state behavior;
- timezone and cutoff display;
- accessible naming, focus, and keyboard interaction;
- loading, empty, stale, unauthorized, and error states.

### Contract

- validate fixtures and API responses against the same authoritative schemas;
- fail on unrecognized required fields or incompatible enum changes;
- confirm secret fields cannot appear in public response models;
- confirm every record remains tenant scoped.

### Browser

Critical paths:

1. authenticate and enter the authorized tenant context;
2. configure an allowlisted read-only integration;
3. inspect capability and ingestion health;
4. find a movement and open its evidence;
5. distinguish pending, degraded, conflicted, and verified dimensions;
6. inspect a reconciliation difference;
7. assign and resolve an exception with a reason;
8. verify the audit history;
9. confirm unauthorized and cross-tenant access fails safely.

### Visual and accessibility

- screenshot checks in light and dark themes at 1440, 1024, 768, and 390 px;
- axe checks for every route state;
- manual keyboard and screen-reader smoke tests for the critical path;
- contrast verification for custom state and chart treatments in both themes;
- reduced-motion verification.

## Performance budgets

Initial front-end budgets, to validate against the integrated application:

| Budget | Target |
| --- | ---: |
| Largest Contentful Paint | under 2.5 s on the agreed test profile |
| Interaction to Next Paint | under 200 ms |
| Cumulative Layout Shift | under 0.1 |
| Initial route JavaScript | under 220 kB compressed, excluding framework runtime |
| Route transition feedback | visible within 100 ms |
| Indexed list response rendering | useful content within 300 ms after response |
| Evidence detail rendering | useful content within 1 s after response |

Large evidence payloads and long tables must use bounded rendering, pagination, or
virtualization. Do not syntax-highlight multi-megabyte payloads on the main thread.

## Security and privacy review

- no tenant authority from client-controlled values;
- no secrets or credential echoes;
- no raw HTML rendering from provider payloads;
- no external image or URL loads from untrusted evidence;
- safe copy and download behavior for evidence;
- no resource-existence leak in authorization errors;
- redacted client logging and error reporting;
- explicit Content Security Policy and frame restrictions;
- audit all workflow mutations;
- clear tenant-scoped caches on sign-out or context change.

## Definition of done

A front-end slice is done when:

- it is connected to a versioned contract and the staging-shaped data path;
- success and non-success states are implemented;
- authorization is enforced server-side and negative tests exist;
- exact values remain exact;
- keyboard, focus, contrast, theme parity, and responsive behavior are verified;
- telemetry is useful and redacted;
- component, contract, and critical browser tests pass;
- documentation and `SCREEN_MAP.md` reflect the delivered behavior;
- `pnpm guard:public` and the repository's tracked/staged boundary checks pass
  before any commit or push.
