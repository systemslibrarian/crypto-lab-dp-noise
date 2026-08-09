/**
 * Exhibit 4b — where does Δ come from? Make the learner answer.
 *
 * The page already *told* the reader that sensitivity comes from a declared
 * clamp rather than the observed data, and told them in the right place. Being
 * told is not the same as having decided. This panel makes it a decision with
 * consequences the reader can read off the screen: pick the bound, see what it
 * does to the noise and to the bias, then meet a record that does not fit and
 * choose what happens to it.
 *
 * The third option on that second decision — quietly raise the bound to fit the
 * data — is offered deliberately, because it is the option a well-meaning
 * engineer actually picks. It is then refused, with the reason: Δ computed from
 * the observed maximum is a function of the data, so the noise scale is a
 * function of the data, so the release leaks the record it exists to protect.
 * Refusing an option the reader has already chosen teaches it far better than
 * never offering it.
 */
import {
  analyseClamp,
  analyseDecision,
  BOUND_CHOICES,
  LATE_HIRE,
  PAYROLL_WITH_LATE_HIRE,
  type OutOfRangeChoice,
} from '../dp/bounds';
import { epsAt } from '../dp/params';
import { toNumber } from '../dp/rational';
import { chartData } from './chart';
import { byId, clear, el, layered, money, stat, statRow, verdict } from './dom';
import { getState, subscribe } from './state';

const DECISIONS: readonly {
  id: OutOfRangeChoice;
  label: string;
  headline: string;
  observation: (bias: number, delta: number) => string;
  meaning: string;
  details: readonly string[];
  kind: 'ok' | 'warn' | 'bad';
}[] = [
  {
    id: 'clip',
    label: 'Clip her to the declared bound',
    kind: 'ok',
    headline: 'Private, and biased by a known amount',
    observation: (bias, delta) =>
      `Her contribution is counted as ${money(delta)} instead of ${money(LATE_HIRE.salary)}, so the released total ` +
      `runs ${money(bias)} low before any noise is added.`,
    meaning:
      'This is the standard answer and the one most libraries implement. Δ stays exactly what was declared, so the ' +
      'privacy guarantee is untouched — you have paid for it in accuracy instead, with a bias you can state, bound ' +
      'and disclose.',
    details: [
      'The bias is deterministic, not random, which is the important difference: noise averages away over repeated ' +
        'releases and clipping bias does not. An analyst who averages a thousand of these releases converges on the ' +
        'clamped total, not on the true one. That is a reason to publish the bound alongside the answer, so a reader ' +
        'knows which quantity they have been given.',
      'Clipping is also what makes the sum a bounded-sensitivity query at all. Without it the query has no finite Δ, ' +
        'no valid Laplace calibration exists, and the correct response to a request for it is refusal rather than a ' +
        'guess at a plausible range.',
    ],
  },
  {
    id: 'reject',
    label: 'Drop her record from this release',
    kind: 'warn',
    headline: 'Private, but you are now answering a different question',
    observation: (bias) =>
      `Her record is excluded entirely, so the released total runs ${money(bias)} low — the whole of her salary, not ` +
      `just the part above the bound.`,
    meaning:
      'Dropping records that fail a bound declared in advance is a deterministic rule, so the mechanism is still ' +
      'differentially private at the same Δ. What it costs is meaning: the number now describes the payroll of ' +
      'everyone earning under the bound, and calling that "the total payroll" would be false.',
    details: [
      'The privacy argument holds only because the rule is fixed before the data is seen. "Drop anyone above ' +
        '$250,000" is part of the query. "Drop whichever record looks like an outlier" is a data-dependent decision, ' +
        'and it puts you back in the same failure as reading Δ off the maximum.',
      'There is a second, subtler cost. Exclusion correlates with being unusual, and the people a bound excludes are ' +
        'rarely a random sample — here it is the only executive. A release that systematically omits a category is a ' +
        'utility failure and sometimes an equity one, and neither shows up anywhere in the ε.',
    ],
  },
  {
    id: 'expand',
    label: 'Raise the bound so it fits her',
    kind: 'bad',
    headline: 'Refused — this is not a private calibration',
    observation: (_bias, delta) =>
      `Δ would become ${money(delta)}, which is Mara's actual salary. The mechanism's noise scale would now be a ` +
      `direct readout of the highest-paid person in the database.`,
    meaning:
      'This is the failure the whole exercise exists for. Δ must be chosen without looking at the data; the moment it ' +
      'is derived from the observed maximum, the released answer carries information about the record it was supposed ' +
      'to protect, and the ε printed beside it is not true of the mechanism you actually ran.',
    details: [
      'The attack is direct. Two neighbouring databases — one with Mara, one without — no longer produce answers from ' +
        'the same distribution shifted slightly; they produce answers from distributions with different scale ' +
        'parameters, b = $480,000/ε against b = $155,000/ε. An attacker who sees the spread of a few releases reads ' +
        'the top salary off the noise itself, and no amount of noise fixes it, because the noise is the channel.',
      'The fix is never to compute the bound more cleverly from the same data. It is to choose it from outside the ' +
        'data — a published salary band, a contractual maximum, a regulatory ceiling, a prior year\'s release that ' +
        'was itself differentially private — and then to clip. If you genuinely must learn the bound from the data, ' +
        'that is its own query and it must be paid for out of the same budget, with its own ε, before the sum is asked.',
    ],
  },
];

export function initBounds(): void {
  const boundSelect = byId<HTMLSelectElement>('bound-hi');
  clear(boundSelect);
  for (const hi of BOUND_CHOICES) {
    boundSelect.append(
      el('option', {
        value: String(hi),
        text: `${money(hi)} — declared in advance`,
      }),
    );
  }
  boundSelect.value = '250000';

  const buttons = DECISIONS.map((d) =>
    el('button', { class: 'predict__opt', type: 'button', id: `bound-${d.id}`, 'aria-pressed': 'false' }, [
      document.createTextNode(d.label),
    ]),
  );
  const choiceMount = byId('bound-choices');
  clear(choiceMount);
  choiceMount.append(
    el('div', { class: 'predict__opts', role: 'group', 'aria-label': 'What happens to the out-of-range record' }, buttons),
  );

  let chosen: OutOfRangeChoice | null = null;

  const render = (): void => {
    renderBound(Number(boundSelect.value));
    renderDecision(Number(boundSelect.value), chosen);
  };

  boundSelect.addEventListener('change', render);
  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      chosen = DECISIONS[i].id;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === btn));
      renderDecision(Number(boundSelect.value), chosen);
    });
  });

  // ε is shared, so the bias/noise balance shifts under the reader as they move
  // the dial — which is the point: the right bound is not a property of the
  // data alone.
  subscribe((next, prev) => {
    if (next.epsIndex !== prev.epsIndex) render();
  });

  render();
}

function renderBound(hi: number): void {
  const eps = toNumber(epsAt(getState().epsIndex));
  const a = analyseClamp(PAYROLL_WITH_LATE_HIRE, hi, eps);
  const out = byId('bound-out');
  clear(out);

  out.append(
    statRow(
      [
        stat('Declared range', `$0 – ${money(hi)}`, 'chosen before seeing the data'),
        stat('Sensitivity Δ', money(a.sensitivity), 'what one person can move'),
        stat('Noise scale b = Δ/ε', money(a.noiseScale), `at ε = ${eps}`),
        stat('Records clipped', `${a.clippedCount} of ${PAYROLL_WITH_LATE_HIRE.length}`, 'salaries above the bound'),
        stat('Clipping bias', money(a.clipBias), 'systematic, does not average away'),
        stat('True total', money(a.trueSum), `released as ${money(a.clampedSum)} before noise`),
      ],
      'What the declared bound does to privacy and to accuracy',
    ),
  );

  const rows = BOUND_CHOICES.map((h) => {
    const c = analyseClamp(PAYROLL_WITH_LATE_HIRE, h, eps);
    return [
      money(h),
      money(c.sensitivity),
      money(c.noiseScale),
      String(c.clippedCount),
      money(c.clipBias),
      money(c.totalTypicalError),
    ];
  });

  out.append(
    chartData({
      summary: 'Every bound at this ε, side by side',
      caption: `Each declared bound at ε = ${eps}: the noise it forces, the records it clips, and the bias that costs.`,
      headers: [
        'Declared bound',
        'Δ',
        'Noise scale b',
        'Records clipped',
        'Clipping bias',
        'Bias + typical noise',
      ],
      rows,
      trend:
        'Raising the bound raises the noise in direct proportion and lowers the clipping bias in steps, so the last ' +
        'column falls and then rises again.',
      notice:
        'There is no bound that is simply correct — the two costs move in opposite directions, and where they balance ' +
        'depends on ε, which is set by a privacy argument rather than by this table. The last column adds a ' +
        'deterministic bias to a typical random error, so treat it as a way of comparing bounds, not as an error bar.',
    }),
    el('p', { class: 'note' }, [
      el('strong', { text: 'Where this bound may not come from: ' }),
      document.createTextNode(
        'the database. Every option above is a number an analyst can defend without opening the table — a published ' +
          'band, a contractual ceiling, a regulator’s figure. The moment the bound is read off the salaries, Δ is a ' +
          'function of the data and the guarantee is gone.',
      ),
    ]),
  );
}

function renderDecision(hi: number, chosen: OutOfRangeChoice | null): void {
  const out = byId('bound-decision-out');
  clear(out);

  if (chosen === null) {
    // Whether she is out of range depends on the bound the reader declared, and
    // at $500,000 she is not: $480,000 fits. The sentence used to assert "above
    // your declared bound of $500,000" unconditionally, which is arithmetically
    // false and contradicts the `Records clipped: 0 of 13` stat rendered
    // directly above it.
    const fits = LATE_HIRE.salary <= hi;
    out.append(
      verdict(
        'idle',
        fits
          ? `Mara Kowalski earns ${money(LATE_HIRE.salary)} — inside your declared bound of ${money(hi)}`
          : `Mara Kowalski earns ${money(LATE_HIRE.salary)} — above your declared bound of ${money(hi)}`,
        fits
          ? 'A thirteenth person joins the payroll after the bound was published. At this bound her salary fits, ' +
            'so nothing has to give — which is its own lesson about how the bound was chosen. Lower it above and ' +
            'the decision becomes real.'
          : 'A thirteenth person joins the payroll after the bound was published. Nobody gets to un-declare it now. ' +
            'Choose what the mechanism does with her record.',
      ),
    );
    return;
  }

  const spec = DECISIONS.find((d) => d.id === chosen)!;
  const a = analyseDecision(PAYROLL_WITH_LATE_HIRE, hi, chosen);
  // The refusal is driven by `a.private`, which `analyseDecision` derives from
  // where its Δ came from via `isPrivateCalibration`. It is deliberately not
  // keyed to the string 'expand': a banner matched on the option's own name
  // would print the same words however the analysis underneath it came out,
  // and a verdict that cannot come out the other way establishes nothing.
  const refused = !a.private;
  out.append(
    layered(refused ? 'bad' : spec.kind, refused ? 'Refused — this is not a private calibration' : spec.headline, {
      observation: spec.observation(a.bias, a.sensitivity),
      meaning: spec.meaning,
      details: spec.details,
      detailsLabel: refused
        ? 'Why this leaks, and what to do instead'
        : 'Why the details matter — the accounting behind this choice',
    }),
  );

  if (refused) {
    out.append(
      el('p', { class: 'note' }, [
        el('strong', { text: 'Not offered as a valid mode. ' }),
        document.createTextNode(
          'The page will not release an answer calibrated this way, because doing so would print an ε that is not ' +
            'true of the mechanism that produced it. Pick clipping or exclusion, and say in the release which one you ' +
            'chose.',
        ),
      ]),
    );
  } else {
    out.append(
      statRow(
        [
          stat(
            'Δ used',
            money(a.sensitivity),
            a.deltaSource === 'declared' ? 'the declared bound, unchanged' : 'read off the observed maximum',
          ),
          stat('Answer before noise', money(a.preNoiseAnswer), `true total ${money(a.preNoiseAnswer + a.bias)}`),
          stat('Systematic bias', money(a.bias), 'not removable by averaging'),
          stat(
            'Still ε-differentially private',
            a.private ? 'yes' : 'no',
            a.deltaSource === 'declared' ? 'Δ never touched the data' : 'Δ is a function of the data',
          ),
        ],
        'The consequences of this decision',
      ),
    );
  }
}
