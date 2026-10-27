/**
 * A second, separate synthetic table — the one the ℓ-diversity and t-closeness
 * lesson needs, and why the twelve-person payroll could not be it.
 *
 * The payroll in `database.ts` is deliberately tiny and deliberately correlated:
 * salary tracks department almost exactly, which is what makes the homogeneity
 * attack land. That same correlation makes it unable to carry this lesson. Two
 * *independent* releases of those twelve rows cannot both satisfy a stated
 * k/ℓ/t policy and still intersect to something new about one person — every
 * generalisation that separates the target from the low-paid support staff
 * leaves THEM a unanimous class, and every one that does not leaves the target's
 * candidate set unchanged. Rather than weaken a release until an attack appears,
 * this exhibit declares a second table built for the job and says so.
 *
 * Nothing in `database.ts` is touched. Every existing k-anonymity, homogeneity,
 * differencing, composition and geo result is computed over the payroll exactly
 * as before.
 *
 * The rows are `Employee` records on purpose, so this table reuses the lab's own
 * machinery rather than imitating it: `analyse()` from `kanon.ts` partitions it
 * into equivalence classes, and `without()` from `database.ts` produces the
 * neighbouring database for the differential-privacy contrast.
 *
 * Sixteen rows, one per (ZIP prefix, age decade) cell, so every class in every
 * release below is a union of whole cells and every count can be checked by eye.
 */
import type { Employee } from './database';

/**
 * The ordered sensitive domain.
 *
 * t-closeness with the Earth Mover's distance needs a *ground distance* between
 * sensitive values, and Li, Li and Venkatasubramanian define it for ordered
 * domains as `ordered_dist(v_i, v_j) = |i − j| / (m − 1)` (ICDE 2007, §5.1).
 * That requires the domain to be totally ordered and the order to be declared
 * rather than inferred from a label, so it is declared here: five salary bands,
 * lowest to highest, with the lab's existing $100,000 high-earner threshold
 * falling exactly on the b3/b4 boundary.
 *
 * This is what makes "semantically related" a computation rather than a word.
 * Bands b1–b3 are all below the threshold; a class drawn entirely from them
 * discloses that its members earn less than $100,000 however many distinct
 * values it contains.
 */
export interface Band {
  readonly id: string;
  readonly label: string;
  /** Position in the total order, 0-based. */
  readonly index: number;
  readonly lo: number;
  /** Exclusive upper bound; Infinity for the top band. */
  readonly hi: number;
}

export const BANDS: readonly Band[] = [
  { id: 'b1', label: 'under $60,000', index: 0, lo: 0, hi: 60_000 },
  { id: 'b2', label: '$60,000–$79,999', index: 1, lo: 60_000, hi: 80_000 },
  { id: 'b3', label: '$80,000–$99,999', index: 2, lo: 80_000, hi: 100_000 },
  { id: 'b4', label: '$100,000–$129,999', index: 3, lo: 100_000, hi: 130_000 },
  { id: 'b5', label: '$130,000 and over', index: 4, lo: 130_000, hi: Infinity },
];

export const BAND_COUNT = BANDS.length;

/** The band a salary falls in. Throws rather than guessing on an unknown value. */
export function bandOf(salary: number): Band {
  const found = BANDS.find((b) => salary >= b.lo && salary < b.hi);
  if (!found) throw new Error(`salary ${salary} falls in no declared band`);
  return found;
}

export function bandById(id: string): Band {
  const found = BANDS.find((b) => b.id === id);
  if (!found) throw new Error(`no band ${id}`);
  return found;
}

/**
 * Sixteen synthetic records: four ZIP prefixes × four age decades, one each.
 *
 * Names are invented, the department column is carried only so the rows are
 * `Employee` records, and no row corresponds to any person. The salaries are
 * chosen to put each cell in a specific band — the grid is printed in the
 * README — so that the two independent releases below intersect to exactly one
 * band for the target and the arithmetic stays checkable by hand.
 */
export const REGISTRY: readonly Employee[] = [
  // ZIP 981**
  { id: 101, name: 'R-101', dept: 'Registry', age: 27, zip: '98101', salary: 118_000 },
  { id: 102, name: 'R-102', dept: 'Registry', age: 34, zip: '98102', salary: 66_000 },
  { id: 103, name: 'R-103', dept: 'Registry', age: 45, zip: '98103', salary: 92_000 },
  { id: 104, name: 'R-104', dept: 'Registry', age: 56, zip: '98104', salary: 74_000 },
  // ZIP 982**
  { id: 105, name: 'R-105', dept: 'Registry', age: 23, zip: '98201', salary: 51_000 },
  { id: 106, name: 'R-106', dept: 'Registry', age: 38, zip: '98202', salary: 88_000 },
  { id: 107, name: 'R-107', dept: 'Registry', age: 42, zip: '98203', salary: 164_000 },
  { id: 108, name: 'R-108', dept: 'Registry', age: 51, zip: '98204', salary: 126_000 },
  // ZIP 983**
  { id: 109, name: 'R-109', dept: 'Registry', age: 29, zip: '98301', salary: 151_000 },
  { id: 110, name: 'R-110', dept: 'Registry', age: 31, zip: '98302', salary: 48_000 },
  { id: 111, name: 'R-111', dept: 'Registry', age: 47, zip: '98303', salary: 69_000 },
  { id: 112, name: 'R-112', dept: 'Registry', age: 58, zip: '98304', salary: 104_000 },
  // ZIP 984**
  { id: 113, name: 'R-113', dept: 'Registry', age: 24, zip: '98401', salary: 44_000 },
  { id: 114, name: 'R-114', dept: 'Registry', age: 36, zip: '98402', salary: 57_000 },
  { id: 115, name: 'R-115', dept: 'Registry', age: 49, zip: '98403', salary: 112_000 },
  { id: 116, name: 'R-116', dept: 'Registry', age: 53, zip: '98404', salary: 97_000 },
];

/** The record the repeated-release attack is aimed at. */
export const REGISTRY_TARGET_ID = 101;

const decade = (age: number): string => `${Math.floor(age / 10) * 10}–${Math.floor(age / 10) * 10 + 9}`;
const twenty = (age: number): string => (age < 40 ? '20–39' : '40–59');
const zip3 = (zip: string): string => `${zip.slice(0, 3)}**`;

/**
 * The four releases, each a declared generalisation of the same sixteen rows.
 *
 * They are `GeneralizationLevel` values so `analyse()` partitions them — the
 * same function that measures k for the payroll, with no second implementation
 * of "what is an equivalence class".
 */
export interface Release {
  readonly id: string;
  readonly label: string;
  readonly short: string;
  readonly note: string;
  readonly dept: (e: Employee) => string;
  readonly age: (e: Employee) => string;
  readonly zip: (e: Employee) => string;
  /** What an attacker must know to find a person's class in this release. */
  readonly locatability: string;
}

export const RELEASES: readonly Release[] = [
  {
    id: 'pairs',
    label: 'ZIP to three digits, age to twenty-year bands',
    short: 'ZIP 3 + age 20yr',
    note:
      'Eight classes of two. 2-anonymous, and one class is unanimous — the homogeneity attack ' +
      'that ℓ-diversity was written to answer.',
    dept: () => 'any',
    age: (e) => twenty(e.age),
    zip: (e) => zip3(e.zip),
    locatability: 'the ZIP prefix and whether the person is under or over forty',
  },
  {
    id: 'age-decade',
    label: 'Age to ten-year bands, ZIP suppressed',
    short: 'age decade',
    note:
      'Four classes of four. Distinct 3-diverse everywhere, and one class draws all three of its ' +
      'values from the bottom of the order — a similarity attack, which diversity alone cannot see.',
    dept: () => 'any',
    age: (e) => decade(e.age),
    zip: () => '98***',
    locatability: 'the person’s age decade',
  },
  {
    id: 'zip3',
    label: 'ZIP to three digits, age suppressed',
    short: 'ZIP 3',
    note:
      'Four classes of four, cut the other way. Distinct 3-diverse, and every class distribution is ' +
      'within the declared t of the whole table.',
    dept: () => 'any',
    age: () => 'any',
    zip: (e) => zip3(e.zip),
    locatability: 'the person’s ZIP prefix',
  },
  {
    id: 'age-twenty',
    label: 'Age to twenty-year bands, ZIP suppressed',
    short: 'age 20yr',
    note:
      'Two classes of eight. The repaired release: distinct 4-diverse and within the declared t — ' +
      'and the page then measures what it cost the analyst.',
    dept: () => 'any',
    age: (e) => twenty(e.age),
    zip: () => '98***',
    locatability: 'whether the person is under or over forty',
  },
];

export function releaseById(id: string): Release {
  const found = RELEASES.find((r) => r.id === id);
  if (!found) throw new Error(`no release ${id}`);
  return found;
}

/**
 * The declared t.
 *
 * 9/64 is not a round number and is chosen on purpose: it is exactly the
 * largest class distance in the two releases that pass, so the page exercises
 * the boundary the definition actually states. Li et al.'s Definition 2 says a
 * class has t-closeness when the distance is "no more than a threshold t", so
 * equality PASSES, and a release sitting exactly on the line is the only way to
 * show that on screen rather than assert it.
 */
export const DECLARED_T = { n: 9n, d: 64n } as const;

/** The ℓ the policy asks for, in the distinct sense. */
export const DECLARED_L = 3;

/** The k the policy asks for. */
export const DECLARED_K = 4;
