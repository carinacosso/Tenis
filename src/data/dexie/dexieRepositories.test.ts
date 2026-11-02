import 'fake-indexeddb/auto';
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
