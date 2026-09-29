import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  apiErrorSchema,
  atomicAmountSchema,
  canonicalMovementSchema,
  sessionContextSchema,
  sourceRecordSchema,
} from "../src/index.js";

describe("canonical schemas", () => {
  it("keeps financial atomic amounts as lossless strings", () => {
    const value = "900719925474099312345678901234567890";
    expect(atomicAmountSchema.parse(value)).toBe(value);
    expect(() => atomicAmountSchema.parse(1.5)).toThrow();
    expect(() => atomicAmountSchema.parse("01")).toThrow();
  });

  it("requires UTC instants rather than retaining ambiguous reporting offsets", () => {
    const valid = "2026-09-28T00:00:00.000Z";
    expect(sourceRecordSchema.shape.observedAt.parse(valid)).toBe(valid);
    expect(() =>
      sourceRecordSchema.shape.observedAt.parse("2026-09-28T05:00:00+05:00"),
    ).toThrow();
  });

  it("requires a movement discriminator instead of treating a transaction hash as a movement", () => {
    const movement = canonicalMovementSchema.parse({
      asset: {
        assetId: "native",
        decimals: 18,
        network: "eip155:1",
        symbol: "ETH",
      },
      effectiveAt: "2026-09-28T00:00:00.000Z",
      movementDiscriminator: "trace:0",
      movementId: "55555555-5555-4555-8555-555555555555",
      quantityAtomic: "1000000000000000000",
      sourceRecordIds: ["33333333-3333-4333-8333-333333333333"],
      tenantId: "11111111-1111-4111-8111-111111111111",
    });

    expect(movement.movementDiscriminator).toBe("trace:0");
  });

  it("exports a JSON Schema adapter from the authoritative runtime schema", () => {
    const jsonSchema = z.toJSONSchema(sourceRecordSchema, { target: "draft-2020-12" });
    expect(jsonSchema).toMatchObject({
      additionalProperties: false,
      type: "object",
    });
  });

  it("keeps session tenancy server-derived and independently versioned", () => {
    const session = sessionContextSchema.parse({
      actor: {
        actorId: "11111111-1111-4111-8111-111111111111",
        subject: "identity-provider|operator-1",
      },
      authenticatedAt: "2026-09-28T01:00:00.000Z",
      expiresAt: "2026-09-28T02:00:00.000Z",
      permissions: ["evidence:read"],
      roles: ["operator"],
      schemaVersion: "1",
      tenant: {
        displayName: "Synthetic Treasury",
        tenantId: "22222222-2222-4222-8222-222222222222",
      },
    });

    expect(session.tenant.tenantId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(() =>
      sessionContextSchema.parse({ ...session, tenantId: session.tenant.tenantId }),
    ).toThrow();
  });

  it("requires a request ID in the shared API error envelope", () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "A credential is required.",
          requestId: "request-1",
        },
      }),
    ).toMatchObject({ error: { requestId: "request-1" } });
  });
});
