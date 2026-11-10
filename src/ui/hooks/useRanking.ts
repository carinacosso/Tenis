import { useMemo } from 'react';
import { confirmedEntries } from '../../domain/registration';
import { type RotationRow, rotationStandings } from '../../domain/rotationStandings';
import type { TournamentData } from './useTournament';

/** Ranking de un formato rotativo, recalculado cuando cambian los datos. */
export function useRanking(data: TournamentData): RotationRow[] {
  return useMemo(
    () =>
      rotationStandings(
        confirmedEntries(data.entries).map((e) => e.id),
        data.matches,
        data.rounds,
        data.tournament.id,
      ),
    [data],
  );
}
