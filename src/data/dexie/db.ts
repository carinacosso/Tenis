import Dexie, { type EntityTable } from 'dexie';
import type { Match, Round } from '../../domain/match';
import type { Player } from '../../domain/player';
import type { Entry } from '../../domain/registration';
import type { AppSettings } from '../../domain/settings';
import type { Tournament } from '../../domain/tournament';

export const SETTINGS_KEY = 'app';

/** Los ajustes se guardan en una sola fila; `value` puede venir incompleto de versiones viejas. */
export interface SettingsRow {
  key: string;
  value: Partial<AppSettings>;
}

/**
 * Base IndexedDB. Para cambiar el esquema, agregar una nueva `version(n)`;
 * nunca modificar una versión existente.
 */
export class TenisDatabase extends Dexie {
  players!: EntityTable<Player, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  tournaments!: EntityTable<Tournament, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  matches!: EntityTable<Match, 'id'>;
  rounds!: EntityTable<Round, 'id'>;

  constructor(name = 'tenis-torneos') {
    super(name);
    this.version(1).stores({
      players: 'id, lastName, deletedAt',
      settings: 'key',
    });
    this.version(2).stores({
      tournaments: 'id, status, date',
      entries: 'id, tournamentId',
      matches: 'id, tournamentId',
    });
    this.version(3).stores({
      rounds: 'id, tournamentId',
    });
  }
}
