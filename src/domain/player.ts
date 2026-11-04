import type { EntityBase, ValidationResult } from './common';
import { cleanSpaces, normalizeForSearch } from './common';

export type Sex = 'M' | 'F';

export interface Player extends EntityBase {
  firstName: string;
  lastName: string;
  phone: string;
  sex: Sex | null;
  /** Nivel o categoría del jugador, tomado de la lista configurable en Ajustes. */
  level: string;
  notes: string;
}

/** Datos editables de un jugador (lo que completa el formulario). */
export interface PlayerDraft {
  firstName: string;
  lastName: string;
  phone: string;
  sex: Sex | null;
  level: string;
  notes: string;
}

export type PlayerField = keyof PlayerDraft;

export const EMPTY_PLAYER_DRAFT: PlayerDraft = {
  firstName: '',
  lastName: '',
  phone: '',
  sex: null,
  level: '',
  notes: '',
};

const MAX_NAME_LENGTH = 60;
const MAX_NOTES_LENGTH = 500;

/** Deja solo dígitos y un "+" inicial opcional. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function isValidPhone(phone: string): boolean {
  if (/[^\d\s()+-]/.test(phone)) return false;
  if (phone.trim().indexOf('+') > 0) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
}

/**
 * Valida y normaliza los datos de un jugador.
 * Obligatorios: nombre, apellido y nivel. Teléfono, sexo y notas son opcionales.
 * `levels` es la lista de niveles válidos configurada en Ajustes.
 */
export function validatePlayerDraft(
  draft: PlayerDraft,
  levels: readonly string[],
): ValidationResult<PlayerDraft, PlayerField> {
  const errors: Partial<Record<PlayerField, string>> = {};
  const firstName = cleanSpaces(draft.firstName);
  const lastName = cleanSpaces(draft.lastName);
  const notes = draft.notes.trim();

  if (!firstName) errors.firstName = 'Ingresá el nombre.';
  else if (firstName.length > MAX_NAME_LENGTH) errors.firstName = 'El nombre es demasiado largo.';

  if (!lastName) errors.lastName = 'Ingresá el apellido.';
  else if (lastName.length > MAX_NAME_LENGTH) errors.lastName = 'El apellido es demasiado largo.';

  // El teléfono es opcional, pero si se carga tiene que ser válido.
  if (draft.phone.trim() && !isValidPhone(draft.phone)) errors.phone = 'El teléfono no es válido.';

  if (!draft.level) errors.level = 'Elegí un nivel.';
  else if (!levels.includes(draft.level)) errors.level = 'El nivel no está en la lista.';

  if (draft.sex !== null && draft.sex !== 'M' && draft.sex !== 'F') errors.sex = 'Sexo inválido.';

  if (notes.length > MAX_NOTES_LENGTH) errors.notes = 'Las notas son demasiado largas.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      phone: normalizePhone(draft.phone),
      sex: draft.sex,
      level: draft.level,
      notes,
    },
  };
}

export function fullName(player: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${player.firstName} ${player.lastName}`;
}

/** Nombre corto para cuadros y tablas: "J. Pérez". */
export function shortName(player: Pick<Player, 'firstName' | 'lastName'>): string {
  const initial = player.firstName.charAt(0).toUpperCase();
  return initial ? `${initial}. ${player.lastName}` : player.lastName;
}

/**
 * Indica si el jugador coincide con la búsqueda.
 * Ignora mayúsculas y tildes; cada palabra buscada debe aparecer en nombre, apellido, nivel o teléfono.
 */
export function matchesPlayerQuery(player: Player, query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeForSearch(
    `${player.firstName} ${player.lastName} ${player.level} ${player.phone}`,
  );
  return words.every((word) => haystack.includes(word));
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });

/** Ordena por apellido y luego por nombre, respetando el orden alfabético en español. */
export function comparePlayers(a: Player, b: Player): number {
  return collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName);
}

/** Filtra jugadores activos por la búsqueda y los devuelve ordenados. */
export function searchPlayers(players: readonly Player[], query: string): Player[] {
  return players
    .filter((p) => p.deletedAt === null && matchesPlayerQuery(p, query))
    .sort(comparePlayers);
}

/** Posibles duplicados: mismo nombre y apellido (sin tildes) o mismo teléfono. */
export function findPossibleDuplicates(
  players: readonly Player[],
  draft: PlayerDraft,
  excludeId?: string,
): Player[] {
  const name = normalizeForSearch(`${cleanSpaces(draft.firstName)} ${cleanSpaces(draft.lastName)}`);
  const phone = normalizePhone(draft.phone);
  return players.filter(
    (p) =>
      p.deletedAt === null &&
      p.id !== excludeId &&
      (normalizeForSearch(fullName(p)) === name || (phone.length >= 6 && p.phone === phone)),
  );
}
