# Reseller control plane

OrbitOS is a two-level SaaS platform:

1. OrbitOS operates the platform and retains master control.
2. A tenant is a company that licenses OrbitOS and resells access to its own customers.
3. A customer belongs to exactly one tenant. Customer, user, domain, billing, and operational records never cross that tenant boundary.

Each tenant receives a reserved `<slug>.orbitos.devlogix.com.pk` route and may connect customer-owned domains. A custom hostname remains inactive until DNS ownership and TLS issuance are both complete.

## System role matrix

| Capability | Super Admin | Tenant Admin | Admin | User |
| --- | --- | --- | --- | --- |
| Scope | Platform control plane | One tenant | One tenant | One tenant |
| Create and suspend tenants | Yes | No | No | No |
| View tenant settings | All tenants | Own tenant | Own tenant | No |
| Create customers | Any tenant | Own tenant | Own tenant | No |
| Create Tenant Admins | Yes | No | No | No |
| Create Admins | Yes | Yes | No | No |
| Create Users | Yes | Yes | Yes | No |
| Create custom roles | Yes | Yes | No | No |
| Assign custom roles | Yes | Yes | No | No |
| Allocate OrbitOS subdomains | Yes | No | No | No |
| Add custom domains | Any tenant | Own tenant | No | No |
| Configure tenant subscription and invoices | Yes | View only | View only | No |
| Configure customer subscription and invoices | Yes | Yes | View only | No |
| Operate integrations, reconciliation, and exceptions | Yes, after explicit tenant context | Yes | Yes | Read-only when assigned |
| Bypass tenant RLS for operational financial data | No | No | No | No |

## Permission keys

| Permission | Meaning |
| --- | --- |
| `platform:tenants:read` | List all reseller tenants. |
| `platform:tenants:write` | Create and govern reseller tenants. |
| `tenants:read` | View the current tenant profile. |
| `customers:read` / `customers:write` | View or manage end-customer workspaces. |
| `users:read` / `users:write` | View or create users within the authorized scope. |
| `roles:read` / `roles:write` | View or create custom roles. A creator cannot grant a permission they do not hold. |
| `domains:read` / `domains:write` | View or manage tenant domain routes. |
| `billing:read` / `billing:write` | View or manage authorized billing relationships. Platform-to-tenant writes additionally require Super Admin. |
| `integrations:*`, `ingestion:*`, `reconciliation:*`, `exceptions:*` | Operate the tenant's read-only financial evidence workflows. |

System roles set an authority ceiling. Custom roles may combine permissions within that ceiling; they cannot create a new platform scope or elevate the assigning user.

## Billing boundaries

- Platform billing records represent OrbitOS billing a tenant.
- Customer billing records represent a tenant billing one of its customers.
- Amounts use integer minor units plus an ISO 4217 currency code. Floating-point amounts are not stored.
- This control plane records plans, subscriptions, invoices, and collection state. A payment processor is an integration choice and is not assumed by the data model.
