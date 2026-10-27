/**
 * Exhibit 1, expert card — ℓ-diversity, t-closeness, and what they still leak.
 *
 * The k-anonymity card above this one ends with the homogeneity attack and the
 * sentence "Machanavajjhala et al. proposed ℓ-diversity as a repair, and it is
 * patched again by t-closeness". This card runs that repair, and the repair of
 * the repair, and then breaks both — on a second synthetic table declared for
 * the job, with every band count, distance and verdict computed from the rows
 * of the release selected.
 *
 * It is an expert-route card. The guided route does not show it, the four core
 * steps do not depend on it, and nothing here marks a core step established.
 */
import {
  AGE_QUERIES,
  answerAgeQuery,
  classOfRecord,
  describeRelease,
  intersectReleases,
  neighbourContrast,
  reduceFraction,
  type ClassReport,
  type ReleaseReport,
} from '../dp/diversity';
import {
  BANDS,
  DECLARED_K,
  DECLARED_L,
  DECLARED_T,
  REGISTRY,
  REGISTRY_TARGET_ID,
  RELEASES,
  bandOf,
  releaseById,
} from '../dp/registry';
import { HIGH_EARNER_THRESHOLD } from '../dp/database';
import { byId, clear, el, layered, money, scroller, stat, statRow } from './dom';

const policy = { k: DECLARED_K, l: DECLARED_L, t: DECLARED_T };

const tLabel = `${DECLARED_T.n}/${DECLARED_T.d}`;
const tApprox = (Number(DECLARED_T.n) / Number(DECLARED_T.d)).toFixed(4);

function fractionText(f: { numerator: bigint; denominator: bigint }): string {
  const r = reduceFraction(f.numerator, f.denominator);
  return `${r.n}/${r.d}`;
}

function target() {
  return REGISTRY.find((e) => e.id === REGISTRY_TARGET_ID)!;
}

export function initDiversity(): void {
  renderRegistry();
  wireReleases();
  wireIntersection();
}

function renderRegistry(): void {
  const table = el('table', { class: 'data-table' }, [
    el('caption', {
      text:
        'The registry: sixteen synthetic records, one for each ZIP prefix and age decade. ' +
        'The band column is the declared ordered sensitive domain, so every distance below can be ' +
        'checked against these rows by hand.',
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Record' }),
        el('th', { scope: 'col', class: 'numeric', text: 'Age' }),
        el('th', { scope: 'col', class: 'numeric', text: 'ZIP' }),
        el('th', { scope: 'col', class: 'numeric', text: 'Salary' }),
        el('th', { scope: 'col', text: 'Band' }),
      ]),
    ]),
    el(
      'tbody',
      {},
      REGISTRY.map((e) =>
        el('tr', e.id === REGISTRY_TARGET_ID ? { class: 'row--target' } : {}, [
          el('th', { scope: 'row' }, [
            document.createTextNode(e.name),
            ...(e.id === REGISTRY_TARGET_ID
              ? [el('span', { class: 'tag', text: 'the target' })]
              : []),
          ]),
          el('td', { class: 'numeric', text: String(e.age) }),
          el('td', { class: 'numeric', text: e.zip }),
          el('td', { class: 'numeric', text: money(e.salary) }),
          el('td', { text: `${bandOf(e.salary).id} — ${bandOf(e.salary).label}` }),
        ]),
      ),
    ),
  ]);
  const mount = byId('div-table');
  clear(mount);
  mount.append(scroller('The synthetic registry', table));
}

function classRow(c: ClassReport): HTMLElement {
  const bad = c.distinct < DECLARED_L || !c.withinT;
  return el('tr', bad ? { class: 'row--leak' } : {}, [
    el('th', { scope: 'row', text: `${c.zip} · ${c.age}` }),
    el('td', { class: 'numeric', text: String(c.size) }),
    el('td', { class: 'mono', text: `[${c.counts.join(', ')}]` }),
    el('td', { class: 'numeric', text: String(c.distinct) }),
    el('td', { class: 'mono numeric', text: fractionText(c.emd) }),
    el('td', {}, [
      el('span', { class: 'marker', 'aria-hidden': 'true', text: c.withinT ? '✓ ' : '✗ ' }),
      document.createTextNode(
        c.withinT ? `within t (≤ ${tLabel})` : `over t (> ${tLabel})`,
      ),
    ]),
  ]);
}

function releaseTable(report: ReleaseReport): HTMLElement {
  return el('table', { class: 'data-table' }, [
    el('caption', {
      text:
        'Every equivalence class in the selected release: its size, its band counts in declared ' +
        'order, how many distinct bands it holds, and its exact Earth Mover distance from the ' +
        'whole-table distribution.',
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Class (ZIP · age)' }),
        el('th', { scope: 'col', class: 'numeric', text: 'Size' }),
        el('th', { scope: 'col', text: 'Band counts' }),
        el('th', { scope: 'col', class: 'numeric', text: 'Distinct' }),
        el('th', { scope: 'col', class: 'numeric', text: 'EMD' }),
        el('th', { scope: 'col', text: 't-closeness' }),
      ]),
    ]),
    el('tbody', { id: 'div-class-body' }, report.classes.map(classRow)),
  ]);
}

function utilityTable(report: ReleaseReport): HTMLElement {
  return el('table', { class: 'data-table' }, [
    el('caption', {
      text:
        'What the release still answers. A record counts for certain when its published age range ' +
        'lies entirely inside the question, and is merely possible when the ranges only overlap. ' +
        'The width of that interval is the cost, derived from the rows of this release.',
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Declared query' }),
        el('th', { scope: 'col', class: 'numeric', text: 'True answer' }),
        el('th', { scope: 'col', class: 'numeric', text: 'What the release admits' }),
        el('th', { scope: 'col', class: 'numeric', text: 'Ambiguity' }),
      ]),
    ]),
    el(
      'tbody',
      { id: 'div-utility-body' },
      AGE_QUERIES.map((q) => {
        const a = answerAgeQuery(report, q);
        return el('tr', {}, [
          el('th', { scope: 'row', text: q.label }),
          el('td', { class: 'numeric', text: String(a.truth) }),
          el('td', { class: 'numeric mono', text: `[${a.lo}, ${a.hi}]` }),
          el('td', { class: 'numeric mono', text: String(a.ambiguity) }),
        ]);
      }),
    ),
  ]);
}

function wireReleases(): void {
  const select = byId<HTMLSelectElement>('div-release');
  clear(select);
  for (const r of RELEASES) select.append(el('option', { value: r.id, text: r.label }));
  select.value = 'age-decade';

  const out = byId('div-out');

  const render = (): void => {
    const release = releaseById(select.value);
    const report = describeRelease(release, policy);
    const cls = classOfRecord(report, REGISTRY_TARGET_ID);
    clear(out);

    out.append(
      el('p', { class: 'muted', text: release.note }),
      statRow(
        [
          stat('Measured k', String(report.k), 'smallest equivalence class'),
          stat('Distinct ℓ', String(report.distinctL), 'fewest distinct bands in any class'),
          stat(
            'Largest class distance',
            fractionText(report.maxEmd),
            `the smallest t this release satisfies (≈ ${report.maxEmd.approx.toFixed(4)})`,
          ),
          stat('Classes', String(report.classes.length)),
        ],
        'Measurements for the selected release',
      ),
      scroller('Equivalence classes in the selected release', releaseTable(report)),
    );

    // The verdict branches on the three computed numbers, never on which option
    // is selected: a banner that cannot come out the other way establishes
    // nothing.
    const homogeneous = report.homogeneousClasses[0];
    if (homogeneous) {
      out.append(
        layered('bad', `${report.k}-anonymous, and one class is unanimous`, {
          observation:
            `Class ${homogeneous.zip} · ${homogeneous.age} holds ${homogeneous.size} records and ` +
            `exactly one band: ${homogeneous.candidateBands[0]!.id} — ${homogeneous.candidateBands[0]!.label}. ` +
            `Anyone located in it is disclosed outright, with k fully intact.`,
          meaning:
            'This is the homogeneity attack the k-anonymity card above ends on, now measured as a ' +
            'diversity number: distinct ℓ = 1. ℓ-diversity is the repair — require every class to ' +
            'hold at least ℓ distinct sensitive values.',
          details: [
            'Distinct ℓ-diversity is the weakest of the three readings of "well-represented" in ' +
              'Machanavajjhala et al. The other two, entropy ℓ-diversity and recursive (c, ℓ)-' +
              'diversity, are stronger and are not implemented here. This page never calls this ' +
              'criterion by either of their names.',
          ],
        }),
      );
    } else if (!report.meetsT) {
      const worst = report.classes.find((c) => !c.withinT)!;
      const concentrated = report.classes.find((c) => c.allBelowThreshold || c.allAboveThreshold);
      out.append(
        layered('bad', `Distinct ${report.distinctL}-diverse, and still over t`, {
          observation:
            `Class ${worst.zip} · ${worst.age} holds ${worst.distinct} distinct bands and sits ` +
            `${fractionText(worst.emd)} from the whole-table distribution, past the declared ` +
            `t = ${tLabel}.` +
            (concentrated
              ? ` Class ${concentrated.zip} · ${concentrated.age} is the sharp case: its ` +
                `${concentrated.distinct} bands are ${concentrated.candidateBands
                  .map((b) => b.id)
                  .join(', ')}, every one of them ${
                  concentrated.allBelowThreshold ? 'below' : 'at or above'
                } ${money(HIGH_EARNER_THRESHOLD)}.`
              : ''),
          meaning:
            'Distinct values are not distant values. A class can hold three different bands and ' +
            'still tell you which end of the scale someone is on — the similarity attack of Li, ' +
            'Li and Venkatasubramanian §3. t-closeness answers it by comparing the class ' +
            'distribution with the table’s, over a declared order.',
          details: [
            'The ground distance between two bands is |i − j| / (m − 1) over the declared order, ' +
              'and the distance between distributions is the Earth Mover distance under it ' +
              '(Li et al. §5.1). Every figure above is an exact fraction; the verdict is a ' +
              'cross-multiplication, never a rounded comparison.',
            'The paper is explicit that this is one distance among several the principle admits, ' +
              'and that the relationship between t and information gain is unclear. A smaller t is ' +
              'not a proportionally smaller disclosure.',
          ],
        }),
      );
    } else {
      out.append(
        layered('ok', `Meets k ≥ ${DECLARED_K}, distinct ℓ ≥ ${DECLARED_L} and t = ${tLabel}`, {
          observation:
            `The largest class distance is ${fractionText(report.maxEmd)}, which is ` +
            `${fractionText(report.maxEmd) === tLabel ? 'exactly the declared t' : `inside the declared t = ${tLabel}`}` +
            `. The t-closeness principle says "no more than a threshold t", so a class sitting ` +
            `on the line passes.`,
          meaning:
            'Three release criteria met at once, on this table, for this publication. None of them ' +
            'is a statement about a mechanism, and the next panel shows what that difference costs.',
          details: [
            'Meeting t says the class distributions resemble the table’s. It does not say an ' +
              'attacker learns nothing: it says what they learn about an individual is close to ' +
              'what the whole release already told them about the population.',
          ],
        }),
      );
    }

    if (cls) {
      out.append(
        el('p', {
          class: 'note',
          text:
            `The target, ${target().name}, is in class ${cls.zip} · ${cls.age}. From this release ` +
            `alone an attacker narrows their band to {${cls.candidateBands.map((b) => b.id).join(', ')}} ` +
            `— ${cls.candidateBands.length} of ${BANDS.length}.`,
        }),
      );
    }

    out.append(scroller('Utility of the selected release', utilityTable(report)));
  };

  select.addEventListener('change', render);
  render();
}

function wireIntersection(): void {
  const out = byId('div-attack-out');

  const run = (): void => {
    const zip = describeRelease(releaseById('zip3'), policy);
    const age = describeRelease(releaseById('age-decade'), policy);
    const knowledge = {
      description: 'the target’s ZIP prefix and age decade',
      locate: (r: ReleaseReport) => classOfRecord(r, REGISTRY_TARGET_ID),
    };
    const result = intersectReleases([zip, age], knowledge);
    const contrast = neighbourContrast(releaseById('age-twenty'), policy, REGISTRY, REGISTRY_TARGET_ID);

    clear(out);

    const attackTable = el('table', { class: 'data-table' }, [
        el('caption', {
          text:
            'What each release tells the attacker about the target on its own, and what the two ' +
            'say together. Nothing here is given the target’s real band.',
        }),
        el('thead', {}, [
          el('tr', {}, [
            el('th', { scope: 'col', text: 'Release' }),
            el('th', { scope: 'col', class: 'numeric', text: 'k' }),
            el('th', { scope: 'col', class: 'numeric', text: 'distinct ℓ' }),
            el('th', { scope: 'col', text: 'Target’s class' }),
            el('th', { scope: 'col', text: 'Candidate bands' }),
          ]),
        ]),
        el('tbody', { id: 'div-attack-body' }, [
          ...[zip, age].map((report, i) =>
            el('tr', {}, [
              el('th', { scope: 'row', text: releaseById(report.levelId).label }),
              el('td', { class: 'numeric', text: String(report.k) }),
              el('td', { class: 'numeric', text: String(report.distinctL) }),
              el('td', { class: 'mono', text: result.perRelease[i]!.classKey }),
              el('td', {
                class: 'mono',
                text: `{${result.perRelease[i]!.candidates.map((b) => b.id).join(', ')}}`,
              }),
            ]),
          ),
          el('tr', { class: 'row--leak' }, [
            el('th', { scope: 'row', text: 'Both, intersected' }),
            el('td', { class: 'numeric', text: '—' }),
            el('td', { class: 'numeric', text: '—' }),
            el('td', { text: 'the attacker’s conclusion' }),
            el('td', {
              class: 'mono',
              id: 'div-intersection',
              text: `{${result.intersection.map((b) => b.id).join(', ')}}`,
            }),
          ]),
        ]),
      ]);

    out.append(
      scroller('What each release says about the target', attackTable),
      layered(
        'bad',
        result.disclosesExactBand
          ? `Two compliant releases, one exact band: ${result.intersection[0]!.id} — ${result.intersection[0]!.label}`
          : `Two compliant releases narrow five bands to ${result.intersection.length}`,
        {
          observation:
            `Each release separately holds k ≥ ${DECLARED_K} and distinct ℓ ≥ ${DECLARED_L}, and ` +
            `neither discloses the target on its own. Intersecting the two candidate sets leaves ` +
            `{${result.intersection.map((b) => b.id).join(', ')}}` +
            (result.disclosesHighEarner
              ? `, every member of which is at or above ${money(HIGH_EARNER_THRESHOLD)} — the same ` +
                `secret the counting query in Exhibit 2 is built to protect.`
              : '.'),
          meaning:
            'The attack needs two things and nothing else, both named by Ganta, Kasiviswanathan ' +
            'and Smith: the sensitive values are published exactly, and the target’s class can ' +
            'be located from attributes a stranger can look up. Those are design features of ' +
            'microdata publishing, not mistakes in these releases.',
          details: [
            'This is residual disclosure, not unique identification. The attacker never learns ' +
              'which row is the target, and in this run learns a band rather than a salary. The ' +
              'two are routinely confused and only one of them is being demonstrated.',
            'One constructed counterexample is not a composition theorem. It shows that these ' +
              'releases compose badly here; the cited paper measured the effect across two census ' +
              'datasets, which is a different kind of claim and is not reproduced on this page.',
            el('p', {
              text:
                `What an omniscient reader can also see, and the attacker cannot: the target’s ` +
                `real band is ${bandOf(target().salary).id} — ${bandOf(target().salary).label}, ` +
                `from a salary of ${money(target().salary)}. That comparison is made here, after ` +
                `the attack has finished, and is never an input to it.`,
            }),
          ],
        },
      ),
      layered('warn', 'And none of this is what differential privacy promises', {
        observation:
          `Take the repaired release — ${releaseById('age-twenty').label}, which meets k, ℓ and t — ` +
          `and run it on two neighbouring tables: the registry, and the registry without the ` +
          `target. The published strings ${contrast.outputsDiffer ? 'differ' : 'are identical'}.`,
        meaning:
          `Let the output event be "${contrast.event}". This release is deterministic, so that ` +
          `event has probability ${contrast.probabilityWith} on one neighbour and ` +
          `${contrast.probabilityWithout} on the other. ε-differential privacy would require ` +
          `1 ≤ e^ε · 0, and no finite ε satisfies that. The criteria above constrain one published ` +
          `table; ε constrains a randomised mechanism across neighbouring inputs.`,
        details: [
          'The scope of that conclusion is narrow and worth keeping narrow. It is about THIS ' +
            'deterministic release and THIS event. It is not a claim that a k, ℓ or t ' +
            'transformation could never appear inside some differentially private mechanism, and ' +
            'it is not a claim that ℓ-diversity and t-closeness fail on their own terms.',
          'Nor does ε rescue everything the criteria miss. Differential privacy does not stop a ' +
            'release teaching true things about a population, and it makes no promise about any ' +
            'particular sensitive value — only that the released answer would have looked much the ' +
            'same had this one person never been in the table.',
        ],
      }),
    );
  };

  byId('div-attack-run').addEventListener('click', run);
  clear(out);
  out.append(
    el('p', {
      class: 'note',
      text:
        'Two releases of the same sixteen people, published independently, each meeting the stated ' +
        'criteria. Run the attack to see what they say together.',
    }),
  );
}

export const DIVERSITY_T_LABEL = `${tLabel} (≈ ${tApprox})`;
