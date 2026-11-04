import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETS_SCORING,
  buildScoreResult,
  checkTimeResult,
  pointsOf,
  type SetsScoring,
  checkPointsResult,
  checkResult,
  checkScoringConfig,
  checkSet,
  checkSetsResult,
  describeScoring,
  formatResult,
  formatResultForWinner,
  quickSetScores,
} from './scoring';

const sixWithTb: SetsScoring = DEFAULT_SETS_SCORING;
const superTb: SetsScoring = { ...DEFAULT_SETS_SCORING, decidingSet: 'superTiebreak' };
const noTb: SetsScoring = { ...DEFAULT_SETS_SCORING, tiebreak: { enabled: false, points: 7 } };
const fourGames: SetsScoring = { ...DEFAULT_SETS_SCORING, gamesPerSet: 4, bestOf: 1 };

describe('checkSet', () => {
  it.each([
    [6, 0],
    [6, 4],
    [4, 6],
    [7, 5],
    [7, 6],
    [6, 7],
  ])('sets a 6 con tie-break: %i-%i es válido', (a, b) => {
    expect(checkSet(sixWithTb, { a, b }, 0)).toBeNull();
  });

  it.each([
    [6, 5],
    [6, 6],
    [8, 6],
    [7, 4],
    [5, 3],
    [7, 7],
    [-1, 6],
    [6.5, 2],
  ])('sets a 6 con tie-break: %d-%d es inválido', (a, b) => {
    expect(checkSet(sixWithTb, { a, b }, 0)).not.toBeNull();
  });

  it('sin tie-break se juega con ventaja', () => {
    expect(checkSet(noTb, { a: 8, b: 6 }, 0)).toBeNull();
    expect(checkSet(noTb, { a: 12, b: 10 }, 0)).toBeNull();
    expect(checkSet(noTb, { a: 7, b: 6 }, 0)).not.toBeNull();
    expect(checkSet(noTb, { a: 9, b: 6 }, 0)).not.toBeNull();
  });

  it('sets a 4 con tie-break', () => {
    expect(checkSet(fourGames, { a: 4, b: 2 }, 0)).toBeNull();
    expect(checkSet(fourGames, { a: 5, b: 3 }, 0)).toBeNull();
    expect(checkSet(fourGames, { a: 5, b: 4 }, 0)).toBeNull();
    expect(checkSet(fourGames, { a: 4, b: 3 }, 0)).not.toBeNull();
    expect(checkSet(fourGames, { a: 6, b: 4 }, 0)).not.toBeNull();
  });

  it('valida el tie-break opcional', () => {
    expect(checkSet(sixWithTb, { a: 7, b: 6, tiebreak: { a: 7, b: 5 } }, 0)).toBeNull();
    expect(checkSet(sixWithTb, { a: 7, b: 6, tiebreak: { a: 12, b: 10 } }, 0)).toBeNull();
    expect(checkSet(sixWithTb, { a: 7, b: 6, tiebreak: { a: 7, b: 6 } }, 0)).not.toBeNull();
    expect(checkSet(sixWithTb, { a: 7, b: 6, tiebreak: { a: 5, b: 7 } }, 0)).not.toBeNull();
    expect(checkSet(sixWithTb, { a: 6, b: 3, tiebreak: { a: 7, b: 5 } }, 0)).not.toBeNull();
  });

  it('super tie-break a 10 en el set decisivo', () => {
    expect(checkSet(superTb, { a: 10, b: 8 }, 2)).toBeNull();
    expect(checkSet(superTb, { a: 12, b: 14 }, 2)).toBeNull();
    expect(checkSet(superTb, { a: 10, b: 9 }, 2)).not.toBeNull();
    expect(checkSet(superTb, { a: 13, b: 10 }, 2)).not.toBeNull();
    expect(checkSet(superTb, { a: 6, b: 3 }, 2)).not.toBeNull();
    // Los sets no decisivos siguen siendo sets normales
    expect(checkSet(superTb, { a: 10, b: 8 }, 0)).not.toBeNull();
  });
});

describe('checkSetsResult', () => {
  it('2 de 3: gana quien llega a 2 sets', () => {
    expect(
      checkSetsResult(sixWithTb, [
        { a: 6, b: 3 },
        { a: 6, b: 4 },
      ]),
    ).toEqual({ ok: true, winner: 'A' });
    expect(
      checkSetsResult(sixWithTb, [
        { a: 6, b: 3 },
        { a: 3, b: 6 },
        { a: 5, b: 7 },
      ]),
    ).toEqual({ ok: true, winner: 'B' });
  });

  it('rechaza partidos incompletos', () => {
    const r = checkSetsResult(sixWithTb, [
      { a: 6, b: 3 },
      { a: 3, b: 6 },
    ]);
    expect(r.ok).toBe(false);
    expect(checkSetsResult(sixWithTb, []).ok).toBe(false);
  });

  it('rechaza sets de más', () => {
    const r = checkSetsResult(sixWithTb, [
      { a: 6, b: 3 },
      { a: 6, b: 3 },
      { a: 6, b: 3 },
    ]);
    expect(r).toEqual({ ok: false, error: 'Sobra el set 3: el partido ya estaba definido.' });
  });

  it('informa el set inválido', () => {
    expect(
      checkSetsResult(sixWithTb, [
        { a: 6, b: 3 },
        { a: 6, b: 5 },
      ]),
    ).toEqual({
      ok: false,
      error: 'Set 2: 6-5 no es un resultado válido para sets a 6.',
    });
  });

  it('con super tie-break', () => {
    expect(
      checkSetsResult(superTb, [
        { a: 6, b: 3 },
        { a: 4, b: 6 },
        { a: 8, b: 10 },
      ]),
    ).toEqual({ ok: true, winner: 'B' });
  });

  it('1 set y 3 de 5', () => {
    expect(checkSetsResult({ ...sixWithTb, bestOf: 1 }, [{ a: 6, b: 2 }])).toEqual({
      ok: true,
      winner: 'A',
    });
    const bo5 = { ...sixWithTb, bestOf: 5 as const };
    expect(
      checkSetsResult(bo5, [
        { a: 6, b: 2 },
        { a: 6, b: 2 },
      ]).ok,
    ).toBe(false);
    expect(
      checkSetsResult(bo5, [
        { a: 6, b: 2 },
        { a: 2, b: 6 },
        { a: 6, b: 2 },
        { a: 2, b: 6 },
        { a: 7, b: 6 },
      ]),
    ).toEqual({ ok: true, winner: 'A' });
  });
});

describe('puntos', () => {
  it('gana el primero que llega al objetivo', () => {
    const cfg = { kind: 'points' as const, target: 21 };
    expect(checkPointsResult(cfg, 21, 15)).toEqual({ ok: true, winner: 'A' });
    expect(checkPointsResult(cfg, 19, 21)).toEqual({ ok: true, winner: 'B' });
    expect(checkPointsResult(cfg, 21, 21).ok).toBe(false);
    expect(checkPointsResult(cfg, 22, 20).ok).toBe(false);
    expect(checkPointsResult(cfg, 20, 18).ok).toBe(false);
  });
});

describe('checkResult', () => {
  it('rechaza un ganador que no coincide', () => {
    const r = checkResult(sixWithTb, {
      kind: 'sets',
      outcome: 'normal',
      sets: [
        { a: 6, b: 1 },
        { a: 6, b: 1 },
      ],
      winner: 'B',
    });
    expect(r.ok).toBe(false);
  });

  it('rechaza un tipo de resultado distinto al del torneo', () => {
    const r = checkResult(sixWithTb, {
      kind: 'points',
      outcome: 'normal',
      a: 21,
      b: 3,
      winner: 'A',
    });
    expect(r.ok).toBe(false);
  });
});

describe('quickSetScores', () => {
  it('sets a 6 con tie-break', () => {
    expect(quickSetScores(sixWithTb, 0).map((s) => `${s.winner}-${s.loser}`)).toEqual([
      '6-0',
      '6-1',
      '6-2',
      '6-3',
      '6-4',
      '7-5',
      '7-6',
    ]);
  });

  it('sin tie-break incluye sets largos', () => {
    expect(quickSetScores(noTb, 0).map((s) => `${s.winner}-${s.loser}`)).toContain('8-6');
  });

  it('super tie-break', () => {
    const scores = quickSetScores(superTb, 2);
    expect(scores[0]).toEqual({ winner: 10, loser: 0, tiebreak: false });
    expect(scores.at(-1)).toEqual({ winner: 10, loser: 8, tiebreak: false });
  });

  it('todas las opciones rápidas son válidas', () => {
    for (const cfg of [sixWithTb, noTb, fourGames, superTb]) {
      for (const index of [0, 2]) {
        for (const s of quickSetScores(cfg, index)) {
          expect(checkSet(cfg, { a: s.winner, b: s.loser }, index)).toBeNull();
        }
      }
    }
  });
});

describe('formato y configuración', () => {
  it('formatea resultados', () => {
    const result = {
      kind: 'sets' as const,
      outcome: 'normal' as const,
      sets: [
        { a: 3, b: 6 },
        { a: 7, b: 6, tiebreak: { a: 7, b: 5 } },
        { a: 10, b: 8 },
      ],
      winner: 'A' as const,
    };
    expect(formatResult(result)).toBe('3-6 7-6(5) 10-8');
    expect(formatResultForWinner({ ...result, winner: 'B' })).toBe('6-3 6-7(5) 8-10');
  });

  it('valida la configuración', () => {
    expect(checkScoringConfig(sixWithTb)).toBeNull();
    expect(
      checkScoringConfig({ ...sixWithTb, bestOf: 1, decidingSet: 'superTiebreak' }),
    ).not.toBeNull();
    expect(
      checkScoringConfig({ ...sixWithTb, tiebreak: { enabled: true, points: 3 } }),
    ).not.toBeNull();
    expect(checkScoringConfig({ kind: 'points', target: 21 })).toBeNull();
    expect(checkScoringConfig({ kind: 'points', target: 0 })).not.toBeNull();
  });

  it('describe la configuración', () => {
    expect(describeScoring(superTb)).toBe(
      '2 de 3 sets a 6 · tie-break a 7 · super tie-break en el decisivo',
    );
    expect(describeScoring({ ...fourGames, goldenPoint: true })).toBe(
      '1 set a 4 · tie-break a 7 · punto de oro',
    );
  });
});

describe('por tiempo y armado de resultados', () => {
  it('por tiempo se permite el empate', () => {
    expect(checkTimeResult(7, 7)).toEqual({ ok: true, winner: null });
    expect(checkTimeResult(3, 9)).toEqual({ ok: true, winner: 'B' });
    expect(checkTimeResult(-1, 2).ok).toBe(false);
    expect(
      checkResult(
        { kind: 'time', minutes: 15 },
        { kind: 'time', outcome: 'normal', a: 5, b: 5, winner: null },
      ),
    ).toEqual({ ok: true, winner: null });
  });

  it('buildScoreResult arma resultados válidos', () => {
    expect(buildScoreResult({ kind: 'points', target: 21 }, 21, 17)).toEqual({
      ok: true,
      result: { kind: 'points', outcome: 'normal', a: 21, b: 17, winner: 'A' },
    });
    expect(buildScoreResult({ kind: 'points', target: 21 }, 20, 17).ok).toBe(false);
    expect(buildScoreResult({ kind: 'time', minutes: 12 }, 4, 4)).toMatchObject({
      ok: true,
      result: { kind: 'time', winner: null },
    });
    expect(buildScoreResult(DEFAULT_SETS_SCORING, 6, 2).ok).toBe(false);
  });

  it('pointsOf y formato', () => {
    const r = {
      kind: 'points' as const,
      outcome: 'normal' as const,
      a: 15,
      b: 21,
      winner: 'B' as const,
    };
    expect(pointsOf(r)).toEqual({ a: 15, b: 21 });
    expect(formatResult(r)).toBe('15-21');
    expect(formatResultForWinner(r)).toBe('21-15');
    expect(describeScoring({ kind: 'points', target: 24 })).toBe('Partidos a 24 puntos');
    expect(describeScoring({ kind: 'time', minutes: 12 })).toBe('Por tiempo: 12 minutos');
  });
});
