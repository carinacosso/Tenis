import type { Id } from '../domain/common';
import type { Match } from '../domain/knockout';
import type { Player } from '../domain/player';
import type { Entry } from '../domain/registration';
import type { AppSettings } from '../domain/settings';
import type { Tournament } from '../domain/tournament';

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
  /** Igual que observeActive pero incluye borrados (para mostrar nombres en torneos viejos). */
  observeAll(listener: Listener<Player[]>, onError?: ErrorListener): Unsubscribe;
}

export interface TournamentRepository {
  getById(id: Id): Promise<Tournament | undefined>;
  listActive(): Promise<Tournament[]>;
  listAll(): Promise<Tournament[]>;
  save(tournament: Tournament): Promise<void>;
  observeActive(listener: Listener<Tournament[]>, onError?: ErrorListener): Unsubscribe;
  observeById(
    id: Id,
    listener: Listener<Tournament | undefined>,
    onError?: ErrorListener,
  ): Unsubscribe;
}

export interface EntryRepository {
  /** Inscripciones del torneo (incluye bajas). */
  listByTournament(tournamentId: Id): Promise<Entry[]>;
  listAll(): Promise<Entry[]>;
  saveMany(entries: readonly Entry[]): Promise<void>;
  observeByTournament(
    tournamentId: Id,
    listener: Listener<Entry[]>,
    onError?: ErrorListener,
  ): Unsubscribe;
}

export interface MatchRepository {
  listByTournament(tournamentId: Id): Promise<Match[]>;
  listAll(): Promise<Match[]>;
  saveMany(matches: readonly Match[]): Promise<void>;
  /** Borra físicamente los partidos del torneo (al regenerar los cruces). */
  deleteByTournament(tournamentId: Id): Promise<void>;
  observeByTournament(
    tournamentId: Id,
    listener: Listener<Match[]>,
    onError?: ErrorListener,
  ): Unsubscribe;
}

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
  observe(listener: Listener<AppSettings>, onError?: ErrorListener): Unsubscribe;
}

export interface Repositories {
  players: PlayerRepository;
  tournaments: TournamentRepository;
  entries: EntryRepository;
  matches: MatchRepository;
  settings: SettingsRepository;
  /** Ejecuta varias operaciones de forma atómica. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
  /** Borra todos los datos (usado al restaurar un backup y en tests). */
  clearAll(): Promise<void>;
}
