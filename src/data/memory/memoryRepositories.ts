import type { Id } from '../../domain/common';
import type { Match } from '../../domain/knockout';
import type { Player } from '../../domain/player';
import type { Entry } from '../../domain/registration';
import { type AppSettings, DEFAULT_SETTINGS } from '../../domain/settings';
import type { Tournament } from '../../domain/tournament';
import type {
  EntryRepository,
  Listener,
  MatchRepository,
  PlayerRepository,
  Repositories,
  SettingsRepository,
  TournamentRepository,
  Unsubscribe,
} from '../ports';

/** Implementación en memoria, para tests y prototipos. */

const clone = <T>(value: T): T => structuredClone(value);

/** Avisa a los observadores cada vez que cambia algún dato. */
class ChangeFeed {
  private readonly watchers = new Set<() => void>();

  watch<T>(query: () => Promise<T>, listener: Listener<T>): Unsubscribe {
    let active = true;
    const run = () => {
      void query().then((value) => {
        if (active) listener(value);
      });
    };
    this.watchers.add(run);
    run();
    return () => {
      active = false;
      this.watchers.delete(run);
    };
  }

  notify(): void {
    for (const run of this.watchers) run();
  }
}

class MemoryTable<T extends { id: Id }> {
  private readonly rows = new Map<Id, T>();

  constructor(private readonly feed: ChangeFeed) {}

  async get(id: Id): Promise<T | undefined> {
    const row = this.rows.get(id);
    return row ? clone(row) : undefined;
  }

  async where(predicate: (row: T) => boolean): Promise<T[]> {
    return [...this.rows.values()].filter(predicate).map(clone);
  }

  async put(rows: readonly T[]): Promise<void> {
    for (const row of rows) this.rows.set(row.id, clone(row));
    this.feed.notify();
  }

  async delete(predicate: (row: T) => boolean): Promise<void> {
    for (const [id, row] of this.rows) if (predicate(row)) this.rows.delete(id);
    this.feed.notify();
  }
}

const isActive = (row: { deletedAt: string | null }) => row.deletedAt === null;
const all = () => true;

export function createMemoryRepositories(): Repositories {
  const feed = new ChangeFeed();
  const playerTable = new MemoryTable<Player>(feed);
  const tournamentTable = new MemoryTable<Tournament>(feed);
  const entryTable = new MemoryTable<Entry>(feed);
  const matchTable = new MemoryTable<Match>(feed);
  let settingsValue: AppSettings = clone(DEFAULT_SETTINGS);

  const players: PlayerRepository = {
    getById: (id) => playerTable.get(id),
    listActive: () => playerTable.where(isActive),
    listAll: () => playerTable.where(all),
    save: (player) => playerTable.put([player]),
    observeActive: (listener) => feed.watch(() => playerTable.where(isActive), listener),
    observeAll: (listener) => feed.watch(() => playerTable.where(all), listener),
  };

  const tournaments: TournamentRepository = {
    getById: (id) => tournamentTable.get(id),
    listActive: () => tournamentTable.where(isActive),
    listAll: () => tournamentTable.where(all),
    save: (tournament) => tournamentTable.put([tournament]),
    observeActive: (listener) => feed.watch(() => tournamentTable.where(isActive), listener),
    observeById: (id, listener) => feed.watch(() => tournamentTable.get(id), listener),
  };

  const byTournament = (tournamentId: Id) => (row: { tournamentId: Id }) =>
    row.tournamentId === tournamentId;

  const entries: EntryRepository = {
    listByTournament: (tid) => entryTable.where(byTournament(tid)),
    listAll: () => entryTable.where(all),
    saveMany: (rows) => entryTable.put(rows),
    observeByTournament: (tid, listener) =>
      feed.watch(() => entryTable.where(byTournament(tid)), listener),
  };

  const matches: MatchRepository = {
    listByTournament: (tid) => matchTable.where(byTournament(tid)),
    listAll: () => matchTable.where(all),
    saveMany: (rows) => matchTable.put(rows),
    deleteByTournament: (tid) => matchTable.delete(byTournament(tid)),
    observeByTournament: (tid, listener) =>
      feed.watch(() => matchTable.where(byTournament(tid)), listener),
  };

  const settings: SettingsRepository = {
    get: async () => clone(settingsValue),
    save: async (value) => {
      settingsValue = clone(value);
      feed.notify();
    },
    observe: (listener) => feed.watch(async () => clone(settingsValue), listener),
  };

  return {
    players,
    tournaments,
    entries,
    matches,
    settings,
    transaction: (work) => work(),
    clearAll: async () => {
      await Promise.all([
        playerTable.delete(all),
        tournamentTable.delete(all),
        entryTable.delete(all),
        matchTable.delete(all),
      ]);
      await settings.save(clone(DEFAULT_SETTINGS));
    },
  };
}
