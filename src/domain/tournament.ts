import type { EntityBase, IsoDateTime, ValidationResult } from './common';
import { cleanSpaces } from './common';
import { type ScoringConfig, checkScoringConfig } from './scoring';

export type Modality = 'singles' | 'doubles';

/** Variantes del Americano. */
export type AmericanoVariant = 'doubles' | 'singles' | 'mixed';

/**
 * Formatos de torneo.
 * En los rotativos, `rounds = null` significa "rotación completa" (se calcula al generar).
 */
export type FormatConfig =
  | { kind: 'knockout' }
  | { kind: 'americano'; variant: AmericanoVariant; rounds: number | null }
  | { kind: 'mexicano'; rounds: number | null };

export type FormatKind = FormatConfig['kind'];

/** Clave del formato para la UI (incluye la variante del Americano). */
export type FormatChoice =
  'knockout' | 'americano_doubles' | 'americano_singles' | 'americano_mixed' | 'mexicano';

export function formatChoice(format: FormatConfig): FormatChoice {
  if (format.kind === 'americano') return `americano_${format.variant}`;
  return format.kind;
}

export function formatFromChoice(choice: FormatChoice, rounds: number | null = null): FormatConfig {
  switch (choice) {
    case 'knockout':
      return { kind: 'knockout' };
    case 'mexicano':
      return { kind: 'mexicano', rounds };
    case 'americano_doubles':
      return { kind: 'americano', variant: 'doubles', rounds };
    case 'americano_singles':
      return { kind: 'americano', variant: 'singles', rounds };
    case 'americano_mixed':
      return { kind: 'americano', variant: 'mixed', rounds };
  }
}

/** Formatos rotativos: inscripción individual, parejas o rivales que cambian cada ronda y ranking por puntos. */
export function isRotation(
  format: FormatConfig,
): format is Exclude<FormatConfig, { kind: 'knockout' }> {
  return format.kind !== 'knockout';
}

/** Modalidad que impone el formato (null si se elige libremente). */
export function impliedModality(format: FormatConfig): Modality | null {
  if (format.kind === 'knockout') return null;
  if (format.kind === 'americano' && format.variant === 'singles') return 'singles';
  return 'doubles';
}

export const MAX_ROUNDS = 50;

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
  /** Rondas totales de un rotativo, fijadas al generar los cruces (null en eliminación directa). */
  plannedRounds?: number | null;
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

export const FORMAT_LABELS: Record<FormatChoice, string> = {
  knockout: 'Eliminación directa',
  americano_doubles: 'Americano dobles',
  americano_singles: 'Americano singles',
  americano_mixed: 'Americano mixto',
  mexicano: 'Mexicano',
};

export function formatLabel(format: FormatConfig): string {
  return FORMAT_LABELS[formatChoice(format)];
}

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
    case 'mexicano':
      return 4;
    case 'americano':
      return format.variant === 'singles' ? 2 : 4;
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
  else if (isRotation(draft.format) && draft.scoring.kind === 'sets')
    errors.scoring = 'En los formatos rotativos el partido es a puntos o por tiempo.';
  else if (!isRotation(draft.format) && draft.scoring.kind !== 'sets')
    errors.scoring = 'La eliminación directa se juega por sets.';

  if (isRotation(draft.format) && draft.format.rounds !== null) {
    const r = draft.format.rounds;
    if (!Number.isInteger(r) || r < 1 || r > MAX_ROUNDS)
      errors.format = `La cantidad de rondas debe ser entre 1 y ${MAX_ROUNDS}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...draft,
      name,
      venue,
      category,
      modality: impliedModality(draft.format) ?? draft.modality,
      entryFee: Math.round(draft.entryFee * 100) / 100,
    },
  };
}

/** Campos que no se pueden cambiar una vez generados los cruces. */
export const LOCKED_AFTER_DRAW: readonly TournamentField[] = ['modality', 'format', 'scoring'];

/** Jugadores por inscripción: en rotativos siempre 1 (las parejas cambian cada ronda). */
export function playersPerEntry(t: Pick<Tournament, 'modality' | 'format'>): 1 | 2 {
  if (isRotation(t.format)) return 1;
  return t.modality === 'singles' ? 1 : 2;
}
