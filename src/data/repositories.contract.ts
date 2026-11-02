import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { makePlayer } from '../domain/testFactories';
import type { Repositories } from './ports';

/**
 * Tests de contrato: toda implementación de Repositories debe pasarlos.
 * Cuando se agregue un backend (Supabase, Firebase), se corre esta misma suite contra él.
 */
export function runRepositoryContract(name: string, create: () => Promise<Repositories>): void {
  describe(`Repositorios: ${name}`, () => {
    let repos: Repositories;

    beforeEach(async () => {
      repos = await create();
      await repos.clearAll();
    });

    it('guarda y recupera un jugador', async () => {
      const player = makePlayer({ id: 'a' });
      await repos.players.save(player);
      expect(await repos.players.getById('a')).toEqual(player);
      expect(await repos.players.getById('no-existe')).toBeUndefined();
    });

    it('save reemplaza un jugador existente', async () => {
      await repos.players.save(makePlayer({ id: 'a', firstName: 'Viejo' }));
      await repos.players.save(makePlayer({ id: 'a', firstName: 'Nuevo' }));
      expect((await repos.players.listAll()).map((p) => p.firstName)).toEqual(['Nuevo']);
    });

    it('listActive excluye los borrados lógicamente y listAll los incluye', async () => {
      await repos.players.save(makePlayer({ id: 'a' }));
      await repos.players.save(makePlayer({ id: 'b', deletedAt: '2026-01-02T00:00:00.000Z' }));
      expect((await repos.players.listActive()).map((p) => p.id)).toEqual(['a']);
      expect((await repos.players.listAll()).map((p) => p.id).sort()).toEqual(['a', 'b']);
    });

    it('los objetos devueltos no comparten referencia con lo guardado', async () => {
      const player = makePlayer({ id: 'a' });
      await repos.players.save(player);
      player.firstName = 'Mutado';
      expect((await repos.players.getById('a'))?.firstName).toBe('Juan');
    });

    it('observeActive emite el estado inicial y los cambios', async () => {
      const received: string[][] = [];
      const done = new Promise<void>((resolve) => {
        const unsubscribe = repos.players.observeActive((players) => {
          received.push(players.map((p) => p.id).sort());
          if (received.length === 1) void repos.players.save(makePlayer({ id: 'x' }));
          if (players.some((p) => p.id === 'x')) {
            unsubscribe();
            resolve();
          }
        });
      });
      await done;
      expect(received[0]).toEqual([]);
      expect(received.at(-1)).toEqual(['x']);
    });

    it('settings devuelve los valores por defecto si no hay nada guardado', async () => {
      expect(await repos.settings.get()).toEqual(DEFAULT_SETTINGS);
    });

    it('settings guarda y recupera', async () => {
      const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, levels: ['A', 'B'] };
      await repos.settings.save(settings);
      expect(await repos.settings.get()).toEqual(settings);
    });

    it('transaction confirma las operaciones', async () => {
      await repos.transaction(async () => {
        await repos.players.save(makePlayer({ id: 'a' }));
        await repos.players.save(makePlayer({ id: 'b' }));
      });
      expect(await repos.players.listAll()).toHaveLength(2);
    });

    it('clearAll borra jugadores y reinicia ajustes', async () => {
      await repos.players.save(makePlayer({ id: 'a' }));
      await repos.settings.save({ ...DEFAULT_SETTINGS, theme: 'dark' });
      await repos.clearAll();
      expect(await repos.players.listAll()).toEqual([]);
      expect(await repos.settings.get()).toEqual(DEFAULT_SETTINGS);
    });
  });
}
