import { createHash, timingSafeEqual } from "node:crypto";

import {
  sourceRecordSchema,
  type SourceRecord,
} from "@orbitos/canonical-model";

export interface RawEvidenceInput {
  readonly effectiveAt?: string;
  readonly evidenceId: string;
  readonly external: {
    readonly objectId: string;
    readonly objectType: string;
    readonly revision?: string;
  };
  readonly independenceGroup: string;
  readonly integrationId: string;
  readonly networkAnchor?: SourceRecord["networkAnchor"];
  readonly objectUri: string;
  readonly observedAt: string;
  readonly payloadFormat: SourceRecord["payloadFormat"];
  readonly provider: string;
  readonly rawBytes: Uint8Array;
  readonly sourceRecordId: string;
  readonly tenantId: string;
}

export interface StoredEvidence {
  readonly byteLength: string;
  readonly effectiveAt?: string;
  readonly evidenceId: string;
  readonly external: RawEvidenceInput["external"];
  readonly independenceGroup: string;
  readonly integrationId: string;
  readonly networkAnchor?: SourceRecord["networkAnchor"];
  readonly objectUri: string;
  readonly observedAt: string;
  readonly payloadFormat: SourceRecord["payloadFormat"];
  readonly provider: string;
  readonly sha256: string;
  readonly tenantId: string;
}

export interface AppendResult {
  readonly conflictWith: readonly string[];
  readonly evidence: StoredEvidence;
  readonly status: "appended" | "conflict" | "duplicate";
}

export class EvidenceIdentityConflictError extends Error {
  override readonly name = "EvidenceIdentityConflictError";
}

export function sha256(rawBytes: Uint8Array): string {
  return createHash("sha256").update(rawBytes).digest("hex");
}

function sourceIdentityKey(evidence: StoredEvidence): string {
  const revision = evidence.external.revision ?? `content:${evidence.sha256}`;
  return [
    evidence.tenantId,
    evidence.integrationId,
    evidence.external.objectType,
    evidence.external.objectId,
    revision,
  ].join("\u001f");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function metadataEqual(left: StoredEvidence, right: StoredEvidence): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.effectiveAt === right.effectiveAt &&
    left.evidenceId === right.evidenceId &&
    left.external.objectId === right.external.objectId &&
    left.external.objectType === right.external.objectType &&
    left.external.revision === right.external.revision &&
    left.independenceGroup === right.independenceGroup &&
    left.integrationId === right.integrationId &&
    JSON.stringify(left.networkAnchor) === JSON.stringify(right.networkAnchor) &&
    left.objectUri === right.objectUri &&
    left.observedAt === right.observedAt &&
    left.payloadFormat === right.payloadFormat &&
    left.provider === right.provider &&
    left.sha256 === right.sha256 &&
    left.tenantId === right.tenantId
  );
}

function freezeMetadata(metadata: StoredEvidence): StoredEvidence {
  const cloned = structuredClone(metadata);
  Object.freeze(cloned.external);
  if (cloned.networkAnchor !== undefined) {
    Object.freeze(cloned.networkAnchor);
  }
  return Object.freeze(cloned);
}

export class InMemoryEvidenceStore {
  private readonly evidence = new Map<
    string,
    { readonly metadata: StoredEvidence; readonly rawBytes: Uint8Array }
  >();

  private readonly sourceIndex = new Map<string, string[]>();

  get size(): number {
    return this.evidence.size;
  }

  append(metadata: StoredEvidence, rawBytes: Uint8Array): AppendResult {
    const existingById = this.evidence.get(metadata.evidenceId);
    if (existingById !== undefined) {
      if (
        metadataEqual(existingById.metadata, metadata) &&
        bytesEqual(existingById.rawBytes, rawBytes)
      ) {
        return {
          conflictWith: [],
          evidence: existingById.metadata,
          status: "duplicate",
        };
      }
      throw new EvidenceIdentityConflictError(
        `Evidence ID ${metadata.evidenceId} cannot identify different bytes`,
      );
    }

    const key = sourceIdentityKey(metadata);
    const relatedIds = this.sourceIndex.get(key) ?? [];
    for (const evidenceId of relatedIds) {
      const related = this.evidence.get(evidenceId);
      if (related?.metadata.sha256 === metadata.sha256) {
        return {
          conflictWith: [],
          evidence: related.metadata,
          status: "duplicate",
        };
      }
    }

    const stored = {
      metadata: freezeMetadata(metadata),
      rawBytes: Uint8Array.from(rawBytes),
    };
    this.evidence.set(metadata.evidenceId, stored);
    this.sourceIndex.set(key, [...relatedIds, metadata.evidenceId]);

    return {
      conflictWith: relatedIds,
      evidence: stored.metadata,
      status: relatedIds.length === 0 ? "appended" : "conflict",
    };
  }

  readRaw(evidenceId: string): Uint8Array | undefined {
    const stored = this.evidence.get(evidenceId);
    return stored === undefined ? undefined : Uint8Array.from(stored.rawBytes);
  }

  verifyIntegrity(evidenceId: string): boolean {
    const stored = this.evidence.get(evidenceId);
    return stored !== undefined && sha256(stored.rawBytes) === stored.metadata.sha256;
  }
}

export function ingestRawEvidence(
  store: InMemoryEvidenceStore,
  input: RawEvidenceInput,
): { readonly append: AppendResult; readonly sourceRecord: SourceRecord } {
  const metadata: StoredEvidence = {
    ...(input.effectiveAt === undefined ? {} : { effectiveAt: input.effectiveAt }),
    byteLength: input.rawBytes.byteLength.toString(),
    evidenceId: input.evidenceId,
    external: input.external,
    independenceGroup: input.independenceGroup,
    integrationId: input.integrationId,
    ...(input.networkAnchor === undefined ? {} : { networkAnchor: input.networkAnchor }),
    objectUri: input.objectUri,
    observedAt: input.observedAt,
    payloadFormat: input.payloadFormat,
    provider: input.provider,
    sha256: sha256(input.rawBytes),
    tenantId: input.tenantId,
  };

  const append = store.append(metadata, input.rawBytes);
  const sourceRecord = sourceRecordSchema.parse({
    ...(append.evidence.effectiveAt === undefined
      ? {}
      : { effectiveAt: append.evidence.effectiveAt }),
    external: append.evidence.external,
    independenceGroup: append.evidence.independenceGroup,
    integrationId: append.evidence.integrationId,
    ...(append.evidence.networkAnchor === undefined
      ? {}
      : { networkAnchor: append.evidence.networkAnchor }),
    observedAt: append.evidence.observedAt,
    payloadFormat: append.evidence.payloadFormat,
    provider: append.evidence.provider,
    rawEvidence: {
      byteLength: append.evidence.byteLength,
      evidenceId: append.evidence.evidenceId,
      objectUri: append.evidence.objectUri,
      sha256: append.evidence.sha256,
    },
    schemaVersion: "1",
    sourceLifecycle: "observed",
    sourceRecordId: input.sourceRecordId,
    tenantId: append.evidence.tenantId,
  });

  return { append, sourceRecord };
}
