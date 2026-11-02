import type { EntityBase, Id } from './common';
import { type Rng, shuffle } from './random';
import { bracketSize } from './registration';
import type { MatchResult } from './scoring';

/** De dónde sale cada lado de un partido. */
export type SideSource =
  { kind: 'entry'; entryId: Id } | { kind: 'bye' } | { kind: 'winnerOf'; matchId: Id };

export interface Match extends EntityBase {
  tournamentId: Id;
  /** Ronda, desde 1. */
  round: number;
  /** Posición dentro de la ronda, desde 0 (de arriba hacia abajo en el cuadro). */
  position: number;
  sideA: SideSource;
  sideB: SideSource;
  result: MatchResult | null;
}

/** Partido generado por el sorteo, antes de agregarle los campos de persistencia. */
export type MatchPlan = Pick<Match, 'id' | 'round' | 'position' | 'sideA' | 'sideB'>;

export interface DrawEntrant {
  id: Id;
  seed: number | null;
}

/**
 * Orden estándar de cabezas de serie en el cuadro (ITF/ATP): posición → número de cabeza "virtual".
 * Para 8: [1, 8, 5, 4, 3, 6, 7, 2]. Para 16, los cabezas 3 y 4 quedan arriba del 2.º cuarto
 * y abajo del 3.º (líneas 5 y 12). En cada partido de primera ronda las cabezas suman size + 1.
 */
export function standardSeedOrder(size: number): number[] {
  // 1. Orden de las secciones (una por partido de primera ronda): [1], [1,2], [1,4,3,2], [1,8,4,5,6,3,7,2]…
  let sections = [1];
  while (sections.length < size / 2) {
    const n = sections.length * 2;
    const half = sections.length / 2;
    sections = sections.flatMap((v, i) => (i < half ? [v, n + 1 - v] : [n + 1 - v, v]));
  }
  // 2. En cada sección, la cabeza va arriba si la sección es impar (1.ª, 3.ª…) y abajo si es par.
  const order: number[] = [];
  sections.forEach((v, j) => {
    const top = j % 2 === 0;
    order.push(top ? v : size + 1 - v, top ? size + 1 - v : v);
  });
  return order;
}

/** Grupos de cabezas que se sortean entre sí: [1], [2], [3-4], [5-8], [9-16]… */
function seedGroup(seed: number): [number, number] {
  if (seed <= 2) return [seed, seed];
  let low = 3;
  let high = 4;
  while (seed > high) {
    low = high + 1;
    high *= 2;
  }
  return [low, high];
}

export function roundCount(size: number): number {
  return Math.log2(size);
}

/** Nombre de la ronda según cuántos partidos tiene. */
export function roundName(round: number, totalRounds: number): string {
  const matches = 2 ** (totalRounds - round);
  if (matches === 1) return 'Final';
  if (matches === 2) return 'Semifinal';
  if (matches === 4) return 'Cuartos de final';
  if (matches === 8) return 'Octavos de final';
  return `${matches}avos de final`;
}

/**
 * Arma el cuadro de eliminación directa.
 * - Cabezas 1 y 2 en los extremos; 3-4, 5-8, etc. se sortean dentro de sus posiciones estándar.
 * - Byes: primero enfrente de los cabezas de serie (en orden), después según el orden estándar.
 * - El resto se sortea al azar.
 */
export function generateKnockout(
  entrants: readonly DrawEntrant[],
  rng: Rng,
  newId: () => Id,
): MatchPlan[] {
  if (entrants.length < 2) throw new Error('Se necesitan al menos 2 inscriptos.');
  const size = bracketSize(entrants.length);
  const order = standardSeedOrder(size);
  const slots: (SideSource | null)[] = Array.from({ length: size }, () => null);

  // 1. Cabezas de serie
  const seeded = entrants
    .filter((e): e is DrawEntrant & { seed: number } => e.seed !== null)
    .sort((a, b) => a.seed - b.seed);
  if (seeded.length > size / 2) throw new Error('Demasiados cabezas de serie.');
  const seedPositions: number[] = [];
  const groups = new Map<string, (DrawEntrant & { seed: number })[]>();
  seeded.forEach((entrant, i) => {
    const rank = i + 1; // se normaliza: los cabezas se toman en orden 1..k
    const key = seedGroup(rank).join('-');
    groups.set(key, [...(groups.get(key) ?? []), entrant]);
  });
  for (const [key, members] of groups) {
    const [low, high] = key.split('-').map(Number) as [number, number];
    const positions = order.flatMap((v, pos) => (v >= low && v <= high ? [pos] : []));
    const chosen = low === high ? positions : shuffle(positions, rng);
    members.forEach((entrant, i) => {
      const pos = chosen[i];
      if (pos === undefined) return;
      slots[pos] = { kind: 'entry', entryId: entrant.id };
      seedPositions.push(pos);
    });
  }

  // 2. Byes: enfrente de los cabezas (en orden), y después de las cabezas "virtuales" libres.
  const byes = size - entrants.length;
  const anchorPositions = [
    ...seedPositions,
    ...order
      .map((v, pos) => ({ v, pos }))
      .filter(({ v, pos }) => v <= size / 2 && !seedPositions.includes(pos))
      .sort((x, y) => x.v - y.v)
      .map(({ pos }) => pos),
  ];
  for (const pos of anchorPositions.slice(0, byes)) slots[pos ^ 1] = { kind: 'bye' };

  // 3. Resto, sorteado
  const unseeded = shuffle(
    entrants.filter((e) => e.seed === null),
    rng,
  );
  let next = 0;
  for (let pos = 0; pos < size; pos++) {
    if (slots[pos] !== null) continue;
    const entrant = unseeded[next++];
    if (!entrant) throw new Error('Error interno al completar el cuadro.');
    slots[pos] = { kind: 'entry', entryId: entrant.id };
  }

  // 4. Partidos
  const plans: MatchPlan[] = [];
  let previous: MatchPlan[] = [];
  for (let i = 0; i < size / 2; i++) {
    const sideA = slots[2 * i];
    const sideB = slots[2 * i + 1];
    if (!sideA || !sideB) throw new Error('Error interno al armar la primera ronda.');
    previous.push({ id: newId(), round: 1, position: i, sideA, sideB });
  }
  plans.push(...previous);
  for (let round = 2; round <= roundCount(size); round++) {
    const current: MatchPlan[] = [];
    for (let i = 0; i < previous.length / 2; i++) {
      const top = previous[2 * i];
      const bottom = previous[2 * i + 1];
      if (!top || !bottom) throw new Error('Error interno al armar las rondas.');
      current.push({
        id: newId(),
        round,
        position: i,
        sideA: { kind: 'winnerOf', matchId: top.id },
        sideB: { kind: 'winnerOf', matchId: bottom.id },
      });
    }
    plans.push(...current);
    previous = current;
  }
  return plans;
}

export type MatchState = 'waiting' | 'ready' | 'finished' | 'bye';

export interface ResolvedMatch {
  match: Match;
  a: Id | null;
  b: Id | null;
  state: MatchState;
  winner: Id | null;
  loser: Id | null;
}

/** Calcula quién juega cada partido y quién ganó, a partir de los resultados cargados. */
export function resolveKnockout(matches: readonly Match[]): Map<Id, ResolvedMatch> {
  const resolved = new Map<Id, ResolvedMatch>();
  const sorted = [...matches].sort((x, y) => x.round - y.round || x.position - y.position);
  const sideEntry = (source: SideSource): Id | null => {
    if (source.kind === 'entry') return source.entryId;
    if (source.kind === 'bye') return null;
    return resolved.get(source.matchId)?.winner ?? null;
  };
  for (const match of sorted) {
    const a = sideEntry(match.sideA);
    const b = sideEntry(match.sideB);
    const byeA = match.sideA.kind === 'bye';
    const byeB = match.sideB.kind === 'bye';
    let state: MatchState;
    let winner: Id | null = null;
    let loser: Id | null = null;
    if (byeA || byeB) {
      state = 'bye';
      winner = byeA ? b : a;
    } else if (a === null || b === null) {
      state = 'waiting';
    } else if (match.result) {
      state = 'finished';
      winner = match.result.winner === 'A' ? a : b;
      loser = match.result.winner === 'A' ? b : a;
    } else {
      state = 'ready';
    }
    resolved.set(match.id, { match, a, b, state, winner, loser });
  }
  return resolved;
}

/**
 * Aplica (o borra, con `result = null`) el resultado de un partido.
 * Si cambia el ganador, los partidos siguientes que ya tenían resultado y cambian de jugadores
 * quedan sin resultado (recálculo en cascada). Devuelve los partidos actualizados y los afectados.
 */
export function applyKnockoutResult(
  matches: readonly Match[],
  matchId: Id,
  result: MatchResult | null,
): { matches: Match[]; cleared: Id[] } {
  const before = resolveKnockout(matches);
  const target = before.get(matchId);
  if (!target) throw new Error('El partido no existe.');
  if (result !== null && target.state !== 'ready' && target.state !== 'finished') {
    throw new Error('El partido todavía no tiene definidos a sus dos jugadores.');
  }
  let updated = matches.map((m) => (m.id === matchId ? { ...m, result } : m));
  const cleared: Id[] = [];
  for (;;) {
    const after = resolveKnockout(updated);
    const stale = updated.find((m) => {
      if (m.id === matchId || m.result === null) return false;
      const was = before.get(m.id);
      const now = after.get(m.id);
      return !was || !now || was.a !== now.a || was.b !== now.b;
    });
    if (!stale) break;
    cleared.push(stale.id);
    updated = updated.map((m) => (m.id === stale.id ? { ...m, result: null } : m));
  }
  return { matches: updated, cleared };
}

export interface Podium {
  champion: Id | null;
  runnerUp: Id | null;
  /** Perdedores de semifinal (no se juega partido por el tercer puesto). */
  thirds: Id[];
}

export function knockoutPodium(matches: readonly Match[]): Podium {
  const resolved = resolveKnockout(matches);
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  const final = [...resolved.values()].find((r) => r.match.round === rounds);
  const semis = [...resolved.values()].filter((r) => r.match.round === rounds - 1);
  return {
    champion: final?.winner ?? null,
    runnerUp: final?.loser ?? null,
    thirds: semis.flatMap((r) => (r.loser ? [r.loser] : [])),
  };
}

/** El torneo terminó cuando la final tiene ganador. */
export function isKnockoutFinished(matches: readonly Match[]): boolean {
  return matches.length > 0 && knockoutPodium(matches).champion !== null;
}
