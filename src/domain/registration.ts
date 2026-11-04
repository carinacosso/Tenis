import type { EntityBase, Id, IsoDateTime } from './common';
import type { Sex } from './player';
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
  sexOf: (playerId: Id) => Sex | null = () => null,
): string | null {
  if (tournament.drawGeneratedAt !== null)
    return 'Los cruces ya están generados: la inscripción está cerrada.';
  const needed = playersPerEntry(tournament);
  if (playerIds.length !== needed)
    return needed === 1 ? 'Elegí un jugador.' : 'Elegí los dos jugadores de la pareja.';
  if (new Set(playerIds).size !== playerIds.length) return 'Elegí dos jugadores distintos.';
  const registered = new Set(activeEntries(entries).flatMap((e) => e.playerIds));
  if (playerIds.some((id) => registered.has(id)))
    return 'Ese jugador ya está inscripto en este torneo.';
  if (isMixed(tournament) && playerIds.some((id) => sexOf(id) === null))
    return 'En el Americano mixto hay que indicar el sexo del jugador (editalo en su ficha).';
  return null;
}

function isMixed(tournament: Tournament): boolean {
  return tournament.format.kind === 'americano' && tournament.format.variant === 'mixed';
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

/** Valida la lista ordenada de cabezas de serie. `max` por defecto: mitad del cuadro. */
export function checkSeeds(
  entries: readonly Entry[],
  seededIds: readonly Id[],
  max = maxSeeds(confirmedEntries(entries).length),
): string | null {
  const confirmed = new Set(confirmedEntries(entries).map((e) => e.id));
  if (new Set(seededIds).size !== seededIds.length) return 'Hay cabezas de serie repetidos.';
  if (seededIds.some((id) => !confirmed.has(id)))
    return 'Solo pueden ser cabezas de serie los inscriptos confirmados.';
  if (seededIds.length > max) return `Como máximo puede haber ${max} cabezas de serie.`;
  return null;
}

/** Valida que se puedan generar los cruces. Devuelve un mensaje de error o null. */
export function checkCanGenerateDraw(
  tournament: Tournament,
  entries: readonly Entry[],
  sexOf: (playerId: Id) => Sex | null = () => null,
): string | null {
  const min = minEntriesFor(tournament.format);
  const confirmed = confirmedEntries(entries);
  const count = confirmed.length;
  if (count < min) return `Se necesitan al menos ${min} inscriptos confirmados (hay ${count}).`;
  if (tournament.format.kind === 'groups') {
    const { groupCount, qualifiersPerGroup } = tournament.format;
    const smallest = Math.floor(count / groupCount);
    if (smallest <= qualifiersPerGroup)
      return `Con ${count} inscriptos y ${groupCount} grupos, cada grupo tiene que tener más de ${qualifiersPerGroup} (clasifican ${qualifiersPerGroup}). Sumá inscriptos o bajá la cantidad de grupos.`;
    if (groupCount * qualifiersPerGroup < 2) return 'Tienen que clasificar al menos 2.';
  }
  if (isMixed(tournament)) {
    const sexes = confirmed.map((e) => sexOf(e.playerIds[0] ?? ''));
    if (sexes.some((x) => x === null)) return 'Hay jugadores sin sexo indicado.';
    const men = sexes.filter((x) => x === 'M').length;
    const women = sexes.filter((x) => x === 'F').length;
    if (men < 2 || women < 2)
      return `Se necesitan al menos 2 hombres y 2 mujeres (hay ${men} y ${women}).`;
  }
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

/** Máximo de cabezas de serie según el formato (en grupos, uno por grupo como mínimo útil, hasta todos). */
export function maxSeedsFor(tournament: Tournament, confirmedCount: number): number {
  if (tournament.format.kind === 'groups')
    return Math.min(confirmedCount, tournament.format.groupCount * 2);
  if (tournament.format.kind === 'knockout') return maxSeeds(confirmedCount);
  return 0;
}
