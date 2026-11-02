import type { IsoDateTime, ValidationResult } from './common';
import { cleanSpaces, normalizeForSearch } from './common';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface BackupReminderConfig {
  /** Avisar al finalizar cada torneo. */
  onTournamentFinish: boolean;
  /** Avisar si pasaron más de N días desde el último backup (0 = nunca). */
  everyDays: number;
}

export interface AppSettings {
  theme: ThemePreference;
  /** Lista de niveles/categorías disponibles para los jugadores. */
  levels: string[];
  lastBackupAt: IsoDateTime | null;
  backupReminder: BackupReminderConfig;
}

export const DEFAULT_LEVELS: readonly string[] = [
  '1ra',
  '2da',
  '3ra',
  '4ta',
  '5ta',
  '6ta',
  '7ma',
  'Principiante',
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  levels: [...DEFAULT_LEVELS],
  lastBackupAt: null,
  backupReminder: { onTournamentFinish: true, everyDays: 7 },
};

const MAX_LEVEL_LENGTH = 30;

/** Agrega un nivel a la lista, validando que no esté vacío ni repetido. */
export function addLevel(levels: readonly string[], raw: string): ValidationResult<string[]> {
  const level = cleanSpaces(raw);
  if (!level) return { ok: false, errors: { level: 'Escribí el nombre del nivel.' } };
  if (level.length > MAX_LEVEL_LENGTH)
    return { ok: false, errors: { level: 'El nombre es demasiado largo.' } };
  const key = normalizeForSearch(level);
  if (levels.some((l) => normalizeForSearch(l) === key))
    return { ok: false, errors: { level: 'Ese nivel ya existe.' } };
  return { ok: true, value: [...levels, level] };
}

/** Quita un nivel de la lista. Debe quedar al menos uno. */
export function removeLevel(levels: readonly string[], level: string): ValidationResult<string[]> {
  const next = levels.filter((l) => l !== level);
  if (next.length === 0)
    return { ok: false, errors: { level: 'Tiene que quedar al menos un nivel.' } };
  return { ok: true, value: next };
}

/** Mueve un nivel una posición arriba (-1) o abajo (+1). */
export function moveLevel(levels: readonly string[], level: string, direction: -1 | 1): string[] {
  const index = levels.indexOf(level);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= levels.length) return [...levels];
  const next = [...levels];
  const a = next[index];
  const b = next[target];
  if (a === undefined || b === undefined) return next;
  next[index] = b;
  next[target] = a;
  return next;
}

/** Indica si corresponde mostrar el recordatorio de backup por tiempo transcurrido. */
export function isBackupOverdue(settings: AppSettings, now: Date): boolean {
  const days = settings.backupReminder.everyDays;
  if (days <= 0) return false;
  if (settings.lastBackupAt === null) return true;
  const elapsedMs = now.getTime() - new Date(settings.lastBackupAt).getTime();
  return elapsedMs > days * 24 * 60 * 60 * 1000;
}
