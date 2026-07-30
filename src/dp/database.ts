/**
 * The toy database, and the queries the page asks of it.
 *
 * Twelve payroll records — small enough to print in full, which is the point:
 * every number the page shows you can check by hand against the table, so when
 * a differencing attack recovers one person's salary you can see that it is
 * *her* salary and not a plausible-looking coincidence.
 *
 * Sensitivity is computed here, never assumed. A query with no bounded
 * sensitivity has no Laplace calibration, so `sumSalary` clamps to a declared
 * range and reports the clamp as part of its answer — this is the step most
 * introductions skip, and it is where real deployments leak.
 */

export interface Employee {
  readonly id: number;
  readonly name: string;
  readonly dept: string;
  readonly age: number;
  readonly zip: string;
  readonly salary: number;
}

/** The salary range the analyst declares up front. Sensitivity follows from it. */
export const SALARY_CLAMP = { lo: 0, hi: 250_000 } as const;

/** The threshold behind the counting query: "how many people earn above this?" */
export const HIGH_EARNER_THRESHOLD = 100_000;

export const EMPLOYEES: readonly Employee[] = [
  { id: 1, name: 'Alice Nguyen', dept: 'Engineering', age: 34, zip: '98101', salary: 142_000 },
  { id: 2, name: 'Bao Tran', dept: 'Engineering', age: 31, zip: '98102', salary: 128_000 },
  { id: 3, name: 'Carla Diaz', dept: 'Engineering', age: 38, zip: '98103', salary: 155_000 },
  { id: 4, name: 'Dmitri Volkov', dept: 'Data Science', age: 36, zip: '98104', salary: 149_000 },
  { id: 5, name: 'Elena Petrova', dept: 'Data Science', age: 33, zip: '98105', salary: 121_000 },
  { id: 6, name: 'Femi Okafor', dept: 'Data Science', age: 39, zip: '98106', salary: 137_000 },
  { id: 7, name: 'Grace Lee', dept: 'Support', age: 27, zip: '98201', salary: 61_000 },
  { id: 8, name: 'Hiro Sato', dept: 'Support', age: 24, zip: '98202', salary: 58_000 },
  { id: 9, name: 'Ingrid Olsen', dept: 'Support', age: 29, zip: '98203', salary: 67_000 },
  { id: 10, name: 'Jonas Meyer', dept: 'Facilities', age: 52, zip: '98204', salary: 72_000 },
  { id: 11, name: 'Keisha Brown', dept: 'Facilities', age: 55, zip: '98205', salary: 81_000 },
  { id: 12, name: 'Luis Ramos', dept: 'Facilities', age: 58, zip: '98206', salary: 69_000 },
];

/** The record the whole page is about: the one an attacker is trying to learn. */
export const TARGET_ID = 1;

export const target = (): Employee => byId(TARGET_ID);

export function byId(id: number): Employee {
  const found = EMPLOYEES.find((e) => e.id === id);
  if (!found) throw new Error(`no employee ${id}`);
  return found;
}

/** The neighbouring database: identical but for one person's record. */
export function without(db: readonly Employee[], id: number): Employee[] {
  return db.filter((e) => e.id !== id);
}

export function clampSalary(s: number): number {
  return Math.min(SALARY_CLAMP.hi, Math.max(SALARY_CLAMP.lo, s));
}

export interface Query<T = number> {
  readonly id: string;
  readonly label: string;
  /** What one person's presence or absence can move the answer by, at most. */
  readonly sensitivity: number;
  /** Why that number and not another — shown in the UI, not just asserted. */
  readonly sensitivityWhy: string;
  /** True if answers are integers, so the discrete mechanism can work on ℤ directly. */
  readonly integral: boolean;
  readonly run: (db: readonly Employee[]) => T;
}

export const countHighEarners: Query = {
  id: 'count-high',
  label: `How many people earn more than $${HIGH_EARNER_THRESHOLD.toLocaleString('en-US')}?`,
  sensitivity: 1,
  sensitivityWhy:
    'Adding or removing one person changes a count by at most one, whatever their salary. Δ = 1 — the cleanest sensitivity there is.',
  integral: true,
  run: (db) => db.filter((e) => e.salary > HIGH_EARNER_THRESHOLD).length,
};

export const headcount: Query = {
  id: 'headcount',
  label: 'How many people are on the payroll?',
  sensitivity: 1,
  sensitivityWhy: 'One person, one head. Δ = 1.',
  integral: true,
  run: (db) => db.length,
};

export const sumSalary: Query = {
  id: 'sum-salary',
  label: 'What is the total payroll?',
  sensitivity: SALARY_CLAMP.hi - SALARY_CLAMP.lo,
  sensitivityWhy:
    `Without a declared range a single record could move the total by any amount, and no finite noise would cover it. ` +
    `Clamping every salary to $${SALARY_CLAMP.lo.toLocaleString('en-US')}–$${SALARY_CLAMP.hi.toLocaleString('en-US')} bounds one person's contribution, ` +
    `so Δ = $${(SALARY_CLAMP.hi - SALARY_CLAMP.lo).toLocaleString('en-US')}.`,
  integral: true,
  run: (db) => db.reduce((acc, e) => acc + clampSalary(e.salary), 0),
};

export const QUERIES: readonly Query[] = [countHighEarners, headcount, sumSalary];

export function queryById(id: string): Query {
  const q = QUERIES.find((x) => x.id === id);
  if (!q) throw new Error(`no query ${id}`);
  return q;
}

/**
 * The average salary, as a *post-processing* of two noisy answers rather than a
 * query of its own. Differential privacy is closed under post-processing: once
 * the sum and the count have been released privately, dividing them costs
 * nothing further, because the divider learns nothing the released numbers did
 * not already say.
 */
export function meanFromReleases(noisySum: number, noisyCount: number): number {
  if (noisyCount <= 0) return Number.NaN;
  return noisySum / noisyCount;
}
