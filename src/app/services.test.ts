import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '../data/memory/memoryRepositories';
import type { Repositories } from '../data/ports';
import type { PlayerDraft } from '../domain/player';
import type { AppDeps } from './deps';
import { type Services, createServices } from './services';

const draft: PlayerDraft = {
  firstName: 'Ana',
  lastName: 'Gómez',
  phone: '11 5555 1234',
  sex: 'F',
  level: '3ra',
  notes: '',
};

describe('servicios', () => {
  let repos: Repositories;
  let services: Services;
  let clock: Date;
  let ids: number;

  beforeEach(() => {
    repos = createMemoryRepositories();
    clock = new Date('2026-05-01T10:00:00.000Z');
    ids = 0;
    const deps: AppDeps = { now: () => clock, newId: () => `id-${++ids}`, random: () => 0.5 };
    services = createServices(repos, deps);
  });

  describe('PlayerService', () => {
    it('crea un jugador con id, fechas y datos normalizados', async () => {
      const result = await services.players.create(draft);
      expect(result.ok).toBe(true);
      expect(await repos.players.getById('id-1')).toMatchObject({
        id: 'id-1',
        ownerId: 'local',
        phone: '1155551234',
        createdAt: '2026-05-01T10:00:00.000Z',
        deletedAt: null,
      });
    });

    it('no guarda nada si los datos son inválidos', async () => {
      const result = await services.players.create({ ...draft, firstName: '' });
      expect(result.ok).toBe(false);
      expect(await repos.players.listAll()).toEqual([]);
    });

    it('valida el nivel contra la lista configurada', async () => {
      await services.settings.addLevel('Damas A');
      expect((await services.players.create({ ...draft, level: 'Damas A' })).ok).toBe(true);
      expect((await services.players.create({ ...draft, level: 'Inexistente' })).ok).toBe(false);
    });

    it('actualiza conservando la fecha de creación', async () => {
      await services.players.create(draft);
      clock = new Date('2026-05-02T10:00:00.000Z');
      const result = await services.players.update('id-1', { ...draft, firstName: 'Ana Laura' });
      expect(result.ok).toBe(true);
      expect(await repos.players.getById('id-1')).toMatchObject({
        firstName: 'Ana Laura',
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-02T10:00:00.000Z',
      });
    });

    it('no actualiza un jugador inexistente o borrado', async () => {
      expect((await services.players.update('nope', draft)).ok).toBe(false);
      await services.players.create(draft);
      await services.players.remove('id-1');
      expect((await services.players.update('id-1', draft)).ok).toBe(false);
    });

    it('borra lógicamente', async () => {
      await services.players.create(draft);
      await services.players.remove('id-1');
      expect(await repos.players.listActive()).toEqual([]);
      expect((await repos.players.getById('id-1'))?.deletedAt).toBe('2026-05-01T10:00:00.000Z');
    });

    it('detecta posibles duplicados', async () => {
      await services.players.create(draft);
      const dups = await services.players.findDuplicates({ ...draft, phone: '1199990000' });
      expect(dups.map((p) => p.id)).toEqual(['id-1']);
      expect(await services.players.findDuplicates(draft, 'id-1')).toEqual([]);
    });
  });

  describe('SettingsService', () => {
    it('cambia el tema', async () => {
      await services.settings.setTheme('dark');
      expect((await services.settings.get()).theme).toBe('dark');
    });

    it('no permite quitar un nivel en uso', async () => {
      await services.players.create(draft);
      const result = await services.settings.removeLevel('3ra');
      expect(result).toEqual({
        ok: false,
        errors: { level: 'No se puede quitar: 1 jugador tiene ese nivel.' },
      });
      expect((await services.settings.get()).levels).toContain('3ra');
    });

    it('quita un nivel sin uso y reordena', async () => {
      expect((await services.settings.removeLevel('7ma')).ok).toBe(true);
      await services.settings.moveLevel('2da', -1);
      const { levels } = await services.settings.get();
      expect(levels).not.toContain('7ma');
      expect(levels.slice(0, 2)).toEqual(['2da', '1ra']);
    });
  });
});
