import { liveQuery } from 'dexie';
import type { Id } from '../../domain/common';
import type { Player } from '../../domain/player';
import { type AppSettings, DEFAULT_SETTINGS } from '../../domain/settings';
import type {
  ErrorListener,
  Listener,
  PlayerRepository,
  Repositories,
  SettingsRepository,
  Unsubscribe,
} from '../ports';
import { SETTINGS_KEY, type SettingsRow, TenisDatabase } from './db';

function observe<T>(
  query: () => Promise<T>,
  listener: Listener<T>,
  onError?: ErrorListener,
): Unsubscribe {
  const subscription = liveQuery(query).subscribe({
    next: listener,
    error: (error: unknown) => onError?.(error),
  });
  return () => subscription.unsubscribe();
}

class DexiePlayerRepository implements PlayerRepository {
  constructor(private readonly db: TenisDatabase) {}

  getById(id: Id): Promise<Player | undefined> {
    return this.db.players.get(id);
  }

  listActive(): Promise<Player[]> {
    return this.db.players.filter((p) => p.deletedAt === null).toArray();
  }

  listAll(): Promise<Player[]> {
    return this.db.players.toArray();
  }

  async save(player: Player): Promise<void> {
    await this.db.players.put(player);
  }

  observeActive(listener: Listener<Player[]>, onError?: ErrorListener): Unsubscribe {
    return observe(() => this.listActive(), listener, onError);
  }
}

/** Completa con valores por defecto los campos que falten (por ejemplo, ajustes nuevos). */
function toSettings(row: SettingsRow | undefined): AppSettings {
  const stored = row?.value ?? {};
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...stored,
    backupReminder: { ...DEFAULT_SETTINGS.backupReminder, ...stored.backupReminder },
  };
}

class DexieSettingsRepository implements SettingsRepository {
  constructor(private readonly db: TenisDatabase) {}

  async get(): Promise<AppSettings> {
    return toSettings(await this.db.settings.get(SETTINGS_KEY));
  }

  async save(settings: AppSettings): Promise<void> {
    await this.db.settings.put({ key: SETTINGS_KEY, value: settings });
  }

  observe(listener: Listener<AppSettings>, onError?: ErrorListener): Unsubscribe {
    return observe(() => this.get(), listener, onError);
  }
}

export function createDexieRepositories(db: TenisDatabase = new TenisDatabase()): Repositories {
  return {
    players: new DexiePlayerRepository(db),
    settings: new DexieSettingsRepository(db),
    transaction: (work) => db.transaction('rw', db.tables, work),
    clearAll: async () => {
      await db.transaction('rw', db.tables, async () => {
        await Promise.all(db.tables.map((table) => table.clear()));
      });
    },
  };
}
