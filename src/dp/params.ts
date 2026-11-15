/**
 * The ε ladder, and what people actually shipped.
 *
 * ε is chosen from a fixed ladder rather than read off a continuous slider so
 * that every value is an exact rational (see `rational.ts`) and the samplers
 * stay exact. The ladder spans the whole range the brief asks for, 0.01 to 10,
 * which is also — not coincidentally — roughly the range real deployments live
 * in, from "the answer is nearly pure noise" to "ε is a formality".
 */
import { ratFromDecimal, type Rational } from './rational';

export const EPS_LADDER: readonly string[] = [
  '0.01',
  '0.02',
  '0.05',
  '0.1',
  '0.2',
  '0.35',
  '0.5',
  '0.75',
  '1',
  '1.5',
  '2',
  '3',
  '5',
  '7',
  '10',
];

/** Where the sliders start: small enough to be interesting, large enough to see. */
export const EPS_DEFAULT_INDEX = 8; // ε = 1

export function epsAt(index: number): Rational {
  const clamped = Math.min(EPS_LADDER.length - 1, Math.max(0, Math.round(index)));
  return ratFromDecimal(EPS_LADDER[clamped]);
}

export function epsLabel(index: number): string {
  return EPS_LADDER[Math.min(EPS_LADDER.length - 1, Math.max(0, Math.round(index)))];
}

export interface Deployment {
  readonly id: string;
  readonly org: string;
  readonly what: string;
  /** Local DP randomises on the user's device; global DP trusts a curator. */
  readonly model: 'local' | 'global';
  /** The ε the page plots. Some are published, some are third-party measurements. */
  readonly eps: number;
  readonly epsNote: string;
  readonly provenance: 'published' | 'measured' | 'derived';
  readonly source: string;
  readonly sourceUrl: string;
}

/**
 * RAPPOR's longitudinal privacy bound (Erlingsson, Pihur & Korolova, CCS 2014,
 * Theorem 1):
 *
 *   ε∞ = 2h·ln((1 − f/2)/(f/2))
 *
 * `h` is the number of hash functions in the Bloom filter and it is not
 * optional. Each of the h bits a value sets is randomised independently, so the
 * permanent randomised response leaks h times over and the bound scales with h.
 * Dropping the factor — an easy transcription to make, because the h sits
 * outside the logarithm — halves the reported ε of Chrome's h = 2 deployment
 * and reports a guarantee twice as strong as the paper proves.
 */
export function rapporEpsilonInfinity(f: number, h: number): number {
  if (!(f > 0 && f < 1)) throw new RangeError('f must be in (0,1)');
  if (!(Number.isInteger(h) && h >= 1)) throw new RangeError('h must be a positive integer');
  return 2 * h * Math.log((1 - f / 2) / (f / 2));
}

/**
 * Real deployments, with their ε and — just as important — where that number
 * came from. A published ε, an ε measured by outside researchers from a
 * shipping binary, and an ε derived from a budget denominated in something else
 * are three different kinds of claim, and the panel says which is which.
 */
export const DEPLOYMENTS: readonly Deployment[] = [
  {
    id: 'apple',
    org: 'Apple',
    what: 'Emoji and word-usage telemetry from iOS and macOS keyboards',
    model: 'local',
    eps: 16,
    epsNote:
      'Per-day, across use cases. Apple documented per-donation parameters but not a single global ε; researchers who reverse-engineered the shipping implementation measured the daily budget the configuration permits as 16 on macOS 10.12 for the four initially announced applications. The loss actually reachable was lower on each platform they inspected: 6 per day on macOS 10.12.3, where DeepLink was not implemented, and 14 per day on iOS 10.1.1. The budget is renewed every day, so the device-lifetime loss grows with the number of days since opt-in.',
    provenance: 'measured',
    source: 'Tang, Korolova, Bai, Wang & Wang, "Privacy Loss in Apple\'s Implementation of Differential Privacy" (2017)',
    sourceUrl: 'https://arxiv.org/abs/1709.02753',
  },
  {
    id: 'rappor',
    org: 'Google (RAPPOR)',
    what: 'Chrome settings and homepage telemetry, randomised in the browser',
    model: 'local',
    eps: rapporEpsilonInfinity(0.75, 2),
    epsNote:
      'The longitudinal bound ε∞ = 2h·ln((1 − f/2)/(f/2)) at the parameters the paper reports for the Chrome homepage collection — f = 0.75 with h = 2 hash functions — computed here rather than quoted. The h matters: it is the number of Bloom-filter bits each value sets, every one of them randomised independently, so the permanent randomised response leaks h times over. RAPPOR\'s design point is that this bound holds even when the same client reports forever, which is why it is the number to compare against, not the ε₁ = 0.5343 the paper quotes for a single report.',
    provenance: 'derived',
    source: 'Erlingsson, Pihur & Korolova, "RAPPOR" (CCS 2014)',
    sourceUrl: 'https://arxiv.org/abs/1407.6981',
  },
  {
    id: 'census',
    org: 'US Census Bureau',
    what: '2020 Census redistricting file (PL 94-171), persons tables — the data that draws voting districts',
    model: 'global',
    eps: 17.14,
    epsNote:
      'The Bureau budgeted ρ = 2.56 for the persons file in zero-concentrated DP (0.07 more for housing units, 2.63 in all) and published ε = 17.14 for it at δ = 10⁻¹⁰, 19.61 with the housing units added. This page converts the persons file\'s ρ itself: the Rényi-optimised conversion reproduces 17.14 and the standard one gives 17.92, so even the published number depends on which conversion you accept — and the 19.61 total adds two files\' ε rather than converting their summed ρ, which would give 17.43.',
    provenance: 'published',
    source: 'US Census Bureau, 2020 Disclosure Avoidance System',
    sourceUrl: 'https://www.census.gov/programs-surveys/decennial-census/decade/2020/planning-management/process/disclosure-avoidance.html',
  },
  {
    id: 'this-page',
    org: 'This page, by default',
    what: 'The counting query in Exhibit 2',
    model: 'global',
    eps: 1,
    epsNote:
      'Chosen because it is the value the literature treats as the boundary of "meaningfully private" — and because at ε = 1 the two distributions in Exhibit 2 still visibly overlap.',
    provenance: 'published',
    source: 'Dwork & Roth, "The Algorithmic Foundations of Differential Privacy" (2014)',
    sourceUrl: 'https://www.cis.upenn.edu/~aaroth/Papers/privacybook.pdf',
  },
];
