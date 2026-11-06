/** Identificador único (UUID). Nunca autoincremental, para poder sincronizar en el futuro. */
export type Id = string;

/** Fecha y hora en formato ISO 8601. */
export type IsoDateTime = string;

/** Dueño de los datos. Hoy siempre es LOCAL_OWNER; en el futuro será un club o usuario. */
export const LOCAL_OWNER = 'local';

/** Campos comunes a todas las entidades persistidas. */
export interface EntityBase {
  id: Id;
  ownerId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Borrado lógico: si tiene valor, la entidad está eliminada. */
  deletedAt: IsoDateTime | null;
}

/** Resultado de una validación: ok, o un mapa campo → mensaje de error. */
export type ValidationResult<T, F extends string = string> =
  { ok: true; value: T } | { ok: false; errors: Partial<Record<F, string>> };

/** Pasa a minúsculas y quita tildes, para búsquedas tolerantes. */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Colapsa espacios repetidos y recorta extremos. */
export function cleanSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
