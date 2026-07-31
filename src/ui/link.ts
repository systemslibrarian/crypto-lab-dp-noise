/**
 * One ε, one sensitivity, one ledger — the causal model made visible.
 *
 * Each exhibit used to keep its own ε, so a reader could establish "small ε
 * means overlapping distributions" in Exhibit 2 and "small ε means a useless
 * payroll figure" in Exhibit 4 without ever connecting them. Linked mode makes
 * the two facts one fact: move ε anywhere and the definition, the guessing game
 * and the utility dial all move with it, and this readout says what the number
 * has just done to privacy, to utility, to an attacker and to the budget.
 *
 * The hierarchy in the note is the thing this page most wants a reader to keep,
 * and it is stated in that order every time, because the seductive shortcut —
 * "ε is how much noise you add" — is right about the arithmetic and wrong about
 * the meaning, and it collapses the moment sensitivity changes:
 *
 *   1. ε bounds how much one person can change the probability of any output.
 *   2. Δ measures how much one person can change this particular query.
 *   3. The mechanism combines them into the noise it actually adds — b = Δ/ε.
 *   4. Composition accounts for what repeated releases spend.
 *
 * The readout is repeated beside every linked control rather than pinned to the
 * viewport. A sticky bar is the obvious reading of "persistent", and it is the
 * wrong one here: it would sit under an already-sticky site header, eat vertical
 * space on the phone layout the charts were re-proportioned for, and overlay
 * content for a reader who has zoomed. Rendering the same component wherever ε
 * is adjustable achieves the same thing — it is always on screen when it is
 * relevant — without taking a pixel from anyone.
 */
import { queryById } from '../dp/database';
import { laplaceScale, worstCasePosterior, type MechanismSpec } from '../dp/mechanism';
import { epsAt, epsLabel } from '../dp/params';
import { toNumber } from '../dp/rational';
import { byId, clear, el, money, num, pct, stat, statRow } from './dom';
import { quote } from './ledger';
import { getState, subscribe, update } from './state';

/**
 * Keep a per-exhibit ε slider and the shared ε in step.
 *
 * In linked mode the slider is a view of the store: local input writes through,
 * and a change made in another exhibit writes back. Unlinked, the slider is
 * exactly what it always was, and the store is left alone — which is what makes
 * "explore" a real route rather than a label.
 */
export type EpsChangeSource = 'reader' | 'sync';

/**
 * The `source` argument is the whole reason this signature is not simpler.
 *
 * Linking means a reader who moves the dial's ε also moves the definition's,
 * which is the point. It must not mean that moving the dial *establishes* the
 * definition step — the navigator's claim is that a step is ticked only by the
 * reader's own interaction with that exhibit, and a sync-driven re-render
 * satisfying that check would quietly make the claim false. So the render
 * callback is told which of the two happened and each exhibit decides for
 * itself; only `'reader'` may complete anything.
 */
export function bindEpsSlider(
  slider: HTMLInputElement,
  valueId: string,
  render: (source: EpsChangeSource) => void,
): void {
  const paint = (): void => {
    byId(valueId).textContent = epsLabel(Number(slider.value));
  };

  slider.addEventListener('input', () => {
    if (getState().linked) update({ epsIndex: Number(slider.value) });
    paint();
    render('reader');
  });

  subscribe((next, prev) => {
    if (!next.linked) return;
    const changed = next.epsIndex !== prev.epsIndex || next.linked !== prev.linked;
    if (!changed) return;
    if (Number(slider.value) === next.epsIndex) return;
    slider.value = String(next.epsIndex);
    paint();
    render('sync');
  });

  if (getState().linked) slider.value = String(getState().epsIndex);
  paint();
}

/**
 * The readout itself: ε, the current query's Δ, the noise those two produce,
 * what an attacker gets for it, and what one release would cost the ledger.
 */
export function readout(): HTMLElement {
  const state = getState();
  const eps = toNumber(epsAt(state.epsIndex));
  const q = queryById(state.queryId);
  const asMoney = q.id === 'sum-salary';
  const fmt = (v: number): string => (asMoney ? money(v) : num(v, Number.isInteger(v) ? 0 : 2));
  const spec: MechanismSpec = {
    kind: 'discrete-laplace',
    eps: epsAt(state.epsIndex),
    delta: 0,
    sensitivity: q.sensitivity,
    gridSteps: 1,
  };
  const b = laplaceScale(spec);
  const cost = quote(eps, q.label);

  const box = el('div', { class: 'readout', role: 'group', 'aria-label': 'The linked privacy parameters' }, [
    el('p', { class: 'readout__formula mono' }, [
      el('span', { class: 'readout__formula-text', text: 'noise scale b = Δ / ε = ' }),
      el('span', { class: 'readout__formula-values', text: `${fmt(q.sensitivity)} / ${eps} = ${fmt(b)}` }),
    ]),
    statRow(
      [
        stat('ε', String(eps), state.linked ? 'linked across exhibits' : 'this exhibit only'),
        stat('Query', q.label.replace(/\?$/, ''), 'the question being asked'),
        stat('Sensitivity Δ', fmt(q.sensitivity), 'declared, not measured'),
        stat('Noise scale b', fmt(b), 'Δ/ε, discrete Laplace'),
        stat('Belief can reach', pct(worstCasePosterior(0.5, eps)), 'from an even prior'),
        stat(
          'One release would cost',
          `${num(cost.total, 3)} of ${num(cost.budget, 2)}`,
          cost.wouldRefuse ? 'over budget — would be refused' : `by ${cost.rule} composition`,
        ),
      ],
      'The current privacy parameters and what they cost',
    ),
    el('p', { class: 'note readout__note' }, [
      el('strong', { text: 'Read it in this order. ' }),
      document.createTextNode(
        'ε bounds how much one person can change the probability of any output; Δ measures how much one person can ' +
          'change this particular query; the mechanism combines them into the noise it adds; composition accounts for ' +
          'what repeated releases spend. ε is not an amount of noise — swap the query above and watch b move by five ' +
          'orders of magnitude while ε does not move at all.',
      ),
    ]),
  ]);

  if (!state.linked) {
    box.append(
      el('p', {
        class: 'note',
        text:
          'Linked controls are off, so each exhibit keeps its own ε and this readout reports the shared one only. ' +
          'Turn linking on to move all three together.',
      }),
    );
  }
  return box;
}

/** A checkbox for linked mode, rendered next to the readout. */
function linkToggle(): HTMLElement {
  const id = 'link-toggle';
  const input = el('input', { type: 'checkbox', id });
  input.checked = getState().linked;
  input.addEventListener('change', () => update({ linked: input.checked }));
  return el('div', { class: 'field field--inline' }, [
    input,
    el('label', { for: id, text: 'Link ε across Exhibits 2, 3 and 4' }),
  ]);
}

/**
 * Mount the readout everywhere it is wanted. `[data-readout]` elements are
 * declared in the markup next to each linked control, and the one in the path
 * navigator is re-created on every navigator render, so it is looked up fresh.
 */
export function initLink(): void {
  const paint = (): void => {
    document.querySelectorAll<HTMLElement>('[data-readout]').forEach((mount) => {
      clear(mount);
      mount.append(readout());
      if (mount.dataset.readout === 'primary') mount.append(linkToggle());
    });
  };
  paint();
  subscribe(paint);
}
