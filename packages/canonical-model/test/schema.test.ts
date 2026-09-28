import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  atomicAmountSchema,
  canonicalMovementSchema,
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
});
