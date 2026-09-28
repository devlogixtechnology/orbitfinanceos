const DECIMAL_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/u;
const POWERS_OF_TEN = new Map<number, bigint>([[0, 1n]]);

function powerOfTen(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError("Decimal scale must be a non-negative safe integer");
  }

  const cached = POWERS_OF_TEN.get(exponent);
  if (cached !== undefined) {
    return cached;
  }

  const value = 10n ** BigInt(exponent);
  POWERS_OF_TEN.set(exponent, value);
  return value;
}

export type RoundingMode = "half-even" | "half-up" | "truncate";

export class ExactDecimal {
  private constructor(
    private readonly coefficient: bigint,
    readonly scale: number,
  ) {}

  static parse(value: string): ExactDecimal {
    const match = DECIMAL_PATTERN.exec(value);
    if (match === null) {
      throw new TypeError(`Invalid canonical decimal string: ${value}`);
    }

    const sign = match[1] === "-" ? -1n : 1n;
    const whole = match[2] ?? "0";
    const fraction = match[3] ?? "";
    const coefficient = sign * BigInt(`${whole}${fraction}`);
    return new ExactDecimal(coefficient, fraction.length);
  }

  static fromAtomic(value: string): ExactDecimal {
    if (!/^-?(?:0|[1-9]\d*)$/u.test(value)) {
      throw new TypeError(`Invalid atomic amount string: ${value}`);
    }
    return new ExactDecimal(BigInt(value), 0);
  }

  add(other: ExactDecimal): ExactDecimal {
    const resultScale = Math.max(this.scale, other.scale);
    const left = this.coefficient * powerOfTen(resultScale - this.scale);
    const right = other.coefficient * powerOfTen(resultScale - other.scale);
    return new ExactDecimal(left + right, resultScale);
  }

  subtract(other: ExactDecimal): ExactDecimal {
    return this.add(new ExactDecimal(-other.coefficient, other.scale));
  }

  multiply(other: ExactDecimal): ExactDecimal {
    return new ExactDecimal(
      this.coefficient * other.coefficient,
      this.scale + other.scale,
    );
  }

  quantize(targetScale: number, roundingMode: RoundingMode): ExactDecimal {
    if (!Number.isSafeInteger(targetScale) || targetScale < 0) {
      throw new RangeError("Target scale must be a non-negative safe integer");
    }
    if (targetScale >= this.scale) {
      return new ExactDecimal(
        this.coefficient * powerOfTen(targetScale - this.scale),
        targetScale,
      );
    }

    const divisor = powerOfTen(this.scale - targetScale);
    const quotient = this.coefficient / divisor;
    const remainder = this.coefficient % divisor;
    if (remainder === 0n || roundingMode === "truncate") {
      return new ExactDecimal(quotient, targetScale);
    }

    const absoluteRemainder = remainder < 0n ? -remainder : remainder;
    const comparison = absoluteRemainder * 2n - divisor;
    const sign = this.coefficient < 0n ? -1n : 1n;
    const shouldRoundAway =
      comparison > 0n ||
      (comparison === 0n &&
        (roundingMode === "half-up" || quotient % 2n !== 0n));

    return new ExactDecimal(
      shouldRoundAway ? quotient + sign : quotient,
      targetScale,
    );
  }

  toString(): string {
    const negative = this.coefficient < 0n;
    const digits = (negative ? -this.coefficient : this.coefficient).toString();
    if (this.scale === 0) {
      return `${negative ? "-" : ""}${digits}`;
    }

    const padded = digits.padStart(this.scale + 1, "0");
    const split = padded.length - this.scale;
    return `${negative ? "-" : ""}${padded.slice(0, split)}.${padded.slice(split)}`;
  }
}
