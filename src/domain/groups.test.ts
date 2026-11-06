import { describe, expect, it } from 'vitest';
import {
  buildPlayoff,
  computeGroupTables,
  distributeGroups,
  generateGroupStage,
  groupName,
  isGroupStageComplete,
  roundRobin,
  superTiebreakIndex,
} from './groups';
import { PairCounter } from './rotation';
import { seededRng } from './random';
import type { StandingRow } from './standings';
import { resolveKnockout } from './knockout';
import { DEFAULT_SETS_SCORING } from './scoring';
import { toMatches } from './testFactories';

function idGen() {
  let n = 0;
  return () => `id${++n}`;
}

const entrants = (count: number, seeds = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: `e${i + 1}`, seed: i < seeds ? i + 1 : null }));

describe('distributeGroups', () => {
  it('grupos parejos y cabezas de serie en grupos distintos (zigzag)', () => {
    const groups = distributeGroups(entrants(10, 4), 3, seededRng(1), idGen());
    expect(groups.map((g) => g.name)).toEqual(['A', 'B', 'C']);
    expect(groups.map((g) => g.entryIds.length).sort()).toEqual([3, 3, 4]);
    expect(groups.flatMap((g) => g.entryIds).sort()).toEqual(
      entrants(10)
        .map((e) => e.id)
        .sort(),
    );
    // Zigzag: e1→A, e2→B, e3→C, e4→C
    expect(groups[0]?.entryIds[0]).toBe('e1');
    expect(groups[1]?.entryIds[0]).toBe('e2');
    expect(groups[2]?.entryIds.slice(0, 2)).toEqual(['e3', 'e4']);
  });

  it('nombres de grupos', () => {
    expect([0, 1, 25].map(groupName)).toEqual(['A', 'B', '26']);
  });
});

describe('roundRobin', () => {
  it('cada par se enfrenta una vez y con impares uno queda libre por fecha', () => {
    for (const count of [4, 5, 6]) {
      const ids = entrants(count).map((e) => e.id);
      const rounds = roundRobin(ids, false, seededRng(2));
      expect(rounds).toHaveLength(count % 2 === 0 ? count - 1 : count);
      const pairs = new PairCounter();
      for (const r of rounds) {
        const appear = [...r.resting, ...r.matches.flat()];
        expect(appear.sort()).toEqual([...ids].sort());
        for (const [a, b] of r.matches) pairs.add(a, b);
      }
      expect(pairs.max()).toBe(1);
      expect(pairs.sumSquares()).toBe((count * (count - 1)) / 2);
    }
  });

  it('ida y vuelta: cada par juega dos veces, con localía invertida', () => {
    const rounds = roundRobin(['a', 'b', 'c', 'd'], true, seededRng(3));
    expect(rounds).toHaveLength(6);
    const first = rounds.slice(0, 3).flatMap((r) => r.matches);
    const second = rounds.slice(3).flatMap((r) => r.matches);
    expect(second).toEqual(first.map(([x, y]) => [y, x]));
  });
});

describe('generateGroupStage', () => {
  it('arma las fechas juntando la misma ronda de cada grupo', () => {
    const groups = distributeGroups(entrants(7), 2, seededRng(4), idGen());
    const stage = generateGroupStage(groups, false, seededRng(4), idGen());
    // grupo de 4 → 3 fechas; grupo de 3 → 3 fechas (con libre)
    expect(stage.rounds).toHaveLength(3);
    expect(stage.matches).toHaveLength(6 + 3);
    expect(stage.matches.every((m) => m.stage === 'group')).toBe(true);
    for (const round of stage.rounds) expect(round.restingEntryIds).toHaveLength(1);
    const matches = toMatches(stage.matches);
    expect(isGroupStageComplete(matches)).toBe(false);
  });
});

function row(entryId: string, won: number, played = 3, setDiff = 0, gameDiff = 0): StandingRow {
  return {
    entryId,
    position: 0,
    played,
    won,
    lost: played - won,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    setDiff,
    gameDiff,
  };
}

/** Primera ronda del playoff como texto, por posición. */
function firstRound(plans: ReturnType<typeof buildPlayoff>): string[] {
  return plans
    .filter((m) => m.round === 1)
    .sort((a, b) => a.position - b.position)
    .map((m) => [m.sideA, m.sideB].map((s) => (s.kind === 'entry' ? s.entryId : s.kind)).join('-'));
}

describe('buildPlayoff', () => {
  it('2 grupos, 2 clasificados: 1°A vs 2°B y 1°B vs 2°A', () => {
    const plans = buildPlayoff(
      [
        { groupIndex: 0, rows: [row('A1', 3), row('A2', 2), row('A3', 1)] },
        { groupIndex: 1, rows: [row('B1', 2), row('B2', 1), row('B3', 0)] },
      ],
      2,
      idGen(),
    );
    expect(firstRound(plans)).toEqual(['A1-B2', 'A2-B1']);
    expect(plans.every((m) => m.stage === 'playoff')).toBe(true);
    expect(plans).toHaveLength(3);
  });

  it('4 grupos, 2 clasificados: nadie cruza a su grupo antes de la final', () => {
    const tables = [0, 1, 2, 3].map((g) => ({
      groupIndex: g,
      rows: [row(`${g}-1`, 3 - g * 0.1), row(`${g}-2`, 2 - g * 0.1), row(`${g}-3`, 0)],
    }));
    const plans = buildPlayoff(tables, 2, idGen());
    const first = firstRound(plans);
    expect(first).toHaveLength(4);
    // Cada partido: un 1° contra un 2° de otro grupo
    for (const m of first) {
      const [x = '', y = ''] = m.split('-').length === 4 ? [m.slice(0, 3), m.slice(4)] : [];
      expect(x.split('-')[0]).not.toBe(y.split('-')[0]);
      expect([x.endsWith('-1'), y.endsWith('-1')].filter(Boolean)).toHaveLength(1);
    }
    // Mitades: los dos de cada grupo en mitades distintas
    const top = first.slice(0, 2).join(' ');
    for (const g of [0, 1, 2, 3]) {
      expect(top.includes(`${g}-1`)).not.toBe(top.includes(`${g}-2`));
    }
  });

  it('3 grupos, 2 clasificados: los mejores 1° pasan con bye', () => {
    const tables = [
      { groupIndex: 0, rows: [row('A1', 3), row('A2', 1)] },
      { groupIndex: 1, rows: [row('B1', 2), row('B2', 1)] },
      { groupIndex: 2, rows: [row('C1', 1), row('C2', 0)] },
    ];
    const plans = buildPlayoff(tables, 2, idGen());
    const first = firstRound(plans);
    expect(first).toHaveLength(4);
    expect(first[0]).toBe('A1-bye');
    expect(first[3]).toBe('bye-B1');
    const resolved = resolveKnockout(toMatches(plans));
    expect([...resolved.values()].filter((r) => r.state === 'bye')).toHaveLength(2);
  });

  it('compara entre grupos por promedio (grupos de distinto tamaño)', () => {
    const tables = [
      { groupIndex: 0, rows: [row('A1', 3, 4), row('A2', 2, 4)] }, // 75 %
      { groupIndex: 1, rows: [row('B1', 3, 3), row('B2', 1, 3)] }, // 100 %
    ];
    const first = firstRound(buildPlayoff(tables, 1, idGen()));
    expect(first).toEqual(['B1-A1']);
  });

  it('exige al menos 2 clasificados', () => {
    expect(() => buildPlayoff([{ groupIndex: 0, rows: [row('A1', 1)] }], 1, idGen())).toThrow();
  });
});

describe('computeGroupTables', () => {
  it('calcula la tabla de cada grupo con sus propios partidos', () => {
    const groups = [
      { id: 'g2', index: 1, entryIds: ['c', 'd'] },
      { id: 'g1', index: 0, entryIds: ['a', 'b'] },
    ];
    const plans = [
      {
        id: 'm1',
        round: 1,
        position: 0,
        sideA: { kind: 'entry' as const, entryId: 'a' },
        sideB: { kind: 'entry' as const, entryId: 'b' },
        stage: 'group' as const,
        groupId: 'g1',
      },
      {
        id: 'm2',
        round: 1,
        position: 1,
        sideA: { kind: 'entry' as const, entryId: 'c' },
        sideB: { kind: 'entry' as const, entryId: 'd' },
        stage: 'group' as const,
        groupId: 'g2',
      },
    ];
    const matches = toMatches(plans).map((m) =>
      m.id === 'm1'
        ? {
            ...m,
            result: {
              kind: 'sets' as const,
              outcome: 'normal' as const,
              sets: [{ a: 2, b: 6 }],
              winner: 'B' as const,
            },
          }
        : m,
    );
    const tables = computeGroupTables(
      { id: 't', scoring: { ...DEFAULT_SETS_SCORING, bestOf: 1 } },
      groups,
      matches,
    );
    expect(tables.map((t) => t.groupIndex)).toEqual([0, 1]);
    expect(tables[0]?.rows.map((r) => r.entryId)).toEqual(['b', 'a']);
    expect(tables[1]?.rows.every((r) => r.played === 0)).toBe(true);
  });

  it('superTiebreakIndex', () => {
    expect(
      superTiebreakIndex({ scoring: { ...DEFAULT_SETS_SCORING, decidingSet: 'superTiebreak' } }),
    ).toBe(2);
    expect(superTiebreakIndex({ scoring: DEFAULT_SETS_SCORING })).toBeNull();
    expect(superTiebreakIndex({ scoring: { kind: 'points', target: 21 } })).toBeNull();
  });
});
