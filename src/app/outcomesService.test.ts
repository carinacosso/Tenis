import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '../data/memory/memoryRepositories';
import type { Repositories } from '../data/ports';
import { consolationMatches, mainDrawMatches } from '../domain/consolation';
import { resolveKnockout } from '../domain/knockout';
import type { Match } from '../domain/match';
import { seededRng } from '../domain/random';
import { DEFAULT_SETS_SCORING, type MatchResult, buildWalkover } from '../domain/scoring';
import { makePlayer } from '../domain/testFactories';
import type { FormatConfig, TournamentDraft } from '../domain/tournament';
import type { AppDeps } from './deps';
import { type Services, createServices } from './services';

const scoring = { ...DEFAULT_SETS_SCORING, bestOf: 1 as const };
const oneSet = (side: 'A' | 'B'): MatchResult => ({
  kind: 'sets',
  outcome: 'normal',
  sets: [side === 'A' ? { a: 6, b: 2 } : { a: 2, b: 6 }],
  winner: side,
});

describe('TournamentService: W.O., abandono, lesión y consolación', () => {
  let repos: Repositories;
  let services: Services;
  let minute: number;
  let ids: number;

  beforeEach(async () => {
    repos = createMemoryRepositories();
    minute = 0;
    ids = 0;
    const deps: AppDeps = {
      now: () => new Date(Date.UTC(2026, 0, 1, 0, minute++)),
      newId: () => `id-${++ids}`,
      random: seededRng(9),
    };
    services = createServices(repos, deps);
    for (let i = 1; i <= 8; i++)
      await repos.players.save(makePlayer({ id: `p${i}`, lastName: `J${i}` }));
  });

  async function setup(format: FormatConfig, count: number) {
    const draft: TournamentDraft = {
      name: 'T',
      date: '2026-06-01',
      venue: '',
      category: '4ta',
      modality: 'singles',
      format,
      scoring,
      maxEntries: 16,
      entryFee: 0,
    };
    const t = await services.tournaments.create(draft);
    if (!t.ok) throw new Error(JSON.stringify(t.errors));
    for (let i = 1; i <= count; i++) await services.tournaments.register(t.value.id, [`p${i}`]);
    const gen = await services.tournaments.generateDraw(t.value.id);
    if (!gen.ok) throw new Error(gen.error);
    return t.value;
  }

  const all = (tid: string) => repos.matches.listByTournament(tid);

  it('W.O. y abandono en eliminación directa: el ganador avanza', async () => {
    const t = await setup({ kind: 'knockout' }, 4);
    const [m1, m2] = (await all(t.id)).filter((m) => m.round === 1);
    if (!m1 || !m2) throw new Error();
    const wo = buildWalkover(scoring, 'B');
    if (!wo.ok) throw new Error();
    expect((await services.tournaments.recordResult(m1.id, wo.result)).status).toBe('saved');
    const retired: MatchResult = {
      kind: 'sets',
      outcome: 'retired',
      sets: [{ a: 3, b: 1 }],
      winner: 'B',
    };
    expect((await services.tournaments.recordResult(m2.id, retired)).status).toBe('saved');
    const final = resolveKnockout(await all(t.id));
    const finalMatch = [...final.values()].find((r) => r.match.round === 2);
    expect(finalMatch?.state).toBe('ready');
    // Un abandono con un set imposible se rechaza
    const bad: MatchResult = {
      kind: 'sets',
      outcome: 'retired',
      sets: [
        { a: 6, b: 5 },
        { a: 1, b: 0 },
      ],
      winner: 'A',
    };
    expect((await services.tournaments.recordResult(m2.id, bad)).status).toBe('invalid');
  });

  it('lesión en liga: el lesionado pierde por W.O. lo que le quedaba, y se deshace si se corrige', async () => {
    const t = await setup({ kind: 'league', doubleRound: false }, 4);
    const [first] = (await all(t.id)).sort((a, b) => a.round - b.round);
    if (!first || first.sideA.kind !== 'entry') throw new Error();
    const injuredEntry = first.sideA.entryId;
    const injury: MatchResult = {
      kind: 'sets',
      outcome: 'injury',
      sets: [{ a: 1, b: 3 }],
      winner: 'B',
    };
    expect((await services.tournaments.recordResult(first.id, injury)).status).toBe('saved');

    const involves = (m: Match) =>
      [m.sideA, m.sideB].some((s) => s.kind === 'entry' && s.entryId === injuredEntry);
    const others = (await all(t.id)).filter((m) => m.id !== first.id && involves(m));
    expect(others).toHaveLength(2);
    for (const m of others) {
      expect(m.result).toMatchObject({ outcome: 'walkover', autoWalkoverFrom: first.id });
      const loserSide = m.result?.winner === 'A' ? m.sideB : m.sideA;
      expect(loserSide.kind === 'entry' && loserSide.entryId).toBe(injuredEntry);
    }
    // Partidos de otros jugadores no se tocan
    expect((await all(t.id)).filter((m) => !involves(m)).every((m) => m.result === null)).toBe(
      true,
    );

    // Si se corrige a un resultado normal, se sacan los W.O. automáticos
    await services.tournaments.recordResult(first.id, oneSet('A'));
    expect(
      (await all(t.id))
        .filter((m) => m.id !== first.id && involves(m))
        .every((m) => m.result === null),
    ).toBe(true);
  });

  it('consolación: se arma con los que pierden su primer partido y el torneo termina con ambas finales', async () => {
    const t = await setup({ kind: 'knockout', consolation: true }, 8);
    const playReady = async (filter: (m: Match) => boolean) => {
      for (const r of resolveKnockout(await all(t.id)).values()) {
        if (r.state === 'ready' && filter(r.match)) {
          expect((await services.tournaments.recordResult(r.match.id, oneSet('A'))).status).toBe(
            'saved',
          );
        }
      }
    };
    expect(consolationMatches(await all(t.id))).toHaveLength(0);
    await playReady((m) => m.stage === undefined && m.round === 1);
    const consolation = consolationMatches(await all(t.id));
    expect(consolation).toHaveLength(3); // 4 perdedores → semis + final

    // El principal termina pero falta la consolación
    await playReady((m) => m.stage === undefined && m.round === 2);
    await playReady((m) => m.stage === undefined && m.round === 3);
    expect((await repos.tournaments.getById(t.id))?.status).toBe('in_progress');
    await playReady((m) => m.stage === 'consolation' && m.round === 1);
    await playReady((m) => m.stage === 'consolation' && m.round === 2);
    expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');
  });

  it('consolación: corregir un primer partido cambia quién entra, pide confirmación y se vuelve a sortear', async () => {
    const t = await setup({ kind: 'knockout', consolation: true }, 4);
    const r1 = mainDrawMatches(await all(t.id)).filter((m) => m.round === 1);
    for (const m of r1) await services.tournaments.recordResult(m.id, oneSet('A'));
    const [cons] = consolationMatches(await all(t.id));
    if (!cons) throw new Error('sin consolación');
    await services.tournaments.recordResult(cons.id, oneSet('A'));

    const [first] = r1;
    if (!first) throw new Error();
    const preview = await services.tournaments.recordResult(first.id, oneSet('B'));
    expect(preview).toEqual({ status: 'needsConfirmation', cleared: [cons.id] });
    expect((await services.tournaments.recordResult(first.id, oneSet('B'), true)).status).toBe(
      'saved',
    );
    const [newCons] = consolationMatches(await all(t.id));
    expect(newCons?.id).not.toBe(cons.id);
    expect(newCons?.result).toBeNull();
  });

  it('sin consolación activada no se arma', async () => {
    const t = await setup({ kind: 'knockout' }, 4);
    for (const m of (await all(t.id)).filter((x) => x.round === 1))
      await services.tournaments.recordResult(m.id, oneSet('A'));
    expect(consolationMatches(await all(t.id))).toHaveLength(0);
  });
});
