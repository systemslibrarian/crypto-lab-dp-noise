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
import { laplaceScale, type MechanismSpec } from '../dp/mechanism';
import { epsAt, EPS_LADDER } from '../dp/params';
import { cryptoRng } from '../dp/rng';
import { byId, clear, el, money, scroller, stat, statRow, verdict } from './dom';

const rng = cryptoRng();

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
      out.append(
        verdict(
          'bad',
          `Alice's salary recovered exactly: ${money(first.recovered)}`,
          `Her real salary is ${money(first.truth)}. The error is zero. Two queries the system was built to answer, ` +
            `neither of which mentions an individual, and the subtraction is a payslip. This is the failure differential ` +
            `privacy was defined to close — and note that no amount of care about which aggregates to publish would have helped.`,
        ),
      );
    } else {
      const spread = results.map((r) => r.recovered);
      const errors = results.map((r) => Math.abs(r.error));
      const median = [...errors].sort((a, b) => a - b)[Math.floor(errors.length / 2)];
      out.append(
        verdict(
          'ok',
          `Attack failed — five runs, five different answers`,
          `Her real salary is ${money(first.truth)}. The typical miss is ${money(median)}, because each answer now ` +
            `carries Laplace noise at scale b = Δ/ε = ${money(laplaceScale(dpSpec()))}. The attack still runs; it just ` +
            `stops meaning anything.`,
        ),
        el('ul', { class: 'chip-row', 'aria-label': 'Five independent runs of the same attack' },
          spread.map((v, i) =>
            el('li', { class: 'chip' }, [
              el('span', { class: 'chip__label', text: `run ${i + 1}` }),
              el('span', { class: 'chip__value mono', text: money(v) }),
            ]),
          ),
        ),
        el('p', {
          class: 'note',
          text:
            'The noise is calibrated to the declared salary range, not to what anyone actually earns — a sensitivity ' +
            'read off the data would itself leak the data.',
        }),
      );
    }
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
        verdict(
          'bad',
          `${report.k}-anonymous, and Alice's salary band is still disclosed`,
          `An attacker who knows only that Alice is ${cls.age === 'any' ? '' : `aged ${cls.age}, `}in ` +
            `${cls.dept.toLowerCase()} and in ZIP ${cls.zip} finds her class. Every one of its ${cls.members.length} ` +
            `members ${cls.leaked}, so she does too. The k guarantee is intact and the sensitive value fell out anyway — that ` +
            `is the homogeneity attack, and it is why the field stopped constraining the released table and started ` +
            `constraining the mechanism.`,
        ),
      );
    } else {
      out.append(
        verdict(
          'warn',
          `${report.k}-anonymous, and Alice's class is mixed`,
          'Her band is not disclosed at this generalisation — but nothing about k guaranteed that. It is luck, and the ' +
            'other classes in the table are still unanimous.',
        ),
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
