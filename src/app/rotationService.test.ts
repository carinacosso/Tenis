import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '../data/memory/memoryRepositories';
import type { Repositories } from '../data/ports';
import { sideEntries } from '../domain/match';
import { seededRng } from '../domain/random';
import { rotationStandings } from '../domain/rotationStandings';
import type { MatchResult } from '../domain/scoring';
import { makePlayer } from '../domain/testFactories';
import { type FormatConfig, type TournamentDraft } from '../domain/tournament';
import type { AppDeps } from './deps';
import { type Services, createServices } from './services';

const points = (a: number, b: number): MatchResult => ({
  kind: 'points',
  outcome: 'normal',
  a,
  b,
  winner: a > b ? 'A' : 'B',
});

describe('TournamentService: rotativos', () => {
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
      random: seededRng(11),
    };
    services = createServices(repos, deps);
    const levels = ['1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', 'Principiante'];
    for (let i = 1; i <= 9; i++) {
      await repos.players.save(
        makePlayer({
          id: `p${i}`,
          lastName: `J${i}`,
          sex: i <= 5 ? 'M' : 'F',
          level: levels[(i - 1) % 8] ?? '4ta',
        }),
      );
    }
  });

  async function setup(format: FormatConfig, playerIds: string[]) {
    const draft: TournamentDraft = {
      name: 'Rotativo',
      date: '2026-06-01',
      venue: '',
      category: 'Mixto',
      modality: 'doubles',
      format,
      scoring: { kind: 'points', target: 21 },
      maxEntries: 16,
      entryFee: 0,
    };
    const t = await services.tournaments.create(draft);
    if (!t.ok) throw new Error(JSON.stringify(t.errors));
    for (const pid of playerIds) {
      const r = await services.tournaments.register(t.value.id, [pid]);
      if (!r.ok) throw new Error(r.error);
    }
    return t.value;
  }

  async function playRound(tid: string, round: number) {
    const matches = (await repos.matches.listByTournament(tid)).filter((m) => m.round === round);
    for (const [i, m] of matches.entries()) {
      const r = await services.tournaments.recordResult(m.id, points(21, 10 + i));
      expect(r.status).toBe('saved');
    }
  }

  it('Americano dobles: genera todas las rondas, con descansos, y termina al cargar la última', async () => {
    const t = await setup({ kind: 'americano', variant: 'doubles', rounds: 3 }, [
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
    ]);
    const gen = await services.tournaments.generateDraw(t.id);
    expect(gen.ok).toBe(true);
    const rounds = await repos.rounds.listByTournament(t.id);
    expect(rounds.map((r) => r.restingEntryIds.length)).toEqual([1, 1, 1]);
    expect((await repos.tournaments.getById(t.id))?.plannedRounds).toBe(3);
    expect(await repos.matches.listByTournament(t.id)).toHaveLength(3);

    await playRound(t.id, 1);
    await playRound(t.id, 2);
    expect((await repos.tournaments.getById(t.id))?.status).toBe('in_progress');
    await playRound(t.id, 3);
    expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');

    // Corregir no pide confirmación y reabre si se borra un resultado
    const [first] = await repos.matches.listByTournament(t.id);
    if (!first) throw new Error();
    expect((await services.tournaments.recordResult(first.id, points(5, 21))).status).toBe('saved');
    expect((await services.tournaments.recordResult(first.id, null)).status).toBe('saved');
    expect((await repos.tournaments.getById(t.id))?.status).toBe('in_progress');
  });

  it('valida el resultado a puntos', async () => {
    const t = await setup({ kind: 'americano', variant: 'singles', rounds: null }, [
      'p1',
      'p2',
      'p3',
    ]);
    await services.tournaments.generateDraw(t.id);
    const [m] = await repos.matches.listByTournament(t.id);
    if (!m) throw new Error();
    const r = await services.tournaments.recordResult(m.id, points(20, 18));
    expect(r).toEqual({ status: 'invalid', error: 'Gana el primero que llega a 21 puntos.' });
    expect((await repos.tournaments.getById(t.id))?.plannedRounds).toBe(3);
  });

  it('no usa cabezas de serie', async () => {
    const t = await setup({ kind: 'mexicano', rounds: 2 }, ['p1', 'p2', 'p3', 'p4']);
    const [entry] = await repos.entries.listByTournament(t.id);
    expect((await services.tournaments.setSeeds(t.id, [entry?.id ?? ''])).ok).toBe(false);
  });

  it('Mexicano: primera ronda por nivel, después por ranking, de a una', async () => {
    // p1=1ra, p2=2da … p8=Principiante
    const t = await setup({ kind: 'mexicano', rounds: 3 }, [
      'p8',
      'p3',
      'p1',
      'p6',
      'p2',
      'p7',
      'p4',
      'p5',
    ]);
    await services.tournaments.generateDraw(t.id);
    const entries = await repos.entries.listByTournament(t.id);
    const playerOf = new Map(entries.map((e) => [e.id, e.playerIds[0]]));
    const r1 = (await repos.matches.listByTournament(t.id)).sort((a, b) => a.position - b.position);
    const sides = (m: (typeof r1)[number]) =>
      [sideEntries(m.sideA), sideEntries(m.sideB)].map((s) => s.map((id) => playerOf.get(id)));
    expect(r1.map(sides)).toEqual([
      [
        ['p1', 'p4'],
        ['p2', 'p3'],
      ],
      [
        ['p5', 'p8'],
        ['p6', 'p7'],
      ],
    ]);

    // No se puede generar la ronda 2 sin terminar la 1
    expect((await services.tournaments.generateNextRound(t.id)).ok).toBe(false);
    await playRound(t.id, 1);
    const next = await services.tournaments.generateNextRound(t.id);
    expect(next.ok).toBe(true);

    // La ronda 2 sigue el ranking: 1° y 4° vs 2° y 3°
    const matches = await repos.matches.listByTournament(t.id);
    const rounds = await repos.rounds.listByTournament(t.id);
    const ranking = rotationStandings(
      entries.map((e) => e.id),
      matches.filter((m) => m.round === 1),
      rounds.filter((r) => r.number === 1),
      t.id,
    ).map((r) => r.entryId);
    const r2 = matches.filter((m) => m.round === 2).sort((a, b) => a.position - b.position);
    expect(sideEntries(r2[0]?.sideA ?? { kind: 'bye' })).toEqual([ranking[0], ranking[3]]);
    expect(sideEntries(r2[0]?.sideB ?? { kind: 'bye' })).toEqual([ranking[1], ranking[2]]);

    // Deshacer la ronda 2 (sin resultados) y volver a generarla
    expect((await services.tournaments.undoLastRound(t.id)).ok).toBe(true);
    expect(await repos.rounds.listByTournament(t.id)).toHaveLength(1);
    expect((await services.tournaments.generateNextRound(t.id)).ok).toBe(true);

    await playRound(t.id, 2);
    expect((await services.tournaments.undoLastRound(t.id)).ok).toBe(false);
    await services.tournaments.generateNextRound(t.id);
    await playRound(t.id, 3);
    expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');
    expect((await services.tournaments.generateNextRound(t.id)).ok).toBe(false);
  });

  it('Americano mixto: exige sexo y equilibrio mínimo', async () => {
    await repos.players.save(makePlayer({ id: 'sin-sexo', sex: null }));
    const t = await setup({ kind: 'americano', variant: 'mixed', rounds: null }, [
      'p1',
      'p2',
      'p3',
    ]);
    const r = await services.tournaments.register(t.id, ['sin-sexo']);
    expect(r.ok).toBe(false);
    expect((await services.tournaments.generateDraw(t.id)).ok).toBe(false); // 3 hombres, 0 mujeres
    await services.tournaments.register(t.id, ['p6']);
    await services.tournaments.register(t.id, ['p7']);
    expect((await services.tournaments.generateDraw(t.id)).ok).toBe(true);
  });

  it('deshacer el sorteo borra rondas y partidos', async () => {
    const t = await setup({ kind: 'americano', variant: 'doubles', rounds: null }, [
      'p1',
      'p2',
      'p3',
      'p4',
    ]);
    await services.tournaments.generateDraw(t.id);
    expect((await services.tournaments.undoDraw(t.id)).ok).toBe(true);
    expect(await repos.rounds.listByTournament(t.id)).toEqual([]);
    expect(await repos.matches.listByTournament(t.id)).toEqual([]);
    expect((await repos.tournaments.getById(t.id))?.plannedRounds).toBeNull();
  });
});
