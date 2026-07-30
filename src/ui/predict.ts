/**
 * Prediction checks: four places where the page asks you to commit to an answer
 * before it shows one.
 *
 * Every wrong option gets a real explanation, because the wrong answers here
 * are the actual misconceptions about differential privacy — that ε is a
 * quantity of noise, that anonymising harder eventually works, that averaging
 * repeated answers is somehow prevented by the mechanism. Saying why each one
 * is wrong is the point of asking.
 *
 * Options are buttons rather than radios so that every option is its own Tab
 * stop; `aria-pressed` carries which one is chosen. They stay enabled after
 * answering so a reader can read the reasoning behind the ones they did not pick.
 */
import { byId, clear, el, verdict } from './dom';

interface PredictOption {
  text: string;
  correct: boolean;
  why: string;
}

interface Prediction {
  mount: string;
  question: string;
  options: PredictOption[];
}

const PREDICTIONS: Prediction[] = [
  {
    mount: 'pr-aggregate',
    question:
      'A payroll system will only ever publish totals across all twelve employees — never one person\'s salary. How much can an attacker learn about Alice\'s pay?',
    options: [
      {
        text: 'Nothing exact — totals average her in with eleven others.',
        correct: false,
        why: 'This is the intuition the whole field was founded to dislodge. Two totals that each average over many people can be *subtracted*, and the difference is one person. Exhibit 1 does it: two innocuous aggregates, one subtraction, Alice\'s salary to the dollar.',
      },
      {
        text: 'Her exact salary, from two totals and one subtraction.',
        correct: true,
        why: 'Right. Ask for the total payroll, then the total payroll for everyone who is not Alice. Neither answer names her; the difference is her exact pay. No amount of care about *which* aggregates get published fixes this, which is why the answers themselves have to change.',
      },
      {
        text: 'Only a rough range, unless the attacker already knows the other eleven salaries.',
        correct: false,
        why: 'No side knowledge is needed. The differencing attack needs only two queries the system was designed to answer, and it recovers the exact figure — not a range.',
      },
    ],
  },
  {
    mount: 'pr-epsilon',
    question: 'What does ε actually measure?',
    options: [
      {
        text: 'How much noise gets added to the answer.',
        correct: false,
        why: 'Close enough to be dangerous. Noise is how ε is *achieved*, not what it means — and the amount of noise also depends on the query\'s sensitivity Δ, so the same ε means wildly different noise for a headcount and for a payroll total. ε measures something about the observer, not about the answer.',
      },
      {
        text: 'How much more likely any output becomes when one person joins the data.',
        correct: true,
        why: 'That is the definition. For every possible output, the probability of seeing it changes by a factor of at most e^ε when one person is added or removed. Exhibit 2 draws both probabilities and their ratio, and you can watch the ratio stop dead at the ceiling.',
      },
      {
        text: 'The probability that someone is re-identified from the release.',
        correct: false,
        why: 'ε is not a probability — it is not even bounded by one; deployments ship ε = 17. It bounds a *ratio* of probabilities, which then bounds how far anyone\'s belief about you can move. Exhibit 2 computes that belief bound from ε.',
      },
    ],
  },
  {
    mount: 'pr-anon',
    question:
      'Generalise the table until every record looks like at least five others. What has an attacker who knows Alice\'s age, department and ZIP learned about her salary?',
    options: [
      {
        text: 'Nothing — she is one of six indistinguishable people.',
        correct: false,
        why: 'Only if those six disagree. k-anonymity constrains how many people share Alice\'s quasi-identifiers; it says nothing about whether they share her *salary*. Exhibit 1 generalises this exact table until k = 6 and every class is still unanimous.',
      },
      {
        text: 'Her salary band, if everyone in her group happens to earn similarly.',
        correct: true,
        why: 'The homogeneity attack, and it is not a coincidence — people who share a department and an age band tend to share a pay band. The k guarantee is fully intact and the sensitive value falls out anyway, which is why the field moved from constraining the table to constraining the mechanism.',
      },
      {
        text: 'Her salary, but only because this table is unusually small.',
        correct: false,
        why: 'Size is not the flaw. A larger table gives larger equivalence classes and the same failure, and the attack gets *easier* with more quasi-identifier columns, not harder. Netflix and AOL both released far larger tables and both were re-identified.',
      },
    ],
  },
  {
    mount: 'pr-repeat',
    question:
      'A mechanism answers "total payroll" with fresh Laplace noise every time. You ask it the same question two thousand times and average the answers. What do you get?',
    options: [
      {
        text: 'The same protection — every answer was independently private.',
        correct: false,
        why: 'Each answer is private. The *set* of them is not, and privacy is a property of what the analyst walks away with. Independent noise averages out at 1/√n, so two thousand answers pin the true total down to about a fortieth of the noise on any one of them.',
      },
      {
        text: 'The true total, near enough — the noise averages away.',
        correct: true,
        why: 'Exhibit 5 runs it: the running mean converges on the true payroll and the error falls as 1/√n. This is why ε has to be a budget that is *spent*, and why the only correct response to an exhausted budget is to stop answering.',
      },
      {
        text: 'Nothing useful — Laplace noise is heavy-tailed enough to resist averaging.',
        correct: false,
        why: 'Laplace has finite variance, so the central limit theorem applies exactly as it would to anything else. Heavy tails slow convergence at small n; they do not stop it.',
      },
    ],
  },
];

let seq = 0;

export function initPredictions(): void {
  for (const p of PREDICTIONS) render(p);
}

function render(p: Prediction): void {
  const mount = byId(p.mount);
  const qId = `predict-q-${++seq}`;
  const out = el('div', { class: 'predict__out', role: 'status', 'aria-live': 'polite' });

  const buttons = p.options.map((opt, i) =>
    el(
      'button',
      { class: 'predict__opt', type: 'button', id: `${p.mount}-${i}`, 'aria-pressed': 'false' },
      [document.createTextNode(opt.text)],
    ),
  );

  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const opt = p.options[i];
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === btn));
      clear(out);
      out.append(verdict(opt.correct ? 'ok' : 'bad', opt.correct ? 'Correct' : 'Not quite', opt.why));
    });
  });

  clear(mount);
  mount.append(
    el('p', { class: 'predict__kicker', text: 'Predict first' }),
    el('p', { class: 'predict__q', id: qId, text: p.question }),
    el('div', { class: 'predict__opts', role: 'group', 'aria-labelledby': qId }, buttons),
    out,
  );
}
