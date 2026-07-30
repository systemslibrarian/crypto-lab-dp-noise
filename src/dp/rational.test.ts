import { describe, expect, it } from 'vitest';
import { add, cmp, div, divInt, mul, rat, ratFromDecimal, scale, toNumber } from './rational';

describe('rational', () => {
  it('reduces on construction', () => {
    expect(rat(6, 8)).toEqual({ n: 3n, d: 4n });
    expect(rat(0, 5)).toEqual({ n: 0n, d: 1n });
  });

  it('parses decimals exactly, where a float would not', () => {
    // 0.1 + 0.2 ≠ 0.3 in binary floating point. As rationals it is exact, which
    // is why ε lives here and not in a double.
    expect(add(ratFromDecimal('0.1'), ratFromDecimal('0.2'))).toEqual(ratFromDecimal('0.3'));
    expect(ratFromDecimal('0.35')).toEqual({ n: 7n, d: 20n });
    expect(ratFromDecimal('10')).toEqual({ n: 10n, d: 1n });
    expect(ratFromDecimal('0.01')).toEqual({ n: 1n, d: 100n });
  });

  it('rejects anything that is not a plain non-negative decimal', () => {
    expect(() => ratFromDecimal('-1')).toThrow();
    expect(() => ratFromDecimal('1e-3')).toThrow();
    expect(() => ratFromDecimal('')).toThrow();
    expect(() => rat(1, 0)).toThrow();
    expect(() => rat(-1, 2)).toThrow();
  });

  it('does arithmetic without leaving the rationals', () => {
    expect(mul(rat(2, 3), rat(3, 4))).toEqual(rat(1, 2));
    expect(div(rat(1, 2), rat(1, 4))).toEqual(rat(2, 1));
    expect(scale(rat(1, 3), 6)).toEqual(rat(2, 1));
    expect(divInt(rat(1, 3), 2)).toEqual(rat(1, 6));
    expect(toNumber(rat(1, 8))).toBe(0.125);
  });

  it('compares without converting to a float', () => {
    expect(cmp(rat(1, 3), rat(1, 2))).toBe(-1);
    expect(cmp(rat(2, 4), rat(1, 2))).toBe(0);
    expect(cmp(rat(3, 4), rat(1, 2))).toBe(1);
  });
});
