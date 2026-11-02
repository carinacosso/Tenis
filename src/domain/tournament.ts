import type { EntityBase, IsoDateTime, ValidationResult } from './common';
import { cleanSpaces } from './common';
import { type ScoringConfig, checkScoringConfig } from './scoring';

export type Modality = 'singles' | 'doubles';

/** Formatos de torneo. Por ahora solo eliminación directa; el resto llega en fases siguientes. */
export type FormatConfig = { kind: 'knockout' };

export type FormatKind = FormatConfig['kind'];

export type TournamentStatus = 'registration' | 'in_progress' | 'finished';

/** Un torneo es una única categoría (decisión del usuario). */
export interface Tournament extends EntityBase {
  name: string;
  /** Fecha de inicio, formato AAAA-MM-DD. */
  date: string;
  venue: string;
  category: string;
  modality: Modality;
  format: FormatConfig;
  scoring: ScoringConfig;
  maxEntries: number;
  /** Monto de inscripción por jugador. */
  entryFee: number;
  status: TournamentStatus;
  drawGeneratedAt: IsoDateTime | null;
  finishedAt: IsoDateTime | null;
}

export interface TournamentDraft {
  name: string;
  date: string;
  venue: string;
  category: string;
  modality: Modality;
  format: FormatConfig;
  scoring: ScoringConfig;
  maxEntries: number;
  entryFee: number;
}

export type TournamentField = keyof TournamentDraft;

export const FORMAT_LABELS: Record<FormatKind, string> = {
  knockout: 'Eliminación directa',
};

export const MODALITY_LABELS: Record<Modality, string> = {
  singles: 'Singles',
  doubles: 'Dobles',
};

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  registration: 'Inscripción abierta',
  in_progress: 'En juego',
  finished: 'Finalizado',
};

export const MAX_ENTRIES_LIMIT = 128;

/** Mínimo de inscriptos confirmados para generar los cruces de cada formato. */
export function minEntriesFor(format: FormatConfig): number {
  switch (format.kind) {
    case 'knockout':
      return 2;
  }
}

function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

/**
 * Valida los datos del torneo.
 * `confirmedCount` es la cantidad de inscriptos confirmados (al editar no se puede bajar el cupo por debajo).
 */
export function validateTournamentDraft(
  draft: TournamentDraft,
  confirmedCount = 0,
): ValidationResult<TournamentDraft, TournamentField> {
  const errors: Partial<Record<TournamentField, string>> = {};
  const name = cleanSpaces(draft.name);
  const venue = cleanSpaces(draft.venue);
  const category = cleanSpaces(draft.category);

  if (!name) errors.name = 'Ingresá el nombre del torneo.';
  else if (name.length > 80) errors.name = 'El nombre es demasiado largo.';
  if (!isValidIsoDate(draft.date)) errors.date = 'Elegí una fecha válida.';
  if (venue.length > 80) errors.venue = 'El lugar es demasiado largo.';
  if (!category) errors.category = 'Ingresá la categoría.';
  else if (category.length > 40) errors.category = 'La categoría es demasiado larga.';
  if (draft.modality !== 'singles' && draft.modality !== 'doubles')
    errors.modality = 'Elegí singles o dobles.';

  const min = minEntriesFor(draft.format);
  if (!Number.isInteger(draft.maxEntries) || draft.maxEntries < min)
    errors.maxEntries = `El cupo mínimo es ${min}.`;
  else if (draft.maxEntries > MAX_ENTRIES_LIMIT)
    errors.maxEntries = `El cupo máximo es ${MAX_ENTRIES_LIMIT}.`;
  else if (draft.maxEntries < confirmedCount)
    errors.maxEntries = `Ya hay ${confirmedCount} inscriptos confirmados.`;

  if (!Number.isFinite(draft.entryFee) || draft.entryFee < 0)
    errors.entryFee = 'El monto no puede ser negativo.';

  const scoringError = checkScoringConfig(draft.scoring);
  if (scoringError) errors.scoring = scoringError;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { ...draft, name, venue, category, entryFee: Math.round(draft.entryFee * 100) / 100 },
  };
}

/** Campos que no se pueden cambiar una vez generados los cruces. */
export const LOCKED_AFTER_DRAW: readonly TournamentField[] = ['modality', 'format', 'scoring'];

export function playersPerEntry(modality: Modality): 1 | 2 {
  return modality === 'singles' ? 1 : 2;
}
