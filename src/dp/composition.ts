/**
 * Composition: what repeated questions cost.
 *
 * The single most misunderstood thing about differential privacy is that ε is a
 * budget, not a setting. Every answer released from the same data spends some;
 * once it is gone, the only fail-closed move left is to stop answering. This is
 * not bureaucracy — Exhibit 4's averaging attack shows the alternative, where an
 * attacker who is allowed to ask the same ε = 0.5 question two thousand times
 * averages the noise away and reads the true value straight off.
 */

export interface Spend {
  readonly eps: number;
  readonly delta: number;
  readonly label: string;
}

export interface CompositionResult {
  readonly eps: number;
  readonly delta: number;
  readonly rule: 'basic' | 'advanced';
}

/**
 * Basic (sequential) composition, Dwork–McSherry–Nissim–Smith: privacy
 * parameters simply add. Always valid, and for a handful of queries it is also
 * the best of the two.
 */
export function basicComposition(spends: readonly Spend[]): CompositionResult {
  let eps = 0;
  let delta = 0;
  for (const s of spends) {
    eps += s.eps;
    delta += s.delta;
  }
  return { eps, delta, rule: 'basic' };
}

/**
 * Advanced composition (Dwork–Rothblum–Vadhan 2010; Dwork & Roth Theorem 3.20,
 * in the heterogeneous form of Kairouz–Oh–Viswanath):
 *
 *   ε' = √(2·ln(1/δ')·Σεᵢ²) + Σ εᵢ(e^εᵢ − 1),   δ' added to Σδᵢ
 *
 * It buys a √k dependence instead of k by allowing a small extra failure
 * probability δ'. It only wins once k is reasonably large — the page plots the
 * crossover rather than claiming one rule is simply better.
 */
export function advancedComposition(spends: readonly Spend[], deltaPrime: number): CompositionResult {
  if (!(deltaPrime > 0 && deltaPrime < 1)) throw new RangeError("need δ' ∈ (0,1)");
  let sumSq = 0;
  let sumTerm = 0;
  let delta = deltaPrime;
  for (const s of spends) {
    sumSq += s.eps * s.eps;
    sumTerm += s.eps * (Math.expm1(s.eps));
    delta += s.delta;
  }
  const eps = Math.sqrt(2 * Math.log(1 / deltaPrime) * sumSq) + sumTerm;
  return { eps, delta, rule: 'advanced' };
}

/**
 * What the analyst is actually charged: whichever valid rule gives the smaller
 * ε. Both are computed and both are reported — the point is that accounting is
 * a choice with consequences, not a constant.
 */
export function bestComposition(spends: readonly Spend[], deltaPrime: number): CompositionResult {
  const basic = basicComposition(spends);
  if (spends.length === 0) return basic;
  const advanced = advancedComposition(spends, deltaPrime);
  return advanced.eps < basic.eps ? advanced : basic;
}

export interface LedgerState {
  readonly spends: readonly Spend[];
  readonly basic: CompositionResult;
  readonly advanced: CompositionResult | null;
  readonly charged: CompositionResult;
  readonly budget: number;
  readonly remaining: number;
  readonly exhausted: boolean;
}

/**
 * A fail-closed privacy budget.
 *
 * `request` is the whole point: a query that would push the charged ε past the
 * budget is *refused*, not answered with more noise and not answered anyway
 * with a warning. An over-budget release cannot be taken back, so the only
 * correct behaviour is to not make it.
 */
export class Ledger {
  private readonly items: Spend[] = [];

  constructor(
    readonly budget: number,
    readonly deltaPrime = 1e-6,
  ) {}

  get spends(): readonly Spend[] {
    return this.items;
  }

  state(): LedgerState {
    const basic = basicComposition(this.items);
    const advanced = this.items.length ? advancedComposition(this.items, this.deltaPrime) : null;
    const charged = bestComposition(this.items, this.deltaPrime);
    const remaining = Math.max(0, this.budget - charged.eps);
    return {
      spends: this.items,
      basic,
      advanced,
      charged,
      budget: this.budget,
      remaining,
      exhausted: charged.eps >= this.budget - 1e-12,
    };
  }

  /** What the ledger *would* be charged if this spend were admitted. */
  quote(spend: Spend): CompositionResult {
    return bestComposition([...this.items, spend], this.deltaPrime);
  }

  /**
   * Admit a spend, or refuse it. Returns null when refused — callers must treat
   * null as "no answer exists", never as "answer with zero noise".
   */
  request(spend: Spend): CompositionResult | null {
    const quoted = this.quote(spend);
    if (quoted.eps > this.budget + 1e-12) return null;
    this.items.push(spend);
    return quoted;
  }

  reset(): void {
    this.items.length = 0;
  }
}
