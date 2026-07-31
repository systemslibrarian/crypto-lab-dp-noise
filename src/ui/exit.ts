/**
 * The exit challenge: four situations this page has not shown you.
 *
 * The prediction checks scattered through the page are formative — they catch a
 * misconception at the moment it would do damage. This is the summative one, and
 * it is deliberately built from scenarios the page never runs: a different pair
 * of teams, a streaming release, a table with nine matching rows, a Gaussian
 * tail. A learner who has memorised this page's wording cannot pattern-match
 * their way through it; one who has the model will find all four unremarkable.
 *
 * The result is reported as concepts, not as a score. "3 / 4" tells a learner
 * nothing they can act on; "revisit sensitivity — Exhibit 4, switch the query
 * from headcount to total payroll at the same ε" tells them exactly which
 * interaction to go back and run. Every wrong option therefore carries both an
 * explanation and a pointer to one specific thing to do.
 */
import { unitForChallenge } from './curriculum';
import { byId, clear, el, jumpLink, verdict } from './dom';
import { CORE_STEPS, getState, subscribe, update } from './state';

/**
 * A "go and run this" pointer that works on whichever route the reader is on.
 *
 * One revisit target — the k-anonymity panel — is set aside on the guided
 * route, so a plain anchor would scroll a guided reader to a section that is
 * not on their page. This widens the route first and says that it is doing so.
 */
function revisitLink(challengeId: string): HTMLElement {
  const unit = unitForChallenge(challengeId);
  return jumpLink(unit.revisitHref, unit.revisit, {
    onFollow: unit.revisitNeedsExplore ? () => update({ route: 'explore' }) : undefined,
    note: unit.revisitNeedsExplore ? '(switches you to the Explore route, where that panel lives)' : undefined,
  });
}

interface Option {
  readonly text: string;
  readonly correct: boolean;
  readonly why: string;
}

/**
 * Option order is fixed and hand-varied so that the correct answer falls in a
 * different position in each question. Shuffling at runtime would be the other
 * way to do it, and it would make a wrong answer impossible to talk about
 * afterwards — "the second one" would mean something different for every reader
 * in the room, which is exactly the wrong property for an assessment an
 * instructor has to debrief.
 */
interface Question {
  /** Matches a `challengeId` in the curriculum, which supplies concept and revisit. */
  readonly id: string;
  readonly scenario: string;
  readonly options: readonly Option[];
}

const QUESTIONS: readonly Question[] = [
  {
    id: 'x-sensitivity',
    scenario:
      'Two teams at the same company both release a statistic at ε = 1. Team A releases the number of employees who ' +
      'completed training. Team B releases total quarterly revenue. Whose released number is noisier, and what have ' +
      'they not told you?',
    options: [
      {
        text: 'Neither — they used the same ε, so they added the same amount of noise.',
        correct: false,
        why:
          'This is the ε-is-noise misconception in its most reasonable-sounding form. ε fixes a ratio between two ' +
          'output distributions, not a quantity of noise; the quantity comes from Δ/ε, and Δ differs by orders of ' +
          'magnitude between a headcount and a revenue total.',
      },
      {
        text: 'Team B’s, and they have not told you the declared bound on one customer’s revenue.',
        correct: true,
        why:
          'Right on both counts. The same ε buys noise of Δ/ε, and a count has Δ = 1 while a revenue total has Δ ' +
          'equal to whatever range one contributor was clamped to. Without that bound, "ε = 1" does not determine ' +
          'the noise, the accuracy, or even whether the mechanism was calibrated legitimately — which is why an ε ' +
          'quoted without its sensitivity is not yet a claim about anything.',
      },
      {
        text: 'Team A’s, because counts are small numbers so the same noise hurts them more.',
        correct: false,
        why:
          'Relative error and absolute noise are different questions, and this answers neither correctly. Team A’s ' +
          'absolute noise is about 1/ε; Team B’s is the declared revenue bound divided by ε, which is larger by ' +
          'whatever that bound is. Team A’s answer may still be the less *useful* one in relative terms — but that ' +
          'is a separate argument, and it is not what the noise scale says.',
      },
    ],
  },
  {
    id: 'x-composition',
    scenario:
      'A monitoring dashboard answers the same query once a minute, forever, each time with fresh noise at ε = 0.1. ' +
      'Is each answer private? Is the day’s transcript private?',
    options: [
      {
        text: 'Each answer is private at ε = 0.1; the transcript is not private at any useful ε.',
        correct: true,
        why:
          'Exactly the distinction that matters. Privacy is a property of everything the analyst walks away with, ' +
          'not of the last thing they were handed. By basic composition a day of once-a-minute releases costs ' +
          '1,440 × 0.1 = 144, and averaging them drives the error down as 1/√n until the true value is simply ' +
          'readable. "Every individual release is DP" is true here and means nothing.',
      },
      {
        text: 'Both are private — the noise is drawn independently every time, so nothing accumulates.',
        correct: false,
        why:
          'Independence is what makes the attack work, not what prevents it. Independent errors average away; a ' +
          'thousand independent draws pin the true answer to about a thirtieth of the noise on any one of them.',
      },
      {
        text: 'Neither is private, because a query answered repeatedly is not a valid DP mechanism.',
        correct: false,
        why:
          'Too strong in a way that hides the real lesson. Each release genuinely is ε = 0.1 differentially private ' +
          'and the mechanism is entirely valid; what fails is the accounting around it. The fix is a budget that ' +
          'charges every release and refuses when it is exhausted — not a ban on answering twice.',
      },
    ],
  },
  {
    id: 'x-anonymisation',
    scenario:
      'A hospital removes all names and direct identifiers, then generalises the remaining columns until every row ' +
      'matches at least nine others. What has been guaranteed, and what has not?',
    options: [
      {
        text: 'Both — with ten records per group, any individual’s value is one possibility in ten.',
        correct: false,
        why:
          'Only if the ten disagree, which nothing here requires. This is the homogeneity attack, and it is not an ' +
          'edge case: correlation between quasi-identifiers and the sensitive attribute is the normal situation, not ' +
          'the unlucky one.',
      },
      {
        text: 'Neither, because generalisation can always be reversed given enough auxiliary data.',
        correct: false,
        why:
          'Overstated, and it points away from the real problem. The generalisation itself is not reversible; the ' +
          'failure is that a fully intact k guarantee never promised anything about the sensitive column. Blaming ' +
          'reversibility suggests the fix is stronger generalisation, and stronger generalisation does not help.',
      },
      {
        text: 'Guaranteed: nobody is uniquely identifiable by those columns. Not guaranteed: that the sensitive value stays secret.',
        correct: true,
        why:
          'The right split. k-anonymity constrains how many records share a set of quasi-identifiers, and it delivers ' +
          'that. It says nothing about whether those ten records agree on the diagnosis — and people grouped by age, ' +
          'postcode and department often do. When a class is unanimous, the sensitive value falls out for every ' +
          'member with the k guarantee fully intact.',
      },
    ],
  },
  {
    id: 'x-delta',
    scenario:
      'An audit of a Gaussian mechanism finds that the likelihood ratio between two neighbouring databases stays ' +
      'under e^ε across the ordinary range of outputs, but exceeds it in rare tail events. Which parameter is ' +
      'accounting for those events, and what does it mean?',
    options: [
      {
        text: 'σ — a larger standard deviation would push the ratio back under the rails everywhere.',
        correct: false,
        why:
          'Raising σ shrinks the ratio at any fixed output but never changes the shape of the problem: the log-ratio ' +
          'of two Gaussians is a straight line in the output, so it crosses any rail you draw, at some point, for ' +
          'every σ. That is a structural fact about Gaussian tails, not a calibration you can tighten your way out of.',
      },
      {
        text: 'δ — the total probability of landing where the ε promise simply does not hold.',
        correct: true,
        why:
          'That is what δ is for, and it is worth being precise about what it is not. δ is not a small extra amount ' +
          'of privacy loss and not a confidence level on ε; it is the probability mass on outputs where the ε bound ' +
          'fails outright. A Gaussian tail falls faster than any exponential, so no finite ε can bound the ratio ' +
          'everywhere — which is exactly why the Gaussian mechanism is (ε, δ) and the Laplace mechanism is not.',
      },
      {
        text: 'The failure rate of the sampler, which should be fixed rather than accounted for.',
        correct: false,
        why:
          'Nothing has malfunctioned. The mechanism is behaving exactly as specified and the tail events are part of ' +
          'the distribution it is supposed to have. Treating δ as a bug to be fixed rather than a parameter to be ' +
          'declared and defended is how deployments end up quoting an ε that is not true of the mechanism they ran.',
      },
    ],
  },
];

interface Answered {
  readonly correct: boolean;
}

const answers = new Map<string, Answered>();

export function initExit(): void {
  const mount = byId('exit-questions');
  clear(mount);
  for (const q of QUESTIONS) mount.append(renderQuestion(q));
  renderResult();
  // The challenge is always reachable; the banner above it only changes to
  // reflect whether the core path has been walked yet.
  subscribe(renderReadiness);
  renderReadiness();
}

function renderQuestion(q: Question): HTMLElement {
  const out = el('div', { class: 'predict__out', role: 'status', 'aria-live': 'polite' });
  const qId = `${q.id}-q`;

  const buttons = q.options.map((opt, i) =>
    el('button', { class: 'predict__opt', type: 'button', id: `${q.id}-${i}`, 'aria-pressed': 'false' }, [
      document.createTextNode(opt.text),
    ]),
  );

  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const opt = q.options[i];
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === btn));
      answers.set(q.id, { correct: opt.correct });
      clear(out);
      const body = el('div', {}, [el('p', { text: opt.why })]);
      if (!opt.correct) {
        body.append(
          el('p', { class: 'exit__revisit' }, [
            el('strong', { text: 'Go and run this: ' }),
            revisitLink(q.id),
          ]),
        );
      }
      out.append(verdict(opt.correct ? 'ok' : 'bad', opt.correct ? 'Correct' : 'Not quite', body));
      renderResult();
    });
  });

  return el('div', { class: 'predict exit__q' }, [
    el('p', { class: 'predict__kicker', text: unitForChallenge(q.id).concept }),
    el('p', { class: 'predict__q', id: qId, text: q.scenario }),
    el('div', { class: 'predict__opts', role: 'group', 'aria-labelledby': qId }, buttons),
    out,
  ]);
}

function renderResult(): void {
  const out = byId('exit-result');
  clear(out);
  const attempted = QUESTIONS.filter((q) => answers.has(q.id));
  if (!attempted.length) {
    out.append(
      verdict(
        'idle',
        'Four scenarios, none of them from this page',
        'Answer them without scrolling back up. The result names the concept to revisit, not a score.',
      ),
    );
    return;
  }

  const wrong = attempted.filter((q) => !answers.get(q.id)!.correct);
  const remaining = QUESTIONS.length - attempted.length;

  if (!wrong.length && !remaining) {
    out.append(
      verdict(
        'ok',
        'All four transferred',
        'You applied the model to four situations the page never ran: you separated ε from an amount of noise, ' +
          'treated a transcript rather than a release as the unit of privacy, kept a k guarantee distinct from ' +
          'secrecy of the sensitive value, and read δ as the mass where the promise fails. That is the whole lesson.',
      ),
    );
    return;
  }

  const body = el('div', {}, []);
  if (wrong.length) {
    body.append(
      el('p', { text: 'These are the ideas to re-establish, and the exact interaction that establishes each:' }),
      el(
        'ul',
        { class: 'exit__todo' },
        wrong.map((q) =>
          el('li', {}, [
            el('strong', { text: `${unitForChallenge(q.id).concept} — ` }),
            revisitLink(q.id),
          ]),
        ),
      ),
    );
  }
  if (remaining) {
    body.append(el('p', { text: `${remaining} question${remaining === 1 ? '' : 's'} still unanswered.` }));
  }

  out.append(
    verdict(
      wrong.length ? 'warn' : 'idle',
      wrong.length
        ? `${wrong.length} concept${wrong.length === 1 ? '' : 's'} to revisit`
        : `${remaining} to go — nothing to revisit so far`,
      body,
    ),
  );
}

function renderReadiness(): void {
  const mount = byId('exit-readiness');
  clear(mount);
  const { completed } = getState();
  const missing = CORE_STEPS.filter((s) => !completed.has(s));
  if (!missing.length) {
    mount.append(
      el('p', {
        class: 'note',
        text:
          'All four core interactions have been run, so everything these questions ask about has been established ' +
          'somewhere above.',
      }),
    );
    return;
  }
  const count = ['', 'One', 'Two', 'Three', 'Four'][missing.length];
  mount.append(
    el('p', {
      class: 'note',
      text:
        `${count} of the four core interactions ${missing.length === 1 ? 'has' : 'have'} not been run yet. ` +
        'The challenge is open regardless — but a wrong answer here is more useful after the interaction than before it.',
    }),
  );
}
