import { describe, expect, it } from 'vitest';
import {
  type DrawEntrant,
  type Match,
  applyKnockoutResult,
  generateKnockout,
  isKnockoutFinished,
  knockoutPodium,
  resolveKnockout,
  roundName,
  standardSeedOrder,
} from './knockout';
import { seededRng } from './random';
import { toMatches, win } from './testFactories';

function idGen() {
  let n = 0;
  return () => `m${++n}`;
}

function entrants(count: number, seeds = 0): DrawEntrant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i + 1}`,
    seed: i < seeds ? i + 1 : null,
  }));
}

function draw(count: number, seeds = 0, seed = 1): Match[] {
  return toMatches(generateKnockout(entrants(count, seeds), seededRng(seed), idGen()));
}

/** Lista de la primera ronda como texto: "e1-bye", "e5-e3"... */
function firstRound(matches: Match[]): string[] {
  return matches
    .filter((m) => m.round === 1)
    .sort((a, b) => a.position - b.position)
    .map((m) => [m.sideA, m.sideB].map((s) => (s.kind === 'entry' ? s.entryId : s.kind)).join('-'));
}

/** Posición (0..size-1) de cada inscripción en la primera ronda. */
function positions(matches: Match[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of matches.filter((x) => x.round === 1)) {
    if (m.sideA.kind === 'entry') map.set(m.sideA.entryId, m.position * 2);
    if (m.sideB.kind === 'entry') map.set(m.sideB.entryId, m.position * 2 + 1);
  }
  return map;
}

/** Juega todo el cuadro haciendo ganar siempre al lado A. */
function playAll(matches: Match[]): Match[] {
  let current = matches;
  for (;;) {
    const ready = [...resolveKnockout(current).values()].find((r) => r.state === 'ready');
    if (!ready) return current;
    current = applyKnockoutResult(current, ready.match.id, win('A')).matches;
  }
}

describe('standardSeedOrder', () => {
  it('ubica los cabezas según el orden estándar', () => {
    expect(standardSeedOrder(2)).toEqual([1, 2]);
    expect(standardSeedOrder(4)).toEqual([1, 4, 3, 2]);
    expect(standardSeedOrder(8)).toEqual([1, 8, 5, 4, 3, 6, 7, 2]);
  });

  it('cada partido de primera ronda suma size + 1 y 1 y 2 solo se cruzan en la final', () => {
    for (const size of [8, 16, 32, 64]) {
      const order = standardSeedOrder(size);
      expect(new Set(order).size).toBe(size);
      for (let i = 0; i < size; i += 2)
        expect((order[i] ?? 0) + (order[i + 1] ?? 0)).toBe(size + 1);
      expect(order.indexOf(1)).toBe(0);
      expect(order.indexOf(2)).toBe(size - 1);
    }
  });
});

describe('generateKnockout', () => {
  it('con potencia de 2 no hay byes y se arman todas las rondas', () => {
    const matches = draw(8);
    expect(matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(matches.filter((m) => m.round === 2)).toHaveLength(2);
    expect(matches.filter((m) => m.round === 3)).toHaveLength(1);
    expect(firstRound(matches).join(' ')).not.toContain('bye');
    expect([...positions(matches).keys()].sort()).toEqual(
      entrants(8)
        .map((e) => e.id)
        .sort(),
    );
  });

  it.each([2, 3, 5, 6, 7, 9, 12, 13, 17, 31, 33, 100])(
    'con %i inscriptos: cuadro de potencia de 2, todos ubicados una vez y sin bye contra bye',
    (count) => {
      const matches = draw(count, Math.min(4, Math.floor(count / 2)));
      const first = matches.filter((m) => m.round === 1);
      let size = 2;
      while (size < count) size *= 2;
      expect(first).toHaveLength(size / 2);
      const byes = first.filter((m) => m.sideA.kind === 'bye' || m.sideB.kind === 'bye');
      expect(byes).toHaveLength(size - count);
      expect(first.some((m) => m.sideA.kind === 'bye' && m.sideB.kind === 'bye')).toBe(false);
      expect(positions(matches).size).toBe(count);
      expect(matches).toHaveLength(size - 1);
    },
  );

  it('los cabezas 1 y 2 van a los extremos y 3-4 a mitades distintas', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const pos = positions(draw(16, 4, seed));
      expect(pos.get('e1')).toBe(0);
      expect(pos.get('e2')).toBe(15);
      const p3 = pos.get('e3') ?? -1;
      const p4 = pos.get('e4') ?? -1;
      expect([p3, p4].sort((a, b) => a - b)).toEqual([4, 11]);
    }
  });

  it('el sorteo de 3-4 varía con la semilla pero se reproduce con la misma', () => {
    const results = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => positions(draw(16, 4, s)).get('e3')),
    );
    expect(results).toEqual(new Set([4, 11]));
    expect(firstRound(draw(13, 2, 42))).toEqual(firstRound(draw(13, 2, 42)));
  });

  it('cabezas 5-8 caen en los cuartos que no tienen a 1-4', () => {
    const pos = positions(draw(32, 8, 7));
    const quarterOf = (p: number) => Math.floor(p / 8);
    const topFour = new Set(['e1', 'e2', 'e3', 'e4'].map((id) => quarterOf(pos.get(id) ?? -1)));
    expect(topFour.size).toBe(4);
    const eighthOf = (p: number) => Math.floor(p / 4);
    const eighths = new Set(
      ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'].map((id) => eighthOf(pos.get(id) ?? -1)),
    );
    expect(eighths.size).toBe(8);
  });

  it('los byes van primero a los cabezas de serie, en orden', () => {
    // 6 inscriptos en cuadro de 8 → 2 byes, para los cabezas 1 y 2
    expect(firstRound(draw(6, 2))).toEqual(
      expect.arrayContaining(['e1-bye', expect.stringMatching(/-e2$|^e2-/)]),
    );
    const first = firstRound(draw(6, 2));
    expect(first[0]).toBe('e1-bye');
    expect(first[3]).toBe('bye-e2');

    // 5 inscriptos con 1 cabeza → 3 byes: el cabeza tiene uno
    expect(firstRound(draw(5, 1))[0]).toBe('e1-bye');

    // 13 inscriptos, 4 cabezas → 3 byes para los cabezas 1, 2 y 3
    const matches = draw(13, 4, 3);
    const byeOwners = matches
      .filter((m) => m.round === 1 && (m.sideA.kind === 'bye' || m.sideB.kind === 'bye'))
      .map((m) =>
        m.sideA.kind === 'entry'
          ? m.sideA.entryId
          : m.sideB.kind === 'entry'
            ? m.sideB.entryId
            : '',
      )
      .sort();
    expect(byeOwners).toEqual(['e1', 'e2', 'e3']);
  });

  it('sin cabezas, los byes se reparten en mitades distintas', () => {
    const first = firstRound(draw(6, 0));
    expect(first[0]).toMatch(/bye/);
    expect(first[3]).toMatch(/bye/);
  });

  it('rechaza menos de 2 inscriptos o demasiados cabezas', () => {
    expect(() => generateKnockout(entrants(1), seededRng(1), idGen())).toThrow();
    expect(() => generateKnockout(entrants(4, 3), seededRng(1), idGen())).toThrow();
  });

  it('nombra las rondas', () => {
    expect(roundName(3, 3)).toBe('Final');
    expect(roundName(2, 3)).toBe('Semifinal');
    expect(roundName(1, 3)).toBe('Cuartos de final');
    expect(roundName(1, 4)).toBe('Octavos de final');
    expect(roundName(1, 5)).toBe('16avos de final');
  });
});

describe('resolveKnockout', () => {
  it('los byes avanzan solos y los partidos esperan a sus jugadores', () => {
    const matches = draw(3, 1);
    const resolved = resolveKnockout(matches);
    const [bye, real] = matches.filter((m) => m.round === 1);
    const final = matches.find((m) => m.round === 2);
    if (!bye || !real || !final) throw new Error('cuadro inesperado');
    expect(resolved.get(bye.id)).toMatchObject({ state: 'bye', winner: 'e1' });
    expect(resolved.get(real.id)?.state).toBe('ready');
    expect(resolved.get(final.id)).toMatchObject({ state: 'waiting', a: 'e1', b: null });
  });

  it('el ganador avanza automáticamente', () => {
    const matches = draw(4);
    const r1 = matches.find((m) => m.round === 1 && m.position === 0);
    const final = matches.find((m) => m.round === 2);
    if (!r1 || !final) throw new Error('cuadro inesperado');
    const { matches: after } = applyKnockoutResult(matches, r1.id, win('B'));
    const resolved = resolveKnockout(after);
    const winner = resolved.get(r1.id)?.winner;
    expect(winner).toBe(r1.sideB.kind === 'entry' ? r1.sideB.entryId : null);
    expect(resolved.get(final.id)?.a).toBe(winner);
  });
});

describe('applyKnockoutResult: recálculo en cascada', () => {
  it('no se puede cargar un resultado si faltan jugadores', () => {
    const matches = draw(4);
    const final = matches.find((m) => m.round === 2);
    if (!final) throw new Error();
    expect(() => applyKnockoutResult(matches, final.id, win('A'))).toThrow();
  });

  it('corregir el marcador sin cambiar el ganador no afecta a nadie', () => {
    const played = playAll(draw(8));
    const r1 = played.find((m) => m.round === 1 && m.position === 0);
    if (!r1) throw new Error();
    const { cleared, matches } = applyKnockoutResult(played, r1.id, win('A', 4));
    expect(cleared).toEqual([]);
    expect(isKnockoutFinished(matches)).toBe(true);
  });

  it('cambiar el ganador borra los resultados posteriores afectados, en cascada', () => {
    const played = playAll(draw(8));
    expect(isKnockoutFinished(played)).toBe(true);
    const r1 = played.find((m) => m.round === 1 && m.position === 0);
    const sf = played.find((m) => m.round === 2 && m.position === 0);
    const otherSf = played.find((m) => m.round === 2 && m.position === 1);
    const final = played.find((m) => m.round === 3);
    if (!r1 || !sf || !otherSf || !final) throw new Error();

    const { matches, cleared } = applyKnockoutResult(played, r1.id, win('B'));
    expect(cleared.sort()).toEqual([sf.id, final.id].sort());
    expect(matches.find((m) => m.id === otherSf.id)?.result).not.toBeNull();
    expect(isKnockoutFinished(matches)).toBe(false);
    const resolved = resolveKnockout(matches);
    expect(resolved.get(sf.id)?.state).toBe('ready');
    expect(resolved.get(final.id)?.state).toBe('waiting');
  });

  it('borrar un resultado también recalcula en cascada', () => {
    const played = playAll(draw(4));
    const r1 = played.find((m) => m.round === 1 && m.position === 1);
    const final = played.find((m) => m.round === 2);
    if (!r1 || !final) throw new Error();
    const { matches, cleared } = applyKnockoutResult(played, r1.id, null);
    expect(cleared).toEqual([final.id]);
    expect(resolveKnockout(matches).get(final.id)?.state).toBe('waiting');
  });

  it('un partido posterior sin resultado no figura como afectado', () => {
    const matches = draw(8);
    const r1 = matches.find((m) => m.round === 1 && m.position === 0);
    if (!r1) throw new Error();
    const once = applyKnockoutResult(matches, r1.id, win('A')).matches;
    expect(applyKnockoutResult(once, r1.id, win('B')).cleared).toEqual([]);
  });
});

describe('podio', () => {
  it('campeón, subcampeón y semifinalistas', () => {
    const played = playAll(draw(8));
    const podium = knockoutPodium(played);
    const resolved = resolveKnockout(played);
    const final = [...resolved.values()].find((r) => r.match.round === 3);
    expect(podium.champion).toBe(final?.winner);
    expect(podium.runnerUp).toBe(final?.loser);
    expect(podium.thirds).toHaveLength(2);
    expect(new Set([podium.champion, podium.runnerUp, ...podium.thirds]).size).toBe(4);
  });

  it('sin final jugada no hay campeón', () => {
    expect(knockoutPodium(draw(4)).champion).toBeNull();
    expect(isKnockoutFinished([])).toBe(false);
  });

  it('cuadro de 2: la final es la única ronda', () => {
    const played = playAll(draw(2));
    expect(knockoutPodium(played)).toMatchObject({ thirds: [] });
    expect(knockoutPodium(played).champion).not.toBeNull();
  });
});
