import type { Id } from './common';
import { type Match, sideEntries } from './match';
import { stableLottery } from './rotationStandings';
import type { MatchResult } from './scoring';
import type { TiebreakCriterion } from './tournament';

/** Fila de la tabla de posiciones de un grupo o liga (partidos por sets). */
export interface StandingRow {
  entryId: Id;
  position: number;
  played: number;
  won: number;
  lost: number;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  setDiff: number;
  gameDiff: number;
}

interface Tally {
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
}

/**
 * Sets y games de un resultado. El super tie-break cuenta como set y como un game (1-0)
 * para el que lo ganó, para no inflar la diferencia de games con sus puntos.
 */
export function tallyResult(result: MatchResult, superTiebreakIndex: number | null): Tally {
  const t: Tally = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0 };
  if (result.kind !== 'sets') return t;
  result.sets.forEach((s, i) => {
    if (s.a > s.b) t.setsA++;
    else t.setsB++;
    if (i === superTiebreakIndex) {
      if (s.a > s.b) t.gamesA++;
      else t.gamesB++;
    } else {
      t.gamesA += s.a;
      t.gamesB += s.b;
    }
  });
  return t;
}

function emptyRow(entryId: Id): StandingRow {
  return {
    entryId,
    position: 0,
    played: 0,
    won: 0,
    lost: 0,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    setDiff: 0,
    gameDiff: 0,
  };
}

/** Acumula los partidos jugados entre las inscripciones dadas. */
function accumulate(
  entryIds: readonly Id[],
  matches: readonly Match[],
  superTiebreakIndex: number | null,
): Map<Id, StandingRow> {
  const rows = new Map(entryIds.map((id) => [id, emptyRow(id)]));
  for (const match of matches) {
    if (!match.result) continue;
    const [a] = sideEntries(match.sideA);
    const [b] = sideEntries(match.sideB);
    const rowA = a === undefined ? undefined : rows.get(a);
    const rowB = b === undefined ? undefined : rows.get(b);
    if (!rowA || !rowB) continue;
    const t = tallyResult(match.result, superTiebreakIndex);
    const winnerIsA = match.result.winner === 'A';
    for (const [row, own, other, won] of [
      [rowA, t, { setsA: t.setsB, setsB: t.setsA, gamesA: t.gamesB, gamesB: t.gamesA }, winnerIsA],
      [rowB, { setsA: t.setsB, setsB: t.setsA, gamesA: t.gamesB, gamesB: t.gamesA }, t, !winnerIsA],
    ] as const) {
      row.played++;
      if (won) row.won++;
      else row.lost++;
      row.setsFor += own.setsA;
      row.setsAgainst += other.setsA;
      row.gamesFor += own.gamesA;
      row.gamesAgainst += other.gamesA;
    }
  }
  for (const row of rows.values()) {
    row.setDiff = row.setsFor - row.setsAgainst;
    row.gameDiff = row.gamesFor - row.gamesAgainst;
  }
  return rows;
}

/**
 * Tabla de posiciones con desempate configurable.
 * Se aplica cada criterio en orden a los que siguen empatados. El enfrentamiento directo
 * usa una mini tabla con los partidos entre los empatados (partidos ganados entre ellos).
 * Al final, sorteo estable por torneo.
 */
export function computeStandings(
  entryIds: readonly Id[],
  matches: readonly Match[],
  order: readonly TiebreakCriterion[],
  lotterySeed: string,
  superTiebreakIndex: number | null = null,
): StandingRow[] {
  const rows = accumulate(entryIds, matches, superTiebreakIndex);
  const value = (criterion: TiebreakCriterion, id: Id, tied: readonly Id[]): number => {
    const row = rows.get(id);
    if (!row) return 0;
    switch (criterion) {
      case 'wins':
        return row.won;
      case 'setDiff':
        return row.setDiff;
      case 'gameDiff':
        return row.gameDiff;
      case 'headToHead': {
        const between = matches.filter((m) => {
          const ids = [...sideEntries(m.sideA), ...sideEntries(m.sideB)];
          return ids.every((x) => tied.includes(x));
        });
        return accumulate(tied, between, superTiebreakIndex).get(id)?.won ?? 0;
      }
    }
  };

  const rank = (ids: Id[], level: number): Id[] => {
    if (ids.length <= 1) return ids;
    const criterion = order[level];
    if (criterion === undefined) {
      return [...ids].sort(
        (x, y) => stableLottery(`${lotterySeed}:${x}`) - stableLottery(`${lotterySeed}:${y}`),
      );
    }
    const buckets = new Map<number, Id[]>();
    for (const id of ids) {
      const v = value(criterion, id, ids);
      buckets.set(v, [...(buckets.get(v) ?? []), id]);
    }
    return [...buckets.entries()]
      .sort((x, y) => y[0] - x[0])
      .flatMap(([, group]) => rank(group, level + 1));
  };

  return rank([...entryIds], 0).map((id, i) => ({
    ...(rows.get(id) ?? emptyRow(id)),
    position: i + 1,
  }));
}
