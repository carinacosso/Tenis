import type { Id } from '../domain/common';
import type { Player } from '../domain/player';
import type { AppSettings } from '../domain/settings';

/**
 * Interfaces de persistencia (puertos).
 * La UI y los servicios dependen solo de esto; hoy se implementan con Dexie (IndexedDB)
 * y en el futuro podrán implementarse con Supabase o Firebase sin tocar la UI.
 */

export type Unsubscribe = () => void;
export type Listener<T> = (value: T) => void;
export type ErrorListener = (error: unknown) => void;

export interface PlayerRepository {
  getById(id: Id): Promise<Player | undefined>;
  /** Jugadores no borrados. */
  listActive(): Promise<Player[]>;
  /** Todos, incluidos los borrados lógicamente (para backup e historial). */
  listAll(): Promise<Player[]>;
  /** Crea o reemplaza. */
  save(player: Player): Promise<void>;
  /** Notifica la lista de jugadores activos cada vez que cambia (también para datos en vivo). */
  observeActive(listener: Listener<Player[]>, onError?: ErrorListener): Unsubscribe;
}

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
  observe(listener: Listener<AppSettings>, onError?: ErrorListener): Unsubscribe;
}

export interface Repositories {
  players: PlayerRepository;
  settings: SettingsRepository;
  /** Ejecuta varias operaciones de forma atómica. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
  /** Borra todos los datos (usado al restaurar un backup y en tests). */
  clearAll(): Promise<void>;
}
