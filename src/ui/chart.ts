/**
 * A small SVG chart, built for this page's one job: putting two probability
 * distributions on the same axis and letting you see whether they overlap.
 *
 * Three rules it follows throughout:
 *
 * - **Nothing is carried by colour alone.** Every series has a line style (solid,
 *   dashed, dotted) and a named entry in a text legend as well as a colour, and
 *   the charts stay readable in greyscale and under deuteranopia.
 * - **The picture never says more than the data.** A discrete distribution is
 *   drawn as steps and stems, not as a smooth curve through integer points; a
 *   smooth interpolation would be a picture of a distribution that does not exist.
 * - **The numbers are available.** Each chart can emit the table it was drawn
 *   from, so a reader who wants the values rather than the shape has them, and
 *   so a screen reader has something better than "chart".
 */
import { el, scroller, svg } from './dom';

export type SeriesKind = 'steps' | 'stems' | 'line' | 'bars';
export type SeriesStyle = 'a' | 'b' | 'ceiling' | 'muted';

export interface Series {
  readonly id: string;
  readonly label: string;
  readonly kind: SeriesKind;
  readonly style: SeriesStyle;
  readonly points: readonly (readonly [number, number])[];
  /** Bar width in x-units. Used to draw two sampled histograms side by side. */
  readonly width?: number;
}

export interface Marker {
  readonly x: number;
  readonly label: string;
  readonly style: SeriesStyle;
}

export interface ChartOptions {
  readonly ariaLabel: string;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly series: readonly Series[];
  readonly markers?: readonly Marker[];
  /** Horizontal reference lines, e.g. the ±ε ceilings the definition promises. */
  readonly ceilings?: readonly { readonly y: number; readonly label: string }[];
  readonly yLog?: boolean;
  /** ε spans three orders of magnitude; a linear axis crushes the interesting end. */
  readonly xLog?: boolean;
  readonly yMin?: number;
  readonly yMax?: number;
  /** Exact x positions to label — for categorical axes, one per category. */
  readonly xTicks?: readonly number[];
  readonly xTickFormat?: (v: number) => string;
  readonly yTickFormat?: (v: number) => string;
  readonly height?: number;
  /** Widen the gutter when the y tick labels are long (money, percentages). */
  readonly padLeft?: number;
}

/**
 * The drawing width in viewBox units. The SVG is scaled to its container, so
 * this is really an aspect ratio: 680 wide by ~250 tall is right on a desktop
 * and far too letterboxed on a phone, where the same plot ends up a hundred
 * pixels tall. Narrowing the viewBox below the layout's own 640px breakpoint
 * gives the chart back its height without changing a single data point.
 *
 * Read once per chart render rather than tracked across resizes: every chart on
 * the page re-renders on interaction, and a rotated phone gets a correctly
 * proportioned chart that is merely scaled, not distorted.
 */
function drawWidth(): number {
  return typeof window !== 'undefined' && window.innerWidth < 640 ? 430 : 680;
}

const PAD = { l: 62, r: 16, t: 14, b: 42 };

function niceTicks(lo: number, hi: number, count: number): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const stepN = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  const step = stepN * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

export function chart(opts: ChartOptions): SVGSVGElement {
  const W = drawWidth();
  const H = opts.height ?? 250;
  const padL = opts.padLeft ?? PAD.l;
  const all = opts.series.flatMap((s) => s.points);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const xLo = xs.length ? Math.min(...xs) : 0;
  const xHi = xs.length ? Math.max(...xs) : 1;
  const fixedY = opts.yMin !== undefined && opts.yMax !== undefined;
  let yLo = opts.yMin ?? 0;
  let yHi = opts.yMax ?? (ys.length ? Math.max(...ys) : 1);
  for (const c of opts.ceilings ?? []) {
    if (!fixedY) {
      yHi = Math.max(yHi, c.y);
      yLo = Math.min(yLo, c.y);
    }
  }
  if (opts.yLog) {
    yLo = Math.max(opts.yMin ?? 1, Number.MIN_VALUE);
    yHi = Math.max(yHi, yLo * 10);
  } else if (yHi <= yLo) {
    yHi = yLo + 1;
  }
  if (!fixedY) yHi *= opts.yLog ? 1.6 : 1.1;

  const xt = (x: number): number =>
    opts.xLog
      ? (Math.log(Math.max(x, xLo)) - Math.log(xLo)) / (Math.log(xHi) - Math.log(xLo) || 1)
      : (x - xLo) / (xHi - xLo || 1);
  const px = (x: number): number => padL + xt(x) * (W - padL - PAD.r);
  const py = (y: number): number => {
    const t = opts.yLog
      ? (Math.log(Math.max(y, yLo)) - Math.log(yLo)) / (Math.log(yHi) - Math.log(yLo) || 1)
      : (y - yLo) / (yHi - yLo || 1);
    return H - PAD.b - t * (H - PAD.t - PAD.b);
  };

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': opts.ariaLabel,
  });
  root.append(svg('title', { text: opts.ariaLabel }));

  // Axes and gridlines.
  const grid = svg('g', { class: 'chart__grid', 'aria-hidden': 'true' });
  const yTicks = opts.yLog ? logTicks(yLo, yHi) : niceTicks(yLo, fixedY ? yHi : yHi / 1.1, 4);
  for (const t of yTicks) {
    const y = py(t);
    if (y < PAD.t - 1 || y > H - PAD.b + 1) continue;
    grid.append(svg('line', { class: 'chart__gridline', x1: padL, x2: W - PAD.r, y1: y, y2: y }));
    grid.append(
      svg('text', {
        class: 'chart__tick chart__tick--y',
        x: padL - 8,
        y: y + 4,
        'text-anchor': 'end',
        text: (opts.yTickFormat ?? defaultFormat)(t),
      }),
    );
  }
  const xTicks = opts.xTicks ?? (opts.xLog ? logTicks(xLo, xHi) : niceTicks(xLo, xHi, 6));
  for (const t of xTicks) {
    const x = px(t);
    if (x < padL - 1 || x > W - PAD.r + 1) continue;
    grid.append(
      svg('text', {
        class: 'chart__tick',
        x,
        y: H - PAD.b + 18,
        'text-anchor': 'middle',
        text: (opts.xTickFormat ?? defaultFormat)(t),
      }),
    );
  }
  grid.append(
    svg('line', { class: 'chart__axis', x1: padL, x2: W - PAD.r, y1: py(yLo), y2: py(yLo) }),
    svg('line', { class: 'chart__axis', x1: padL, x2: padL, y1: PAD.t, y2: H - PAD.b }),
  );
  root.append(grid);

  // Axis titles.
  root.append(
    svg('text', {
      class: 'chart__axis-title',
      x: (padL + W - PAD.r) / 2,
      y: H - 6,
      'text-anchor': 'middle',
      'aria-hidden': 'true',
      text: opts.xLabel,
    }),
    svg('text', {
      class: 'chart__axis-title',
      x: 12,
      y: (PAD.t + H - PAD.b) / 2,
      'text-anchor': 'middle',
      transform: `rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`,
      'aria-hidden': 'true',
      text: opts.yLabel,
    }),
  );

  for (const c of opts.ceilings ?? []) {
    const y = py(c.y);
    if (y < PAD.t - 1 || y > H - PAD.b + 1) continue;
    root.append(
      svg('line', { class: 'chart__ceiling', x1: padL, x2: W - PAD.r, y1: y, y2: y }),
      svg('text', {
        class: 'chart__ceiling-label',
        x: W - PAD.r - 4,
        y: y - 6,
        'text-anchor': 'end',
        'aria-hidden': 'true',
        text: c.label,
      }),
    );
  }

  const plotW = W - padL - PAD.r;
  for (const s of opts.series) {
    if (!s.points.length) continue;
    const g = svg('g', { class: `chart__series chart__series--${s.style}`, 'aria-hidden': 'true' });
    if (s.kind === 'line') {
      g.append(svg('path', { class: 'chart__line', d: pathOf(s.points, px, py) }));
    } else if (s.kind === 'steps') {
      g.append(svg('path', { class: 'chart__line', d: stepPathOf(s.points, px, py, plotW, xLo, xHi) }));
    } else if (s.kind === 'stems') {
      for (const [x, y] of s.points) {
        if (y <= yLo) continue;
        g.append(svg('line', { class: 'chart__stem', x1: px(x), x2: px(x), y1: py(yLo), y2: py(y) }));
      }
    } else {
      const step =
        s.width !== undefined
          ? Math.abs(px(xLo + s.width) - px(xLo))
          : s.points.length > 1
            ? Math.abs(px(s.points[1][0]) - px(s.points[0][0])) * 0.74
            : 8;
      const w = Math.max(1.5, step);
      for (const [x, y] of s.points) {
        if (y <= yLo) continue;
        g.append(
          svg('rect', {
            class: 'chart__bar',
            x: px(x) - w / 2,
            width: w,
            y: py(y),
            height: Math.max(0, py(yLo) - py(y)),
          }),
        );
      }
    }
    root.append(g);
  }

  (opts.markers ?? []).forEach((m, i) => {
    const x = px(m.x);
    // Alternate the labels left and right of their lines, and stagger them
    // vertically, so two markers a few pixels apart do not print on top of each
    // other. Also flip anything close to the right edge inward.
    const nearRight = x > W - PAD.r - 70 || i % 2 === 1;
    root.append(
      svg('line', {
        class: `chart__marker chart__marker--${m.style}`,
        x1: x,
        x2: x,
        y1: PAD.t,
        y2: H - PAD.b,
        'aria-hidden': 'true',
      }),
      svg('text', {
        class: 'chart__marker-label',
        x: nearRight ? x - 5 : x + 5,
        y: PAD.t + 12 + (i % 2) * 15,
        'text-anchor': nearRight ? 'end' : 'start',
        'aria-hidden': 'true',
        text: m.label,
      }),
    );
  });

  return root;
}

function defaultFormat(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(2);
}

function logTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  const from = Math.floor(Math.log10(lo));
  const to = Math.ceil(Math.log10(hi));
  for (let e = from; e <= to; e++) {
    const v = Math.pow(10, e);
    if (v >= lo * 0.999 && v <= hi * 1.001) ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

function pathOf(
  points: readonly (readonly [number, number])[],
  px: (v: number) => number,
  py: (v: number) => number,
): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(2)} ${py(y).toFixed(2)}`).join(' ');
}

/**
 * A discrete distribution drawn as a staircase, one flat tread per integer
 * outcome. Joining the points with a smooth curve would draw a continuous
 * density that this mechanism does not have.
 */
function stepPathOf(
  points: readonly (readonly [number, number])[],
  px: (v: number) => number,
  py: (v: number) => number,
  plotW: number,
  xLo: number,
  xHi: number,
): string {
  const half = points.length > 1 ? plotW / (xHi - xLo) / 2 : 4;
  const parts: string[] = [];
  points.forEach(([x, y], i) => {
    const yy = py(y).toFixed(2);
    parts.push(`${i ? 'L' : 'M'}${(px(x) - half).toFixed(2)} ${yy}`, `L${(px(x) + half).toFixed(2)} ${yy}`);
  });
  return parts.join(' ');
}

export interface LegendEntry {
  readonly label: string;
  readonly style: SeriesStyle;
  readonly kind: SeriesKind;
}

/** A text legend. The swatch repeats the line style, so colour is never the only cue. */
export function legend(entries: readonly LegendEntry[]): HTMLElement {
  return el(
    'ul',
    { class: 'chart-legend' },
    entries.map((e) =>
      el('li', {}, [
        el('span', { class: `chart-swatch chart-swatch--${e.style} chart-swatch--${e.kind}`, 'aria-hidden': 'true' }),
        el('span', { text: e.label }),
      ]),
    ),
  );
}

export interface ChartDataOptions {
  /** The disclosure's label. Defaults to the wording used across the page. */
  readonly summary?: string;
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** The shape of the data, in one sentence. */
  readonly trend: string;
  /** The exact thing the reader is meant to take from this chart. */
  readonly notice: string;
  /**
   * For charts carrying both a simulation and a closed form: which marks are
   * which. A reader who cannot tell a sampled bar from a theoretical curve is
   * being invited to read a finite experiment as a proof.
   */
  readonly sampled?: string;
}

/**
 * The accessible twin of a chart: its values, its trend, and what it is for.
 *
 * An `aria-label` saying "a chart of error against queries asked" is a
 * description of a picture, not access to a finding. Every instructional chart
 * on this page carries one of these instead, so that a reader who cannot use
 * the SVG — screen reader, greyscale, no pointer, or simply preferring numbers —
 * reaches the same conclusion from the same data rather than a summary of it.
 */
export function chartData(o: ChartDataOptions): HTMLElement {
  const prose = el('div', { class: 'chart-data__prose' }, [
    el('p', {}, [el('strong', { text: 'The trend. ' }), document.createTextNode(o.trend)]),
    el('p', {}, [el('strong', { text: 'What to notice. ' }), document.createTextNode(o.notice)]),
  ]);
  if (o.sampled) {
    prose.append(
      el('p', { class: 'note' }, [
        el('strong', { text: 'Sampled versus theoretical. ' }),
        document.createTextNode(o.sampled),
      ]),
    );
  }
  return el('details', { class: 'data-details' }, [
    el('summary', { text: o.summary ?? 'Data and interpretation' }),
    prose,
    scroller(o.caption, table(o.caption, o.headers, o.rows)),
  ]);
}

/** The numbers a chart was drawn from, as a real table behind a disclosure. */
export function dataTable(
  summary: string,
  caption: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): HTMLElement {
  return el('details', { class: 'data-details' }, [
    el('summary', { text: summary }),
    scroller(caption, table(caption, headers, rows)),
  ]);
}

function table(
  caption: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): HTMLElement {
  return el('table', { class: 'data-table' }, [
    el('caption', { text: caption }),
    el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { scope: 'col', text: h })))]),
    el(
      'tbody',
      {},
      rows.map((r) =>
        el('tr', {}, r.map((c, i) => el(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row', text: c } : { text: c }))),
      ),
    ),
  ]);
}
