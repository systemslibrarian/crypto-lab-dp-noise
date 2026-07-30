/**
 * k-anonymity, and why differential privacy replaced it.
 *
 * k-anonymity (Sweeney 2002) is a property of a *released table*: every record
 * must be indistinguishable from at least k−1 others on the quasi-identifiers.
 * It is intuitive, it is checkable, and it is not enough — because a class of k
 * records that all share the same sensitive value tells you that value anyway.
 * Machanavajjhala et al. named this the homogeneity attack in 2007.
 *
 * Everything below is computed from the table, including k itself: the page
 * generalises the data, finds the equivalence classes, measures k, and then
 * looks for classes that leak. The contrast with DP is structural — k-anonymity
 * constrains the *output table*, differential privacy constrains the *process*,
 * and only the second one survives an attacker who knows what else is out there.
 */
import { EMPLOYEES, HIGH_EARNER_THRESHOLD, type Employee } from './database';

export interface GeneralizationLevel {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly dept: (e: Employee) => string;
  readonly age: (e: Employee) => string;
  readonly zip: (e: Employee) => string;
}

const TECHNICAL = new Set(['Engineering', 'Data Science']);

export const LEVELS: readonly GeneralizationLevel[] = [
  {
    id: 'raw',
    label: 'Raw table',
    note: 'Names removed, everything else published as collected. "De-identified" in the sense the phrase is usually meant.',
    dept: (e) => e.dept,
    age: (e) => String(e.age),
    zip: (e) => e.zip,
  },
  {
    id: 'age-banded',
    label: 'Age banded to 10 years',
    note: 'The usual first move — blur the field that looks most identifying and publish the rest.',
    dept: (e) => e.dept,
    age: (e) => `${Math.floor(e.age / 10) * 10}–${Math.floor(e.age / 10) * 10 + 9}`,
    zip: (e) => e.zip,
  },
  {
    id: 'k3',
    label: 'Age banded + ZIP truncated',
    note: 'Generalised until every equivalence class holds at least three people. This table really is 3-anonymous.',
    dept: (e) => e.dept,
    age: (e) => `${Math.floor(e.age / 10) * 10}–${Math.floor(e.age / 10) * 10 + 9}`,
    zip: (e) => `${e.zip.slice(0, 4)}*`,
  },
  {
    id: 'k6',
    label: 'Generalise everything further',
    note: 'Age dropped entirely, departments collapsed to technical and non-technical, ZIP down to three digits. Twice as anonymous by the k measure.',
    dept: (e) => (TECHNICAL.has(e.dept) ? 'Technical' : 'Non-technical'),
    age: () => 'any',
    zip: (e) => `${e.zip.slice(0, 3)}**`,
  },
];

export interface EquivalenceClass {
  readonly key: string;
  readonly dept: string;
  readonly age: string;
  readonly zip: string;
  readonly members: readonly Employee[];
  /** True when every member falls on the same side of the earnings threshold. */
  readonly homogeneous: boolean;
  /** The sensitive value the class gives away, when it is homogeneous. */
  readonly leaked: string | null;
}

export interface AnonymityReport {
  readonly level: GeneralizationLevel;
  readonly classes: readonly EquivalenceClass[];
  /** The measured k: the size of the smallest equivalence class. */
  readonly k: number;
  readonly homogeneousClasses: readonly EquivalenceClass[];
  /** Records whose sensitive attribute is disclosed despite the k that holds. */
  readonly recordsLeaked: number;
}

export function analyse(level: GeneralizationLevel, db: readonly Employee[] = EMPLOYEES): AnonymityReport {
  const buckets = new Map<string, Employee[]>();
  const meta = new Map<string, { dept: string; age: string; zip: string }>();
  for (const e of db) {
    const dept = level.dept(e);
    const age = level.age(e);
    const zip = level.zip(e);
    const key = `${dept}|${age}|${zip}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      meta.set(key, { dept, age, zip });
    }
    buckets.get(key)!.push(e);
  }

  const classes: EquivalenceClass[] = [];
  for (const [key, members] of buckets) {
    const high = members.filter((m) => m.salary > HIGH_EARNER_THRESHOLD).length;
    const homogeneous = high === 0 || high === members.length;
    const m = meta.get(key)!;
    classes.push({
      key,
      dept: m.dept,
      age: m.age,
      zip: m.zip,
      members,
      homogeneous,
      leaked: homogeneous
        ? high === members.length
          ? `earns more than $${HIGH_EARNER_THRESHOLD.toLocaleString('en-US')}`
          : `earns $${HIGH_EARNER_THRESHOLD.toLocaleString('en-US')} or less`
        : null,
    });
  }
  classes.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));

  const homogeneousClasses = classes.filter((c) => c.homogeneous);
  return {
    level,
    classes,
    k: Math.min(...classes.map((c) => c.members.length)),
    homogeneousClasses,
    recordsLeaked: homogeneousClasses.reduce((acc, c) => acc + c.members.length, 0),
  };
}

/** The class a given person lands in — what an attacker who knows their record finds. */
export function classOf(report: AnonymityReport, id: number): EquivalenceClass | null {
  return report.classes.find((c) => c.members.some((m) => m.id === id)) ?? null;
}
