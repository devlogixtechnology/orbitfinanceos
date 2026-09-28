import { describe, expect, it } from "vitest";

import {
  EvidenceIdentityConflictError,
  InMemoryEvidenceStore,
  ingestRawEvidence,
} from "../src/index.js";

const baseInput = {
  evidenceId: "44444444-4444-4444-8444-444444444444",
  external: {
    objectId: "transfer-42",
    objectType: "synthetic_transfer",
    revision: "1",
  },
  independenceGroup: "synthetic-fixture",
  integrationId: "22222222-2222-4222-8222-222222222222",
  objectUri: "memory://tenant-1/evidence-1",
  observedAt: "2026-09-28T00:00:01.000Z",
  payloadFormat: "json" as const,
  provider: "synthetic",
  rawBytes: new TextEncoder().encode('{ "amount": "9007199254740993" }\n'),
  sourceRecordId: "33333333-3333-4333-8333-333333333333",
  tenantId: "11111111-1111-4111-8111-111111111111",
};

describe("synthetic raw-evidence ingestion and replay", () => {
  it("preserves exact bytes before creating a canonical source record", () => {
    const store = new InMemoryEvidenceStore();
    const first = ingestRawEvidence(store, baseInput);
    const replay = ingestRawEvidence(store, baseInput);

    expect(first.append.status).toBe("appended");
    expect(replay.append.status).toBe("duplicate");
    expect(store.size).toBe(1);
    expect(new TextDecoder().decode(store.readRaw(baseInput.evidenceId))).toBe(
      '{ "amount": "9007199254740993" }\n',
    );
    expect(store.verifyIntegrity(baseInput.evidenceId)).toBe(true);
    expect(first.sourceRecord.rawEvidence.sha256).toHaveLength(64);
  });

  it("retains conflicting bytes for the same source revision without overwriting", () => {
    const store = new InMemoryEvidenceStore();
    ingestRawEvidence(store, baseInput);

    const conflict = ingestRawEvidence(store, {
      ...baseInput,
      evidenceId: "66666666-6666-4666-8666-666666666666",
      objectUri: "memory://tenant-1/evidence-2",
      rawBytes: new TextEncoder().encode('{ "amount": "9007199254740994" }\n'),
      sourceRecordId: "77777777-7777-4777-8777-777777777777",
    });

    expect(conflict.append.status).toBe("conflict");
    expect(conflict.append.conflictWith).toEqual([baseInput.evidenceId]);
    expect(store.size).toBe(2);
    expect(store.readRaw(baseInput.evidenceId)).not.toEqual(
      store.readRaw(conflict.append.evidence.evidenceId),
    );
  });

  it("rejects reuse of an evidence ID across tenant metadata", () => {
    const store = new InMemoryEvidenceStore();
    ingestRawEvidence(store, baseInput);

    expect(() =>
      ingestRawEvidence(store, {
        ...baseInput,
        tenantId: "88888888-8888-4888-8888-888888888888",
      }),
    ).toThrow(EvidenceIdentityConflictError);
    expect(store.size).toBe(1);
  });
});
