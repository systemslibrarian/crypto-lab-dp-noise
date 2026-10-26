import { describe, expect, it } from 'vitest';
import { seededRng } from './rng';
import {
  auditFiniteGrid,
  euclidean,
  finiteGridDistribution,
  geoBound,
  inferCandidatePath,
  nearestPointIndex,
  pathTranscriptBound,
  planarDensity,
  planarPrivacyLoss,
  planarRadialCdf,
  planarRadiusQuantile,
  samplePlanarLaplace,
  squareGrid,
  tightPlanarWitness,
  type Point,
} from './geo';

const A: Point = { x: 0, y: 0 };
const B: Point = { x: 1, y: 0 };

describe('ideal planar Laplace mechanism', () => {
  it('pins the normalised density and its exponential decay', () => {
    const epsilon = 0.5;
    expect(planarDensity(epsilon, A, A)).toBeCloseTo(0.25 / (2 * Math.PI), 15);
    expect(planarDensity(epsilon, A, { x: 2, y: 0 })).toBeCloseTo(
      (0.25 / (2 * Math.PI)) * Math.exp(-1),
      15,
    );
  });

  it('reaches the epsilon-times-distance bound at a collinear witness', () => {
    const epsilon = 0.7;
    const witness = tightPlanarWitness(A, B, 3);
    expect(witness).toEqual({ x: -3, y: 0 });
    const loss = planarPrivacyLoss(epsilon, A, B, witness);
    expect(loss).toBeCloseTo(geoBound(epsilon, A, B), 15);
    expect(Math.exp(loss)).toBeCloseTo(
      planarDensity(epsilon, A, witness) / planarDensity(epsilon, B, witness),
      13,
    );
  });

  it('never exceeds the metric bound over a broad deterministic output grid', () => {
    const epsilon = 1.25;
    const a = { x: -0.5, y: 2 };
    const b = { x: 2.5, y: -1 };
    const bound = geoBound(epsilon, a, b);
    for (let y = -12; y <= 12; y += 0.5) {
      for (let x = -12; x <= 12; x += 0.5) {
        expect(Math.abs(planarPrivacyLoss(epsilon, a, b, { x, y }))).toBeLessThanOrEqual(
          bound + 1e-12,
        );
      }
    }
  });

  it('pins the radial CDF, mean scale and quantile inversion', () => {
    const epsilon = 0.5;
    expect(planarRadialCdf(epsilon, 2)).toBeCloseTo(1 - 2 / Math.E, 15);
    expect(planarRadialCdf(1, 1e-8)).toBeCloseTo(5e-17, 22);
    expect(planarRadialCdf(2, Number.MAX_VALUE)).toBe(1);
    for (const mass of [0, 0.1, 0.5, 0.9, 0.99]) {
      const radius = planarRadiusQuantile(epsilon, mass);
      expect(planarRadialCdf(epsilon, radius)).toBeCloseTo(mass, 13);
    }
  });

  it('samples Gamma(2, 1/epsilon) radius rather than two independent Laplace coordinates', () => {
    const epsilon = 0.5;
    const rng = seededRng(20_261_026);
    const draws = 50_000;
    let radiusSum = 0;
    let withinTwo = 0;
    for (let i = 0; i < draws; i++) {
      const draw = samplePlanarLaplace(epsilon, A, rng);
      radiusSum += draw.radius;
      if (draw.radius <= 2) withinTwo += 1;
      expect(euclidean(A, draw.point)).toBeCloseTo(draw.radius, 11);
    }
    expect(radiusSum / draws).toBeCloseTo(2 / epsilon, 1);
    expect(withinTwo / draws).toBeCloseTo(planarRadialCdf(epsilon, 2), 2);
  });

  it('selects the nearest service from the actual noisy point', () => {
    const services = [A, { x: 8, y: 0 }, { x: 0, y: 8 }];
    expect(nearestPointIndex({ x: 0.2, y: -0.1 }, services)).toBe(0);
    expect(nearestPointIndex({ x: 7.9, y: 0.2 }, services)).toBe(1);
    expect(nearestPointIndex({ x: 0.1, y: 7.8 }, services)).toBe(2);
  });
});

describe('finite-grid boundary control', () => {
  const grid = squareGrid(3);
  const borderA = { x: -3, y: 0 };
  const borderB = { x: -2, y: 0 };
  const epsilon = 0.5;

  it('normalises every finite distribution from its own input location', () => {
    for (const input of [borderA, borderB, A]) {
      const probabilities = finiteGridDistribution(epsilon, input, grid);
      expect(probabilities).toHaveLength(49);
      expect(probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 14);
      expect(probabilities.every((p) => p > 0)).toBe(true);
    }
  });

  it('exposes the naive border normaliser violation from computed probabilities', () => {
    const audit = auditFiniteGrid(epsilon, borderA, borderB, grid);
    expect(audit.witness).toEqual(borderA);
    expect(audit.maxAbsLogRatio).toBeCloseTo(0.7001084955107122, 13);
    expect(audit.maxAbsLogRatio).toBeGreaterThan(geoBound(epsilon, borderA, borderB));
  });

  it('keeps the half-rate repair within the requested epsilon bound', () => {
    const audit = auditFiniteGrid(epsilon / 2, borderA, borderB, grid);
    expect(audit.maxAbsLogRatio).toBeCloseTo(0.3748578630969641, 13);
    expect(audit.maxAbsLogRatio).toBeLessThanOrEqual(geoBound(epsilon, borderA, borderB));
  });

  it('keeps the half-rate guarantee across every pair on the bounded grid', () => {
    for (let a = 0; a < grid.length; a++) {
      for (let b = a + 1; b < grid.length; b++) {
        const audit = auditFiniteGrid(epsilon / 2, grid[a]!, grid[b]!, grid);
        expect(audit.maxAbsLogRatio).toBeLessThanOrEqual(geoBound(epsilon, grid[a]!, grid[b]!) + 1e-12);
      }
    }
  });
});

describe('repeated releases and public candidate paths', () => {
  const pathA = [0, 1, 2, 3].map((x) => ({ x, y: 0 }));
  const pathB = [0, 1, 2, 3].map((x) => ({ x, y: 1 }));

  it('computes inference from public paths and releases without a truth input', () => {
    const releases = pathA.map((point) => ({ x: point.x, y: point.y - 2 }));
    const inferred = inferCandidatePath(0.5, pathA, pathB, releases);
    expect(inferred.logLikelihoodAOverB).toBeCloseTo(2, 15);
    expect(inferred.favoured).toBe('A');
    expect(inferred.posteriorFavoured).toBeCloseTo(1 / (1 + Math.exp(-2)), 15);
  });

  it('sums per-release metric bounds instead of silently reusing one epsilon', () => {
    expect(pathTranscriptBound(0.5, pathA, pathB)).toBeCloseTo(2, 15);
    const releases = pathA.map((point) => ({ x: point.x, y: point.y + 20 }));
    const loss = inferCandidatePath(0.5, pathA, pathB, releases).logLikelihoodAOverB;
    expect(Math.abs(loss)).toBeLessThanOrEqual(pathTranscriptBound(0.5, pathA, pathB) + 1e-12);
  });
});

describe('geo input refusal', () => {
  it('fails closed on invalid epsilon, geometry, grids and transcripts', () => {
    expect(() => planarDensity(0, A, B)).toThrow(/epsilon/);
    expect(() => planarDensity(Number.NaN, A, B)).toThrow(/epsilon/);
    expect(() => planarDensity(Number.MIN_VALUE, A, B)).toThrow(/implementation range/);
    expect(() => planarDensity(1e200, A, B)).toThrow(/implementation range/);
    expect(() => euclidean({ x: Number.POSITIVE_INFINITY, y: 0 }, B)).toThrow(/finite/);
    expect(() => euclidean({ x: Number.MAX_VALUE, y: 0 }, { x: -Number.MAX_VALUE, y: 0 })).toThrow(/range/);
    expect(() => planarRadialCdf(1, -1)).toThrow(/radius/);
    expect(() => planarRadiusQuantile(1, 1)).toThrow(/mass/);
    expect(() => tightPlanarWitness(A, A)).toThrow(/differ/);
    expect(() => finiteGridDistribution(1, A, [])).toThrow(/grid/);
    expect(() => nearestPointIndex(A, [])).toThrow(/candidate/);
    expect(() => inferCandidatePath(1, [A], [B], [])).toThrow(/same non-zero length/);
    expect(() => pathTranscriptBound(1, [A], [])).toThrow(/same non-zero length/);
  });
});
