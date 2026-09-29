# First-party authentication

OrbitOS owns its identity boundary. No external identity provider is required
for Sprint 1.

## Security model

- Passwords are normalized and validated at the API boundary, then stored only
  as versioned scrypt hashes with a unique 16-byte salt (`N=131072`, `r=8`,
  `p=1`, 64-byte output).
- Sign-in failures return one generic response. Five consecutive failures lock
  the credential for 15 minutes, and the API also limits attempts by source
  address before performing expensive password verification.
- Successful sign-in creates a cryptographically random 256-bit token with an
  eight-hour absolute lifetime. PostgreSQL stores only its SHA-256 digest.
- The browser receives the opaque token in an HTTP-only, same-site cookie.
  Secure cookies remain enabled in production.
- Sign-out revokes the server-side session before removing the browser cookie.
- Tenant, actor, role, and permission context is reconstructed on the server.
  The browser never supplies a tenant identifier.

The credential and session lookup tables form the deliberate pre-authentication
boundary, so they do not use tenant row-level security. They contain no
plaintext passwords or bearer tokens. All joins into tenant identity data occur
inside a transaction with `app.tenant_id` set, where forced row-level security
applies.

## Operations

Apply migrations with `pnpm db:migrate`. The runner takes a PostgreSQL advisory
lock, verifies migration digests, and applies each new migration and its ledger
entry in one transaction.

Set `ORBITOS_BOOTSTRAP_PASSWORD` through the deployment secret manager and run
`pnpm auth:bootstrap-staging` to create or rotate the staging administrator
`orbitos@devlogix.com.pk`. The command never prints the password. Do not place a
real password in `.env.example`, shell history, CI logs, or repository files.

Production deployment must provide TLS, encrypted database transport, database
backups, and distributed request throttling at the trusted edge in addition to
the process-local API limiter. Application logs redact authorization, cookie,
and API-key headers.
