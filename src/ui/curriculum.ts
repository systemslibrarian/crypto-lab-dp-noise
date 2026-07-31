/**
 * One table, three uses: what the page promises, what establishes it, what tests it.
 *
 * These three things were separate lists in three files — the objectives in the
 * markup, the path steps in `path.ts`, the exit questions in `exit.ts` — all of
 * length four and all describing the same four ideas from different angles.
 * Three parallel lists is three chances to drift, and a lesson whose stated
 * objective, core interaction and final assessment have quietly come apart is
 * worse than one that never claimed to have them.
 *
 * So the linkage lives here and the three consumers read it:
 *
 * - `objectives.ts` renders `can` as the contract at the top of the page.
 * - `path.ts` renders `idea`, `action` and `establishes` as the core path, and
 *   names the challenge question each step is tested by.
 * - `exit.ts` reads `concept`, `revisit` and `href` to say, after a wrong
 *   answer, exactly which interaction to go and run.
 *
 * The `revisitNeedsExplore` flag exists because one revisit target — the
 * k-anonymity panel — is set aside on the guided route. Sending a learner to a
 * section that is not on their page would be the worst kind of broken pointer,
 * so links to expert-gated content switch the route on the way there.
 */
import type { CoreStep } from './state';

export interface Unit {
  /** The core step this unit is about. */
  readonly id: CoreStep;
  /** The capability, stated as the page's promise to the reader. */
  readonly can: string;
  /** The short name of the idea, used in the navigator. */
  readonly idea: string;
  /** The one interaction that establishes it. */
  readonly action: string;
  /** What running that interaction establishes, in one sentence. */
  readonly establishes: string;
  readonly href: string;
  readonly exhibit: string;
  /** The exit-challenge question that tests transfer of this idea. */
  readonly challengeId: string;
  /** The concept as a heading — sentence case. */
  readonly concept: string;
  /**
   * The same concept phrased to sit mid-sentence. Not derivable by lowercasing
   * `concept`: that turns "δ, and why the Gaussian needs it" into "the gaussian",
   * and a page about precision should not misspell Gauss.
   */
  readonly conceptInline: string;
  /** The exact thing to go and run again after getting the challenge wrong. */
  readonly revisit: string;
  /** The revisit target, which may differ from the step's own anchor. */
  readonly revisitHref: string;
  /** True when the revisit target is set aside on the guided route. */
  readonly revisitNeedsExplore: boolean;
}

export const CURRICULUM: readonly Unit[] = [
  {
    id: 'differencing',
    can:
      'Tell a guarantee from an anonymisation — say why a promise about a released table is a different kind of ' +
      'claim from a promise about the mechanism that produced it, and why only the second survives an attacker who ' +
      'already knows everything else.',
    idea: 'Why aggregates fail',
    action: 'Run the differencing attack on the exact answers.',
    establishes:
      'Publishing only totals is not privacy: two aggregates that name nobody subtract to one person’s salary.',
    href: '#leak',
    exhibit: 'Exhibit 1',
    challengeId: 'x-anonymisation',
    concept: 'Guarantee versus anonymisation',
    conceptInline: 'guarantee versus anonymisation',
    revisit: 'Exhibit 1 — raise the generalisation until k = 6 and read the equivalence-class table.',
    revisitHref: '#leak',
    revisitNeedsExplore: true,
  },
  {
    id: 'definition',
    can:
      'Read ε as a bound on changed probabilities — state what it constrains, in terms of two databases differing ' +
      'by one person, without using the phrase "amount of noise".',
    idea: 'What ε promises',
    action: 'Move ε and watch the two neighbouring worlds slide together.',
    establishes:
      'ε bounds how much one person’s presence can change the probability of any output — a ratio, not a quantity of noise.',
    href: '#definition',
    exhibit: 'Exhibit 2',
    challengeId: 'x-delta',
    concept: 'δ, and why the Gaussian needs it',
    conceptInline: 'δ, and why the Gaussian needs it',
    revisit: 'Exhibit 2 — switch the mechanism to the discrete Gaussian and watch the ratio cross the rails.',
    revisitHref: '#definition',
    revisitNeedsExplore: false,
  },
  {
    id: 'sensitivity',
    can:
      'Predict the effect of ε and of sensitivity — given a query and an ε, say roughly how noisy the answer will ' +
      'be and what an attacker could conclude, and say which of those two the sensitivity changes.',
    idea: 'Why sensitivity matters',
    action: 'Compare the headcount and the total payroll at the same ε.',
    establishes:
      'The noise comes from Δ/ε, so the same ε buys wildly different accuracy depending on what one person can move.',
    href: '#dial',
    exhibit: 'Exhibit 4',
    challengeId: 'x-sensitivity',
    concept: 'Sensitivity',
    conceptInline: 'sensitivity',
    revisit: 'Exhibit 4 — keep ε fixed and switch the query from the headcount to the total payroll.',
    revisitHref: '#dial',
    revisitNeedsExplore: false,
  },
  {
    id: 'budget',
    can:
      'Explain why repeated queries must be composed — say what a transcript of individually private answers costs, ' +
      'and why refusing to answer is the correct end state rather than a failure.',
    idea: 'Why privacy is a budget',
    action: 'Average repeated answers, then spend the budget until a query is refused.',
    establishes:
      'Privacy loss accumulates across releases, so a finite budget — and a refusal at the end of it — is a security control.',
    href: '#budget',
    exhibit: 'Exhibit 5',
    challengeId: 'x-composition',
    concept: 'Composition',
    conceptInline: 'composition',
    revisit: 'Exhibit 5 — run the averaging attack, then spend the ledger until a query is refused.',
    revisitHref: '#budget',
    revisitNeedsExplore: false,
  },
];

export function unitForStep(step: CoreStep): Unit {
  const unit = CURRICULUM.find((u) => u.id === step);
  if (!unit) throw new Error(`no curriculum unit for ${step}`);
  return unit;
}

export function unitForChallenge(challengeId: string): Unit {
  const unit = CURRICULUM.find((u) => u.challengeId === challengeId);
  if (!unit) throw new Error(`no curriculum unit for challenge ${challengeId}`);
  return unit;
}
