import { describe, expect, it } from "vitest";

import { ExactDecimal } from "../src/index.js";

describe("ExactDecimal", () => {
  it("adds quantities beyond JavaScript's safe integer range exactly", () => {
    const result = ExactDecimal.parse("900719925474099312345678901234567890.01").add(
      ExactDecimal.parse("0.09"),
    );
    expect(result.toString()).toBe("900719925474099312345678901234567890.10");
  });

  it("multiplies prices and quantities without binary floating point", () => {
    const result = ExactDecimal.parse("0.1").multiply(ExactDecimal.parse("0.2"));
    expect(result.toString()).toBe("0.02");
  });

  it("requires an explicit rounding mode when reducing scale", () => {
    expect(ExactDecimal.parse("2.345").quantize(2, "half-even").toString()).toBe("2.34");
    expect(ExactDecimal.parse("2.355").quantize(2, "half-even").toString()).toBe("2.36");
    expect(ExactDecimal.parse("-2.345").quantize(2, "half-up").toString()).toBe("-2.35");
  });

  it("rejects exponent notation and non-canonical leading zeroes", () => {
    expect(() => ExactDecimal.parse("1e-8")).toThrow();
    expect(() => ExactDecimal.parse("01.0")).toThrow();
  });
});
