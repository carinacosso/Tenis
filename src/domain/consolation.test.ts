import { describe, expect, it } from 'vitest';
import {
  consolationEntrants,
  consolationMatches,
  generateConsolation,
  mainDrawMatches,
} from './consolation';
import { applyKnockoutResult, generateKnockout, resolveKnockout } from './knockout';
import type { Match } from './match';
import { seededRng } from './random';
import { DEFAULT_SETS_SCORING, buildWalkover } from './scoring';
import { toMatches, win } from './testFactories';

function idGen(prefix = 'm') {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function draw(count: number, seeds = 0): Match[] {
  const entrants = Array.from({ length: count }, (_, i) => ({
    id: `e${i + 1}`,
    seed: i < seeds ? i + 1 : null,
  }));
  return toMatches(generateKnockout(entrants, seededRng(1), idGen()));
}

/** Carga resultados (ganando el lado A) en todos los partidos listos de la ronda dada. */
function playRound(matches: Match[], round: number, result = win('A')): Match[] {
  let current = matches;
  for (const r of resolveKnockout(current).values()) {
    if (r.match.round === round && r.state === 'ready')
      current = applyKnockoutResult(current, r.match.id, result).matches;
  }
  return current;
}

describe('consolationEntrants', () => {
  it('8 jugadores: entran los 4 que pierden en primera ronda', () => {
    const matches = draw(8);
    expect(consolationEntrants(matches).complete).toBe(false);
    const played = playRound(matches, 1);
    const { complete, entrants } = consolationEntrants(played);
    expect(complete).toBe(true);
    expect(entrants).toHaveLength(4);
    const losers = [...resolveKnockout(played).values()]
      .filter((r) => r.match.round === 1)
      .map((r) => r.loser);
    expect([...entrants].sort()).toEqual([...losers].sort());
  });

  it('con byes: el que tuvo bye y pierde en 2.ª ronda también entra', () => {
    const matches = draw(6, 2); // 2 byes para los cabezas
    const afterR1 = playRound(matches, 1);
    // Faltan los partidos de 2.ª ronda de los que tuvieron bye
    expect(consolationEntrants(afterR1).complete).toBe(false);
    // En la 2.ª ronda pierden los cabezas (que tuvieron bye), estén del lado que estén
    let afterR2 = afterR1;
    for (const r of resolveKnockout(afterR1).values()) {
      if (r.match.round !== 2 || r.state !== 'ready') continue;
      const seedSide = r.a === 'e1' || r.a === 'e2' ? 'B' : 'A';
      afterR2 = applyKnockoutResult(afterR2, r.match.id, win(seedSide)).matches;
    }
    const { complete, entrants } = consolationEntrants(afterR2);
    expect(complete).toBe(true);
    expect(entrants).toContain('e1');
    expect(entrants).toContain('e2');
    expect(entrants).toHaveLength(4); // 2 perdedores de 1.ª ronda + 2 cabezas
  });

  it('no entran los que pierden su primer partido por W.O. o lesión', () => {
    const matches = draw(4);
    const [first, second] = matches.filter((m) => m.round === 1);
    if (!first || !second) throw new Error();
    const wo = buildWalkover(DEFAULT_SETS_SCORING, 'A');
    if (!wo.ok) throw new Error();
    let played = applyKnockoutResult(matches, first.id, wo.result).matches;
    played = applyKnockoutResult(played, second.id, {
      kind: 'sets',
      outcome: 'injury',
      sets: [{ a: 2, b: 3 }],
      winner: 'B',
    }).matches;
    expect(consolationEntrants(played)).toEqual({ complete: true, entrants: [] });
  });
});

describe('generateConsolation', () => {
  it('arma un cuadro aparte, marcado como consolación', () => {
    const plans = generateConsolation(['a', 'b', 'c'], seededRng(2), idGen('c'));
    expect(plans).toHaveLength(3);
    expect(plans.every((p) => p.stage === 'consolation')).toBe(true);
    const matches = toMatches(plans);
    expect(consolationMatches(matches)).toHaveLength(3);
    expect(mainDrawMatches(matches)).toHaveLength(0);
  });
});
