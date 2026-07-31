/**
 * Which randomness the page's samplers draw from.
 *
 * The default is and stays `crypto.getRandomValues`. Classroom mode swaps in
 * the seeded sfc32 generator that the test suite uses, for one reason only: an
 * instructor preparing a lesson needs the histogram they rehearsed with, and a
 * live sampler is entitled to hand them an unlucky draw in front of a room.
 *
 * Two rules keep this from becoming a lie:
 *
 * 1. **Nothing is rigged.** The seeded generator feeds the same exact samplers
 *    through the same code path. It fixes the *sequence*, not the result, so a
 *    seeded averaging attack converges because averaging attacks converge, not
 *    because the page arranged a tidy number.
 * 2. **It is always labelled.** `randomnessNote()` returns a sentence for any
 *    panel showing sampled output, and the mode switch says the same thing.
 *    A reproducible run that looked like a live one would undermine every
 *    "this is the real mechanism" claim the page makes.
 *
 * The indirection is a getter rather than a captured `Rng` because the exhibits
 * construct their samplers at module load, long before anyone flips the switch.
 */
import { cryptoRng, seededRng, type Rng } from '../dp/rng';
import { getState, subscribe } from './state';

/** Fixed so that "the seed" is a property of the page, not of the session. */
export const CLASSROOM_SEED = 20_260_730;

let live: Rng = cryptoRng();
let seeded: Rng = seededRng(CLASSROOM_SEED);

/**
 * The generator the mechanisms should draw from right now.
 *
 * Returned as a stable façade rather than the underlying object so a caller may
 * hold it forever and still follow the switch — `const rng = sharedRng()` at
 * module scope is the usual pattern in this codebase and it has to keep working.
 */
export function sharedRng(): Rng {
  return {
    nextUint32(): number {
      return getState().seeded ? seeded.nextUint32() : live.nextUint32();
    },
  };
}

/**
 * Rewind the seeded stream. Called whenever classroom mode is switched on, so
 * that entering the mode twice in a session gives the same run twice — which is
 * the entire point of the mode and would otherwise depend on how many draws had
 * been taken in between.
 */
export function rewindSeeded(): void {
  seeded = seededRng(CLASSROOM_SEED);
}

export function randomnessNote(): string {
  return getState().seeded
    ? `Reproducible classroom run, not live randomness — seeded at ${CLASSROOM_SEED.toLocaleString('en-US')}. ` +
        `The sampler and the mechanism are unchanged; only the sequence of draws is fixed, so this run can be ` +
        `rehearsed and repeated. Switch classroom mode off for cryptographic randomness.`
    : `Live cryptographic randomness — every draw comes from crypto.getRandomValues, so this run is not repeatable.`;
}

export function initRandom(): void {
  subscribe((next, prev) => {
    if (next.seeded && !prev.seeded) rewindSeeded();
  });
}
