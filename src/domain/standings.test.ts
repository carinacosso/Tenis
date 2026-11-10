import { describe, expect, it } from 'vitest';
import type { Match } from './match';
import type { SetScore } from './scoring';
import { DEFAULT_SETS_SCORING } from './scoring';
import { computeStandings, tallyResult } from './standings';
import { DEFAULT_TIEBREAK_ORDER, type TiebreakCriterion } from './tournament';

const base = {
  ownerId: 'local',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  tournamentId: 't',
};

let n = 0;
/** Partido a vs b con sets dados desde el lado de a. */
function played(a: string, b: string, sets: [number, number][]): Match {
  const scores: SetScore[] = sets.map(([x, y]) => ({ a: x, b: y }));
  const won = scores.filter((s) => s.a > s.b).length;
  return {
    ...base,
    id: `m${++n}`,
    round: 1,
    position: 0,
    sideA: { kind: 'entry', entryId: a },
    sideB: { kind: 'entry', entryId: b },
    stage: 'group',
    result: {
      kind: 'sets',
      outcome: 'normal',
      sets: scores,
      winner: won * 2 > scores.length ? 'A' : 'B',
    },
  };
}

const ids = (rows: { entryId: string }[]) => rows.map((r) => r.entryId);

describe('tallyResult', () => {
  it('cuenta sets y games; el super tie-break vale un game', () => {
    const result = played('a', 'b', [
      [6, 4],
      [3, 6],
      [10, 8],
    ]).result;
    if (!result) throw new Error();
    expect(tallyResult(result, 2)).toEqual({ setsA: 2, setsB: 1, gamesA: 10, gamesB: 10 });
    expect(tallyResult(result, null)).toEqual({ setsA: 2, setsB: 1, gamesA: 19, gamesB: 18 });
  });
});

describe('computeStandings', () => {
  it('suma partidos, sets y games de cada uno', () => {
    const rows = computeStandings(
      ['a', 'b', 'c'],
      [
        played('a', 'b', [
          [6, 2],
          [6, 3],
        ]),
        played('c', 'a', [
          [6, 4],
          [2, 6],
          [6, 7],
        ]),
      ],
      DEFAULT_TIEBREAK_ORDER,
      's',
    );
    expect(rows[0]).toMatchObject({
      entryId: 'a',
      played: 2,
      won: 2,
      setsFor: 4,
      setsAgainst: 1,
      gamesFor: 29,
      gamesAgainst: 19,
      setDiff: 3,
      gameDiff: 10,
      position: 1,
    });
    expect(rows.find((r) => r.entryId === 'b')).toMatchObject({ played: 1, won: 0, setDiff: -2 });
  });

  it('los que no jugaron aparecen con todo en cero', () => {
    const rows = computeStandings(['x', 'y'], [], DEFAULT_TIEBREAK_ORDER, 's');
    expect(rows.map((r) => r.played)).toEqual([0, 0]);
  });

  it('desempata por diferencia de sets y después de games', () => {
    // a, b y c ganan uno cada uno (triple empate en ganados)
    const matches = [
      played('a', 'b', [
        [6, 0],
        [6, 0],
      ]),
      played('b', 'c', [
        [6, 4],
        [4, 6],
        [6, 4],
      ]),
      played('c', 'a', [
        [6, 4],
        [4, 6],
        [7, 5],
      ]),
    ];
    const rows = computeStandings(['a', 'b', 'c'], matches, DEFAULT_TIEBREAK_ORDER, 's');
    // sets: a 3-2 (+1), b 2-4 (-2), c 4-3 (+1) → a y c empatan en sets; games: a +11, c 0
    expect(ids(rows)).toEqual(['a', 'c', 'b']);
  });

  it('el enfrentamiento directo con 2 empatados', () => {
    const matches = [
      played('a', 'b', [
        [6, 4],
        [6, 4],
      ]),
      played('b', 'c', [
        [6, 0],
        [6, 0],
      ]),
      played('c', 'a', [
        [6, 0],
        [6, 0],
      ]),
      played('a', 'd', [
        [6, 0],
        [6, 0],
      ]),
      played('b', 'd', [
        [6, 0],
        [6, 0],
      ]),
    ];
    const order: TiebreakCriterion[] = ['wins', 'headToHead', 'setDiff', 'gameDiff'];
    // a y b ganaron 2; b tiene mejor diferencia pero a le ganó a b
    const rows = computeStandings(['a', 'b', 'c', 'd'], matches, order, 's');
    expect(ids(rows).slice(0, 2)).toEqual(['a', 'b']);
    // con el orden por defecto (sets antes que directo) gana b
    const byDefault = computeStandings(['a', 'b', 'c', 'd'], matches, DEFAULT_TIEBREAK_ORDER, 's');
    expect(ids(byDefault).slice(0, 2)).toEqual(['b', 'a']);
  });

  it('con 3 o más empatados el directo usa una mini tabla entre ellos', () => {
    // a, b, c, d: a, b y c ganan 2. Entre ellos: a le gana a b y c; b le gana a c; c le gana a d.
    const matches = [
      played('a', 'b', [
        [6, 4],
        [6, 4],
      ]),
      played('a', 'c', [
        [6, 4],
        [6, 4],
      ]),
      played('b', 'c', [
        [6, 4],
        [6, 4],
      ]),
      played('d', 'a', [
        [6, 0],
        [6, 0],
      ]),
      played('b', 'd', [
        [6, 0],
        [6, 0],
      ]),
      played('c', 'd', [
        [6, 0],
        [6, 0],
      ]),
    ];
    const rows = computeStandings(
      ['a', 'b', 'c', 'd'],
      matches,
      ['wins', 'headToHead', 'setDiff', 'gameDiff'],
      's',
    );
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('respeta el orden configurado', () => {
    // b gana más partidos pero a tiene mejor diferencia de games
    const matches = [
      played('a', 'c', [
        [6, 0],
        [6, 0],
      ]),
      played('b', 'c', [
        [6, 4],
        [6, 4],
      ]),
      played('b', 'd', [
        [6, 4],
        [6, 4],
      ]),
    ];
    const byGames = computeStandings(
      ['a', 'b', 'c', 'd'],
      matches,
      ['gameDiff', 'wins', 'setDiff', 'headToHead'],
      's',
    );
    expect(ids(byGames)[0]).toBe('a');
    const byWins = computeStandings(['a', 'b', 'c', 'd'], matches, DEFAULT_TIEBREAK_ORDER, 's');
    expect(ids(byWins)[0]).toBe('b');
  });

  it('empate total: sorteo estable', () => {
    const run = () => ids(computeStandings(['a', 'b', 'c'], [], DEFAULT_TIEBREAK_ORDER, 'torneo'));
    expect(run()).toEqual(run());
    expect(run().sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('W.O. y abandono en la tabla', () => {
  it('el W.O. cuenta 6-0 6-0 y el abandono se completa a favor del ganador', () => {
    const scoring = DEFAULT_SETS_SCORING;
    const wo: Match = {
      ...played('a', 'b', [
        [6, 0],
        [6, 0],
      ]),
      result: {
        kind: 'sets',
        outcome: 'walkover',
        sets: [
          { a: 6, b: 0 },
          { a: 6, b: 0 },
        ],
        winner: 'A',
      },
    };
    const ret: Match = {
      ...played('c', 'a', [[6, 3]]),
      result: {
        kind: 'sets',
        outcome: 'retired',
        sets: [
          { a: 6, b: 3 },
          { a: 2, b: 1 },
        ],
        winner: 'B',
      },
    };
    const rows = computeStandings(['a', 'b', 'c'], [wo, ret], DEFAULT_TIEBREAK_ORDER, 's', scoring);
    const a = rows.find((r) => r.entryId === 'a');
    // a: W.O. 6-0 6-0 + vs c: 3-6 6-2 6-0 (completado) → sets 4-1, games 12+15=27 vs 0+8=8
    expect(a).toMatchObject({ won: 2, setsFor: 4, setsAgainst: 1, gamesFor: 27, gamesAgainst: 8 });
  });
});
