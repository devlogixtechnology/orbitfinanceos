import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { FilesystemEvidenceStore } from "../packages/evidence-core/src/index.js";
import {
  BscJsonRpcClient,
  createFilesystemRpcEvidenceSink,
  type RawRpcEvidenceSink,
} from "../connectors/bsc/src/index.js";

interface EndpointDefinition {
  readonly chainId: "56" | "97";
  readonly independenceGroup: string;
  readonly integrationId: string;
  readonly minimumIntervalMilliseconds?: number;
  readonly name: string;
  readonly operator: string;
  readonly url: string;
}

const tenantId = "11111111-1111-4111-8111-111111111111";
const endpoints: readonly EndpointDefinition[] = [
  {
    chainId: "56",
    independenceGroup: "sentio",
    integrationId: "21111111-1111-4111-8111-111111111111",
    name: "Sentio Mainnet",
    operator: "Sentio",
    url: "https://rpc.sentio.xyz/bsc",
  },
  {
    chainId: "56",
    independenceGroup: "automata-1rpc",
    integrationId: "31111111-1111-4111-8111-111111111111",
    name: "1RPC Mainnet",
    operator: "Automata 1RPC",
    url: "https://public.1rpc.io/bnb",
  },
  {
    chainId: "97",
    independenceGroup: "allnodes-publicnode",
    integrationId: "41111111-1111-4111-8111-111111111111",
    name: "PublicNode Testnet",
    operator: "Allnodes PublicNode",
    url: "https://bsc-testnet-rpc.publicnode.com",
  },
  {
    chainId: "97",
    independenceGroup: "sentio",
    integrationId: "51111111-1111-4111-8111-111111111111",
    name: "Sentio Testnet",
    operator: "Sentio",
    url: "https://rpc.sentio.xyz/bsc-testnet",
  },
];

const zeroAddress = `0x${"0".repeat(40)}`;
const optionalCalls = [
  { method: "eth_getBlockByNumber", name: "finalized-block-tag", params: ["finalized", false] },
  { method: "eth_getBlockByNumber", name: "safe-block-tag", params: ["safe", false] },
  { method: "parlia_getFinalizedHeader", name: "parlia_getFinalizedHeader", params: [] },
] as const;

const evidenceDirectory = resolve(
  process.env.ORBITOS_EVIDENCE_DIRECTORY ?? ".runtime/evidence/bsc-capability-probes",
);
const evidenceStore = new FilesystemEvidenceStore(evidenceDirectory);
const evidenceSink: RawRpcEvidenceSink = createFilesystemRpcEvidenceSink(evidenceStore);

async function probeEndpoint(endpoint: EndpointDefinition) {
  const client = new BscJsonRpcClient({
    endpoint: endpoint.url,
    evidenceSink,
    independenceGroup: endpoint.independenceGroup,
    integrationId: endpoint.integrationId,
    maxAttempts: 3,
    provider: endpoint.name,
    tenantId,
    timeoutMilliseconds: 20_000,
  });
  const required: Record<string, boolean> = {};
  const optional: Record<string, boolean> = {};
  let identity = false;
  let previousCallStartedAt = 0;

  async function rpcCall(method: string, params: readonly unknown[]) {
    const waitMilliseconds = Math.max(
      0,
      (endpoint.minimumIntervalMilliseconds ?? 0) -
        (Date.now() - previousCallStartedAt),
    );
    if (waitMilliseconds > 0) {
      await delay(waitMilliseconds);
    }
    previousCallStartedAt = Date.now();
    return client.call(method, params);
  }

  try {
    await client.assertChainIdentity(endpoint.chainId);
    previousCallStartedAt = Date.now();
    identity = true;
  } catch {
    identity = false;
  }

  let blockNumber: string | undefined;
  let transactionHash: string | undefined;
  try {
    const block = await rpcCall("eth_getBlockByNumber", ["finalized", true]);
    if (typeof block !== "object" || block === null) {
      throw new TypeError("finalized block was not an object");
    }
    const candidate = block as { number?: unknown; transactions?: unknown };
    if (typeof candidate.number !== "string" || !Array.isArray(candidate.transactions)) {
      throw new TypeError("finalized block did not include number and transactions");
    }
    const firstTransaction = candidate.transactions[0];
    if (firstTransaction !== undefined) {
      if (
        typeof firstTransaction !== "object" ||
        firstTransaction === null ||
        typeof (firstTransaction as { hash?: unknown }).hash !== "string"
      ) {
        throw new TypeError("finalized block included an invalid transaction");
      }
      transactionHash = (firstTransaction as { hash: string }).hash;
    }
    blockNumber = candidate.number;
    required.eth_getBlockByNumber = true;
  } catch {
    required.eth_getBlockByNumber = false;
  }

  const requiredCalls = [
    {
      method: "eth_getLogs",
      params: [
        {
          address: zeroAddress,
          fromBlock: blockNumber ?? "latest",
          toBlock: blockNumber ?? "latest",
        },
      ],
    },
    {
      method: "eth_getTransactionByHash",
      params: [transactionHash ?? `0x${"0".repeat(64)}`],
    },
    {
      method: "eth_getTransactionReceipt",
      params: [transactionHash ?? `0x${"0".repeat(64)}`],
    },
  ] as const;
  for (const call of requiredCalls) {
    try {
      await rpcCall(call.method, call.params);
      required[call.method] = true;
    } catch {
      required[call.method] = false;
    }
  }
  for (const call of optionalCalls) {
    try {
      await rpcCall(call.method, call.params);
      optional[call.name] = true;
    } catch {
      optional[call.name] = false;
    }
  }

  return {
    chainId: endpoint.chainId,
    identity,
    independenceGroup: endpoint.independenceGroup,
    name: endpoint.name,
    operator: endpoint.operator,
    optional,
    required,
  };
}

const results = [];
for (const endpoint of endpoints) {
  results.push(await probeEndpoint(endpoint));
}

const passed = results.every(
  (result) => result.identity && Object.values(result.required).every(Boolean),
);
console.log(
  JSON.stringify(
    {
      evidenceDirectory,
      observedAt: new Date().toISOString(),
      passed,
      results,
    },
    null,
    2,
  ),
);
if (!passed) {
  process.exitCode = 1;
}
