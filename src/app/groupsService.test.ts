import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '../data/memory/memoryRepositories';
import type { Repositories } from '../data/ports';
import { groupMatches, playoffMatches } from '../domain/groups';
import type { Match } from '../domain/match';
import { seededRng } from '../domain/random';
import { DEFAULT_SETS_SCORING } from '../domain/scoring';
import { makePlayer } from '../domain/testFactories';
import type { FormatConfig, TournamentDraft } from '../domain/tournament';
import type { AppDeps } from './deps';
import { type Services, createServices } from './services';

describe('TournamentService: grupos y liga', () => {
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
      random: seededRng(5),
    };
    services = createServices(repos, deps);
    for (let i = 1; i <= 8; i++)
      await repos.players.save(makePlayer({ id: `p${i}`, lastName: `J${i}` }));
  });

  async function setup(format: FormatConfig, count: number) {
    const draft: TournamentDraft = {
      name: 'Tabla',
      date: '2026-06-01',
      venue: '',
      category: '4ta',
      modality: 'singles',
      format,
      scoring: { ...DEFAULT_SETS_SCORING, bestOf: 1 },
      maxEntries: 16,
      entryFee: 0,
    };
    const t = await services.tournaments.create(draft);
    if (!t.ok) throw new Error(JSON.stringify(t.errors));
    for (let i = 1; i <= count; i++) {
      const r = await services.tournaments.register(t.value.id, [`p${i}`]);
      if (!r.ok) throw new Error(r.error);
    }
    return t.value;
  }

  const oneSet = (side: 'A' | 'B') => ({
    kind: 'sets' as const,
    outcome: 'normal' as const,
    sets: [side === 'A' ? { a: 6, b: 2 } : { a: 2, b: 6 }],
    winner: side,
  });

  /** Juega todos los partidos pendientes de la lista dada, ganando el lado A. */
  async function playAll(list: () => Promise<Match[]>) {
    for (const m of await list()) {
      if (m.result) continue;
      const r = await services.tournaments.recordResult(m.id, oneSet('A'));
      expect(r.status).toBe('saved');
    }
  }

  it('liga: todos contra todos, termina cuando se juegan todos', async () => {
    const t = await setup({ kind: 'league', doubleRound: false }, 5);
    expect((await services.tournaments.generateDraw(t.id)).ok).toBe(true);
    const groups = await repos.groups.listByTournament(t.id);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('Liga');
    const matches = await repos.matches.listByTournament(t.id);
    expect(matches).toHaveLength(10);
    expect(await repos.rounds.listByTournament(t.id)).toHaveLength(5);
    await playAll(() => repos.matches.listByTournament(t.id));
    expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');
  });

  it('liga ida y vuelta', async () => {
    const t = await setup({ kind: 'league', doubleRound: true }, 4);
    await services.tournaments.generateDraw(t.id);
    expect(await repos.matches.listByTournament(t.id)).toHaveLength(12);
  });

  it('grupos: cabezas en grupos distintos y cuadro final automático al terminar los grupos', async () => {
    const t = await setup({ kind: 'groups', groupCount: 2, qualifiersPerGroup: 2 }, 8);
    const entries = await repos.entries.listByTournament(t.id);
    const [s1, s2] = entries;
    expect((await services.tournaments.setSeeds(t.id, [s1?.id ?? '', s2?.id ?? ''])).ok).toBe(true);
    expect((await services.tournaments.generateDraw(t.id)).ok).toBe(true);

    const groups = await repos.groups.listByTournament(t.id);
    expect(groups.map((g) => g.entryIds.length)).toEqual([4, 4]);
    expect(groups.find((g) => g.entryIds.includes(s1?.id ?? ''))).not.toBe(
      groups.find((g) => g.entryIds.includes(s2?.id ?? '')),
    );

    const all = () => repos.matches.listByTournament(t.id);
    expect(groupMatches(await all())).toHaveLength(12);
    expect(playoffMatches(await all())).toHaveLength(0);

    await playAll(async () => groupMatches(await all()));
    const playoff = playoffMatches(await all());
    expect(playoff).toHaveLength(3); // 2 semifinales + final
    expect((await repos.tournaments.getById(t.id))?.status).toBe('in_progress');

    await playAll(async () => playoffMatches(await all()).filter((m) => m.round === 1));
    await playAll(async () => playoffMatches(await all()));
    expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');
  });

  it('corregir resultados de grupo que cambian los clasificados pide confirmación y rearma el cuadro', async () => {
    const t = await setup({ kind: 'groups', groupCount: 2, qualifiersPerGroup: 1 }, 6);
    await services.tournaments.generateDraw(t.id);
    const all = () => repos.matches.listByTournament(t.id);
    await playAll(async () => groupMatches(await all()));
    const [final] = playoffMatches(await all());
    if (!final) throw new Error('sin final');
    expect((await services.tournaments.recordResult(final.id, oneSet('A'))).status).toBe('saved');
    expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');

    // Un jugador del grupo A que no clasificó pasa a ganar todos sus partidos → pasa a ser 1°
    const [groupA] = (await repos.groups.listByTournament(t.id)).sort((a, b) => a.index - b.index);
    const finalists = [final.sideA, final.sideB].map((s) => (s.kind === 'entry' ? s.entryId : ''));
    const outsider = groupA?.entryIds.find((id) => !finalists.includes(id));
    if (!outsider) throw new Error('sin candidato');
    let asked = false;
    for (const m of groupMatches(await all())) {
      const sideOf = (x: Match['sideA']) => (x.kind === 'entry' ? x.entryId : '');
      if (sideOf(m.sideA) !== outsider && sideOf(m.sideB) !== outsider) continue;
      const result = oneSet(sideOf(m.sideA) === outsider ? 'A' : 'B');
      const preview = await services.tournaments.recordResult(m.id, result);
      if (preview.status === 'needsConfirmation') {
        asked = true;
        expect(preview.cleared).toEqual([final.id]);
        // Sin confirmar no se guarda nada
        expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');
        expect((await services.tournaments.recordResult(m.id, result, true)).status).toBe('saved');
      } else {
        expect(preview.status).toBe('saved');
      }
    }
    expect(asked).toBe(true);
    const playoff = playoffMatches(await all());
    expect(playoff).toHaveLength(1);
    expect(playoff[0]?.id).not.toBe(final.id);
    expect(playoff[0]?.result).toBeNull();
    expect(JSON.stringify(playoff[0])).toContain(outsider);
    expect((await repos.tournaments.getById(t.id))?.status).toBe('in_progress');
  });

  it('borrar un resultado de grupo saca el cuadro final (sin resultados no pide confirmación)', async () => {
    const t = await setup({ kind: 'groups', groupCount: 2, qualifiersPerGroup: 1 }, 6);
    await services.tournaments.generateDraw(t.id);
    const all = () => repos.matches.listByTournament(t.id);
    await playAll(async () => groupMatches(await all()));
    expect(playoffMatches(await all())).toHaveLength(1);
    const [first] = groupMatches(await all());
    if (!first) throw new Error();
    expect((await services.tournaments.recordResult(first.id, null)).status).toBe('saved');
    expect(playoffMatches(await all())).toHaveLength(0);
  });

  it('no deja generar grupos con muy pocos inscriptos', async () => {
    const t = await setup({ kind: 'groups', groupCount: 2, qualifiersPerGroup: 2 }, 5);
    const r = await services.tournaments.generateDraw(t.id);
    expect(r.ok).toBe(false);
  });

  it('deshacer el sorteo borra los grupos', async () => {
    const t = await setup({ kind: 'groups', groupCount: 2, qualifiersPerGroup: 1 }, 4);
    await services.tournaments.generateDraw(t.id);
    expect((await services.tournaments.undoDraw(t.id)).ok).toBe(true);
    expect(await repos.groups.listByTournament(t.id)).toEqual([]);
  });

  it('la liga no usa cabezas de serie', async () => {
    const t = await setup({ kind: 'league', doubleRound: false }, 3);
    const [e] = await repos.entries.listByTournament(t.id);
    expect((await services.tournaments.setSeeds(t.id, [e?.id ?? ''])).ok).toBe(false);
  });
});
