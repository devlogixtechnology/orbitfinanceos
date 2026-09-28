# OrbitOS Interface Design System

Status: proposed front-end baseline

Scope: authenticated OrbitOS web application

Theme: light and dark, system-aware

This document is the visual and interaction authority for the OrbitOS front-end.
The implementation sequence and route-level requirements live in
[`docs/frontend/IMPLEMENTATION_PLAN.md`](docs/frontend/IMPLEMENTATION_PLAN.md) and
[`docs/frontend/SCREEN_MAP.md`](docs/frontend/SCREEN_MAP.md).

## Design read

OrbitOS is an institutional operator console for controllers, operations analysts,
and reviewers. It must feel minimal, precise, and calm under pressure. Luxury comes
from proportion, typography, material restraint, and excellent state design. It
must never come from decorative glow, opaque glass effects, or animation that
competes with financial evidence.

The visual language is cool, precise luxury with operational authority:

- pale technical surfaces in light mode and dark mineral surfaces in dark mode;
- crisp, high-contrast typography;
- cyan for action and focus;
- violet for evidence relationships and secondary analytical emphasis;
- semantic colors reserved for real state;
- sparse elevation and generous structural spacing;
- compact density inside tables and investigation views.

Design dials:

| Dial | Value | Meaning |
| --- | ---: | --- |
| `DESIGN_VARIANCE` | 4/10 | Ordered grids with occasional asymmetric emphasis |
| `MOTION_INTENSITY` | 3/10 | State feedback and short transitions only |
| `VISUAL_DENSITY` | 6/10 | Operationally dense, with clear grouping and breathing room |

## Product principles

### Evidence before decoration

Every important status must expose why it exists. A movement, verification result,
reconciliation outcome, or exception should lead directly to its evidence and
policy lineage.

### Confidence must be legible

Do not collapse observed, normalized, final, verified, reconciled, and resolved
into one badge. Present each dimension independently. Uncertainty is an explicit
state, not a visual omission.

### One primary decision per view

Each screen has one dominant operator task. Secondary actions stay quiet. Dangerous
or irreversible actions require clear consequence text and confirmation.

### Calm under failure

Degraded providers, missing evidence, conflicts, reorgs, and authorization failures
must look deliberate and actionable. Error states must not visually break the
application shell.

### Exact values stay exact

Quantities, fees, balances, block numbers, and hashes are displayed from string or
integer representations. The UI must not convert financial values to binary
floating point. Truncation is visual only and the full exact value remains
available through copy or detail views.

## Color system

### Core palette

| Role | Token | Light theme | Dark theme | Usage |
| --- | --- | --- | --- | --- |
| Canvas | `--color-canvas` | `#F4F7FA` | `#080B12` | Application background |
| Subtle background | `--color-background-subtle` | `#EAF0F6` | `#0C111B` | Filter bars, quiet grouped regions |
| Surface | `--color-surface` | `#FFFFFF` | `#111722` | Navigation, panels, table bodies |
| Raised surface | `--color-surface-raised` | `#FFFFFF` | `#192231` | Dialogs, popovers, selected panels |
| Border | `--color-border` | `#D7E0EA` | `#253246` | Structural separation |
| Strong border | `--color-border-strong` | `#B7C4D3` | `#35445B` | Emphasized structural separation |
| Primary text | `--color-text-primary` | `#101827` | `#F3F7FC` | Headings, values, primary labels |
| Secondary text | `--color-text-secondary` | `#475569` | `#A7B4C6` | Supporting text, metadata, placeholders |
| Muted text | `--color-text-muted` | `#718096` | `#718096` | Nonessential and disabled information |
| Orbit cyan | `--color-accent` | `#087C9E` | `#4CC9F0` | Primary actions, focus, active navigation |
| Cyan hover | `--color-accent-hover` | `#066781` | `#72D6F4` | Interactive hover and active emphasis |
| Aurora violet | `--color-analytic` | `#6554D9` | `#9587F8` | Evidence lineage and analytical comparison |
| Violet hover | `--color-analytic-hover` | `#5544C0` | `#ADA3FA` | Analytical hover emphasis |
| Success | `--color-success` | `#16835F` | `#35D39A` | Confirmed positive semantic state |
| Warning | `--color-warning` | `#A86400` | `#F2B84B` | Pending, degraded, needs attention |
| Error | `--color-error` | `#C93B52` | `#FF667A` | Failed, conflicted, blocked, destructive |

### Supporting tokens

Supporting tokens are derived from the core palette. They do not introduce new
brand colors.

```css
:root,
:root[data-theme="light"] {
  color-scheme: light;

  --color-canvas: #f4f7fa;
  --color-background-subtle: #eaf0f6;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-border: #d7e0ea;
  --color-border-strong: #b7c4d3;
  --color-text-primary: #101827;
  --color-text-secondary: #475569;
  --color-text-muted: #718096;
  --color-accent: #087c9e;
  --color-accent-hover: #066781;
  --color-analytic: #6554d9;
  --color-analytic-hover: #5544c0;
  --color-success: #16835f;
  --color-warning: #a86400;
  --color-error: #c93b52;

  --color-on-accent: #ffffff;
  --color-on-analytic: #ffffff;
  --color-on-success: #ffffff;
  --color-on-warning: #ffffff;
  --color-on-error: #ffffff;
  --color-control-border: #718096;
  --color-accent-soft: rgb(8 124 158 / 0.1);
  --color-analytic-soft: rgb(101 84 217 / 0.1);
  --color-scrim: rgb(16 24 39 / 0.56);
  --color-shadow: rgb(71 85 105 / 0.16);
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --color-canvas: #080b12;
  --color-background-subtle: #0c111b;
  --color-surface: #111722;
  --color-surface-raised: #192231;
  --color-border: #253246;
  --color-border-strong: #35445b;
  --color-text-primary: #f3f7fc;
  --color-text-secondary: #a7b4c6;
  --color-text-muted: #718096;
  --color-accent: #4cc9f0;
  --color-accent-hover: #72d6f4;
  --color-analytic: #9587f8;
  --color-analytic-hover: #ada3fa;
  --color-success: #35d39a;
  --color-warning: #f2b84b;
  --color-error: #ff667a;

  --color-on-accent: #080b12;
  --color-on-analytic: #080b12;
  --color-on-success: #080b12;
  --color-on-warning: #080b12;
  --color-on-error: #080b12;
  --color-control-border: #718096;
  --color-accent-soft: rgb(76 201 240 / 0.12);
  --color-analytic-soft: rgb(149 135 248 / 0.12);
  --color-scrim: rgb(8 11 18 / 0.78);
  --color-shadow: rgb(2 6 15 / 0.48);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;

    --color-canvas: #080b12;
    --color-background-subtle: #0c111b;
    --color-surface: #111722;
    --color-surface-raised: #192231;
    --color-border: #253246;
    --color-border-strong: #35445b;
    --color-text-primary: #f3f7fc;
    --color-text-secondary: #a7b4c6;
    --color-text-muted: #718096;
    --color-accent: #4cc9f0;
    --color-accent-hover: #72d6f4;
    --color-analytic: #9587f8;
    --color-analytic-hover: #ada3fa;
    --color-success: #35d39a;
    --color-warning: #f2b84b;
    --color-error: #ff667a;
    --color-on-accent: #080b12;
    --color-on-analytic: #080b12;
    --color-on-success: #080b12;
    --color-on-warning: #080b12;
    --color-on-error: #080b12;
    --color-control-border: #718096;
    --color-accent-soft: rgb(76 201 240 / 0.12);
    --color-analytic-soft: rgb(149 135 248 / 0.12);
    --color-scrim: rgb(8 11 18 / 0.78);
    --color-shadow: rgb(2 6 15 / 0.48);
  }
}
```

### Color rules

1. Cyan is the only interactive accent. Use it for focus, links, selected
   navigation, and the primary call to action.
2. Violet is analytical, not interactive. Use it for evidence relationships,
   comparison series, and lineage emphasis. Do not use it for primary buttons.
3. Success, warning, and error appear only when they communicate actual state.
4. Status never relies on color alone. Pair color with a label, icon, and concise
   explanation where needed.
5. Avoid outer glows and large cyan-violet gradients. A subtle tinted fill or
   inner border is sufficient.
6. A page uses one active theme. Individual sections and panels cannot invert
   themselves independently.
7. Muted text is not permitted for essential body copy. It falls below 4.5:1 on
   several supplied surfaces and is limited to disabled or nonessential content.
8. Structural border tokens organize content. Controls that require a visible
   boundary use `--color-control-border` or another treatment that reaches 3:1.

### Theme behavior

- Offer `Light`, `Dark`, and `System` preferences in the user menu.
- Use the operating-system preference on first visit.
- Persist the explicit choice in a server-readable cookie when possible so the
  correct theme is rendered before hydration.
- Apply `data-theme="light"` or `data-theme="dark"` to the document root for an
  explicit choice. Leave the attribute absent for `System` so the media query
  remains authoritative.
- Prevent theme flash by resolving the cookie or system preference before first
  paint. Do not wait for a client effect.
- Browser-native controls must follow the active theme through `color-scheme`.
- Theme changes update color only. Layout, hierarchy, component size, and status
  meaning stay identical.
- Every component and chart must be reviewed in both themes. Components consume
  semantic tokens and never branch on raw hexadecimal values.

### Verified contrast pairs

| Theme | Foreground | Background | Ratio | Rule |
| --- | --- | --- | ---: | --- |
| Light | Primary text | Canvas | 16.52:1 | AAA |
| Light | Primary text | Surface | 17.77:1 | AAA |
| Light | Secondary text | Canvas | 7.05:1 | AAA |
| Light | Secondary text | Surface | 7.58:1 | AAA |
| Light | White action text | Orbit cyan | 4.79:1 | AA |
| Light | White action text | Cyan hover | 6.43:1 | AA |
| Light | White analytical text | Aurora violet | 5.49:1 | AA |
| Light | White state text | Success | 4.72:1 | AA |
| Light | White state text | Warning | 4.68:1 | AA |
| Light | White state text | Error | 4.96:1 | AA |
| Dark | Primary text | Canvas | 18.30:1 | AAA |
| Dark | Secondary text | Canvas | 9.36:1 | AAA |
| Dark | Secondary text | Surface | 8.54:1 | AAA |
| Dark | Canvas action text | Orbit cyan | 10.24:1 | AAA |
| Dark | Canvas action text | Cyan hover | 11.85:1 | AAA |
| Dark | Canvas analytical text | Aurora violet | 6.65:1 | AA |
| Dark | Canvas state text | Success | 10.25:1 | AAA |
| Dark | Canvas state text | Warning | 11.00:1 | AAA |
| Dark | Canvas state text | Error | 6.97:1 | AA |

Filled controls always use the matching `--color-on-*` token. Do not assume white
text works on a dark-theme accent or dark text works on a light-theme accent.

## Typography

### Families

- Interface and display: `Geist Sans`, variable weight, self-hosted or loaded with
  `next/font`.
- Exact values and technical identifiers: `Geist Mono`.
- System fallback: `Arial`, `Helvetica`, sans-serif for interface text and
  `ui-monospace`, `SFMono-Regular`, monospace for technical text.

Do not introduce a serif family. Authority comes from measured sans-serif
typography, not editorial ornament.

### Type scale

| Role | Size / line height | Weight | Use |
| --- | --- | ---: | --- |
| Display | 40/44 desktop, 32/36 compact | 560 | Page title or key total only |
| Heading 1 | 30/36 | 560 | Primary page heading |
| Heading 2 | 22/28 | 540 | Section heading |
| Heading 3 | 17/24 | 540 | Panel heading |
| Body | 14/21 | 420 | Default application copy |
| Body strong | 14/21 | 560 | Labels and emphasis |
| Small | 12/18 | 450 | Metadata and helper text |
| Data | 13/20 | 500 | Amounts, hashes, IDs, blocks |

Rules:

- Use sentence case for headings, labels, buttons, and navigation.
- Do not use uppercase tracking as a repeated section device.
- Tabular numeric alignment is required for comparable values.
- Technical identifiers use monospace and preserve copyable full values.
- Page titles should fit on one line at 1280 px whenever possible.

## Layout

### Application frame

- Desktop sidebar: 248 px expanded, 72 px collapsed.
- Top bar: 64 px maximum height.
- Main content width: fluid, with a 1600 px maximum for dense operational views.
- Default content padding: 32 px desktop, 24 px tablet, 16 px compact.
- Page section gap: 32 px.
- Panel gap: 16 px.
- Base spacing unit: 4 px.

The application shell uses a fixed navigation column and a stable content region.
Avoid centered marketing-page layouts inside authenticated workflows.

### Grid

- Use a 12-column grid for overview and detail pages.
- Use CSS Grid for split layouts and aligned summaries.
- Investigation pages use a 7/5 or 8/4 content-to-context split at large widths.
- Below 1024 px, secondary context becomes a drawer or stacked region.
- Below 768 px, use one column with 16 px page padding.

### Shape

OrbitOS uses a restrained soft-corner system:

| Element | Radius |
| --- | ---: |
| Buttons, inputs, compact controls | 6 px |
| Panels, tables, drawers | 10 px |
| Dialogs | 12 px |
| Status badges | 999 px |

Pills are reserved for status and filters. General buttons are not pill-shaped.

### Elevation

Use three structural layers:

1. Canvas: page background.
2. Surface: navigation, panels, tables.
3. Raised surface: popovers, dialogs, selected investigation context.

Prefer borders and tonal separation over shadows. Raised elements may use one
subtle tinted shadow:

```css
box-shadow: 0 16px 48px var(--color-shadow);
```

## Iconography

Use one icon family across the product. The planned default is Phosphor Icons with
`1.5` stroke weight and regular style. Use 16 px icons in dense controls, 20 px in
navigation, and 24 px only for prominent empty states.

Icons reinforce labels and must not replace essential text in unfamiliar actions.
Do not draw custom interface SVG paths.

## Core components

### Buttons

- Primary: cyan fill, `--color-on-accent` text, one per action region.
- Secondary: transparent or Surface fill with strong border and Primary text.
- Tertiary: text action with cyan hover and focus treatment.
- Destructive: Error fill with `--color-on-error` text, only after clear
  consequence wording.
- Icon-only: 36 px square minimum with an accessible name and tooltip.

All buttons include hover, focus-visible, active, disabled, loading, and error
recovery behavior. Active feedback uses a 1 px vertical translation. Labels stay
on one line.

### Inputs and forms

- Label sits above the control.
- Helper text and validation remain below it.
- Placeholder text never replaces the label.
- Inputs use Surface fill, an accessible control border, and a 2 px cyan focus
  ring. Structural border tokens alone are not sufficient control boundaries.
- Secret values are never returned to or echoed by the interface.
- Long configuration forms are grouped by task, not placed in one uninterrupted
  column.

### Tables

Tables are for comparable operational records, not layout.

- Header height: 40 px.
- Row height: 48 px default, 56 px when a row carries a secondary line.
- Sticky header for long result sets.
- Right-align quantities and block numbers.
- Use monospace for exact amounts, hashes, addresses, and IDs.
- Use one subtle row separator, not boxed cells.
- Row hover reveals affordance without moving content.
- Selection is visible through a cyan-tinted fill and a left inset marker.
- Pagination, sort, and filters remain keyboard accessible.
- Columns hide by priority on compact screens; horizontal scrolling is the final
  fallback for exact comparison tables.

### Status presentation

Badges must represent one state dimension only.

| State family | Treatment |
| --- | --- |
| Confirmed, matched, healthy | Success icon and label |
| Pending, degraded, needs review | Warning icon and label |
| Conflicted, failed, blocked | Error icon and label |
| Observed, neutral, unavailable | Secondary text and neutral border |
| Active selection or action | Cyan, never a semantic substitute |
| Evidence comparison | Violet, never a success substitute |

Never display a lone green badge called `Verified` when finality, provider
agreement, or reconciliation has a different state.

### Panels and summary metrics

Cards are used only when they represent a real unit of hierarchy. Summary metrics
sit in a shared surface with sparse separators. Avoid rows of identical floating
cards.

Every metric includes:

- a clear label;
- an exact value or a clearly marked count;
- the cutoff or freshness time when relevant;
- a route to the underlying records;
- an unavailable state that does not display zero.

### Drawers and dialogs

Use a right-side drawer for evidence context that should remain visible beside the
operator's current list. Use a dialog only for short, interruptive decisions. Full
investigations use a route so they can be bookmarked and shared within authorized
access.

### Empty, loading, and error states

- Loading skeletons match the final content structure and reserve layout space.
- Empty states explain whether the state is healthy, filtered, or waiting for data.
- Error states identify scope, impact, retry behavior, and a supportable reference.
- Permission errors do not reveal whether another tenant's resource exists.
- Stale data remains visible with a clear stale marker when policy permits it.

## Navigation and information architecture

Primary navigation for the initial MVP:

1. Overview
2. Integrations
3. Movements
4. Reconciliation
5. Exceptions

Evidence is contextual and reached from movements, verification results,
reconciliation items, and exceptions. It is not a disconnected primary section.
Audit history appears inside each relevant detail view in the MVP.

Future modules such as Subledger, Close, Reports, AI Assistant, and Administration
must not appear as enabled navigation until their backend contracts and permissions
exist. If roadmap visibility is required, use product documentation, not disabled
application navigation.

## Data visualization

Charts support investigation and trend recognition. They never replace exact
figures or imply precision that the data does not support.

- Cyan is the primary series.
- Violet is the comparison or independent-evidence series.
- Success, warning, and error are reserved for state annotations.
- Use direct labels where space permits.
- Use patterns, icons, or labels in addition to color.
- Tooltips show exact string values and explicit timestamps.
- Zero, missing, stale, and unavailable are separate states.
- Do not use decorative radial scores or progress rings for close readiness.

## Motion

Motion communicates state change, hierarchy, or feedback.

- Standard transition: 140 ms for hover/focus, 180-220 ms for overlays.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Animate only opacity and transform.
- Do not animate live table rows continuously.
- New or changed records may use one brief background fade.
- Drawers enter from the right without overshoot.
- Skeleton shimmer is optional and disabled under reduced motion.
- Honor `prefers-reduced-motion` across the product.

No parallax, scroll hijacking, magnetic controls, particle effects, or decorative
infinite loops are permitted in the authenticated application.

## Responsive behavior

OrbitOS is desktop-first because investigation and reconciliation require
comparison space. Responsive web support remains required.

- 1440-1600 px: full navigation, multi-column investigation, complete tables.
- 1024-1439 px: collapsed navigation available, reduced secondary columns.
- 768-1023 px: drawers replace side context, priority columns remain.
- Below 768 px: single column, stacked summaries, compact filters, and safe
  read-oriented investigation. Complex configuration and bulk actions may direct
  users to a larger viewport.

Do not use `100vh` for full-height regions. Use dynamic viewport units and allow
content to grow.

## Accessibility and trust requirements

- WCAG 2.2 AA is the minimum target for all MVP workflows.
- All primary content and actions are keyboard reachable.
- Focus order follows visual order and focus is never hidden by sticky regions.
- Status, charts, and validation never depend on color alone.
- Tables have semantic headers, captions where needed, and accessible sort state.
- Dialogs and drawers manage focus and return it to the invoking control.
- Copy controls announce success without moving focus.
- Live updates use restrained `aria-live` regions and never flood assistive
  technology.
- Timestamps expose timezone and absolute value, even when a relative label is
  also shown.
- Destructive or security-sensitive actions name the affected resource and result.

## Content and voice

OrbitOS copy is direct, factual, and specific.

Use:

- `Provider responses disagree`
- `Evidence is still pending from one source`
- `Reconciliation excludes 3 conflicted movements`
- `Copied full transaction hash`

Avoid:

- vague reassurance;
- playful metaphors in control states;
- invented precision;
- unexplained acronyms;
- marketing language inside operational flows;
- wording that treats a provider claim as independent verification.

## Implementation tokens

The web application should expose semantic tokens, not raw palette values, to
components. Planned groups:

```text
color.background.*
color.text.*
color.border.*
color.action.*
color.state.*
space.*
size.control.*
radius.*
shadow.*
type.*
motion.*
layer.*
```

The z-index scale is fixed:

| Layer | Value |
| --- | ---: |
| Base content | 0 |
| Sticky table/header | 10 |
| Sidebar/top bar | 20 |
| Drawer scrim | 30 |
| Drawer/popover | 40 |
| Dialog scrim | 50 |
| Dialog/toast | 60 |

Do not add arbitrary z-index values in components.

## Design review checklist

A screen is ready for implementation review only when:

- the operator's primary task is clear within five seconds;
- every status identifies its dimension and evidence route;
- exact values remain exact and copyable;
- loading, empty, degraded, stale, unauthorized, and error states are designed;
- keyboard and focus behavior are specified;
- cyan is interactive, violet is analytical, and semantic colors retain meaning;
- contrast meets WCAG AA in both themes;
- mobile and narrow-screen collapse behavior is explicit;
- motion has a state or feedback purpose;
- no unimplemented product capability is presented as available;
- no credential, secret, or cross-tenant identifier can appear in the UI.
