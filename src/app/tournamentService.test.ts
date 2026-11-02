import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '../data/memory/memoryRepositories';
import type { Repositories } from '../data/ports';
import { resolveKnockout } from '../domain/knockout';
import { seededRng } from '../domain/random';
import { DEFAULT_SETS_SCORING } from '../domain/scoring';
import { makePlayer, win } from '../domain/testFactories';
import type { TournamentDraft } from '../domain/tournament';
import type { AppDeps } from './deps';
import { type Services, createServices } from './services';

const draft: TournamentDraft = {
  name: 'Apertura',
  date: '2026-06-01',
  venue: 'Club',
  category: '4ta',
  modality: 'singles',
  format: { kind: 'knockout' },
  scoring: DEFAULT_SETS_SCORING,
  maxEntries: 4,
  entryFee: 2000,
};

describe('TournamentService', () => {
  let repos: Repositories;
  let services: Services;
  let minute: number;
  let ids: number;

  beforeEach(async () => {
    repos = createMemoryRepositories();
    minute = 0;
    ids = 0;
    const deps: AppDeps = {
      // Cada llamada avanza un minuto, así el orden de inscripción queda definido.
      now: () => new Date(Date.UTC(2026, 0, 1, 0, minute++)),
      newId: () => `id-${++ids}`,
      random: seededRng(7),
    };
    services = createServices(repos, deps);
    for (let i = 1; i <= 8; i++)
      await repos.players.save(makePlayer({ id: `p${i}`, lastName: `J${i}` }));
  });

  async function createTournament(overrides: Partial<TournamentDraft> = {}) {
    const r = await services.tournaments.create({ ...draft, ...overrides });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.value;
  }

  async function registerAll(tid: string, playerIds: string[]) {
    for (const pid of playerIds) {
      const r = await services.tournaments.register(tid, [pid]);
      if (!r.ok) throw new Error(r.error);
    }
  }

  it('crea el torneo con inscripción abierta', async () => {
    const t = await createTournament();
    expect(t).toMatchObject({ status: 'registration', drawGeneratedAt: null, ownerId: 'local' });
    expect((await services.tournaments.create({ ...draft, name: '' })).ok).toBe(false);
  });

  it('inscribe con pago individual pendiente y manda a lista de espera al llenarse el cupo', async () => {
    const t = await createTournament({ maxEntries: 2 });
    await registerAll(t.id, ['p1', 'p2', 'p3']);
    const entries = await repos.entries.listByTournament(t.id);
    expect(entries.map((e) => e.status)).toEqual(['confirmed', 'confirmed', 'waitlist']);
    expect(entries[0]?.payments).toEqual([{ playerId: 'p1', amount: 2000, status: 'pending' }]);
    expect((await services.tournaments.register(t.id, ['p1'])).ok).toBe(false);
    expect((await services.tournaments.register(t.id, ['no-existe'])).ok).toBe(false);
  });

  it('en dobles cada jugador tiene su pago', async () => {
    const t = await createTournament({ modality: 'doubles' });
    const r = await services.tournaments.register(t.id, ['p1', 'p2']);
    expect(r.ok && r.value.payments.map((p) => p.playerId)).toEqual(['p1', 'p2']);
    if (!r.ok) return;
    await services.tournaments.setPayment(r.value.id, 'p2', 'paid');
    const [entry] = await repos.entries.listByTournament(t.id);
    expect(entry?.payments.map((p) => p.status)).toEqual(['pending', 'paid']);
  });

  it('al dar de baja promueve automáticamente al primero de la lista de espera', async () => {
    const t = await createTournament({ maxEntries: 2 });
    await registerAll(t.id, ['p1', 'p2', 'p3', 'p4']);
    const [first] = await repos.entries.listByTournament(t.id);
    if (!first) throw new Error();
    const r = await services.tournaments.withdraw(first.id);
    expect(r.ok && r.value.map((e) => e.playerIds[0])).toEqual(['p3']);
    const status = Object.fromEntries(
      (await repos.entries.listByTournament(t.id)).map((e) => [e.playerIds[0], e.status]),
    );
    expect(status).toEqual({ p1: 'withdrawn', p2: 'confirmed', p3: 'confirmed', p4: 'waitlist' });
  });

  it('al ampliar el cupo promueve la lista de espera; no se puede bajar por debajo de los confirmados', async () => {
    const t = await createTournament({ maxEntries: 2 });
    await registerAll(t.id, ['p1', 'p2', 'p3']);
    expect((await services.tournaments.update(t.id, { ...draft, maxEntries: 1 })).ok).toBe(false);
    expect((await services.tournaments.update(t.id, { ...draft, maxEntries: 3 })).ok).toBe(true);
    const statuses = (await repos.entries.listByTournament(t.id)).map((e) => e.status);
    expect(statuses).toEqual(['confirmed', 'confirmed', 'confirmed']);
  });

  it('genera los cruces, cierra la inscripción y bloquea cambios de formato', async () => {
    const t = await createTournament({ maxEntries: 8 });
    await registerAll(t.id, ['p1', 'p2', 'p3', 'p4', 'p5']);
    const entries = await repos.entries.listByTournament(t.id);
    expect(
      (await services.tournaments.setSeeds(t.id, [entries[4]?.id ?? '', entries[0]?.id ?? ''])).ok,
    ).toBe(true);
    const r = await services.tournaments.generateDraw(t.id);
    expect(r.ok && r.value).toHaveLength(7);
    const updated = await repos.tournaments.getById(t.id);
    expect(updated).toMatchObject({ status: 'in_progress' });
    expect(updated?.drawGeneratedAt).not.toBeNull();
    expect((await services.tournaments.register(t.id, ['p6'])).ok).toBe(false);
    expect((await services.tournaments.generateDraw(t.id)).ok).toBe(false);
    const change = await services.tournaments.update(t.id, {
      ...draft,
      maxEntries: 8,
      modality: 'doubles',
    });
    expect(change.ok).toBe(false);
    const rename = await services.tournaments.update(t.id, {
      ...draft,
      maxEntries: 8,
      name: 'Nuevo',
    });
    expect(rename.ok).toBe(true);
  });

  it('no genera cruces con menos del mínimo', async () => {
    const t = await createTournament();
    await registerAll(t.id, ['p1']);
    expect(await services.tournaments.generateDraw(t.id)).toEqual({
      ok: false,
      error: 'Se necesitan al menos 2 inscriptos confirmados (hay 1).',
    });
  });

  it('deshacer el sorteo solo sin resultados', async () => {
    const t = await createTournament();
    await registerAll(t.id, ['p1', 'p2', 'p3', 'p4']);
    await services.tournaments.generateDraw(t.id);
    expect((await services.tournaments.undoDraw(t.id)).ok).toBe(true);
    expect(await repos.matches.listByTournament(t.id)).toEqual([]);
    expect((await repos.tournaments.getById(t.id))?.status).toBe('registration');

    await services.tournaments.generateDraw(t.id);
    const ready = (await repos.matches.listByTournament(t.id)).find((m) => m.round === 1);
    if (!ready) throw new Error();
    await services.tournaments.recordResult(ready.id, win('A'));
    expect((await services.tournaments.undoDraw(t.id)).ok).toBe(false);
  });

  describe('resultados', () => {
    async function startedTournament() {
      const t = await createTournament();
      await registerAll(t.id, ['p1', 'p2', 'p3', 'p4']);
      await services.tournaments.generateDraw(t.id);
      const matches = await repos.matches.listByTournament(t.id);
      const find = (round: number, position: number) => {
        const m = matches.find((x) => x.round === round && x.position === position);
        if (!m) throw new Error('partido inexistente');
        return m;
      };
      return { t, sf1: find(1, 0), sf2: find(1, 1), final: find(2, 0) };
    }

    it('valida el resultado contra la configuración', async () => {
      const { sf1 } = await startedTournament();
      const bad = await services.tournaments.recordResult(sf1.id, {
        kind: 'sets',
        outcome: 'normal',
        sets: [{ a: 6, b: 5 }],
        winner: 'A',
      });
      expect(bad).toEqual({
        status: 'invalid',
        error: 'Set 1: 6-5 no es un resultado válido para sets a 6.',
      });
    });

    it('no permite cargar un partido sin jugadores definidos', async () => {
      const { final } = await startedTournament();
      const r = await services.tournaments.recordResult(final.id, win('A'));
      expect(r.status).toBe('invalid');
    });

    it('juega el torneo completo y lo marca como finalizado', async () => {
      const { t, sf1, sf2, final } = await startedTournament();
      expect((await services.tournaments.recordResult(sf1.id, win('A'))).status).toBe('saved');
      expect((await services.tournaments.recordResult(sf2.id, win('B'))).status).toBe('saved');
      expect((await services.tournaments.recordResult(final.id, win('A'))).status).toBe('saved');
      const finished = await repos.tournaments.getById(t.id);
      expect(finished?.status).toBe('finished');
      expect(finished?.finishedAt).not.toBeNull();
    });

    it('corregir un resultado que cambia el ganador pide confirmación y recalcula en cascada', async () => {
      const { t, sf1, sf2, final } = await startedTournament();
      await services.tournaments.recordResult(sf1.id, win('A'));
      await services.tournaments.recordResult(sf2.id, win('A'));
      await services.tournaments.recordResult(final.id, win('B'));

      const preview = await services.tournaments.recordResult(sf1.id, win('B'));
      expect(preview).toEqual({ status: 'needsConfirmation', cleared: [final.id] });
      // Sin confirmar no cambia nada
      expect((await repos.tournaments.getById(t.id))?.status).toBe('finished');

      const saved = await services.tournaments.recordResult(sf1.id, win('B'), true);
      expect(saved).toEqual({ status: 'saved', cleared: [final.id] });
      const matches = await repos.matches.listByTournament(t.id);
      expect(matches.find((m) => m.id === final.id)?.result).toBeNull();
      const resolved = resolveKnockout(matches);
      expect(resolved.get(final.id)?.a).toBe(sf1.sideB.kind === 'entry' ? sf1.sideB.entryId : null);
      const reopened = await repos.tournaments.getById(t.id);
      expect(reopened).toMatchObject({ status: 'in_progress', finishedAt: null });
    });

    it('corregir solo el marcador no pide confirmación', async () => {
      const { sf1, sf2, final } = await startedTournament();
      await services.tournaments.recordResult(sf1.id, win('A'));
      await services.tournaments.recordResult(sf2.id, win('A'));
      await services.tournaments.recordResult(final.id, win('A'));
      expect(await services.tournaments.recordResult(sf1.id, win('A', 4))).toEqual({
        status: 'saved',
        cleared: [],
      });
    });
  });

  it('borra el torneo lógicamente', async () => {
    const t = await createTournament();
    await services.tournaments.remove(t.id);
    expect(await repos.tournaments.listActive()).toEqual([]);
    expect((await repos.tournaments.getById(t.id))?.deletedAt).not.toBeNull();
  });
});
