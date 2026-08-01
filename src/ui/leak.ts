/**
 * Exhibit 1 — why aggregates are not privacy.
 *
 * Two panels, one argument. The differencing attack shows that publishing only
 * totals leaks an individual exactly; the k-anonymity panel shows that the
 * obvious alternative — anonymise the table harder — leaks too, and keeps
 * leaking as k rises. Both run against the real code: the attack calls the same
 * `release` path every other exhibit uses, and k is measured off the generalised
 * table rather than asserted.
 */
import { differencingAttack } from '../dp/attack';
import { EMPLOYEES, HIGH_EARNER_THRESHOLD, sumSalary, TARGET_ID } from '../dp/database';
import { analyse, classOf, LEVELS } from '../dp/kanon';
import { lattice, laplaceScale, type MechanismSpec } from '../dp/mechanism';
import { epsAt, EPS_LADDER } from '../dp/params';
import { byId, clear, el, layered, money, scroller, stat, statRow, verdict } from './dom';
import { randomnessNote, sharedRng } from './random';
import { complete } from './state';

const rng = sharedRng();

const DP_EPS_INDEX = EPS_LADDER.indexOf('1');

const dpSpec = (): MechanismSpec => ({
  kind: 'discrete-laplace',
  eps: epsAt(DP_EPS_INDEX),
  delta: 0,
  sensitivity: sumSalary.sensitivity,
  gridSteps: 50,
});

const exactSpec = (): MechanismSpec => ({ ...dpSpec(), kind: 'exact' });

export function initLeak(): void {
  renderTable();
  wireAttack();
  wireAnonymity();
}

function renderTable(): void {
  const table = el('table', { class: 'data-table' }, [
    el('caption', {
      text: 'The whole database. Twelve records, so every number this page prints can be checked by hand.',
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Name' }),
        el('th', { scope: 'col', text: 'Department' }),
        el('th', { scope: 'col', text: 'Age' }),
        el('th', { scope: 'col', text: 'ZIP' }),
        el('th', { scope: 'col', class: 'numeric', text: 'Salary' }),
      ]),
    ]),
    el(
      'tbody',
      {},
      EMPLOYEES.map((e) =>
        el('tr', e.id === TARGET_ID ? { class: 'row--target' } : {}, [
          el('th', { scope: 'row' }, [
            document.createTextNode(e.name),
            ...(e.id === TARGET_ID ? [el('span', { class: 'tag', text: 'the target' })] : []),
          ]),
          el('td', { text: e.dept }),
          el('td', { class: 'numeric', text: String(e.age) }),
          el('td', { class: 'numeric', text: e.zip }),
          el('td', { class: 'numeric', text: money(e.salary) }),
        ]),
      ),
    ),
  ]);
  const mount = byId('leak-table');
  clear(mount);
  mount.append(scroller('The toy payroll database', table));
}

function wireAttack(): void {
  const out = byId('leak-out');
  const modeSelect = byId<HTMLSelectElement>('leak-mode');

  const run = (): void => {
    const dp = modeSelect.value === 'dp';
    const spec = dp ? dpSpec() : exactSpec();
    const trials = dp ? 5 : 1;
    const results = Array.from({ length: trials }, () => differencingAttack(rng, spec, EMPLOYEES, TARGET_ID));

    clear(out);
    const first = results[0];

    out.append(
      el('ol', { class: 'steps' }, [
        el('li', {}, [
          el('p', { class: 'steps__what', text: 'Query 1 — "What is the total payroll?"' }),
          el('p', { class: 'steps__val mono', text: money(first.answerAll) }),
        ]),
        el('li', {}, [
          el('p', {
            class: 'steps__what',
            text: 'Query 2 — "What is the total payroll for everyone except Alice Nguyen?"',
          }),
          el('p', { class: 'steps__val mono', text: money(first.answerWithout) }),
        ]),
        el('li', {}, [
          el('p', { class: 'steps__what', text: 'Subtract. Neither answer named a salary; the difference is one.' }),
          el('p', { class: 'steps__val mono steps__val--big', text: money(first.recovered) }),
        ]),
      ]),
    );

    if (!dp) {
      // The attacker succeeded, so this is an ALARM even though it "worked":
      // colour tracks system integrity here, never the return value.
      // `first.exact` is the comparison `recovered === truth`, made by the
      // attack itself. The headline is derived from it rather than written
      // beside it, so "recovered exactly" cannot be printed over a subtraction
      // that did not come out exact.
      out.append(
        layered(
          'bad',
          first.exact
            ? `Alice's salary recovered exactly: ${money(first.recovered)}`
            : `Alice's salary recovered to within ${money(Math.abs(first.error))}: ${money(first.recovered)}`,
          {
            observation: first.exact
              ? `Her real salary is ${money(first.truth)}, and the subtraction returned it with an error of zero.`
              : `Her real salary is ${money(first.truth)}, and the subtraction returned ${money(first.recovered)}.`,
            meaning:
              'Two queries the system was built to answer, neither of which mentions an individual, and the ' +
              'difference is a payslip. Publishing only aggregates is not privacy — which is the failure ' +
              'differential privacy was defined to close.',
            details: [
              'Note what would not have helped. Reviewing which aggregates get published does not fix this: both ' +
                'queries are ones any reasonable review would approve, and the attack needs no side knowledge about ' +
                'the other eleven people. The problem is not the choice of aggregate, it is that exact answers to ' +
                'overlapping questions determine their difference.',
              'Nor does a rule against "small" groups. The attack works at any database size, because it never asks ' +
                'about a small group — it asks two questions about large ones and subtracts. Restricting queries to ' +
                'groups above some size is a rule an attacker satisfies trivially.',
            ],
          },
        ),
      );
    } else {
      const spread = results.map((r) => r.recovered);
      const errors = results.map((r) => Math.abs(r.error));
      const median = [...errors].sort((a, b) => a - b)[Math.floor(errors.length / 2)];
      // Read off the runs, not asserted. "Five different answers" is a claim
      // about what just happened; the noise is random, so a run of this attack
      // is entitled to a coincidence, and the panel reports the one it got
      // rather than printing the expected sentence either way.
      const distinct = new Set(spread).size;
      const grid = lattice(dpSpec()).grid;
      const close = errors.filter((e) => e <= grid).length;
      out.append(
        layered('ok', `Attack failed — ${trials} runs, ${distinct} different ${distinct === 1 ? 'answer' : 'answers'}`, {
          observation:
            `Her real salary is ${money(first.truth)}, and the ${trials} runs miss it by about ${money(median)} each` +
            (close > 0
              ? `. ${close === 1 ? 'One run landed' : `${close} runs landed`} within one ${money(grid)} lattice step ` +
                `of it, which is luck the attacker cannot use: nothing in the released numbers says which run was ` +
                `the close one.`
              : '.'),
          meaning:
            `Each answer now carries Laplace noise at scale b = Δ/ε = ${money(laplaceScale(dpSpec()))}. The attack ` +
            `still runs — nothing stops the attacker subtracting — it just stops meaning anything, because the ` +
            `difference of two noisy answers is itself noisy.`,
          details: [
            'The noise is calibrated to the declared salary range, not to what anyone actually earns. A sensitivity ' +
              'read off the observed data would itself be a function of the data and would leak it — the exercise in ' +
              'Exhibit 4 makes that choice explicitly.',
            // The attack is two queries, so it is two charges. Saying so here
            // stops the DP-mode panel reading as though privacy became free the
            // moment it started working.
            `Note what this cost. The attack asks two questions, so it spends twice: ε = 1 each, ε = 2 in total by ` +
              `basic composition. Against the strict budget in Exhibit 5 that is more than the whole session, and the ` +
              `ledger there would refuse the second query outright. Failing to recover Alice's salary is not the same ` +
              `as the attack being harmless — it stopped working because someone paid for it to.`,
            randomnessNote(),
          ],
        }),
        el('ul', { class: 'chip-row', 'aria-label': 'Five independent runs of the same attack' },
          spread.map((v, i) =>
            el('li', { class: 'chip' }, [
              el('span', { class: 'chip__label', text: `run ${i + 1}` }),
              el('span', { class: 'chip__value mono', text: money(v) }),
            ]),
          ),
        ),
      );
    }
    // Established by running it, in either mode: the contrast is the lesson.
    complete('differencing');
  };

  byId('leak-run').addEventListener('click', run);
  modeSelect.addEventListener('change', run);
  clear(out);
  out.append(
    verdict('idle', 'Nothing run yet', 'Pick a mode and run the attack. Start with the exact answers.'),
  );
}

function wireAnonymity(): void {
  const select = byId<HTMLSelectElement>('kanon-level');
  clear(select);
  for (const l of LEVELS) select.append(el('option', { value: l.id, text: l.label }));
  select.value = 'k3';

  const out = byId('kanon-out');

  const render = (): void => {
    const level = LEVELS.find((l) => l.id === select.value)!;
    const report = analyse(level);
    const cls = classOf(report, TARGET_ID);
    clear(out);

    out.append(
      el('p', { class: 'muted', text: level.note }),
      statRow(
        [
          stat('Measured k', String(report.k), 'smallest equivalence class'),
          stat('Classes', String(report.classes.length)),
          stat('Records whose salary band is disclosed', `${report.recordsLeaked} of ${EMPLOYEES.length}`),
        ],
        'k-anonymity measurements for the selected generalisation',
      ),
    );

    const table = el('table', { class: 'data-table' }, [
      el('caption', {
        text:
          'Every equivalence class, its size, and whether its members agree on the sensitive attribute. ' +
          'A unanimous class discloses that attribute for all of its members.',
      }),
      el('thead', {}, [
        el('tr', {}, [
          el('th', { scope: 'col', text: 'Department' }),
          el('th', { scope: 'col', text: 'Age' }),
          el('th', { scope: 'col', text: 'ZIP' }),
          el('th', { scope: 'col', class: 'numeric', text: 'Size' }),
          el('th', { scope: 'col', text: 'Salary band' }),
        ]),
      ]),
      el(
        'tbody',
        {},
        report.classes.map((c) =>
          el('tr', c.homogeneous ? { class: 'row--leak' } : {}, [
            el('th', { scope: 'row', text: c.dept }),
            el('td', { text: c.age }),
            el('td', { text: c.zip }),
            el('td', { class: 'numeric', text: String(c.members.length) }),
            el('td', {}, [
              el('span', { class: 'marker', 'aria-hidden': 'true', text: c.homogeneous ? '✗ ' : '✓ ' }),
              document.createTextNode(c.homogeneous ? `unanimous — ${c.leaked}` : 'mixed — nothing disclosed'),
            ]),
          ]),
        ),
      ),
    ]);
    out.append(scroller('Equivalence classes at the selected generalisation', table));

    if (cls?.homogeneous) {
      out.append(
        layered('bad', `${report.k}-anonymous, and Alice's salary band is still disclosed`, {
          observation:
            `An attacker who knows only that Alice is ${cls.age === 'any' ? '' : `aged ${cls.age}, `}in ` +
            `${cls.dept.toLowerCase()} and in ZIP ${cls.zip} finds her class, and every one of its ` +
            `${cls.members.length} members ${cls.leaked}.`,
          meaning:
            'The k guarantee is fully intact and the sensitive value fell out anyway. That is the homogeneity ' +
            'attack, and it is why the field stopped constraining the released table and started constraining the ' +
            'mechanism that produces the answers.',
          details: [
            'k-anonymity constrains how many records share a set of quasi-identifiers. It says nothing whatever ' +
              'about whether those records agree on the sensitive attribute — and correlation between the two is the ' +
              'normal case, not the unlucky one. People who share a department and an age band tend to share a pay ' +
              'band; that is what departments and pay scales are.',
            'Raising k does not fix it and can make it worse, because larger classes are built by generalising ' +
              'harder, which groups more similar people together. The measured k rises, the disclosure stays, and ' +
              'the metric reports success throughout. Machanavajjhala et al. (2007) proposed ℓ-diversity as a ' +
              'repair, and it is patched again by t-closeness — a pattern of repairs to a definition that was ' +
              'never quantifying over what an attacker already knew.',
          ],
        }),
      );
    } else {
      out.append(
        layered('warn', `${report.k}-anonymous, and Alice's class is mixed`, {
          observation:
            'Her band is not disclosed at this generalisation — her equivalence class contains people on both ' +
            'sides of the threshold.',
          meaning:
            'Nothing about k guaranteed that. It is luck: the same k with a different distribution of salaries ' +
            'discloses her, and other classes in this very table are still unanimous. A guarantee that holds by ' +
            'accident is not one you can promise anybody.',
          details: [
            'This is the sharpest version of the argument, because the metric is being met and the outcome is ' +
              'still not under anyone’s control. Change one salary in the table and the disclosure returns without ' +
              'k moving at all — so k is not measuring the thing that matters, even when the news is good.',
          ],
        }),
      );
    }

    out.append(
      el('p', {
        class: 'note',
        text:
          `"Salary band" here means above or below ${money(HIGH_EARNER_THRESHOLD)} — the same threshold the counting ` +
          `query in Exhibit 2 uses, so the two exhibits are talking about the same secret. Differential privacy makes no ` +
          `promise about the released table at all — it promises that whatever is released would have looked much the ` +
          `same had Alice never existed.`,
      }),
    );
  };

  select.addEventListener('change', render);
  render();
}
