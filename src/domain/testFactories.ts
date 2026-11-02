import type { Player } from './player';
import { LOCAL_OWNER } from './common';

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
