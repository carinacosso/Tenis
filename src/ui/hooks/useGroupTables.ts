import { useMemo } from 'react';
import { type GroupTable, computeGroupTables } from '../../domain/groups';
import type { TournamentData } from './useTournament';

/** Tablas de posiciones de cada grupo (o de la liga), recalculadas con cada resultado. */
export function useGroupTables(data: TournamentData): GroupTable[] {
  return useMemo(() => computeGroupTables(data.tournament, data.groups, data.matches), [data]);
}
