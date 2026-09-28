# Authoritative schemas

OrbitOS runtime contracts are authored in `packages/canonical-model` with Zod 4.
JSON Schema, OpenAPI, and Protobuf adapters must be generated or parity-tested from
that authoritative model rather than maintained as independent competing schemas.

`pnpm schema:check` exercises the current runtime-to-JSON-Schema adapter and the
database migration contract. Checked-in generated artifacts will be added when an
external consumer requires them.
