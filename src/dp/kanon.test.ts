import { describe, expect, it } from 'vitest';
import { EMPLOYEES, TARGET_ID } from './database';
import { analyse, classOf, LEVELS } from './kanon';

const level = (id: string) => LEVELS.find((l) => l.id === id)!;

describe('k, measured rather than claimed', () => {
  it.each([
    ['raw', 1],
    ['age-banded', 1],
    ['k3', 3],
    ['k6', 6],
  ])('%s is %s-anonymous', (id, k) => {
    expect(analyse(level(id)).k).toBe(k);
  });

  it('still leaves everyone unique when only the age is blurred', () => {
    // The classic mistake: generalise the field that feels identifying and stop.
    // ZIP alone still singles out all twelve people.
    const report = analyse(level('age-banded'));
    expect(report.classes).toHaveLength(12);
  });

  it('partitions every record exactly once, at every level', () => {
    for (const l of LEVELS) {
      const report = analyse(l);
      const ids = report.classes.flatMap((c) => c.members.map((m) => m.id));
      expect(ids).toHaveLength(EMPLOYEES.length);
      expect(new Set(ids).size).toBe(EMPLOYEES.length);
    }
  });
});

describe('the homogeneity attack', () => {
  it('leaks the sensitive attribute even at k = 3 and k = 6', () => {
    // This is why k-anonymity was not enough. Every equivalence class in this
    // table agrees on the sensitive attribute, so knowing which class someone
    // is in is knowing their answer — with the k guarantee fully intact.
    for (const id of ['k3', 'k6']) {
      const report = analyse(level(id));
      expect(report.k).toBeGreaterThanOrEqual(3);
      expect(report.homogeneousClasses).toHaveLength(report.classes.length);
      expect(report.recordsLeaked).toBe(EMPLOYEES.length);
    }
  });

  it('names the value it gives away', () => {
    const report = analyse(level('k3'));
    const cls = classOf(report, TARGET_ID);
    expect(cls).not.toBeNull();
    expect(cls!.members).toHaveLength(3);
    expect(cls!.homogeneous).toBe(true);
    expect(cls!.leaked).toContain('more than');
  });

  it('gets no better as k rises', () => {
    // Generalising further doubles k and changes nothing an attacker cares
    // about — the failure is structural, not a matter of tuning.
    const k3 = analyse(level('k3'));
    const k6 = analyse(level('k6'));
    expect(k6.k).toBeGreaterThan(k3.k);
    expect(k6.recordsLeaked).toBe(k3.recordsLeaked);
  });

  it('returns null for a record that is not in the table', () => {
    expect(classOf(analyse(level('k3')), 999)).toBeNull();
  });
});
