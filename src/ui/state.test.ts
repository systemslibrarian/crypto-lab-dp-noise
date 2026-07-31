import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EPS_DEFAULT_INDEX } from '../dp/params';
import { complete, CORE_STEPS, coreProgress, getState, resetState, subscribe, update } from './state';

beforeEach(() => {
  resetState();
});

describe('the initial state', () => {
  it('opens on the guided route with linking on', () => {
    expect(getState().route).toBe('guided');
    expect(getState().linked).toBe(true);
  });

  it('never opens in classroom mode — cryptographic randomness is the default', () => {
    expect(getState().seeded).toBe(false);
  });

  it('starts at the ladder default and with nothing established', () => {
    expect(getState().epsIndex).toBe(EPS_DEFAULT_INDEX);
    expect(coreProgress()).toEqual({ done: 0, total: 4, allDone: false });
  });
});

describe('update', () => {
  it('merges a patch and notifies with both states', () => {
    const seen = vi.fn();
    subscribe(seen);
    update({ epsIndex: 3 });
    expect(getState().epsIndex).toBe(3);
    expect(getState().route).toBe('guided');
    expect(seen).toHaveBeenCalledTimes(1);
    const [next, prev] = seen.mock.calls[0];
    expect(next.epsIndex).toBe(3);
    expect(prev.epsIndex).toBe(EPS_DEFAULT_INDEX);
  });

  it('leaves completion alone', () => {
    complete('differencing');
    update({ route: 'explore' });
    expect(getState().completed.has('differencing')).toBe(true);
  });

  it('stops notifying once a subscriber unsubscribes', () => {
    const seen = vi.fn();
    const off = subscribe(seen);
    update({ epsIndex: 1 });
    off();
    update({ epsIndex: 2 });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('complete', () => {
  it('records a step and reports progress', () => {
    complete('differencing');
    complete('definition');
    expect(coreProgress()).toEqual({ done: 2, total: 4, allDone: false });
  });

  it('is idempotent, and silent on a repeat', () => {
    const seen = vi.fn();
    subscribe(seen);
    complete('budget');
    complete('budget');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(coreProgress().done).toBe(1);
  });

  it('reports allDone only once every core step is established', () => {
    for (const step of CORE_STEPS.slice(0, -1)) complete(step);
    expect(coreProgress().allDone).toBe(false);
    complete(CORE_STEPS[CORE_STEPS.length - 1]);
    expect(coreProgress()).toEqual({ done: 4, total: 4, allDone: true });
  });

  it('never un-completes a step', () => {
    complete('sensitivity');
    update({ route: 'explore', linked: false, epsIndex: 0, seeded: true });
    complete('sensitivity');
    expect(getState().completed.has('sensitivity')).toBe(true);
  });

  // The store hands out a ReadonlySet, but a caller could still cast it away;
  // the copy-on-write in `complete` is what actually protects earlier snapshots.
  it('does not mutate a previously observed state object', () => {
    const before = getState();
    complete('differencing');
    expect(before.completed.size).toBe(0);
    expect(getState().completed.size).toBe(1);
  });
});
