import { liveQuery } from 'dexie';
import type { Id } from '../../domain/common';
import { type AppSettings, DEFAULT_SETTINGS } from '../../domain/settings';
import type {
  EntryRepository,
  ErrorListener,
  Listener,
  MatchRepository,
  PlayerRepository,
  Repositories,
  SettingsRepository,
  TournamentRepository,
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

/** Completa con valores por defecto los campos que falten (por ejemplo, ajustes nuevos). */
function toSettings(row: SettingsRow | undefined): AppSettings {
  const stored = row?.value ?? {};
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...stored,
    backupReminder: { ...DEFAULT_SETTINGS.backupReminder, ...stored.backupReminder },
  };
}

export function createDexieRepositories(db: TenisDatabase = new TenisDatabase()): Repositories {
  const activePlayers = () => db.players.filter((p) => p.deletedAt === null).toArray();
  const allPlayers = () => db.players.toArray();
  const players: PlayerRepository = {
    getById: (id) => db.players.get(id),
    listActive: activePlayers,
    listAll: allPlayers,
    save: async (player) => {
      await db.players.put(player);
    },
    observeActive: (listener, onError) => observe(activePlayers, listener, onError),
    observeAll: (listener, onError) => observe(allPlayers, listener, onError),
  };

  const activeTournaments = () => db.tournaments.filter((t) => t.deletedAt === null).toArray();
  const tournaments: TournamentRepository = {
    getById: (id) => db.tournaments.get(id),
    listActive: activeTournaments,
    listAll: () => db.tournaments.toArray(),
    save: async (tournament) => {
      await db.tournaments.put(tournament);
    },
    observeActive: (listener, onError) => observe(activeTournaments, listener, onError),
    observeById: (id, listener, onError) =>
      observe(() => db.tournaments.get(id), listener, onError),
  };

  const entriesOf = (tid: Id) => db.entries.where('tournamentId').equals(tid).toArray();
  const entries: EntryRepository = {
    listByTournament: entriesOf,
    listAll: () => db.entries.toArray(),
    saveMany: async (rows) => {
      await db.entries.bulkPut([...rows]);
    },
    observeByTournament: (tid, listener, onError) =>
      observe(() => entriesOf(tid), listener, onError),
  };

  const matchesOf = (tid: Id) => db.matches.where('tournamentId').equals(tid).toArray();
  const matches: MatchRepository = {
    listByTournament: matchesOf,
    listAll: () => db.matches.toArray(),
    saveMany: async (rows) => {
      await db.matches.bulkPut([...rows]);
    },
    deleteByTournament: async (tid) => {
      await db.matches.where('tournamentId').equals(tid).delete();
    },
    observeByTournament: (tid, listener, onError) =>
      observe(() => matchesOf(tid), listener, onError),
  };

  const settings: SettingsRepository = {
    get: async () => toSettings(await db.settings.get(SETTINGS_KEY)),
    save: async (value) => {
      await db.settings.put({ key: SETTINGS_KEY, value });
    },
    observe: (listener, onError) =>
      observe(async () => toSettings(await db.settings.get(SETTINGS_KEY)), listener, onError),
  };

  return {
    players,
    tournaments,
    entries,
    matches,
    settings,
    transaction: (work) => db.transaction('rw', db.tables, work),
    clearAll: async () => {
      await db.transaction('rw', db.tables, async () => {
        await Promise.all(db.tables.map((table) => table.clear()));
      });
    },
  };
}
