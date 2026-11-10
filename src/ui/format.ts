import type { Id } from '../domain/common';
import { type Player, fullName, shortName } from '../domain/player';
import type { Entry } from '../domain/registration';

export type PlayersById = ReadonlyMap<Id, Player>;

export function indexPlayers(players: readonly Player[]): Map<Id, Player> {
  return new Map(players.map((p) => [p.id, p]));
}

/** Nombre a mostrar de una inscripción: "Ana Gómez" o "A. Gómez / L. Sosa". */
export function entryName(entry: Entry | undefined, players: PlayersById): string {
  if (!entry) return '—';
  const names = entry.playerIds.map((id) => players.get(id));
  if (names.length === 1) return names[0] ? fullName(names[0]) : 'Jugador eliminado';
  return names.map((p) => (p ? shortName(p) : '?')).join(' / ');
}

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatMoney(amount: number): string {
  return money.format(amount);
}

/** "2026-06-01" → "lun 1 jun 2026". */
export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** "2026-11-10T16:05:00Z" → "del 10/11/2026 a las 13:05" (hora del teléfono). */
export function formatBuildTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  });
  const time = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
  return `del ${day} a las ${time}`;
}
