import type { Player } from './player';
import { LOCAL_OWNER } from './common';
import type { Entry } from './registration';
import type { Match } from './knockout';
import type { Tournament } from './tournament';
import { DEFAULT_SETS_SCORING, type MatchResult } from './scoring';
/** Crea un jugador válido para tests, sobrescribiendo los campos que se pasen. */
export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p-1',
    ownerId: LOCAL_OWNER,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Juan',
    lastName: 'Pérez',
    phone: '+5491155550000',
    sex: 'M',
    level: '4ta',
    notes: '',
    ...overrides,
  };
}

const base = {
  ownerId: LOCAL_OWNER,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

export function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    ...base,
    id: 't-1',
    name: 'Torneo de prueba',
    date: '2026-06-01',
    venue: 'Club',
    category: '4ta',
    modality: 'singles',
    format: { kind: 'knockout' },
    scoring: DEFAULT_SETS_SCORING,
    maxEntries: 16,
    entryFee: 1000,
    status: 'registration',
    drawGeneratedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  const id = overrides.id ?? 'e-1';
  return {
    ...base,
    id,
    tournamentId: 't-1',
    playerIds: [`player-${id}`],
    status: 'confirmed',
    registeredAt: '2026-01-01T00:00:00.000Z',
    seed: null,
    payments: [{ playerId: `player-${id}`, amount: 1000, status: 'pending' }],
    ...overrides,
  };
}

export function toMatches(
  plans: Pick<Match, 'id' | 'round' | 'position' | 'sideA' | 'sideB'>[],
): Match[] {
  return plans.map((p) => ({ ...base, ...p, tournamentId: 't-1', result: null }));
}

/** Resultado 6-x 6-x para el lado indicado. */
export function win(side: 'A' | 'B', loserGames = 2): MatchResult {
  const set = side === 'A' ? { a: 6, b: loserGames } : { a: loserGames, b: 6 };
  return { kind: 'sets', outcome: 'normal', sets: [set, { ...set }], winner: side };
}
