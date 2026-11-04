import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { makePlayer } from '../../domain/testFactories';
import { it, expect } from 'vitest';
import { runRepositoryContract } from '../repositories.contract';
import { TenisDatabase } from './db';
import { createDexieRepositories } from './dexieRepositories';

let counter = 0;
runRepositoryContract('Dexie (IndexedDB)', async () =>
  createDexieRepositories(new TenisDatabase(`test-${counter++}`)),
);

it('Dexie completa ajustes viejos con los valores por defecto nuevos', async () => {
  const db = new TenisDatabase('test-defaults');
  await db.settings.put({ key: 'app', value: { theme: 'light' } });
  const settings = await createDexieRepositories(db).settings.get();
  expect(settings.theme).toBe('light');
  expect(settings.backupReminder.everyDays).toBe(7);
  expect(settings.levels.length).toBeGreaterThan(0);
});

it('al actualizar el esquema se conservan los datos de versiones anteriores', async () => {
  const name = 'test-migracion';
  const old = new Dexie(name);
  old.version(1).stores({ players: 'id, lastName, deletedAt', settings: 'key' });
  await old.open();
  await old.table('players').put(makePlayer({ id: 'viejo' }));
  old.close();

  const repos = createDexieRepositories(new TenisDatabase(name));
  expect((await repos.players.getById('viejo'))?.firstName).toBe('Juan');
  expect(await repos.rounds.listAll()).toEqual([]);
  expect(await repos.tournaments.listAll()).toEqual([]);
});
