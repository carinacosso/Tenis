import type { Id } from './common';
import { type Match, type Round, sideEntries } from './match';
import { pointsOf } from './scoring';

/** Fila del ranking de un formato rotativo. */
export interface RotationRow {
  entryId: Id;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Puntos acreditados por descansar (promedio por jugador de cada ronda completa). */
  restPoints: number;
  rests: number;
  /** pointsFor + restPoints. Es el criterio principal del ranking. */
  total: number;
  /** pointsFor − pointsAgainst. */
  diff: number;
}

/** Número pseudoaleatorio estable a partir de un texto (FNV-1a), para el "sorteo" de desempate. */
export function stableLottery(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Una ronda está completa cuando todos sus partidos tienen resultado. */
export function isRoundComplete(round: number, matches: readonly Match[]): boolean {
  const inRound = matches.filter((m) => m.round === round);
  return inRound.length > 0 && inRound.every((m) => m.result !== null);
}

/**
 * Ranking: puntos totales → partidos ganados → diferencia de puntos → sorteo.
 * Cada jugador suma los puntos de su lado en cada partido. El que descansa suma
 * el promedio de puntos por jugador de esa ronda, cuando la ronda está completa.
 */
export function rotationStandings(
  entryIds: readonly Id[],
  matches: readonly Match[],
  rounds: readonly Round[],
  lotterySeed: string,
): RotationRow[] {
  const rows = new Map<Id, RotationRow>(
    entryIds.map((id) => [
      id,
      {
        entryId: id,
        position: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        restPoints: 0,
        rests: 0,
        total: 0,
        diff: 0,
      },
    ]),
  );

  for (const match of matches) {
    if (!match.result) continue;
    const score = pointsOf(match.result);
    if (!score) continue;
    const sides: [Id[], number, number, 'A' | 'B'][] = [
      [sideEntries(match.sideA), score.a, score.b, 'A'],
      [sideEntries(match.sideB), score.b, score.a, 'B'],
    ];
    for (const [ids, own, other, side] of sides) {
      for (const id of ids) {
        const row = rows.get(id);
        if (!row) continue;
        row.played++;
        row.pointsFor += own;
        row.pointsAgainst += other;
        if (match.result.winner === null) row.drawn++;
        else if (match.result.winner === side) row.won++;
        else row.lost++;
      }
    }
  }

  for (const round of rounds) {
    for (const id of round.restingEntryIds) {
      const row = rows.get(id);
      if (row) row.rests++;
    }
    if (round.restingEntryIds.length === 0 || !isRoundComplete(round.number, matches)) continue;
    let points = 0;
    let players = 0;
    for (const match of matches.filter((m) => m.round === round.number && m.result)) {
      const score = match.result ? pointsOf(match.result) : null;
      if (!score) continue;
      const a = sideEntries(match.sideA).length;
      const b = sideEntries(match.sideB).length;
      points += score.a * a + score.b * b;
      players += a + b;
    }
    const average = players > 0 ? points / players : 0;
    for (const id of round.restingEntryIds) {
      const row = rows.get(id);
      if (row) row.restPoints += average;
    }
  }

  const sorted = [...rows.values()].map((row) => ({
    ...row,
    restPoints: Math.round(row.restPoints * 10) / 10,
    total: Math.round((row.pointsFor + row.restPoints) * 10) / 10,
    diff: row.pointsFor - row.pointsAgainst,
  }));
  sorted.sort(
    (x, y) =>
      y.total - x.total ||
      y.won - x.won ||
      y.diff - x.diff ||
      stableLottery(`${lotterySeed}:${x.entryId}`) - stableLottery(`${lotterySeed}:${y.entryId}`),
  );
  return sorted.map((row, i) => ({ ...row, position: i + 1 }));
}

/** Última ronda generada (0 si no hay ninguna). */
export function lastRoundNumber(rounds: readonly Pick<Round, 'number'>[]): number {
  return Math.max(0, ...rounds.map((r) => r.number));
}

/** Un rotativo termina cuando se generaron todas las rondas previstas y todas tienen resultado. */
export function isRotationFinished(
  plannedRounds: number | null | undefined,
  matches: readonly Match[],
  rounds: readonly Pick<Round, 'number'>[],
): boolean {
  if (!plannedRounds || lastRoundNumber(rounds) < plannedRounds) return false;
  return rounds.every((r) => isRoundComplete(r.number, matches));
}

/** Motivo por el que todavía no se puede generar la siguiente ronda del Mexicano, o null si se puede. */
export function nextRoundBlocker(
  plannedRounds: number | null | undefined,
  matches: readonly Match[],
  rounds: readonly Pick<Round, 'number'>[],
): string | null {
  const last = lastRoundNumber(rounds);
  if (last === 0) return 'Todavía no se generaron los cruces.';
  if (plannedRounds && last >= plannedRounds) return 'Ya se generaron todas las rondas.';
  if (!isRoundComplete(last, matches))
    return `Terminá de cargar los resultados de la ronda ${last}.`;
  return null;
}
