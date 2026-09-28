import { z } from "zod";

export const uuidSchema = z.uuid();
export const utcInstantSchema = z
  .iso.datetime({ offset: false })
  .refine((value) => value.endsWith("Z"), "Timestamp must be a UTC instant");
export const unsignedIntegerStringSchema = z.string().regex(/^(?:0|[1-9]\d*)$/u);
export const atomicAmountSchema = z.string().regex(/^-?(?:0|[1-9]\d*)$/u);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const sourceLifecycleSchema = z.enum([
  "observed",
  "quarantined",
  "superseded",
]);
export const finalityStateSchema = z.enum([
  "unknown",
  "pending",
  "final",
  "orphaned",
]);
export const verificationStateSchema = z.enum([
  "pending",
  "verified",
  "degraded",
  "conflicted",
  "invalidated",
]);
export const reconciliationStateSchema = z.enum([
  "not_started",
  "matched",
  "mismatched",
  "timing_difference",
]);
export const restrictionStateSchema = z.enum([
  "not_screened",
  "clear",
  "restricted",
  "under_review",
]);
export const accountingReadinessSchema = z.enum([
  "blocked",
  "ready",
  "posted",
]);

const evmAnchorSchema = z
  .object({
    blockHash: z.string().min(1),
    blockNumber: unsignedIntegerStringSchema,
    chainId: unsignedIntegerStringSchema,
    family: z.literal("evm"),
    transactionHash: z.string().min(1),
  })
  .strict();

const bitcoinAnchorSchema = z
  .object({
    blockHash: z.string().min(1),
    blockHeight: unsignedIntegerStringSchema,
    family: z.literal("bitcoin"),
    network: z.string().min(1),
    transactionId: z.string().min(1),
  })
  .strict();

const solanaAnchorSchema = z
  .object({
    blockhash: z.string().min(1),
    family: z.literal("solana"),
    network: z.string().min(1),
    signature: z.string().min(1),
    slot: unsignedIntegerStringSchema,
  })
  .strict();

const otherAnchorSchema = z
  .object({
    anchor: z.string().min(1),
    family: z.literal("other"),
    network: z.string().min(1),
  })
  .strict();

export const networkAnchorSchema = z.discriminatedUnion("family", [
  evmAnchorSchema,
  bitcoinAnchorSchema,
  solanaAnchorSchema,
  otherAnchorSchema,
]);

export const sourceIdentitySchema = z
  .object({
    objectId: z.string().min(1),
    objectType: z.string().min(1),
    revision: z.string().min(1).optional(),
  })
  .strict();

export const rawEvidenceReferenceSchema = z
  .object({
    byteLength: unsignedIntegerStringSchema,
    evidenceId: uuidSchema,
    objectUri: z.string().min(1),
    sha256: sha256Schema,
  })
  .strict();

export const sourceRecordSchema = z
  .object({
    effectiveAt: utcInstantSchema.optional(),
    external: sourceIdentitySchema,
    independenceGroup: z.string().min(1),
    integrationId: uuidSchema,
    networkAnchor: networkAnchorSchema.optional(),
    observedAt: utcInstantSchema,
    payloadFormat: z.enum(["json", "csv", "webhook", "rpc", "binary", "other"]),
    provider: z.string().min(1),
    rawEvidence: rawEvidenceReferenceSchema,
    schemaVersion: z.literal("1"),
    sourceLifecycle: sourceLifecycleSchema,
    sourceRecordId: uuidSchema,
    tenantId: uuidSchema,
  })
  .strict();

export const assetIdentitySchema = z
  .object({
    assetId: z.string().min(1),
    decimals: z.number().int().min(0).max(255),
    network: z.string().min(1),
    symbol: z.string().min(1).optional(),
    tokenId: z.string().min(1).optional(),
  })
  .strict();

export const canonicalMovementSchema = z
  .object({
    asset: assetIdentitySchema,
    effectiveAt: utcInstantSchema,
    movementDiscriminator: z.string().min(1),
    movementId: uuidSchema,
    quantityAtomic: atomicAmountSchema,
    sourceRecordIds: z.array(uuidSchema).min(1),
    tenantId: uuidSchema,
  })
  .strict();

export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type CanonicalMovement = z.infer<typeof canonicalMovementSchema>;
