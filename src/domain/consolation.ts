import type { Id } from './common';
import { generateKnockout, resolveKnockout } from './knockout';
import type { Match, MatchPlan } from './match';
import type { Rng } from './random';

/** Cuadro de consolación: para los que pierden su primer partido del cuadro principal. */

export function mainDrawMatches(matches: readonly Match[]): Match[] {
  return matches.filter((m) => m.stage === undefined);
}

export function consolationMatches(matches: readonly Match[]): Match[] {
  return matches.filter((m) => m.stage === 'consolation');
}

/**
 * Quiénes van a la consolación: los que perdieron su primer partido jugado (los que tuvieron bye
 * cuentan su partido de 2.ª ronda). No entran los que perdieron ese partido por W.O. o lesión.
 * `complete` es true cuando ya se definieron todos esos primeros partidos.
 */
export function consolationEntrants(main: readonly Match[]): { complete: boolean; entrants: Id[] } {
  const resolved = [...resolveKnockout(main).values()].sort(
    (x, y) => x.match.round - y.match.round || x.match.position - y.match.position,
  );
  const entries = main
    .filter((m) => m.round === 1)
    .flatMap((m) => [m.sideA, m.sideB])
    .flatMap((s) => (s.kind === 'entry' ? [s.entryId] : []));
  let complete = true;
  const entrants: Id[] = [];
  for (const entry of entries) {
    const first = resolved.find((r) => r.state !== 'bye' && (r.a === entry || r.b === entry));
    if (!first || first.state !== 'finished') {
      complete = false;
      continue;
    }
    const outcome = first.match.result?.outcome;
    if (first.loser === entry && outcome !== 'walkover' && outcome !== 'injury')
      entrants.push(entry);
  }
  return { complete, entrants };
}

/** Sortea el cuadro de consolación (sin cabezas de serie). */
export function generateConsolation(
  entrants: readonly Id[],
  rng: Rng,
  newId: () => Id,
): MatchPlan[] {
  return generateKnockout(
    entrants.map((id) => ({ id, seed: null })),
    rng,
    newId,
  ).map((plan) => ({ ...plan, stage: 'consolation' as const }));
}
