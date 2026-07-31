/**
 * Classroom mode: the switch, and the label that has to travel with it.
 *
 * An instructor preparing a thirty-minute lesson needs the run they rehearsed.
 * A live cryptographic sampler is entitled to hand them a histogram that makes
 * the opposite point, in front of a room, once — and the correct response to
 * that risk is a labelled deterministic mode, not a mechanism that quietly
 * arranges tidy results.
 *
 * So this control does exactly one thing: it swaps which generator the samplers
 * draw from. It does not adjust, filter, retry or select any outcome. Nothing on
 * the page is easier to demonstrate in seeded mode than in live mode; the run is
 * simply the same run every time. And every panel that shows sampled output
 * prints `randomnessNote()` alongside it, so a seeded result can never be
 * mistaken for a live one.
 */
import { byId, clear, el } from './dom';
import { CLASSROOM_SEED } from './random';
import { getState, subscribe, update } from './state';

export function initTeaching(): void {
  const mount = byId('teaching-mode');
  const input = el('input', { type: 'checkbox', id: 'seed-toggle' });
  input.checked = getState().seeded;
  input.addEventListener('change', () => update({ seeded: input.checked }));

  const status = el('p', { class: 'note', role: 'status' });

  const paint = (): void => {
    clear(status);
    const seeded = getState().seeded;
    status.append(
      el('strong', { text: seeded ? 'Reproducible classroom run. ' : 'Live cryptographic randomness. ' }),
      document.createTextNode(
        seeded
          ? `Every sampled panel on this page now draws from a generator seeded at ` +
              `${CLASSROOM_SEED.toLocaleString('en-US')}, so a lesson can be rehearsed and repeated exactly. The ` +
              `mechanisms and the samplers are unchanged — only the sequence of draws is fixed, and no result is ` +
              `selected, retried or tidied. Sampled panels say so individually.`
          : `Every draw comes from crypto.getRandomValues, so no run repeats and an unlucky histogram is a real ` +
              `possibility. This is the default and the right setting for reading the page on your own.`,
      ),
    );
  };

  clear(mount);
  mount.append(
    el('div', { class: 'field field--inline' }, [
      input,
      el('label', { for: 'seed-toggle', text: 'Classroom mode — reproducible, seeded sampling' }),
    ]),
    status,
  );

  paint();
  subscribe((next, prev) => {
    if (next.seeded !== prev.seeded) {
      input.checked = next.seeded;
      paint();
    }
  });
}
