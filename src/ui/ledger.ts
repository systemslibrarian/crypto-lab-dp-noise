/**
 * The session's single privacy ledger.
 *
 * Exhibit 5 used to own this outright, which quietly taught the wrong lesson:
 * releases made in Exhibits 3 and 4 looked free, because nothing charged them.
 * They are not free. A budget that only counts the queries asked inside one
 * panel is exactly the accounting failure the averaging attack exploits.
 *
 * So the ledger lives here, one per page load, and every panel that releases an
 * answer can quote what that release would cost against it. Whether a panel
 * *charges* the ledger or merely quotes it is a separate decision made by the
 * panel: Exhibit 5 charges, because enforcement is its subject; the dial quotes,
 * because a reader dragging ε back and forth to compare mechanisms is not
 * running an attack and should not be locked out of the page for exploring it.
 * The quote is shown either way, so a release never looks costless.
 */
import { Ledger, type CompositionResult, type Spend } from '../dp/composition';

export const DELTA_PRIME = 1e-6;
export const DEFAULT_BUDGET = 1.5;

let ledger = new Ledger(DEFAULT_BUDGET, DELTA_PRIME);

type Listener = () => void;
const listeners = new Set<Listener>();

export function sessionLedger(): Ledger {
  return ledger;
}

export function onLedgerChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function setBudget(budget: number): void {
  ledger = new Ledger(budget, DELTA_PRIME);
  notify();
}

export function resetLedger(): void {
  ledger.reset();
  notify();
}

/** Charge the ledger, or refuse. Null means no answer exists — never "answer anyway". */
export function charge(spend: Spend): CompositionResult | null {
  const result = ledger.request(spend);
  notify();
  return result;
}

export interface Quote {
  /** What the ledger would be charged in total if this release were billed. */
  readonly total: number;
  readonly rule: 'basic' | 'advanced';
  readonly remaining: number;
  readonly budget: number;
  /** True when billing this release would overdraw the budget. */
  readonly wouldRefuse: boolean;
}

/** What one more release at this ε would cost, without spending anything. */
export function quote(eps: number, label: string): Quote {
  const state = ledger.state();
  const quoted = ledger.quote({ eps, delta: 0, label });
  return {
    total: quoted.eps,
    rule: quoted.rule,
    remaining: state.remaining,
    budget: state.budget,
    wouldRefuse: quoted.eps > state.budget + 1e-12,
  };
}
