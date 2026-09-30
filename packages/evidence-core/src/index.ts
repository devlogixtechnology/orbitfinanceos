import { createHash, timingSafeEqual } from "node:crypto";
import { access, mkdir, open, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";

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

export interface DurableEvidenceInput {
  readonly attributes?: Readonly<Record<string, string>>;
  readonly evidenceId: string;
  readonly independenceGroup: string;
  readonly integrationId: string;
  readonly observedAt: string;
  readonly provider: string;
  readonly rawBytes: Uint8Array;
  readonly tenantId: string;
}

export interface DurableEvidenceObject {
  readonly attributes: Readonly<Record<string, string>>;
  readonly byteLength: string;
  readonly evidenceId: string;
  readonly independenceGroup: string;
  readonly integrationId: string;
  readonly objectUri: string;
  readonly observedAt: string;
  readonly provider: string;
  readonly sha256: string;
  readonly tenantId: string;
}

export interface DurableEvidenceStore {
  append(input: DurableEvidenceInput): Promise<DurableEvidenceObject>;
  checkReadiness(): Promise<void>;
  readByDigest(tenantId: string, digest: string): Promise<Uint8Array>;
  readMetadata(tenantId: string, evidenceId: string): Promise<DurableEvidenceObject>;
  verifyIntegrity(tenantId: string, evidenceId: string): Promise<boolean>;
}

const safeIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const digestPattern = /^[0-9a-f]{64}$/u;

function assertSafeIdentifier(value: string, label: string): void {
  if (!safeIdentifierPattern.test(value)) {
    throw new TypeError(`${label} must be a UUID`);
  }
}

async function writeExclusive(path: string, content: Uint8Array | string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }

  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return true;
}

export class FilesystemEvidenceStore implements DurableEvidenceStore {
  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory);
  }

  async checkReadiness(): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true });
    await access(this.rootDirectory, constants.R_OK | constants.W_OK);
  }

  async append(input: DurableEvidenceInput): Promise<DurableEvidenceObject> {
    assertSafeIdentifier(input.tenantId, "tenantId");
    assertSafeIdentifier(input.integrationId, "integrationId");
    assertSafeIdentifier(input.evidenceId, "evidenceId");

    const digest = sha256(input.rawBytes);
    const tenantDirectory = join(this.rootDirectory, input.tenantId);
    const objectDirectory = join(tenantDirectory, "objects");
    const metadataDirectory = join(tenantDirectory, "metadata");
    await Promise.all([
      mkdir(objectDirectory, { recursive: true }),
      mkdir(metadataDirectory, { recursive: true }),
    ]);

    const objectPath = join(objectDirectory, `${digest}.bin`);
    const objectCreated = await writeExclusive(objectPath, input.rawBytes);
    if (!objectCreated) {
      const existingBytes = new Uint8Array(await readFile(objectPath));
      if (!bytesEqual(existingBytes, input.rawBytes)) {
        throw new EvidenceIdentityConflictError(
          `Evidence digest ${digest} identifies different bytes`,
        );
      }
    }

    const metadata: DurableEvidenceObject = Object.freeze({
      attributes: Object.freeze({ ...(input.attributes ?? {}) }),
      byteLength: input.rawBytes.byteLength.toString(),
      evidenceId: input.evidenceId,
      independenceGroup: input.independenceGroup,
      integrationId: input.integrationId,
      objectUri: `evidence://${input.tenantId}/${digest}?observation=${input.evidenceId}`,
      observedAt: input.observedAt,
      provider: input.provider,
      sha256: digest,
      tenantId: input.tenantId,
    });
    const serializedMetadata = JSON.stringify(metadata);
    const metadataPath = join(metadataDirectory, `${input.evidenceId}.json`);
    const metadataCreated = await writeExclusive(metadataPath, serializedMetadata);
    if (!metadataCreated) {
      const existingMetadata = await readFile(metadataPath, "utf8");
      if (existingMetadata !== serializedMetadata) {
        throw new EvidenceIdentityConflictError(
          `Evidence ID ${input.evidenceId} cannot identify different metadata`,
        );
      }
    }

    return metadata;
  }

  async readByDigest(tenantId: string, digest: string): Promise<Uint8Array> {
    assertSafeIdentifier(tenantId, "tenantId");
    if (!digestPattern.test(digest)) {
      throw new TypeError("digest must be a lowercase SHA-256 value");
    }
    return new Uint8Array(
      await readFile(join(this.rootDirectory, tenantId, "objects", `${digest}.bin`)),
    );
  }

  async readMetadata(
    tenantId: string,
    evidenceId: string,
  ): Promise<DurableEvidenceObject> {
    assertSafeIdentifier(tenantId, "tenantId");
    assertSafeIdentifier(evidenceId, "evidenceId");
    const content = await readFile(
      join(this.rootDirectory, tenantId, "metadata", `${evidenceId}.json`),
      "utf8",
    );
    return JSON.parse(content) as DurableEvidenceObject;
  }

  async verifyIntegrity(tenantId: string, evidenceId: string): Promise<boolean> {
    const metadata = await this.readMetadata(tenantId, evidenceId);
    const rawBytes = await this.readByDigest(tenantId, metadata.sha256);
    return (
      rawBytes.byteLength.toString() === metadata.byteLength &&
      sha256(rawBytes) === metadata.sha256
    );
  }
}

export interface SupabaseStorageEvidenceStoreOptions {
  readonly bucket?: string;
  readonly fetchImplementation?: typeof fetch;
  readonly secretKey: string;
  readonly supabaseUrl: string;
}

export class SupabaseStorageEvidenceStore implements DurableEvidenceStore {
  private readonly bucket: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly secretKey: string;
  private readonly storageApiUrl: string;
  private readonly storageBaseUrl: string;

  constructor(options: SupabaseStorageEvidenceStoreOptions) {
    this.bucket = options.bucket ?? "orbitos-evidence-staging";
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.secretKey = options.secretKey;
    this.storageApiUrl = `${options.supabaseUrl.replace(/\/$/u, "")}/storage/v1`;
    this.storageBaseUrl = `${this.storageApiUrl}/object`;
    if (this.secretKey.length === 0) {
      throw new TypeError("A server-only Supabase secret key is required");
    }
  }

  async checkReadiness(): Promise<void> {
    const response = await this.fetchImplementation(
      `${this.storageApiUrl}/bucket/${encodeURIComponent(this.bucket)}`,
      { headers: this.headers(), method: "GET" },
    );
    if (!response.ok) throw new Error("Evidence storage bucket is unavailable");
  }

  async append(input: DurableEvidenceInput): Promise<DurableEvidenceObject> {
    assertSafeIdentifier(input.tenantId, "tenantId");
    assertSafeIdentifier(input.integrationId, "integrationId");
    assertSafeIdentifier(input.evidenceId, "evidenceId");
    const digest = sha256(input.rawBytes);
    const objectName = `${input.tenantId}/objects/${digest}.bin`;
    await this.putImmutable(objectName, input.rawBytes, "application/octet-stream");
    const metadata: DurableEvidenceObject = Object.freeze({
      attributes: Object.freeze({ ...(input.attributes ?? {}) }),
      byteLength: input.rawBytes.byteLength.toString(),
      evidenceId: input.evidenceId,
      independenceGroup: input.independenceGroup,
      integrationId: input.integrationId,
      objectUri: `supabase://${this.bucket}/${objectName}?observation=${input.evidenceId}`,
      observedAt: input.observedAt,
      provider: input.provider,
      sha256: digest,
      tenantId: input.tenantId,
    });
    await this.putImmutable(
      `${input.tenantId}/metadata/${input.evidenceId}.json`,
      new TextEncoder().encode(JSON.stringify(metadata)),
      "application/json",
    );
    return metadata;
  }

  async readByDigest(tenantId: string, digest: string): Promise<Uint8Array> {
    assertSafeIdentifier(tenantId, "tenantId");
    if (!digestPattern.test(digest)) throw new TypeError("digest must be a lowercase SHA-256 value");
    return this.get(`${tenantId}/objects/${digest}.bin`);
  }

  async readMetadata(tenantId: string, evidenceId: string): Promise<DurableEvidenceObject> {
    assertSafeIdentifier(tenantId, "tenantId");
    assertSafeIdentifier(evidenceId, "evidenceId");
    const bytes = await this.get(`${tenantId}/metadata/${evidenceId}.json`);
    return JSON.parse(new TextDecoder().decode(bytes)) as DurableEvidenceObject;
  }

  async verifyIntegrity(tenantId: string, evidenceId: string): Promise<boolean> {
    const metadata = await this.readMetadata(tenantId, evidenceId);
    const bytes = await this.readByDigest(tenantId, metadata.sha256);
    return bytes.byteLength.toString() === metadata.byteLength && sha256(bytes) === metadata.sha256;
  }

  private headers(contentType?: string): Record<string, string> {
    return {
      apikey: this.secretKey,
      authorization: `Bearer ${this.secretKey}`,
      ...(contentType === undefined ? {} : { "content-type": contentType }),
    };
  }

  private objectUrl(name: string): string {
    return `${this.storageBaseUrl}/${encodeURIComponent(this.bucket)}/${name.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async get(name: string): Promise<Uint8Array> {
    const response = await this.fetchImplementation(this.objectUrl(name), {
      headers: this.headers(),
      method: "GET",
    });
    if (!response.ok) throw new Error(`Evidence object read failed with status ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async putImmutable(name: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const response = await this.fetchImplementation(this.objectUrl(name), {
      body: Uint8Array.from(bytes),
      headers: { ...this.headers(contentType), "x-upsert": "false" },
      method: "POST",
    });
    if (response.ok) return;
    if (response.status === 400 || response.status === 409) {
      const existing = await this.get(name);
      if (bytesEqual(existing, bytes)) return;
      throw new EvidenceIdentityConflictError(`Evidence object ${name} already contains different bytes`);
    }
    throw new Error(`Evidence object write failed with status ${response.status}`);
  }
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
