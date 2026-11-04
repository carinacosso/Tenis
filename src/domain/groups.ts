import type { Id } from './common';
import { type DrawEntrant, buildBracket, meetingRound, standardSeedOrder } from './knockout';
import type { Group, GroupPlan, Match, MatchPlan, RoundPlan, SideSource } from './match';
import { type Rng, shuffle } from './random';
import { bracketSize } from './registration';
import { circleRounds } from './rotation';
import { isSuperTiebreakSet } from './scoring';
import { type StandingRow, computeStandings } from './standings';
import { type Tournament, tiebreakOrderOf } from './tournament';

/** Fase de grupos y liga: reparto en grupos, fixture todos contra todos y cuadro final. */

export const GROUP_NAMES = 'ABCDEFGHIJKLMNOP';

export function groupName(index: number): string {
  return GROUP_NAMES[index] ?? String(index + 1);
}

/**
 * Reparte en grupos en zigzag (A, B, C, C, B, A…): primero los cabezas de serie en orden,
 * así quedan en grupos distintos, y después el resto sorteado. Los grupos quedan parejos.
 */
export function distributeGroups(
  entrants: readonly DrawEntrant[],
  groupCount: number,
  rng: Rng,
  newId: () => Id,
): GroupPlan[] {
  if (groupCount < 1) throw new Error('Tiene que haber al menos un grupo.');
  const seeded = entrants
    .filter((e): e is DrawEntrant & { seed: number } => e.seed !== null)
    .sort((a, b) => a.seed - b.seed);
  const unseeded = shuffle(
    entrants.filter((e) => e.seed === null),
    rng,
  );
  const groups: GroupPlan[] = Array.from({ length: groupCount }, (_, index) => ({
    id: newId(),
    name: groupName(index),
    index,
    entryIds: [],
  }));
  [...seeded, ...unseeded].forEach((entrant, k) => {
    const lap = Math.floor(k / groupCount);
    const pos = k % groupCount;
    const target = groups[lap % 2 === 0 ? pos : groupCount - 1 - pos];
    target?.entryIds.push(entrant.id);
  });
  return groups;
}

/** Fixture todos contra todos (método del círculo). Con impares, uno queda libre por fecha. */
export function roundRobin(
  entryIds: readonly Id[],
  doubleRound: boolean,
  rng: Rng,
): { matches: [Id, Id][]; resting: Id[] }[] {
  if (entryIds.length < 2) return [];
  const base: (Id | null)[] = shuffle(entryIds, rng);
  if (base.length % 2 !== 0) base.push(null);
  const firstLeg = circleRounds(base).map((pairs, r) => {
    const matches: [Id, Id][] = [];
    const resting: Id[] = [];
    for (const [x, y] of pairs) {
      if (x === null && y !== null) resting.push(y);
      else if (y === null && x !== null) resting.push(x);
      else if (x !== null && y !== null) matches.push(r % 2 === 0 ? [x, y] : [y, x]);
    }
    return { matches, resting };
  });
  if (!doubleRound) return firstLeg;
  const secondLeg = firstLeg.map((round) => ({
    matches: round.matches.map(([x, y]): [Id, Id] => [y, x]),
    resting: [...round.resting],
  }));
  return [...firstLeg, ...secondLeg];
}

/** Arma las fechas de la fase de grupos (o de la liga): la fecha N junta la ronda N de cada grupo. */
export function generateGroupStage(
  groups: readonly GroupPlan[],
  doubleRound: boolean,
  rng: Rng,
  newId: () => Id,
): { rounds: RoundPlan[]; matches: MatchPlan[] } {
  const schedules = groups.map((g) => ({
    group: g,
    rounds: roundRobin(g.entryIds, doubleRound, rng),
  }));
  const total = Math.max(0, ...schedules.map((s) => s.rounds.length));
  const rounds: RoundPlan[] = [];
  const matches: MatchPlan[] = [];
  for (let r = 0; r < total; r++) {
    const number = r + 1;
    let position = 0;
    const resting: Id[] = [];
    for (const { group, rounds: schedule } of schedules) {
      const round = schedule[r];
      if (!round) continue;
      resting.push(...round.resting);
      for (const [a, b] of round.matches) {
        matches.push({
          id: newId(),
          round: number,
          position: position++,
          sideA: { kind: 'entry', entryId: a },
          sideB: { kind: 'entry', entryId: b },
          stage: 'group',
          groupId: group.id,
        });
      }
    }
    rounds.push({ id: newId(), number, restingEntryIds: resting });
  }
  return { rounds, matches };
}

export function groupMatches(matches: readonly Match[]): Match[] {
  return matches.filter((m) => m.stage === 'group');
}

export function playoffMatches(matches: readonly Match[]): Match[] {
  return matches.filter((m) => m.stage === 'playoff');
}

/** La fase de grupos terminó cuando todos sus partidos tienen resultado. */
export function isGroupStageComplete(matches: readonly Match[]): boolean {
  const group = groupMatches(matches);
  return group.length > 0 && group.every((m) => m.result !== null);
}

export interface GroupTable {
  groupIndex: number;
  rows: readonly StandingRow[];
}

/** Índice del set que se juega como super tie-break (para contar games), o null. */
export function superTiebreakIndex(tournament: Pick<Tournament, 'scoring'>): number | null {
  const { scoring } = tournament;
  return scoring.kind === 'sets' && isSuperTiebreakSet(scoring, scoring.bestOf - 1)
    ? scoring.bestOf - 1
    : null;
}

/** Tabla de cada grupo (ordenados A, B…) con el desempate configurado en el torneo. */
export function computeGroupTables(
  tournament: Pick<Tournament, 'id' | 'scoring' | 'tiebreakOrder'>,
  groups: readonly Pick<Group, 'id' | 'index' | 'entryIds'>[],
  matches: readonly Match[],
): GroupTable[] {
  const order = tiebreakOrderOf(tournament);
  const scoring = tournament.scoring.kind === 'sets' ? tournament.scoring : null;
  return [...groups]
    .sort((a, b) => a.index - b.index)
    .map((g) => ({
      groupIndex: g.index,
      rows: computeStandings(
        g.entryIds,
        matches.filter((m) => m.stage === 'group' && m.groupId === g.id),
        order,
        tournament.id,
        scoring,
      ),
    }));
}

interface Qualifier {
  entryId: Id;
  groupIndex: number;
  row: StandingRow;
}

/** Compara clasificados de la misma posición de grupos distintos (por promedio, porque los grupos pueden tener distinto tamaño). */
function compareAcrossGroups(x: Qualifier, y: Qualifier): number {
  const rate = (q: Qualifier, n: number) => (q.row.played > 0 ? n / q.row.played : 0);
  return (
    rate(y, y.row.won) - rate(x, x.row.won) ||
    rate(y, y.row.setDiff) - rate(x, x.row.setDiff) ||
    rate(y, y.row.gameDiff) - rate(x, x.row.gameDiff) ||
    x.groupIndex - y.groupIndex
  );
}

/**
 * Cuadro final a partir de las tablas de los grupos.
 * - Los 1° se ubican como cabezas de serie (el mejor 1° arriba, el segundo abajo…).
 * - Si los clasificados no son potencia de 2, los byes van a los mejores clasificados.
 * - El resto se ubica para que los del mismo grupo se crucen lo más tarde posible
 *   (mitades opuestas), y entre opciones iguales el mejor enfrenta al 1° más débil.
 *   Con 2 grupos queda 1°A vs 2°B y 1°B vs 2°A.
 */
export function buildPlayoff(
  tables: readonly GroupTable[],
  qualifiersPerGroup: number,
  newId: () => Id,
): MatchPlan[] {
  const qualifiers: Qualifier[] = [];
  for (let p = 0; p < qualifiersPerGroup; p++) {
    const atPosition = tables.flatMap((t): Qualifier[] => {
      const row = t.rows[p];
      return row ? [{ entryId: row.entryId, groupIndex: t.groupIndex, row }] : [];
    });
    qualifiers.push(...atPosition.sort(compareAcrossGroups));
  }
  if (qualifiers.length < 2) throw new Error('Se necesitan al menos 2 clasificados.');

  const size = bracketSize(qualifiers.length);
  const order = standardSeedOrder(size);
  const byes = size - qualifiers.length;
  const slots: (SideSource | null)[] = Array.from({ length: size }, () => null);
  const placed = new Map<number, number>(); // posición → índice del clasificado

  const fixed = Math.min(qualifiers.length, Math.max(tables.length, byes));
  for (let k = 0; k < fixed; k++) {
    const pos = order.indexOf(k + 1);
    const q = qualifiers[k];
    if (q) {
      slots[pos] = { kind: 'entry', entryId: q.entryId };
      placed.set(pos, k);
    }
  }
  for (let k = 0; k < byes; k++) slots[order.indexOf(k + 1) ^ 1] = { kind: 'bye' };

  for (let k = fixed; k < qualifiers.length; k++) {
    const q = qualifiers[k];
    if (!q) continue;
    const sameGroup = [...placed.entries()]
      .filter(([, idx]) => qualifiers[idx]?.groupIndex === q.groupIndex)
      .map(([pos]) => pos);
    let best = -1;
    let bestScore = -1;
    let bestOpponent = -2;
    for (let pos = 0; pos < size; pos++) {
      if (slots[pos] !== null) continue;
      const score = sameGroup.length
        ? Math.min(...sameGroup.map((other) => meetingRound(pos, other)))
        : Number.POSITIVE_INFINITY;
      const opponent = placed.get(pos ^ 1) ?? -1; // más alto = rival más débil
      if (score > bestScore || (score === bestScore && opponent > bestOpponent)) {
        best = pos;
        bestScore = score;
        bestOpponent = opponent;
      }
    }
    slots[best] = { kind: 'entry', entryId: q.entryId };
    placed.set(best, k);
  }

  const filled = slots.map((slot) => {
    if (!slot) throw new Error('Error interno al armar el cuadro final.');
    return slot;
  });
  return buildBracket(filled, newId, 'playoff');
}
