import { describe, expect, it } from 'vitest';
import type { Match, Round } from './match';
import {
  isRotationFinished,
  isRoundComplete,
  lastRoundNumber,
  nextRoundBlocker,
  rotationStandings,
  stableLottery,
} from './rotationStandings';
import type { MatchResult } from './scoring';

const base = {
  ownerId: 'local',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  tournamentId: 't',
};

function match(
  round: number,
  a: string[],
  b: string[],
  score: [number, number] | null,
  kind: 'points' | 'time' = 'points',
): Match {
  let result: MatchResult | null = null;
  if (score) {
    const [x, y] = score;
    const winner = x === y ? null : x > y ? ('A' as const) : ('B' as const);
    result =
      kind === 'time' || winner === null
        ? { kind: 'time', outcome: 'normal', a: x, b: y, winner }
        : { kind: 'points', outcome: 'normal', a: x, b: y, winner };
  }
  return {
    ...base,
    id: `${round}-${a.join()}`,
    round,
    position: 0,
    sideA: { kind: 'entries', entryIds: a },
    sideB: { kind: 'entries', entryIds: b },
    result,
  };
}

function round(number: number, resting: string[] = []): Round {
  return { ...base, id: `r${number}`, number, restingEntryIds: resting };
}

describe('rotationStandings', () => {
  it('cada jugador suma los puntos de su pareja', () => {
    const rows = rotationStandings(
      ['a', 'b', 'c', 'd'],
      [match(1, ['a', 'b'], ['c', 'd'], [21, 15]), match(2, ['a', 'c'], ['b', 'd'], [10, 21])],
      [round(1), round(2)],
      'seed',
    );
    const byId = Object.fromEntries(rows.map((r) => [r.entryId, r]));
    expect(byId.a).toMatchObject({
      played: 2,
      won: 1,
      lost: 1,
      pointsFor: 31,
      pointsAgainst: 36,
      diff: -5,
    });
    expect(byId.b).toMatchObject({ won: 2, pointsFor: 42, total: 42 });
    expect(rows[0]?.entryId).toBe('b');
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it('el que descansa suma el promedio por jugador de la ronda, solo con la ronda completa', () => {
    const matches = [match(1, ['a', 'b'], ['c', 'd'], [21, 15])];
    const rows = rotationStandings(['a', 'b', 'c', 'd', 'e'], matches, [round(1, ['e'])], 's');
    const e = rows.find((r) => r.entryId === 'e');
    // (21·2 + 15·2) / 4 = 18
    expect(e).toMatchObject({ restPoints: 18, total: 18, played: 0, rests: 1, won: 0, diff: 0 });

    const incomplete = [...matches, match(1, ['f', 'g'], ['h', 'i'], null)];
    const pending = rotationStandings(['a', 'e'], incomplete, [round(1, ['e'])], 's');
    expect(pending.find((r) => r.entryId === 'e')).toMatchObject({ restPoints: 0, rests: 1 });
  });

  it('el promedio puede ser decimal y se redondea a un decimal', () => {
    const rows = rotationStandings(
      ['a', 'b', 'e'],
      [match(1, ['a'], ['b'], [21, 0])],
      [round(1, ['e'])],
      's',
    );
    expect(rows.find((r) => r.entryId === 'e')?.restPoints).toBe(10.5);
  });

  it('desempata por partidos ganados, después diferencia y después sorteo estable', () => {
    // a y b con 30 puntos; a ganó 2, b ganó 1 (rivales distintos para no sumarles puntos de más)
    const byWins = rotationStandings(
      ['a', 'b', 'x', 'y', 'z', 'w'],
      [
        match(1, ['a'], ['x'], [16, 14]),
        match(2, ['a'], ['y'], [14, 12]),
        match(1, ['b'], ['z'], [21, 0]),
        match(2, ['b'], ['w'], [9, 21]),
      ],
      [round(1), round(2)],
      's',
    );
    expect(byWins.slice(0, 2).map((r) => r.entryId)).toEqual(['a', 'b']);

    // mismos puntos y ganados: gana la diferencia
    const byDiff = rotationStandings(
      ['a', 'b', 'x', 'y'],
      [match(1, ['a'], ['x'], [21, 20]), match(1, ['b'], ['y'], [21, 5])],
      [round(1)],
      's',
    );
    expect(byDiff[0]?.entryId).toBe('b');

    // empate total: decide el sorteo, siempre igual para el mismo torneo
    const tied = () => rotationStandings(['a', 'b'], [], [], 'torneo-1').map((r) => r.entryId);
    expect(tied()).toEqual(tied());
    const expectedFirst = stableLottery('torneo-1:a') < stableLottery('torneo-1:b') ? 'a' : 'b';
    expect(tied()[0]).toBe(expectedFirst);
  });

  it('cuenta empates en partidos por tiempo', () => {
    const rows = rotationStandings(
      ['a', 'b'],
      [match(1, ['a'], ['b'], [7, 7], 'time')],
      [round(1)],
      's',
    );
    expect(rows.every((r) => r.drawn === 1 && r.won === 0 && r.total === 7)).toBe(true);
  });

  it('isRoundComplete', () => {
    const ms = [match(1, ['a'], ['b'], [21, 3]), match(1, ['c'], ['d'], null)];
    expect(isRoundComplete(1, ms)).toBe(false);
    expect(isRoundComplete(1, ms.slice(0, 1))).toBe(true);
    expect(isRoundComplete(2, ms)).toBe(false);
  });
});

describe('avance de rondas', () => {
  const r1 = [match(1, ['a'], ['b'], [21, 3])];
  const r2pending = [...r1, match(2, ['a'], ['c'], null)];

  it('lastRoundNumber', () => {
    expect(lastRoundNumber([])).toBe(0);
    expect(lastRoundNumber([round(1), round(3)])).toBe(3);
  });

  it('isRotationFinished', () => {
    expect(isRotationFinished(1, r1, [round(1)])).toBe(true);
    expect(isRotationFinished(2, r1, [round(1)])).toBe(false);
    expect(isRotationFinished(2, r2pending, [round(1), round(2)])).toBe(false);
    expect(isRotationFinished(null, r1, [round(1)])).toBe(false);
  });

  it('nextRoundBlocker', () => {
    expect(nextRoundBlocker(3, [], [])).toBe('Todavía no se generaron los cruces.');
    expect(nextRoundBlocker(3, r1, [round(1)])).toBeNull();
    expect(nextRoundBlocker(3, r2pending, [round(1), round(2)])).toBe(
      'Terminá de cargar los resultados de la ronda 2.',
    );
    expect(nextRoundBlocker(1, r1, [round(1)])).toBe('Ya se generaron todas las rondas.');
  });
});
