/**
 * The one piece of state the exhibits share.
 *
 * Every exhibit on this page used to own its own ε, its own mechanism and its
 * own idea of which query was being asked, which made the page read as six
 * demonstrations rather than one causal model. This store is the fix: a single
 * ε index, a single query, and a route, with a subscription so an exhibit can
 * re-render when something it depends on changes.
 *
 * It is deliberately tiny and deliberately not reactive-by-magic. Exhibits
 * subscribe, read what they need, and redraw; there is no dependency tracking
 * and no diffing, because there are six subscribers and the whole page
 * re-renders in under a frame.
 *
 * Two invariants worth stating:
 *
 * - **Linking is a view, not a constraint.** With `linked` off every exhibit
 *   keeps its own ε exactly as before, so the page still works as a reference
 *   where you park one exhibit at ε = 0.1 and another at ε = 5 to compare them.
 *   Linked mode is the default only on the guided route.
 * - **Completion is earned, never asserted.** `complete()` is called from the
 *   handler of the interaction itself — after the attack has run, after the
 *   refusal has actually been refused — so a step cannot be ticked off by
 *   scrolling past it.
 */
import { EPS_DEFAULT_INDEX } from '../dp/params';

export type Route = 'guided' | 'explore';

/** The four ideas the guided route exists to establish, in order. */
export const CORE_STEPS = ['differencing', 'definition', 'sensitivity', 'budget'] as const;
export type CoreStep = (typeof CORE_STEPS)[number];

export interface LabState {
  readonly route: Route;
  /** When true, the ε below drives Exhibits 2, 3 and 4 together. */
  readonly linked: boolean;
  readonly epsIndex: number;
  /** The query whose sensitivity the linked readout reports. */
  readonly queryId: string;
  /** Deterministic sampling for classroom use. Never the default. */
  readonly seeded: boolean;
  readonly completed: ReadonlySet<CoreStep>;
}

const INITIAL: LabState = {
  route: 'guided',
  linked: true,
  epsIndex: EPS_DEFAULT_INDEX,
  queryId: 'count-high',
  seeded: false,
  completed: new Set(),
};

let state: LabState = INITIAL;

type Listener = (next: LabState, prev: LabState) => void;
const listeners = new Set<Listener>();

export function getState(): LabState {
  return state;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Merge a patch and notify. Notification is unconditional rather than
 * shallow-compared: `update({ epsIndex: 8 })` when ε is already 8 is a no-op
 * everywhere it lands, and a listener that had to defend against spurious calls
 * would be a listener with a bug waiting in it.
 */
export function update(patch: Partial<Omit<LabState, 'completed'>>): void {
  const prev = state;
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state, prev);
}

/**
 * Mark one of the four core ideas established. Idempotent: re-running the
 * differencing attack does not un-complete it, and does not re-notify, so the
 * navigator does not flash on every repeat interaction.
 */
export function complete(step: CoreStep): void {
  if (state.completed.has(step)) return;
  const next = new Set(state.completed);
  next.add(step);
  const prev = state;
  state = { ...state, completed: next };
  for (const fn of listeners) fn(state, prev);
}

/** Test seam — the page never calls this. */
export function resetState(): void {
  state = { ...INITIAL, completed: new Set() };
  listeners.clear();
}

export function coreProgress(): { done: number; total: number; allDone: boolean } {
  const done = CORE_STEPS.filter((s) => state.completed.has(s)).length;
  return { done, total: CORE_STEPS.length, allDone: done === CORE_STEPS.length };
}
