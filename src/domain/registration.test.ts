import { describe, expect, it } from 'vitest';
import {
  bracketSize,
  checkCanGenerateDraw,
  checkRegistration,
  checkSeeds,
  confirmedEntries,
  entriesToPromote,
  maxSeeds,
  paymentSummary,
  statusForNewEntry,
  waitlist,
} from './registration';
import { makeEntry, makeTournament } from './testFactories';

const at = (minute: number) => `2026-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`;

describe('inscripción', () => {
  const tournament = makeTournament({ maxEntries: 2 });

  it('confirma mientras hay cupo y después manda a lista de espera', () => {
    expect(statusForNewEntry(tournament, [])).toBe('confirmed');
    const one = [makeEntry({ id: 'a' })];
    expect(statusForNewEntry(tournament, one)).toBe('confirmed');
    const two = [...one, makeEntry({ id: 'b' })];
    expect(statusForNewEntry(tournament, two)).toBe('waitlist');
    const withdrawn = [...one, makeEntry({ id: 'b', status: 'withdrawn' })];
    expect(statusForNewEntry(tournament, withdrawn)).toBe('confirmed');
  });

  it('valida cantidad de jugadores según modalidad', () => {
    expect(checkRegistration(tournament, [], ['p1'])).toBeNull();
    expect(checkRegistration(tournament, [], ['p1', 'p2'])).toBe('Elegí un jugador.');
    const doubles = makeTournament({ modality: 'doubles' });
    expect(checkRegistration(doubles, [], ['p1'])).toBe('Elegí los dos jugadores de la pareja.');
    expect(checkRegistration(doubles, [], ['p1', 'p1'])).toBe('Elegí dos jugadores distintos.');
    expect(checkRegistration(doubles, [], ['p1', 'p2'])).toBeNull();
  });

  it('no permite inscribir dos veces al mismo jugador (salvo que se haya dado de baja)', () => {
    const entries = [makeEntry({ id: 'a', playerIds: ['p1'] })];
    expect(checkRegistration(tournament, entries, ['p1'])).toBe(
      'Ese jugador ya está inscripto en este torneo.',
    );
    const doubles = makeTournament({ modality: 'doubles' });
    const pair = [makeEntry({ id: 'a', playerIds: ['p1', 'p2'] })];
    expect(checkRegistration(doubles, pair, ['p3', 'p2'])).not.toBeNull();
    const gone = [makeEntry({ id: 'a', playerIds: ['p1'], status: 'withdrawn' })];
    expect(checkRegistration(tournament, gone, ['p1'])).toBeNull();
  });

  it('cierra la inscripción al generar los cruces', () => {
    const closed = makeTournament({ drawGeneratedAt: '2026-01-02T00:00:00.000Z' });
    expect(checkRegistration(closed, [], ['p1'])).not.toBeNull();
  });
});

describe('lista de espera', () => {
  const entries = [
    makeEntry({ id: 'a', registeredAt: at(1) }),
    makeEntry({ id: 'w2', status: 'waitlist', registeredAt: at(5) }),
    makeEntry({ id: 'w1', status: 'waitlist', registeredAt: at(3) }),
    makeEntry({ id: 'w3', status: 'waitlist', registeredAt: at(7) }),
  ];

  it('ordena por llegada', () => {
    expect(waitlist(entries).map((e) => e.id)).toEqual(['w1', 'w2', 'w3']);
    expect(confirmedEntries(entries).map((e) => e.id)).toEqual(['a']);
  });

  it('promueve en orden de llegada según el lugar libre', () => {
    expect(entriesToPromote(makeTournament({ maxEntries: 1 }), entries)).toEqual([]);
    expect(entriesToPromote(makeTournament({ maxEntries: 2 }), entries).map((e) => e.id)).toEqual([
      'w1',
    ]);
    expect(entriesToPromote(makeTournament({ maxEntries: 10 }), entries).map((e) => e.id)).toEqual([
      'w1',
      'w2',
      'w3',
    ]);
  });

  it('no promueve automáticamente después de generar los cruces', () => {
    const t = makeTournament({ maxEntries: 5, drawGeneratedAt: '2026-01-02T00:00:00.000Z' });
    expect(entriesToPromote(t, entries)).toEqual([]);
  });
});

describe('cabezas de serie', () => {
  it('tamaño del cuadro y máximo de cabezas', () => {
    expect([2, 3, 4, 5, 8, 9, 16, 17].map(bracketSize)).toEqual([2, 4, 4, 8, 8, 16, 16, 32]);
    expect([0, 1, 2, 3, 5, 8, 9].map(maxSeeds)).toEqual([0, 0, 1, 2, 4, 4, 8]);
  });

  it('valida la lista', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((id) => makeEntry({ id }));
    expect(checkSeeds(entries, ['a', 'b'])).toBeNull();
    expect(checkSeeds(entries, ['a', 'a'])).not.toBeNull();
    expect(checkSeeds(entries, ['x'])).not.toBeNull();
    expect(checkSeeds(entries, ['a', 'b', 'c', 'd', 'e'])).toBe(
      'Como máximo puede haber 4 cabezas de serie.',
    );
    const withWaitlist = [...entries, makeEntry({ id: 'w', status: 'waitlist' })];
    expect(checkSeeds(withWaitlist, ['w'])).not.toBeNull();
  });
});

describe('generar cruces y pagos', () => {
  it('exige el mínimo de confirmados', () => {
    const t = makeTournament();
    expect(checkCanGenerateDraw(t, [makeEntry({ id: 'a' })])).toBe(
      'Se necesitan al menos 2 inscriptos confirmados (hay 1).',
    );
    expect(checkCanGenerateDraw(t, [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })])).toBeNull();
  });

  it('resume pagos individuales, ignorando bajas', () => {
    const entries = [
      makeEntry({
        id: 'a',
        playerIds: ['p1', 'p2'],
        payments: [
          { playerId: 'p1', amount: 1000, status: 'paid' },
          { playerId: 'p2', amount: 1000, status: 'pending' },
        ],
      }),
      makeEntry({ id: 'b', status: 'withdrawn' }),
      makeEntry({ id: 'c', status: 'waitlist' }),
    ];
    expect(paymentSummary(entries)).toEqual({ paid: 1000, pending: 2000, pendingPlayers: 2 });
  });
});
