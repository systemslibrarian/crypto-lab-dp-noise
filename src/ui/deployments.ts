/**
 * Exhibit 6 — ε in the wild.
 *
 * A panel of quoted numbers would be the weakest thing on this page, so it does
 * not quote them: each deployment's ε is put through the same
 * `worstCasePosterior` the rest of the page uses, so "Apple's ε = 16" becomes
 * "an even prior can move to 99.99% certainty" — which is a sentence a reader
 * can evaluate. The Census entry goes further and re-derives the persons file's
 * ε from the ρ the Bureau actually budgeted for it: one defensible conversion
 * reproduces the published number and another lands three-quarters of a unit
 * away, which is a real and underappreciated fact about reading these values.
 *
 * The column that matters most is provenance. A published ε, an ε measured by
 * outside researchers from a shipping binary, and an ε derived from a budget
 * denominated in something else are three different kinds of claim.
 */
import { worstCasePosterior } from '../dp/mechanism';
import { DEPLOYMENTS, type Deployment } from '../dp/params';
import { zcdpToDpStandard, zcdpToDpTight } from '../dp/zcdp';
import { chart, chartData, legend } from './chart';
import { byId, clear, el, num, pct, scroller, stat, statRow } from './dom';

const PROVENANCE_LABEL: Record<Deployment['provenance'], string> = {
  published: 'Published by the operator',
  measured: 'Measured by outside researchers',
  derived: 'Derived here from a published parameter',
};

export function initDeployments(): void {
  renderChart();
  renderTable();
  renderCensus();
}

function renderChart(): void {
  const sorted = [...DEPLOYMENTS].sort((a, b) => a.eps - b.eps);
  const points: [number, number][] = sorted.map((d, i) => [i, d.eps]);
  const mount = byId('dep-chart');
  clear(mount);
  mount.append(
    chart({
      ariaLabel:
        'Privacy parameters of four deployments on a logarithmic scale, from RAPPOR at about 2 to the 2020 US Census ' +
        'at 17.',
      xLabel: 'deployment',
      yLabel: 'ε (log scale)',
      yLog: true,
      yMin: 1,
      series: [{ id: 'eps', label: 'ε', kind: 'bars', style: 'a', points, width: 0.5 }],
      height: 200,
      // A categorical axis: exactly one tick per bar, never an interpolated one.
      xTicks: sorted.map((_, i) => i),
      xTickFormat: (v) => sorted[Math.round(v)]?.org ?? '',
      yTickFormat: (v) => num(v, v < 10 ? 1 : 0),
    }),
    legend([{ label: 'ε as deployed (higher means weaker)', style: 'a', kind: 'bars' }]),
    chartData({
      caption: 'Each deployment’s ε, the ratio it permits, and the belief bound it implies from an even prior.',
      headers: ['Deployment', 'ε', 'e^ε', 'Belief can reach', 'Provenance'],
      rows: sorted.map((d) => [
        d.org,
        num(d.eps, 2),
        d.eps > 12 ? Math.exp(d.eps).toExponential(2) : num(Math.exp(d.eps), 1),
        pct(worstCasePosterior(0.5, d.eps), 2),
        PROVENANCE_LABEL[d.provenance],
      ]),
      trend:
        'The ε column spans about an order of magnitude and the e^ε column spans seven, because the quantity ε bounds ' +
        'is exponential in it.',
      notice:
        'The e^ε column is the one to read. A ratio of 24 million bounds nothing an ordinary reader would call ' +
        'privacy, and yet every row here is a real system described as differentially private — so "we use ' +
        'differential privacy" is a statement about a technique, not about a guarantee. Then read the provenance ' +
        'column, because a published ε, a measured one and a derived one are three different kinds of claim.',
    }),
    el('p', {
      class: 'note',
      text:
        'The axis is logarithmic and the range is still enormous, which is the first thing to notice: these systems ' +
        'are not making the same promise with slightly different settings. e^17 is about 24 million — a ratio that ' +
        'bounds nothing an ordinary reader would call privacy. That is not a scandal on its own, because ε bounds the ' +
        'worst case over every possible attacker and every possible output, and the typical case is far better. But it ' +
        'is why "we use differential privacy" is a statement about a technique, not about a guarantee.',
    }),
  );
}

function renderTable(): void {
  const table = el('table', { class: 'data-table' }, [
    el('caption', {
      text:
        'Four deployments, their ε, where that number came from, and what it means for an observer who started out ' +
        'thinking it an even chance you were in the data.',
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Who' }),
        el('th', { scope: 'col', text: 'Trust model' }),
        el('th', { scope: 'col', class: 'numeric', text: 'ε' }),
        el('th', { scope: 'col', class: 'numeric', text: 'Belief can reach' }),
        el('th', { scope: 'col', text: 'Provenance' }),
      ]),
    ]),
    el(
      'tbody',
      {},
      DEPLOYMENTS.map((d) =>
        el('tr', {}, [
          el('th', { scope: 'row' }, [
            el('span', { class: 'dep__org', text: d.org }),
            el('span', { class: 'dep__what', text: d.what }),
          ]),
          el('td', {}, [
            el('span', { class: 'marker', 'aria-hidden': 'true', text: d.model === 'local' ? '◆ ' : '● ' }),
            document.createTextNode(d.model === 'local' ? 'Local — randomised on the device' : 'Global — a trusted curator'),
          ]),
          el('td', { class: 'numeric mono', text: num(d.eps, 2) }),
          el('td', { class: 'numeric mono', text: pct(worstCasePosterior(0.5, d.eps), 2) }),
          el('td', {}, [
            el('span', { class: `pill pill--${d.provenance}`, text: PROVENANCE_LABEL[d.provenance] }),
            el('p', { class: 'dep__note', text: d.epsNote }),
            el('p', { class: 'dep__src' }, [
              el('a', { href: d.sourceUrl, target: '_blank', rel: 'noopener', text: d.source }),
            ]),
          ]),
        ]),
      ),
    ),
  ]);

  const mount = byId('dep-table');
  clear(mount);
  mount.append(scroller('Deployment parameters and their provenance', table));
}

function renderCensus(): void {
  // The Bureau budgeted in ρ (zero-concentrated DP) and published an (ε, δ) for
  // each of the two files it released, so this compares like with like: the
  // persons file's ρ against the persons file's ε. Converting ρ is still a
  // choice, and the choice is what moves the number.
  const delta = 1e-10;
  // Production settings for the 2020 redistricting data (Abowd et al.,
  // arXiv:2204.08986, §8.2): ρ = 2.63 in all, 2.56 for the persons tables and
  // 0.07 for housing units. Published 9 June 2021 as ε = 19.61 in all, 17.14
  // for the persons file and 2.47 for housing units, each at δ = 1e-10.
  const rhoPersons = 2.56;
  const rhoHousing = 0.07;
  const rhoTotal = rhoPersons + rhoHousing;
  const publishedPersons = 17.14;
  const publishedHousing = 2.47;
  const publishedTotal = publishedPersons + publishedHousing;

  const standard = zcdpToDpStandard(rhoPersons, delta);
  const tight = zcdpToDpTight(rhoPersons, delta);
  const standardTotal = zcdpToDpStandard(rhoTotal, delta);
  const tightTotal = zcdpToDpTight(rhoTotal, delta).eps;

  const mount = byId('dep-census');
  clear(mount);
  mount.append(
    statRow(
      [
        stat('Budget as set', `ρ = ${num(rhoPersons, 2)}`, 'persons file, zero-concentrated DP'),
        stat('Standard conversion', num(standard, 2), 'ρ + 2√(ρ ln(1/δ))'),
        stat('Rényi-optimised', num(tight.eps, 2), `at α = ${num(tight.alpha, 2)}`),
        stat('As published', num(publishedPersons, 2), 'US Census Bureau, persons file'),
      ],
      'One mechanism, four ε labels',
    ),
    el('p', {
      class: 'note',
      text:
        `All four rows describe the persons file of the 2020 redistricting release at δ = ${delta.toExponential(0)}. ` +
        `The Bureau's ${num(publishedPersons, 2)} is what the Rényi-optimised conversion gives at the production ρ ` +
        `(${num(rhoPersons, 2)} is rounded; the exact setting reproduces ${num(publishedPersons, 2)}), while the standard ` +
        `closed form puts the same file ${num(standard - publishedPersons, 2)} higher. The headline total is a label of a ` +
        `third kind: ρ = ${num(rhoPersons, 2)} + ${num(rhoHousing, 2)} = ${num(rhoTotal, 2)} was published as ` +
        `ε = ${num(publishedPersons, 2)} + ${num(publishedHousing, 2)} = ${num(publishedTotal, 2)}, adding the two files' ε, ` +
        `where converting the summed ρ gives ${num(tightTotal, 2)} (Rényi-optimised) or ${num(standardTotal, 2)} (standard) — ` +
        `and the Bureau's own paper calls converting the sum the more accurate route. Nothing is wrong in any row — but a ` +
        `reader comparing "ε = ${num(publishedTotal, 2)}" against another system's "ε = ${num(tightTotal, 2)}" would be ` +
        `comparing accountants, not privacy. When you see an ε, ask what converted it, and what was added up.`,
    }),
  );
}
