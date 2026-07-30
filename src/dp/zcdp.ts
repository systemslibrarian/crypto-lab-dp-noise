/**
 * zero-concentrated DP → (ε, δ), because that is the currency the 2020 US
 * Census was actually denominated in.
 *
 * The Census Bureau set its disclosure-avoidance budget in ρ (zCDP, Bun &
 * Steinke 2016) and then published an (ε, δ) equivalent, because ρ is
 * meaningless to anyone outside the field. Exhibit 5 does that conversion here
 * rather than quoting the answer, so you can see that "ε = 17.14" is not a
 * measured quantity but the output of a chosen conversion — and that a
 * different, equally valid conversion gives a different number for the same
 * mechanism. That is a real and underappreciated fact about reading published
 * ε values.
 */

/** ρ-zCDP ⟹ (ρ + 2√(ρ·ln(1/δ)), δ)-DP. Bun & Steinke 2016, Proposition 1.3. */
export function zcdpToDpStandard(rho: number, delta: number): number {
  return rho + 2 * Math.sqrt(rho * Math.log(1 / delta));
}

/**
 * The tighter conversion, via the Rényi bound optimised over the order α:
 *
 *   ε(α) = ρα + ln((α−1)/α) − (ln δ + ln α)/(α−1)
 *
 * (Canonne–Kamath–Steinke 2020, Prop. 12 / the "improved" RDP→DP conversion.)
 * Minimised numerically over α > 1.
 */
export function zcdpToDpTight(rho: number, delta: number): { eps: number; alpha: number } {
  const at = (alpha: number): number =>
    rho * alpha + Math.log((alpha - 1) / alpha) - (Math.log(delta) + Math.log(alpha)) / (alpha - 1);

  // Bracket around the standard conversion's optimum, then golden-section.
  let lo = 1 + 1e-6;
  let hi = 1 + 40 * Math.max(1, Math.sqrt(Math.log(1 / delta) / rho));
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = hi - phi * (hi - lo);
  let b = lo + phi * (hi - lo);
  let fa = at(a);
  let fb = at(b);
  for (let i = 0; i < 300; i++) {
    if (fa < fb) {
      hi = b;
      b = a;
      fb = fa;
      a = hi - phi * (hi - lo);
      fa = at(a);
    } else {
      lo = a;
      a = b;
      fa = fb;
      b = lo + phi * (hi - lo);
      fb = at(b);
    }
  }
  const alpha = 0.5 * (lo + hi);
  return { eps: at(alpha), alpha };
}
