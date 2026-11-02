import type { EntityBase, Id, IsoDateTime } from './common';
import { type Tournament, minEntriesFor, playersPerEntry } from './tournament';

export type EntryStatus = 'confirmed' | 'waitlist' | 'withdrawn';
export type PaymentStatus = 'paid' | 'pending';

/** Pago individual de cada jugador de la inscripción. */
export interface Payment {
  playerId: Id;
  amount: number;
  status: PaymentStatus;
}

/** Inscripción: un jugador (singles) o una pareja (dobles). */
export interface Entry extends EntityBase {
  tournamentId: Id;
  playerIds: Id[];
  status: EntryStatus;
  registeredAt: IsoDateTime;
  /** Número de cabeza de serie (1 = primer favorito), o null. */
  seed: number | null;
  payments: Payment[];
}

const byRegistration = (a: Entry, b: Entry) => a.registeredAt.localeCompare(b.registeredAt);

export function activeEntries(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => e.deletedAt === null && e.status !== 'withdrawn');
}

export function confirmedEntries(entries: readonly Entry[]): Entry[] {
  return entries
    .filter((e) => e.deletedAt === null && e.status === 'confirmed')
    .sort(byRegistration);
}

/** Lista de espera en orden de llegada. */
export function waitlist(entries: readonly Entry[]): Entry[] {
  return entries
    .filter((e) => e.deletedAt === null && e.status === 'waitlist')
    .sort(byRegistration);
}

/** Valida una nueva inscripción. Devuelve un mensaje de error o null. */
export function checkRegistration(
  tournament: Tournament,
  entries: readonly Entry[],
  playerIds: readonly Id[],
): string | null {
  if (tournament.drawGeneratedAt !== null)
    return 'Los cruces ya están generados: la inscripción está cerrada.';
  const needed = playersPerEntry(tournament.modality);
  if (playerIds.length !== needed)
    return needed === 1 ? 'Elegí un jugador.' : 'Elegí los dos jugadores de la pareja.';
  if (new Set(playerIds).size !== playerIds.length) return 'Elegí dos jugadores distintos.';
  const registered = new Set(activeEntries(entries).flatMap((e) => e.playerIds));
  if (playerIds.some((id) => registered.has(id)))
    return 'Ese jugador ya está inscripto en este torneo.';
  return null;
}

/** Estado inicial de una inscripción nueva según el cupo. */
export function statusForNewEntry(tournament: Tournament, entries: readonly Entry[]): EntryStatus {
  return confirmedEntries(entries).length < tournament.maxEntries ? 'confirmed' : 'waitlist';
}

/**
 * Inscripciones en lista de espera que pasan a confirmadas porque se liberó lugar.
 * Solo hay promoción automática mientras no se hayan generado los cruces.
 */
export function entriesToPromote(tournament: Tournament, entries: readonly Entry[]): Entry[] {
  if (tournament.drawGeneratedAt !== null) return [];
  const free = tournament.maxEntries - confirmedEntries(entries).length;
  return free > 0 ? waitlist(entries).slice(0, free) : [];
}

/** Máximo de cabezas de serie: la mitad del cuadro (potencia de 2) y nunca más que los inscriptos. */
export function maxSeeds(entryCount: number): number {
  if (entryCount < 2) return 0;
  return Math.min(entryCount, bracketSize(entryCount) / 2);
}

/** Tamaño del cuadro: la potencia de 2 igual o mayor a la cantidad de inscriptos. */
export function bracketSize(entryCount: number): number {
  let size = 2;
  while (size < entryCount) size *= 2;
  return size;
}

/** Valida la lista ordenada de cabezas de serie. */
export function checkSeeds(entries: readonly Entry[], seededIds: readonly Id[]): string | null {
  const confirmed = new Set(confirmedEntries(entries).map((e) => e.id));
  if (new Set(seededIds).size !== seededIds.length) return 'Hay cabezas de serie repetidos.';
  if (seededIds.some((id) => !confirmed.has(id)))
    return 'Solo pueden ser cabezas de serie los inscriptos confirmados.';
  const max = maxSeeds(confirmed.size);
  if (seededIds.length > max) return `Como máximo puede haber ${max} cabezas de serie.`;
  return null;
}

/** Valida que se puedan generar los cruces. Devuelve un mensaje de error o null. */
export function checkCanGenerateDraw(
  tournament: Tournament,
  entries: readonly Entry[],
): string | null {
  const min = minEntriesFor(tournament.format);
  const count = confirmedEntries(entries).length;
  if (count < min) return `Se necesitan al menos ${min} inscriptos confirmados (hay ${count}).`;
  return null;
}

export interface PaymentSummary {
  paid: number;
  pending: number;
  pendingPlayers: number;
}

/** Total cobrado y pendiente de las inscripciones activas. */
export function paymentSummary(entries: readonly Entry[]): PaymentSummary {
  const summary: PaymentSummary = { paid: 0, pending: 0, pendingPlayers: 0 };
  for (const entry of activeEntries(entries)) {
    for (const payment of entry.payments) {
      if (payment.status === 'paid') summary.paid += payment.amount;
      else {
        summary.pending += payment.amount;
        summary.pendingPlayers++;
      }
    }
  }
  return summary;
}
