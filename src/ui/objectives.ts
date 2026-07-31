/**
 * The contract, stated before anything is asked of the reader.
 *
 * This is deliberately the least clever component on the page. It states four
 * capabilities in the second person and does nothing else — no progress, no
 * ticks, no state. The navigator immediately below it already carries all of
 * that, and duplicating it here would turn an opening promise into a second
 * scoreboard, which is both redundant and a subtly different message: a
 * contract that grades you while you read it is not a contract.
 *
 * It is rendered rather than written into the markup only so that it cannot
 * drift from the path steps and the exit questions — all three now come from
 * `CURRICULUM`, so an objective with no interaction behind it, or an
 * interaction testing something the page never promised, is not expressible.
 */
import { CURRICULUM } from './curriculum';
import { byId, clear, el } from './dom';

export function initObjectives(): void {
  const mount = byId('objectives');
  clear(mount);
  mount.append(
    el('h3', { text: 'By the end of this page, you can…' }),
    el(
      'ul',
      { class: 'objectives' },
      CURRICULUM.map((unit) => {
        // The lead clause is the capability; the rest is what it means in
        // practice. Splitting on the em dash keeps the four claims scannable
        // as a list while leaving the qualification attached to each one.
        const [lead, ...rest] = unit.can.split(' — ');
        return el('li', {}, [
          el('strong', { text: lead }),
          document.createTextNode(rest.length ? ` — ${rest.join(' — ')}` : ''),
        ]);
      }),
    ),
    el('p', {
      class: 'note',
      text:
        'Each of those is established by one interaction below and tested at the end on a situation this page has ' +
        'not shown you. Nothing here asks you to take a result on trust.',
    }),
  );
}
