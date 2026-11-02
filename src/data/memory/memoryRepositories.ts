import type { Id } from '../../domain/common';
import type { Player } from '../../domain/player';
import { type AppSettings, DEFAULT_SETTINGS } from '../../domain/settings';
import type {
  Listener,
  PlayerRepository,
  Repositories,
  SettingsRepository,
  Unsubscribe,
} from '../ports';

/** Implementación en memoria, para tests y prototipos. */

class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>, initial: () => Promise<T>): Unsubscribe {
    this.listeners.add(listener);
    void initial().then((value) => {
      if (this.listeners.has(listener)) listener(value);
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryPlayerRepository implements PlayerRepository {
  private readonly items = new Map<Id, Player>();
  private readonly emitter = new Emitter<Player[]>();

  async getById(id: Id): Promise<Player | undefined> {
    const player = this.items.get(id);
    return player ? clone(player) : undefined;
  }

  async listActive(): Promise<Player[]> {
    return [...this.items.values()].filter((p) => p.deletedAt === null).map(clone);
  }

  async listAll(): Promise<Player[]> {
    return [...this.items.values()].map(clone);
  }

  async save(player: Player): Promise<void> {
    this.items.set(player.id, clone(player));
    this.emitter.emit(await this.listActive());
  }

  observeActive(listener: Listener<Player[]>): Unsubscribe {
    return this.emitter.subscribe(listener, () => this.listActive());
  }

  async clear(): Promise<void> {
    this.items.clear();
    this.emitter.emit([]);
  }
}

export class MemorySettingsRepository implements SettingsRepository {
  private settings: AppSettings = clone(DEFAULT_SETTINGS);
  private readonly emitter = new Emitter<AppSettings>();

  async get(): Promise<AppSettings> {
    return clone(this.settings);
  }

  async save(settings: AppSettings): Promise<void> {
    this.settings = clone(settings);
    this.emitter.emit(clone(this.settings));
  }

  observe(listener: Listener<AppSettings>): Unsubscribe {
    return this.emitter.subscribe(listener, () => this.get());
  }

  async clear(): Promise<void> {
    await this.save(clone(DEFAULT_SETTINGS));
  }
}

export function createMemoryRepositories(): Repositories {
  const players = new MemoryPlayerRepository();
  const settings = new MemorySettingsRepository();
  return {
    players,
    settings,
    transaction: (work) => work(),
    clearAll: async () => {
      await players.clear();
      await settings.clear();
    },
  };
}
