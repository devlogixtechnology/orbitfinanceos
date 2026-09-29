# BSC provider capability matrix

Status: locally verified against public endpoints on 2026-09-29 at 10:11 UTC

OrbitOS requires two independently operated, read-only provider groups per
network before it can claim independent verification. The repeatable
`pnpm probe:bsc` probe persists every exact JSON-RPC response to the ignored
local evidence store before parsing it, verifies the expected chain identity,
and exits non-zero unless every required method succeeds for every group.

| Network | Provider group | Operator | `eth_chainId` | `eth_getLogs` | Transaction | Receipt | Block | `safe` / `finalized` | Parlia header |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mainnet (`56`) | `sentio` | Sentio | pass | pass | pass | pass | pass | pass / pass | unsupported |
| Mainnet (`56`) | `automata-1rpc` | Automata 1RPC | pass | pass | pass | pass | pass | pass / pass | unsupported |
| Testnet (`97`) | `allnodes-publicnode` | Allnodes PublicNode | pass | pass | pass | pass | pass | pass / pass | unsupported |
| Testnet (`97`) | `sentio` | Sentio | pass | pass | pass | pass | pass | pass / pass | unsupported |

The required transaction and receipt probes use a transaction from a recent
finalized block when one exists; an empty block falls back to a null lookup that
still distinguishes supported methods from provider errors. Log probes use a
bounded one-block range. WebSocket subscriptions, contractual quotas, burst
limits, and provider retention guarantees remain outside this public-endpoint
probe and must be recorded when production service plans are selected.

The connector preserves exact response bytes before parsing, uses bounded timeout
and retry behavior, fingerprints requests without storing authorization headers,
and records provider plus independence-group identity. Golden fixtures cover
normal and multi-log transfers, zero value, mint/burn shapes, failed execution,
duplicates, out-of-order and malformed responses, and a very large exact amount.

These results demonstrate current method compatibility, not an SLA. Re-run the
probe before relying on a provider change. A shared operator, reseller, or
infrastructure dependency does not count as independent merely because it uses
a different endpoint hostname.
