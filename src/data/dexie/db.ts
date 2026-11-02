import Dexie, { type EntityTable } from 'dexie';
import type { Player } from '../../domain/player';
import type { AppSettings } from '../../domain/settings';

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

  constructor(name = 'tenis-torneos') {
    super(name);
    this.version(1).stores({
      players: 'id, lastName, deletedAt',
      settings: 'key',
    });
  }
}
