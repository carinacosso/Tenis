import { describe, expect, it } from 'vitest';
import type { MatchPlan, RoundPlan } from './match';
import { seededRng } from './random';
import {
  PairCounter,
  circleRounds,
  emptyHistory,
  fullRotationRounds,
  generateAmericano,
  generateMexicanoRound,
  historyFrom,
  orderByLevel,
  pickResting,
  type RotationEntrant,
} from './rotation';

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

function players(
  count: number,
  sex: (i: number) => 'M' | 'F' | null = () => null,
): RotationEntrant[] {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, sex: sex(i) }));
}

const side = (m: MatchPlan, s: 'A' | 'B') => {
  const source = s === 'A' ? m.sideA : m.sideB;
  return source.kind === 'entries' ? source.entryIds : [];
};

/** Analiza una planificación: repeticiones, descansos y que cada ronda sea una partición válida. */
function analyze(plan: { rounds: RoundPlan[]; matches: MatchPlan[] }, all: string[]) {
  const partners = new PairCounter();
  const opponents = new PairCounter();
  const rests = new Map(all.map((id) => [id, 0]));
  for (const round of plan.rounds) {
    const inRound = plan.matches.filter((m) => m.round === round.number);
    const appearing = [
      ...round.restingEntryIds,
      ...inRound.flatMap((m) => [...side(m, 'A'), ...side(m, 'B')]),
    ];
    // Cada jugador aparece exactamente una vez por ronda (jugando o descansando)
    expect([...appearing].sort()).toEqual([...all].sort());
    for (const id of round.restingEntryIds) rests.set(id, (rests.get(id) ?? 0) + 1);
    for (const m of inRound) {
      const a = side(m, 'A');
      const b = side(m, 'B');
      for (const s of [a, b]) if (s.length === 2) partners.add(s[0] ?? '', s[1] ?? '');
      for (const x of a) for (const y of b) opponents.add(x, y);
    }
  }
  const restValues = [...rests.values()];
  return {
    partners,
    opponents,
    restSpread: Math.max(...restValues) - Math.min(...restValues),
    rests,
  };
}

describe('circleRounds', () => {
  it('cada par aparece exactamente una vez', () => {
    const rounds = circleRounds(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(rounds).toHaveLength(5);
    const seen = new PairCounter();
    for (const r of rounds) {
      expect(r.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      for (const [x, y] of r) seen.add(x, y);
    }
    expect(seen.max()).toBe(1);
    expect(seen.sumSquares()).toBe(15);
  });

  it('rechaza cantidades impares', () => {
    expect(() => circleRounds(['a', 'b', 'c'])).toThrow();
  });
});

describe('fullRotationRounds', () => {
  it('calcula la rotación completa', () => {
    expect(fullRotationRounds('doubles', players(8))).toBe(7);
    expect(fullRotationRounds('doubles', players(9))).toBe(9);
    expect(fullRotationRounds('singles', players(6))).toBe(5);
    expect(
      fullRotationRounds(
        'mixed',
        players(10, (i) => (i < 6 ? 'M' : 'F')),
      ),
    ).toBe(6);
  });
});

describe('Americano dobles', () => {
  it.each([1, 2, 3, 4])(
    '8 jugadores (semilla %i): nadie repite compañero y cada rival se enfrenta 2 veces',
    (seed) => {
      const all = players(8);
      const plan = generateAmericano(all, 'doubles', null, seededRng(seed), ids());
      expect(plan.rounds).toHaveLength(7);
      expect(plan.matches).toHaveLength(14);
      const { partners, opponents, restSpread } = analyze(
        plan,
        all.map((p) => p.id),
      );
      expect(partners.max()).toBe(1);
      expect(partners.sumSquares()).toBe(28); // los 28 pares posibles, una vez cada uno
      expect(opponents.max()).toBe(2);
      expect(restSpread).toBe(0);
    },
  );

  it('12 y 16 jugadores: nadie repite compañero en la rotación completa', () => {
    for (const n of [12, 16]) {
      const all = players(n);
      const plan = generateAmericano(all, 'doubles', null, seededRng(5), ids());
      const { partners } = analyze(
        plan,
        all.map((p) => p.id),
      );
      expect(partners.max()).toBe(1);
    }
  });

  it.each([5, 6, 7, 9, 10, 11])(
    'con %i jugadores descansan los que sobran, por turnos justos, sin repetir compañero',
    (n) => {
      const all = players(n);
      const plan = generateAmericano(all, 'doubles', null, seededRng(n), ids());
      for (const round of plan.rounds) expect(round.restingEntryIds).toHaveLength(n % 4);
      const { partners, restSpread } = analyze(
        plan,
        all.map((p) => p.id),
      );
      expect(restSpread).toBeLessThanOrEqual(1);
      expect(partners.max()).toBe(1);
    },
  );

  it('respeta la cantidad de rondas pedida', () => {
    const plan = generateAmericano(players(8), 'doubles', 3, seededRng(1), ids());
    expect(plan.rounds.map((r) => r.number)).toEqual([1, 2, 3]);
    const more = generateAmericano(players(4), 'doubles', 5, seededRng(1), ids());
    expect(more.rounds).toHaveLength(5);
  });

  it('es reproducible con la misma semilla', () => {
    const a = generateAmericano(players(9), 'doubles', null, seededRng(42), ids());
    const b = generateAmericano(players(9), 'doubles', null, seededRng(42), ids());
    expect(a).toEqual(b);
  });

  it('exige al menos 4 jugadores', () => {
    expect(() => generateAmericano(players(3), 'doubles', null, seededRng(1), ids())).toThrow();
  });
});

describe('Americano singles', () => {
  it('cada jugador enfrenta a todos una vez', () => {
    const all = players(6);
    const plan = generateAmericano(all, 'singles', null, seededRng(1), ids());
    expect(plan.rounds).toHaveLength(5);
    const { opponents, restSpread } = analyze(
      plan,
      all.map((p) => p.id),
    );
    expect(opponents.max()).toBe(1);
    expect(opponents.sumSquares()).toBe(15);
    expect(restSpread).toBe(0);
  });

  it('con impares cada uno descansa una vez', () => {
    const all = players(7);
    const plan = generateAmericano(all, 'singles', null, seededRng(1), ids());
    expect(plan.rounds).toHaveLength(7);
    const { opponents, rests } = analyze(
      plan,
      all.map((p) => p.id),
    );
    expect(opponents.max()).toBe(1);
    expect([...rests.values()]).toEqual(Array(7).fill(1));
  });
});

describe('Americano mixto', () => {
  const sexOf = (count: number, men: number) => players(count, (i) => (i < men ? 'M' : 'F'));

  it('las parejas siempre son hombre + mujer y no se repiten', () => {
    const all = sexOf(8, 4);
    const plan = generateAmericano(all, 'mixed', null, seededRng(3), ids());
    expect(plan.rounds).toHaveLength(4);
    const sex = new Map(all.map((p) => [p.id, p.sex]));
    for (const m of plan.matches) {
      for (const s of [side(m, 'A'), side(m, 'B')]) {
        expect(s.map((id) => sex.get(id)).sort()).toEqual(['F', 'M']);
      }
    }
    expect(
      analyze(
        plan,
        all.map((p) => p.id),
      ).partners.max(),
    ).toBe(1);
  });

  it('si sobran de un sexo, descansan por turnos', () => {
    const all = sexOf(9, 6); // 6 hombres, 3 mujeres → 1 partido por ronda
    const plan = generateAmericano(all, 'mixed', 6, seededRng(2), ids());
    const { rests } = analyze(
      plan,
      all.map((p) => p.id),
    );
    const menRests = all.filter((p) => p.sex === 'M').map((p) => rests.get(p.id) ?? 0);
    const womenRests = all.filter((p) => p.sex === 'F').map((p) => rests.get(p.id) ?? 0);
    expect(Math.max(...menRests) - Math.min(...menRests)).toBeLessThanOrEqual(1);
    expect(Math.max(...womenRests) - Math.min(...womenRests)).toBeLessThanOrEqual(1);
    for (const round of plan.rounds) expect(round.restingEntryIds).toHaveLength(5);
  });

  it('exige al menos 2 de cada sexo', () => {
    expect(() => generateAmericano(sexOf(5, 4), 'mixed', null, seededRng(1), ids())).toThrow();
  });
});

describe('descansos', () => {
  it('descansa quien menos descansó y, si empatan, quien hace más que no descansa', () => {
    const history = emptyHistory();
    history.rests.set('a', 1);
    history.lastRest.set('a', 1);
    history.rests.set('b', 1);
    history.lastRest.set('b', 3);
    expect(pickResting(['a', 'b', 'c'], 1, history, seededRng(1))).toEqual(['c']);
    expect(pickResting(['a', 'b'], 1, history, seededRng(1))).toEqual(['a']);
    expect(pickResting(['a', 'b'], 0, history, seededRng(1))).toEqual([]);
  });

  it('historyFrom reconstruye compañeros, rivales y descansos', () => {
    const plan = generateMexicanoRound(
      ['a', 'b', 'c', 'd', 'e'],
      emptyHistory(),
      1,
      seededRng(1),
      ids(),
    );
    const history = historyFrom(plan.matches, plan.rounds);
    const [round] = plan.rounds;
    const resting = round?.restingEntryIds ?? [];
    expect(resting).toHaveLength(1);
    expect(history.rests.get(resting[0] ?? '')).toBe(1);
    expect(history.partners.sumSquares()).toBe(2);
    expect(history.opponents.sumSquares()).toBe(4);
  });
});

describe('Mexicano', () => {
  it('cruza 1° y 4° contra 2° y 3° en cada grupo de 4', () => {
    const plan = generateMexicanoRound(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      emptyHistory(),
      2,
      seededRng(1),
      ids(),
    );
    expect(plan.rounds[0]).toMatchObject({ number: 2, restingEntryIds: [] });
    expect(plan.matches.map((m) => [side(m, 'A'), side(m, 'B')])).toEqual([
      [
        ['p1', 'p4'],
        ['p2', 'p3'],
      ],
      [
        ['p5', 'p8'],
        ['p6', 'p7'],
      ],
    ]);
  });

  it('con 9 jugadores descansa uno, priorizando a quien menos descansó', () => {
    const order = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
    const history = emptyHistory();
    for (const id of order) if (id !== 'p5') history.rests.set(id, 1);
    const plan = generateMexicanoRound(order, history, 3, seededRng(1), ids());
    expect(plan.rounds[0]?.restingEntryIds).toEqual(['p5']);
    expect(side(plan.matches[1] as MatchPlan, 'A')).toEqual(['p6', 'p9']);
  });

  it('ordena la primera ronda por nivel', () => {
    const order = orderByLevel(
      [
        { id: 'c', level: '3ra' },
        { id: 'x', level: 'Otro' },
        { id: 'a', level: '1ra' },
        { id: 'b', level: '2da' },
      ],
      ['1ra', '2da', '3ra'],
      seededRng(1),
    );
    expect(order).toEqual(['a', 'b', 'c', 'x']);
  });
});
