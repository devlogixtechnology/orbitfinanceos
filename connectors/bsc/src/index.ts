import {
  bscChainIdSchema,
  canonicalChainMovementSchema,
  verificationDecisionSchema,
  type CanonicalChainMovement,
  type Integration,
  type SessionContext,
  type VerificationDecision,
  type VerificationPolicy,
  type VerificationProviderObservation,
} from "@orbitos/canonical-model";
import { sha256, type DurableEvidenceStore } from "@orbitos/evidence-core";
import type {
  IngestionRepository,
  IngestionService,
} from "@orbitos/ingestion-core";
import type { IntegrationRepository } from "@orbitos/integration-core";
import {
  evaluateVerification,
  assertVerificationTransition,
  type VerificationDecisionStore,
  type VerificationPolicyStore,
} from "@orbitos/verification-core";
import { z } from "zod";

export const requiredBscMethods = [
  "eth_chainId",
  "eth_getLogs",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
] as const;

export const optionalBscFinalityCapabilities = [
  "finalized-block-tag",
  "safe-block-tag",
  "parlia_getFinalizedHeader",
] as const;

export interface RawRpcEvidence {
  readonly evidenceId: string;
  readonly independenceGroup: string;
  readonly integrationId: string;
  readonly method: string;
  readonly observedAt: string;
  readonly provider: string;
  readonly rawBytes: Uint8Array;
  readonly requestFingerprint: string;
  readonly tenantId: string;
}

export interface RawRpcEvidenceSink {
  append(evidence: RawRpcEvidence): Promise<void>;
}

export interface RpcCallResult {
  readonly evidenceId: string;
  readonly result: unknown;
}

export function createFilesystemRpcEvidenceSink(
  store: DurableEvidenceStore,
): RawRpcEvidenceSink {
  return {
    append: async (evidence) => {
      await store.append({
        attributes: {
          method: evidence.method,
          requestFingerprint: evidence.requestFingerprint,
        },
        evidenceId: evidence.evidenceId,
        independenceGroup: evidence.independenceGroup,
        integrationId: evidence.integrationId,
        observedAt: evidence.observedAt,
        provider: evidence.provider,
        rawBytes: evidence.rawBytes,
        tenantId: evidence.tenantId,
      });
    },
  };
}

export class RpcTransportError extends Error {
  override readonly name = "RpcTransportError";
}

export class RpcPayloadError extends Error {
  override readonly name = "RpcPayloadError";

  constructor(message: string, readonly evidenceIds: readonly string[] = []) {
    super(message);
  }
}

export class UnexpectedChainIdentityError extends Error {
  override readonly name = "UnexpectedChainIdentityError";
}

const jsonRpcEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.number().int(),
        data: z.unknown().optional(),
        message: z.string(),
      })
      .strict()
      .optional(),
    id: z.union([z.string(), z.number().int()]),
    jsonrpc: z.literal("2.0"),
    result: z.unknown().optional(),
  })
  .strict()
  .refine(
    (value) => (value.result === undefined) !== (value.error === undefined),
    "JSON-RPC response must contain exactly one of result or error",
  );

export interface BscJsonRpcClientOptions {
  readonly authorizationHeader?: string;
  readonly clock?: () => Date;
  readonly endpoint: string;
  readonly evidenceSink: RawRpcEvidenceSink;
  readonly fetchImplementation?: typeof fetch;
  readonly idGenerator?: () => string;
  readonly independenceGroup: string;
  readonly integrationId: string;
  readonly maxAttempts?: number;
  readonly provider: string;
  readonly sleeper?: (milliseconds: number) => Promise<void>;
  readonly tenantId: SessionContext["tenant"]["tenantId"];
  readonly timeoutMilliseconds?: number;
}

function retryDelay(attempt: number, retryAfter: string | null = null, now = new Date()): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    const requested = Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(retryAfter) - now.getTime();
    if (Number.isFinite(requested) && requested >= 0) {
      return Math.min(requested, 30_000);
    }
  }
  return Math.min(250 * 2 ** (attempt - 1), 2_000);
}

function requestFingerprint(method: string, params: readonly unknown[]): string {
  return sha256(
    new TextEncoder().encode(JSON.stringify({ method, params })),
  );
}

export class BscJsonRpcClient {
  private readonly authorizationHeader: string | undefined;
  private readonly clock: () => Date;
  private readonly endpoint: string;
  private readonly evidenceSink: RawRpcEvidenceSink;
  private readonly fetchImplementation: typeof fetch;
  private readonly idGenerator: () => string;
  private readonly independenceGroup: string;
  private readonly integrationId: string;
  private readonly maxAttempts: number;
  private readonly provider: string;
  private readonly sleeper: (milliseconds: number) => Promise<void>;
  private readonly tenantId: string;
  private readonly timeoutMilliseconds: number;

  constructor(options: BscJsonRpcClientOptions) {
    this.authorizationHeader = options.authorizationHeader;
    this.clock = options.clock ?? (() => new Date());
    this.endpoint = options.endpoint;
    this.evidenceSink = options.evidenceSink;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    this.independenceGroup = options.independenceGroup;
    this.integrationId = options.integrationId;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.provider = options.provider;
    this.sleeper =
      options.sleeper ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    this.tenantId = options.tenantId;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;

    if (this.maxAttempts < 1 || this.maxAttempts > 5) {
      throw new RangeError("maxAttempts must be between 1 and 5");
    }
  }

  async call(method: string, params: readonly unknown[]): Promise<unknown> {
    return (await this.callWithEvidence(method, params)).result;
  }

  get providerIdentity(): { readonly independenceGroup: string; readonly provider: string } {
    return { independenceGroup: this.independenceGroup, provider: this.provider };
  }

  async callWithEvidence(
    method: string,
    params: readonly unknown[],
  ): Promise<RpcCallResult> {
    const fingerprint = requestFingerprint(method, params);
    const requestId = this.idGenerator();
    const body = JSON.stringify({ id: requestId, jsonrpc: "2.0", method, params });

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (this.authorizationHeader !== undefined) {
          headers.authorization = this.authorizationHeader;
        }

        const response = await this.fetchImplementation(this.endpoint, {
          body,
          headers,
          method: "POST",
          signal: AbortSignal.timeout(this.timeoutMilliseconds),
        });
        const rawBytes = new Uint8Array(await response.arrayBuffer());
        const evidenceId = this.idGenerator();
        await this.evidenceSink.append({
          evidenceId,
          independenceGroup: this.independenceGroup,
          integrationId: this.integrationId,
          method,
          observedAt: this.clock().toISOString(),
          provider: this.provider,
          rawBytes,
          requestFingerprint: fingerprint,
          tenantId: this.tenantId,
        });

        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < this.maxAttempts) {
            await this.sleeper(retryDelay(
              attempt,
              response.status === 429 ? response.headers.get("retry-after") : null,
              this.clock(),
            ));
            continue;
          }
          throw new RpcTransportError(
            `JSON-RPC request failed with HTTP status ${response.status}`,
          );
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(new TextDecoder().decode(rawBytes));
        } catch {
          throw new RpcPayloadError("JSON-RPC response was not valid JSON", [evidenceId]);
        }
        const envelope = jsonRpcEnvelopeSchema.safeParse(parsed);
        if (!envelope.success) {
          throw new RpcPayloadError("JSON-RPC response did not match the contract", [evidenceId]);
        }
        if (envelope.data.error !== undefined) {
          if (
            (envelope.data.error.code === 19 || envelope.data.error.code === -32_005) &&
            attempt < this.maxAttempts
          ) {
            await this.sleeper(retryDelay(attempt));
            continue;
          }
          throw new RpcPayloadError(
            `JSON-RPC provider returned error code ${envelope.data.error.code}`,
            [evidenceId],
          );
        }
        return { evidenceId, result: envelope.data.result };
      } catch (error) {
        if (
          error instanceof RpcPayloadError ||
          error instanceof RpcTransportError ||
          attempt === this.maxAttempts
        ) {
          throw error instanceof Error
            ? error
            : new RpcTransportError("JSON-RPC request failed");
        }
        await this.sleeper(retryDelay(attempt));
      }
    }

    throw new RpcTransportError("JSON-RPC request exhausted its retry budget");
  }

  async assertChainIdentity(expectedChainId: "56" | "97"): Promise<void> {
    const result = await this.call("eth_chainId", []);
    if (typeof result !== "string" || !/^0x[0-9a-f]+$/iu.test(result)) {
      throw new RpcPayloadError("eth_chainId did not return a hexadecimal string");
    }

    const actualChainId = bscChainIdSchema.safeParse(BigInt(result).toString());
    if (!actualChainId.success || actualChainId.data !== expectedChainId) {
      throw new UnexpectedChainIdentityError(
        `Expected BSC chain ${expectedChainId} but provider reported ${BigInt(result).toString()}`,
      );
    }
  }
}

export const bep20TransferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const bscParserVersion = "bsc-bep20-v1";

const hexQuantitySchema = z.string().regex(/^0x(?:0|[1-9a-f][0-9a-f]*)$/iu);
const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/u);
const topicSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/u);
const rpcLogSchema = z
  .object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/u),
    blockHash: hashSchema,
    blockNumber: hexQuantitySchema,
    data: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
    logIndex: hexQuantitySchema,
    removed: z.boolean().optional(),
    topics: z.array(topicSchema).min(3),
    transactionHash: hashSchema,
  })
  .passthrough();
const receiptSchema = z
  .object({
    blockHash: hashSchema.optional(),
    blockNumber: hexQuantitySchema.optional(),
    effectiveGasPrice: hexQuantitySchema.optional(),
    from: z.string().regex(/^0x[a-fA-F0-9]{40}$/u).optional(),
    gasPayer: z.string().regex(/^0x[a-fA-F0-9]{40}$/u).optional(),
    gasUsed: hexQuantitySchema,
    status: z.enum(["0x0", "0x1"]),
    transactionHash: hashSchema,
  })
  .passthrough();
const transactionSchema = z
  .object({
    from: z.string().regex(/^0x[a-fA-F0-9]{40}$/u),
    gasPrice: hexQuantitySchema.optional(),
    hash: hashSchema,
  })
  .passthrough();
const blockSchema = z
  .object({
    hash: hashSchema,
    number: hexQuantitySchema,
    timestamp: hexQuantitySchema,
  })
  .passthrough();

export interface TokenMetadata {
  readonly decimals: number;
  readonly source: string;
  readonly symbol?: string;
}

export interface NormalizeBscTransactionInput {
  readonly block: unknown;
  readonly chainId: "56" | "97";
  readonly evidenceIds: readonly string[];
  readonly idGenerator?: () => string;
  readonly integrationId: string;
  readonly logs: readonly unknown[];
  readonly observedAt: string;
  readonly receipt: unknown;
  readonly tenantId: string;
  readonly tokenMetadata?: Readonly<Record<string, TokenMetadata>>;
  readonly transaction: unknown;
}

function decodeTopicAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function decimalDisplay(quantity: bigint, decimals: number): string {
  if (decimals === 0) return quantity.toString();
  const padded = quantity.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}

export function normalizeBscTransaction(
  input: NormalizeBscTransactionInput,
): readonly CanonicalChainMovement[] {
  const receipt = receiptSchema.parse(input.receipt);
  const transaction = transactionSchema.parse(input.transaction);
  const block = blockSchema.parse(input.block);
  if (receipt.transactionHash.toLowerCase() !== transaction.hash.toLowerCase()) {
    throw new RpcPayloadError("Receipt and transaction identities disagree", input.evidenceIds);
  }
  const idGenerator = input.idGenerator ?? (() => crypto.randomUUID());
  const blockTimestamp = BigInt(block.timestamp);
  if (blockTimestamp > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1_000))) {
    throw new RpcPayloadError("Block timestamp exceeds the supported UTC range", input.evidenceIds);
  }
  const common = {
    blockHash: block.hash.toLowerCase(),
    blockNumber: BigInt(block.number).toString(),
    evidenceIds: [...new Set(input.evidenceIds)],
    effectiveAt: new Date(Number(blockTimestamp) * 1_000).toISOString(),
    integrationId: input.integrationId,
    network: { chainId: input.chainId, family: "evm" as const },
    observedAt: input.observedAt,
    observedState: "observed" as const,
    parserVersion: bscParserVersion,
    schemaVersion: "1" as const,
    tenantId: input.tenantId,
    transactionHash: transaction.hash.toLowerCase(),
  };

  const movements: CanonicalChainMovement[] = [];
  if (receipt.status === "0x1") {
    for (const rawLog of input.logs) {
      const log = rpcLogSchema.parse(rawLog);
      if (log.removed === true || log.topics[0]?.toLowerCase() !== bep20TransferTopic) {
        continue;
      }
      const token = log.address.toLowerCase();
      const metadata = input.tokenMetadata?.[token];
      const quantity = BigInt(log.data);
      movements.push(canonicalChainMovementSchema.parse({
        ...common,
        asset: {
          contractAddress: token,
          ...(metadata === undefined ? {} : { decimals: metadata.decimals }),
          metadataSource: metadata?.source ?? "unavailable",
          network: `bsc:${input.chainId}`,
          ...(metadata?.symbol === undefined ? {} : { symbol: metadata.symbol }),
        },
        fromAddress: decodeTopicAddress(log.topics[1] ?? ""),
        kind: "bep20_transfer",
        logIndex: BigInt(log.logIndex).toString(),
        movementId: idGenerator(),
        normalizedState: "normalized",
        quantityAtomic: quantity.toString(),
        ...(metadata === undefined ? {} : { quantityDisplay: decimalDisplay(quantity, metadata.decimals) }),
        toAddress: decodeTopicAddress(log.topics[2] ?? ""),
      }));
    }
  }

  const gasPrice = receipt.effectiveGasPrice ?? transaction.gasPrice;
  if (gasPrice !== undefined) {
    const payer = receipt.gasPayer ?? receipt.from ?? transaction.from;
    const payerSource = receipt.gasPayer !== undefined
      ? "receipt"
      : receipt.from !== undefined
        ? "receipt"
        : "protocol_default";
    const fee = BigInt(receipt.gasUsed) * BigInt(gasPrice);
    movements.push(canonicalChainMovementSchema.parse({
      ...common,
      asset: {
        decimals: 18,
        metadataSource: "bsc-native-v1",
        network: `bsc:${input.chainId}`,
        symbol: "BNB",
      },
      feePayerSource: payerSource,
      fromAddress: payer.toLowerCase(),
      kind: "native_fee",
      movementId: idGenerator(),
      normalizedState: "normalized",
      quantityAtomic: fee.toString(),
      quantityDisplay: decimalDisplay(fee, 18),
    }));
  }
  return movements;
}

export type BscClientFactory = (
  integration: Integration,
  providerGroup: Integration["providerGroups"][number],
) => BscJsonRpcClient;

export class BscIngestionService implements IngestionService {
  constructor(
    private readonly integrations: IntegrationRepository,
    private readonly repository: IngestionRepository,
    private readonly createClient: BscClientFactory,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  listMovements(tenantId: string, integrationId?: string) {
    return this.repository.listMovements(tenantId, integrationId);
  }

  listRuns(tenantId: string, integrationId?: string) {
    return this.repository.listRuns(tenantId, integrationId);
  }

  pause(tenantId: string, runId: string) {
    return this.repository.setRunState(tenantId, runId, "paused");
  }

  stop(tenantId: string, runId: string) {
    return this.repository.setRunState(tenantId, runId, "stopped");
  }

  async start(command: { readonly endBlock: string; readonly integrationId: string; readonly startBlock: string; readonly tenantId: string }) {
    const integration = await this.integrations.getForTenant(command.tenantId, command.integrationId);
    if (integration === null || !integration.enabled) {
      throw new Error("Integration is unavailable or disabled");
    }
    if (BigInt(command.endBlock) - BigInt(command.startBlock) > 999n) {
      throw new RangeError("An ingestion run may contain at most 1000 blocks");
    }
    let run = await this.repository.createRun(command);
    run = (await this.repository.setRunState(command.tenantId, run.runId, "running")) ?? run;
    return this.execute(integration, run);
  }

  async resume(tenantId: string, runId: string) {
    const run = await this.repository.getRun(tenantId, runId);
    if (run === null || run.state === "completed" || run.state === "stopped") return run;
    const integration = await this.integrations.getForTenant(tenantId, run.integrationId);
    if (integration === null || !integration.enabled) return null;
    const running = (await this.repository.setRunState(tenantId, runId, "running")) ?? run;
    return this.execute(integration, running);
  }

  private async execute(integration: Integration, initialRun: Awaited<ReturnType<IngestionRepository["createRun"]>>) {
    let run = initialRun;
    const leaseTtlMilliseconds = 300_000;
    const lease = await this.repository.acquireLease(
      run.tenantId,
      run.runId,
      `bsc-worker:${process.pid}`,
      leaseTtlMilliseconds,
    );
    if (lease === null) return run;
    try {
      const clients = integration.providerGroups.flatMap((group) => {
        try {
          return [this.createClient(integration, group)];
        } catch {
          return [];
        }
      });
      const validClients: BscJsonRpcClient[] = [];
      for (const candidate of clients) {
        try {
          await candidate.assertChainIdentity(integration.network.chainId);
          validClients.push(candidate);
        } catch {
          // A group that cannot prove the expected chain identity is never used.
        }
      }
      const metadataClient = validClients[0];
      if (metadataClient === undefined) {
        return (await this.repository.setRunState(
          run.tenantId,
          run.runId,
          "failed",
          "ingestion:no_valid_provider",
        )) ?? run;
      }
      const tokenMetadata: Record<string, TokenMetadata> = {};
      const tokenMetadataEvidence = new Map<string, string>();
      for (const contractAddress of integration.tokenContracts) {
        try {
          const result = await metadataClient.callWithEvidence("eth_call", [
            { data: "0x313ce567", to: contractAddress },
            "latest",
          ]);
          if (typeof result.result === "string" && /^0x[a-fA-F0-9]{64}$/u.test(result.result)) {
            const decimals = Number(BigInt(result.result));
            if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 255) {
              tokenMetadata[contractAddress.toLowerCase()] = {
                decimals,
                source: `rpc:eth_call:${result.evidenceId}`,
              };
              tokenMetadataEvidence.set(contractAddress.toLowerCase(), result.evidenceId);
            }
          }
        } catch {
          // Token metadata is optional; atomic quantities remain authoritative.
        }
      }
      const first = run.checkpointBlock === undefined
        ? BigInt(run.startBlock)
        : BigInt(run.checkpointBlock) + 1n;
      for (let height = first; height <= BigInt(run.endBlock); height += 1n) {
        const latest = await this.repository.getRun(run.tenantId, run.runId);
        if (latest === null || latest.state !== "running") return latest ?? run;
        const renewed = await this.repository.renewLease(
          run.tenantId,
          run.runId,
          lease.token,
          leaseTtlMilliseconds,
        );
        if (renewed === null) {
          return (await this.repository.setRunState(
            run.tenantId,
            run.runId,
            "failed",
            "ingestion:lease_lost",
          )) ?? run;
        }
        const blockHex = `0x${height.toString(16)}`;
        const evidenceIds: string[] = [];
        try {
        let client: BscJsonRpcClient | undefined;
        let logsResult: RpcCallResult | undefined;
        for (const candidate of validClients) {
          try {
            logsResult = await candidate.callWithEvidence("eth_getLogs", [{
              address: integration.tokenContracts,
              fromBlock: blockHex,
              toBlock: blockHex,
              topics: [bep20TransferTopic],
            }]);
            client = candidate;
            break;
          } catch (error) {
            if (error instanceof RpcPayloadError) evidenceIds.push(...error.evidenceIds);
            const unavailable =
              error instanceof RpcTransportError ||
              (error instanceof RpcPayloadError && error.message.startsWith("JSON-RPC provider returned error code"));
            if (!unavailable) throw error;
          }
        }
        if (client === undefined || logsResult === undefined) {
          throw new RpcPayloadError("No provider could serve eth_getLogs", evidenceIds);
        }
        evidenceIds.push(logsResult.evidenceId);
        const configuredWallets = new Set(
          integration.walletAddresses.map((address) => address.toLowerCase()),
        );
        const logs = z.array(rpcLogSchema).parse(logsResult.result).filter((log) => {
          const from = log.topics[1];
          const to = log.topics[2];
          return (
            (from !== undefined && configuredWallets.has(decodeTopicAddress(from))) ||
            (to !== undefined && configuredWallets.has(decodeTopicAddress(to)))
          );
        });
        const blockResult = await client.callWithEvidence("eth_getBlockByNumber", [blockHex, false]);
        evidenceIds.push(blockResult.evidenceId);
        const movements: CanonicalChainMovement[] = [];
        const byTransaction = new Map<string, typeof logs>();
        for (const log of logs) {
          const key = log.transactionHash.toLowerCase();
          byTransaction.set(key, [...(byTransaction.get(key) ?? []), log]);
        }
        for (const [transactionHash, transactionLogs] of byTransaction) {
          const receiptResult = await client.callWithEvidence("eth_getTransactionReceipt", [transactionHash]);
          const transactionResult = await client.callWithEvidence("eth_getTransactionByHash", [transactionHash]);
          evidenceIds.push(receiptResult.evidenceId, transactionResult.evidenceId);
          const metadataEvidenceIds = transactionLogs
            .map((log) => tokenMetadataEvidence.get(log.address.toLowerCase()))
            .filter((value): value is string => value !== undefined);
          movements.push(...normalizeBscTransaction({
            block: blockResult.result,
            chainId: integration.network.chainId,
            evidenceIds: [logsResult.evidenceId, blockResult.evidenceId, receiptResult.evidenceId, transactionResult.evidenceId, ...metadataEvidenceIds],
            integrationId: integration.integrationId,
            logs: transactionLogs,
            observedAt: this.clock().toISOString(),
            receipt: receiptResult.result,
            tenantId: integration.tenantId,
            tokenMetadata,
            transaction: transactionResult.result,
          }));
        }
          run = await this.repository.completeBlock({
            blockNumber: height.toString(),
            movements,
            runId: run.runId,
            tenantId: run.tenantId,
          });
        } catch (error) {
          const captured = error instanceof RpcPayloadError ? error.evidenceIds : [];
          const lineage = [...new Set([...evidenceIds, ...captured])];
          if (lineage.length === 0) {
            await this.repository.setRunState(
              run.tenantId,
              run.runId,
              "failed",
              "ingestion:provider_unavailable",
            );
          } else {
            await this.repository.quarantine({
              blockNumber: height.toString(),
              evidenceIds: lineage,
              integrationId: integration.integrationId,
              reasonCode: "ingestion:malformed_response",
              runId: run.runId,
              tenantId: run.tenantId,
            });
          }
          return (await this.repository.getRun(run.tenantId, run.runId)) ?? run;
        }
      }
      return run;
    } finally {
      await this.repository.releaseLease(run.tenantId, run.runId, lease.token);
    }
  }
}

export interface BscVerificationClient {
  readonly providerIdentity: {
    readonly independenceGroup: string;
    readonly provider: string;
  };
  assertChainIdentity(expectedChainId: "56" | "97"): Promise<void>;
  callWithEvidence(method: string, params: readonly unknown[]): Promise<RpcCallResult>;
}

export type BscVerificationClientFactory = (
  integration: Integration,
  providerGroup: Integration["providerGroups"][number],
) => BscVerificationClient;

export interface VerifyBscMovementCommand {
  readonly integration: Integration;
  readonly movement: CanonicalChainMovement;
  readonly policy: VerificationPolicy;
  readonly previousDecision?: VerificationDecision;
}

export interface BscVerificationServiceOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
  readonly onConflict?: (decision: VerificationDecision) => Promise<void>;
}

export class BscVerificationService {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private readonly onConflict: ((decision: VerificationDecision) => Promise<void>) | undefined;

  constructor(
    private readonly createClient: BscVerificationClientFactory,
    private readonly store: VerificationDecisionStore,
    options: BscVerificationServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    this.onConflict = options.onConflict;
  }

  async verify(command: VerifyBscMovementCommand): Promise<VerificationDecision> {
    if (
      command.integration.tenantId !== command.movement.tenantId ||
      command.integration.integrationId !== command.movement.integrationId ||
      command.integration.network.chainId !== command.movement.network.chainId
    ) {
      throw new TypeError("Movement and integration scope must match");
    }
    const observations = await Promise.all(
      command.integration.providerGroups.map(async (group): Promise<VerificationProviderObservation> => {
        let client: BscVerificationClient | undefined;
        const evidenceIds: string[] = [];
        try {
          client = this.createClient(command.integration, group);
          await client.assertChainIdentity(command.integration.network.chainId);
          const receiptResult = await client.callWithEvidence("eth_getTransactionReceipt", [command.movement.transactionHash]);
          evidenceIds.push(receiptResult.evidenceId);
          const receipt = receiptSchema.parse(receiptResult.result);
          const blockResult = await client.callWithEvidence("eth_getBlockByNumber", [
            `0x${BigInt(command.movement.blockNumber).toString(16)}`,
            false,
          ]);
          evidenceIds.push(blockResult.evidenceId);
          const block = blockSchema.parse(blockResult.result);
          const inclusion =
            receipt.blockHash?.toLowerCase() === command.movement.blockHash.toLowerCase() &&
            receipt.blockNumber !== undefined &&
            BigInt(receipt.blockNumber).toString() === command.movement.blockNumber &&
            block.hash.toLowerCase() === command.movement.blockHash.toLowerCase()
              ? "included"
              : "not_included";
          const execution = receipt.status === "0x1" ? "succeeded" : "failed";

          let finality: VerificationProviderObservation["finality"] = "pending";
          let confirmationCount: string | undefined;
          let finalityTag: VerificationProviderObservation["finalityTag"];
          if (command.policy.finalityMode === "confirmations") {
            const headResult = await client.callWithEvidence("eth_getBlockByNumber", ["latest", false]);
            evidenceIds.push(headResult.evidenceId);
            const head = blockSchema.parse(headResult.result);
            const confirmations = BigInt(head.number) - BigInt(command.movement.blockNumber) + 1n;
            confirmationCount = (confirmations < 0n ? 0n : confirmations).toString();
            finality = confirmations >= BigInt(command.policy.minimumConfirmations ?? 0) ? "final" : "pending";
          } else {
            finalityTag = command.policy.finalityMode === "safe_tag" ? "safe" : "finalized";
            const finalityResult = await client.callWithEvidence("eth_getBlockByNumber", [finalityTag, false]);
            evidenceIds.push(finalityResult.evidenceId);
            const finalizedBlock = blockSchema.safeParse(finalityResult.result);
            finality = finalizedBlock.success && BigInt(finalizedBlock.data.number) >= BigInt(command.movement.blockNumber)
              ? "final"
              : "pending";
          }

          return {
            agreementKey: [
              command.movement.network.chainId,
              command.movement.blockNumber,
              block.hash.toLowerCase(),
              command.movement.transactionHash.toLowerCase(),
              command.movement.logIndex ?? command.movement.kind,
            ].join(":"),
            ...(confirmationCount === undefined ? {} : { confirmationCount }),
            evidenceIds,
            execution,
            finality,
            ...(finalityTag === undefined ? {} : { finalityTag }),
            inclusion,
            independenceGroup: client.providerIdentity.independenceGroup,
            observedAt: this.clock().toISOString(),
            provider: client.providerIdentity.provider,
            status: "available",
          };
        } catch {
          return {
            evidenceIds,
            execution: "unknown",
            finality: "unknown",
            inclusion: "unknown",
            independenceGroup: client?.providerIdentity.independenceGroup ?? group.independenceGroup,
            observedAt: this.clock().toISOString(),
            provider: client?.providerIdentity.provider ?? group.groupId,
            status: "unavailable",
          };
        }
      }),
    );
    const candidate = evaluateVerification({
      decidedAt: this.clock().toISOString(),
      decisionId: this.idGenerator(),
      movementId: command.movement.movementId,
      observations,
      policy: command.policy,
      tenantId: command.movement.tenantId,
    });
    if (
      command.previousDecision?.verification === candidate.verification &&
      command.previousDecision.policyVersion === candidate.policyVersion
    ) {
      return command.previousDecision;
    }
    const nextState =
      command.previousDecision?.verification === "verified" && candidate.verification === "conflicted"
        ? "invalidated"
        : candidate.verification;
    if (command.previousDecision !== undefined) {
      assertVerificationTransition(command.previousDecision.verification, nextState);
    }
    const decision = verificationDecisionSchema.parse({
      ...candidate,
      ...(nextState === "invalidated"
        ? {
            finality: "orphaned",
            reasonCodes: [...new Set([...candidate.reasonCodes, "verification:orphaned"])],
          }
        : {}),
      ...(command.previousDecision === undefined
        ? {}
        : { supersedesDecisionId: command.previousDecision.decisionId }),
      verification: nextState,
    });
    await this.store.append(decision);
    if (
      (decision.verification === "conflicted" || decision.verification === "invalidated") &&
      this.onConflict !== undefined
    ) {
      await this.onConflict(decision);
    }
    return decision;
  }
}

export class BscVerifiedIngestionService implements IngestionService {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly integrations: IntegrationRepository,
    private readonly policies: VerificationPolicyStore,
    private readonly verifier: BscVerificationService,
    private readonly decisions: VerificationDecisionStore,
  ) {}

  listMovements(tenantId: string, integrationId?: string) {
    return this.ingestion.listMovements(tenantId, integrationId);
  }

  listRuns(tenantId: string, integrationId?: string) {
    return this.ingestion.listRuns(tenantId, integrationId);
  }

  pause(tenantId: string, runId: string) {
    return this.ingestion.pause(tenantId, runId);
  }

  stop(tenantId: string, runId: string) {
    return this.ingestion.stop(tenantId, runId);
  }

  async start(command: { readonly endBlock: string; readonly integrationId: string; readonly startBlock: string; readonly tenantId: string }) {
    const run = await this.ingestion.start(command);
    await this.verifyIntegration(command.tenantId, command.integrationId);
    return run;
  }

  async resume(tenantId: string, runId: string) {
    const run = await this.ingestion.resume(tenantId, runId);
    if (run !== null) await this.verifyIntegration(tenantId, run.integrationId);
    return run;
  }

  private async verifyIntegration(tenantId: string, integrationId: string): Promise<void> {
    const integration = await this.integrations.getForTenant(tenantId, integrationId);
    if (integration === null) throw new TypeError("Integration was not found for verification");
    const policy = await this.policies.getByVersion(tenantId, integration.finalityPolicyVersion);
    if (policy === null) throw new TypeError(`Verification policy ${integration.finalityPolicyVersion} was not found`);
    const movements = await this.ingestion.listMovements(tenantId, integrationId);
    for (const movement of movements) {
      const history = await this.decisions.listForMovement(tenantId, movement.movementId);
      const previousDecision = history.at(-1);
      if (
        previousDecision?.verification === "invalidated" ||
        previousDecision?.verification === "superseded" ||
        previousDecision?.verification === "conflicted"
      ) {
        continue;
      }
      await this.verifier.verify({
        integration,
        movement,
        policy,
        ...(previousDecision === undefined ? {} : { previousDecision }),
      });
    }
  }
}
