import { describe, expect, it } from 'vitest';
import { CURRICULUM, unitForChallenge, unitForStep } from './curriculum';
import { CORE_STEPS } from './state';

describe('the curriculum table', () => {
  it('covers every core step exactly once', () => {
    expect(CURRICULUM.map((u) => u.id)).toEqual([...CORE_STEPS]);
  });

  it('gives every step exactly one challenge question, and never shares one', () => {
    const ids = CURRICULUM.map((u) => u.challengeId);
    expect(new Set(ids).size).toBe(CURRICULUM.length);
  });

  // The whole reason this table exists: an objective with no interaction behind
  // it, or an interaction that nothing tests, is the drift it was made to stop.
  it('states a capability, an action and an establishing sentence for each', () => {
    for (const unit of CURRICULUM) {
      expect(unit.can.length).toBeGreaterThan(40);
      expect(unit.action.length).toBeGreaterThan(15);
      expect(unit.establishes.length).toBeGreaterThan(40);
      expect(unit.revisit.length).toBeGreaterThan(15);
    }
  });

  // The inline form exists because lowercasing the heading form would print
  // "the gaussian". Anything that regenerates it by `.toLowerCase()` fails here.
  it('keeps proper nouns capitalised in the mid-sentence concept form', () => {
    const delta = unitForChallenge('x-delta');
    expect(delta.conceptInline).toContain('Gaussian');
    for (const unit of CURRICULUM) {
      expect(unit.conceptInline).not.toMatch(/^[A-Z]/);
    }
  });

  it('points every link at a real in-page anchor', () => {
    for (const unit of CURRICULUM) {
      expect(unit.href).toMatch(/^#[a-z-]+$/);
      expect(unit.revisitHref).toMatch(/^#[a-z-]+$/);
    }
  });

  it('resolves a unit from either direction', () => {
    for (const unit of CURRICULUM) {
      expect(unitForStep(unit.id)).toBe(unit);
      expect(unitForChallenge(unit.challengeId)).toBe(unit);
    }
  });

  it('throws rather than returning a wrong unit for an unknown key', () => {
    // @ts-expect-error — deliberately outside the CoreStep union
    expect(() => unitForStep('not-a-step')).toThrow();
    expect(() => unitForChallenge('not-a-challenge')).toThrow();
  });

  // Only one revisit target is expert-gated today. If a second becomes gated,
  // or this one stops being, the flag has to move with it — otherwise a wrong
  // answer sends a guided reader to a section that is not on their page.
  it('flags exactly the revisit targets that the guided route sets aside', () => {
    const gated = CURRICULUM.filter((u) => u.revisitNeedsExplore).map((u) => u.challengeId);
    expect(gated).toEqual(['x-anonymisation']);
  });
});
