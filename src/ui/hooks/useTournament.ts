import { useCallback, useMemo } from 'react';
import type { ErrorListener, Listener } from '../../data/ports';
import type { Id } from '../../domain/common';
import type { Match } from '../../domain/knockout';
import type { Player } from '../../domain/player';
import type { Entry } from '../../domain/registration';
import type { Tournament } from '../../domain/tournament';
import { type PlayersById, indexPlayers } from '../format';
import { useServices } from '../ServicesContext';
import { type Observed, useObservable } from './useObservable';

export function useActiveTournaments(): Observed<Tournament[]> {
  const { tournaments } = useServices();
  return useObservable(
    useCallback(
      (listener: Listener<Tournament[]>, onError: ErrorListener) =>
        tournaments.observeActive(listener, onError),
      [tournaments],
    ),
  );
}

export function useAllPlayers(): Observed<Player[]> {
  const { players } = useServices();
  return useObservable(
    useCallback(
      (listener: Listener<Player[]>, onError: ErrorListener) =>
        players.observeAll(listener, onError),
      [players],
    ),
  );
}

export interface TournamentData {
  tournament: Tournament;
  entries: Entry[];
  matches: Match[];
  players: PlayersById;
  entriesById: ReadonlyMap<Id, Entry>;
}

export type TournamentState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | ({ status: 'ready' } & TournamentData);

/** Torneo con sus inscripciones, partidos y jugadores, actualizado en vivo. */
export function useTournament(id: Id): TournamentState {
  const { tournaments } = useServices();
  const tournament = useObservable(
    useCallback(
      (listener: Listener<Tournament | undefined>, onError: ErrorListener) =>
        tournaments.observeById(id, listener, onError),
      [tournaments, id],
    ),
  );
  const entries = useObservable(
    useCallback(
      (listener: Listener<Entry[]>, onError: ErrorListener) =>
        tournaments.observeEntries(id, listener, onError),
      [tournaments, id],
    ),
  );
  const matches = useObservable(
    useCallback(
      (listener: Listener<Match[]>, onError: ErrorListener) =>
        tournaments.observeMatches(id, listener, onError),
      [tournaments, id],
    ),
  );
  const players = useAllPlayers();

  return useMemo((): TournamentState => {
    const parts = [tournament, entries, matches, players];
    if (parts.some((p) => p.status === 'error')) return { status: 'error' };
    if (
      tournament.status !== 'ready' ||
      entries.status !== 'ready' ||
      matches.status !== 'ready' ||
      players.status !== 'ready'
    ) {
      return { status: 'loading' };
    }
    if (!tournament.data || tournament.data.deletedAt !== null) return { status: 'missing' };
    const activeEntries = entries.data.filter((e) => e.deletedAt === null);
    return {
      status: 'ready',
      tournament: tournament.data,
      entries: activeEntries,
      matches: matches.data,
      players: indexPlayers(players.data),
      entriesById: new Map(activeEntries.map((e) => [e.id, e])),
    };
  }, [tournament, entries, matches, players]);
}
