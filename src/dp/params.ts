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

/** RAPPOR's longitudinal privacy bound at randomisation probability f. */
export function rapporEpsilonInfinity(f: number): number {
  if (!(f > 0 && f < 1)) throw new RangeError('f must be in (0,1)');
  return 2 * Math.log((1 - f / 2) / (f / 2));
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
      'Per-day, across use cases. Apple documented per-donation parameters but not a single global ε; researchers who reverse-engineered the shipping implementation measured a daily budget of about 14 on macOS 10.12 and 16 on iOS 10.',
    provenance: 'measured',
    source: 'Tang, Korolova, Bai, Wang & Wang, "Privacy Loss in Apple\'s Implementation of Differential Privacy" (2017)',
    sourceUrl: 'https://arxiv.org/abs/1709.02753',
  },
  {
    id: 'rappor',
    org: 'Google (RAPPOR)',
    what: 'Chrome settings and homepage telemetry, randomised in the browser',
    model: 'local',
    eps: rapporEpsilonInfinity(0.5),
    epsNote:
      'The longitudinal bound ε∞ = 2·ln((1 − f/2)/(f/2)) at the paper\'s f = 0.5, computed here rather than quoted. RAPPOR\'s design point is that this bound holds even when the same client reports forever.',
    provenance: 'derived',
    source: 'Erlingsson, Pihur & Korolova, "RAPPOR" (CCS 2014)',
    sourceUrl: 'https://arxiv.org/abs/1407.6981',
  },
  {
    id: 'census',
    org: 'US Census Bureau',
    what: '2020 Census redistricting file (PL 94-171) — the data that draws voting districts',
    model: 'global',
    eps: 17.14,
    epsNote:
      'The Bureau set its budget as ρ = 2.63 in zero-concentrated DP and published ε = 17.14 at δ = 10⁻¹⁰. This page converts ρ itself: the standard conversion gives 18.19 and the Rényi-optimised one 17.43, so even the published number depends on which conversion you accept.',
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
