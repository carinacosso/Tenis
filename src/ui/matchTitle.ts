import { consolationMatches, mainDrawMatches } from '../domain/consolation';
import { groupMatches, playoffMatches } from '../domain/groups';
import { roundName } from '../domain/knockout';
import type { Match } from '../domain/match';
import type { TournamentData } from './hooks/useTournament';

/** Partidos del cuadro principal: el playoff en grupos, o el cuadro de eliminación directa. */
export function bracketMatches(matches: readonly Match[]): Match[] {
  return groupMatches(matches).length > 0 ? playoffMatches(matches) : mainDrawMatches(matches);
}

/** Título corto de un partido: "Grupo A · Fecha 2", "Fecha 3", "Semifinal" o "Consolación · Final". */
export function matchTitle(match: Match, data: Pick<TournamentData, 'matches' | 'groups'>): string {
  if (match.stage === 'group') {
    const group = data.groups.find((g) => g.id === match.groupId);
    return data.groups.length > 1 && group
      ? `Grupo ${group.name} · Fecha ${match.round}`
      : `Fecha ${match.round}`;
  }
  if (match.stage === 'consolation') {
    const rounds = Math.max(1, ...consolationMatches(data.matches).map((m) => m.round));
    return `Consolación · ${roundName(match.round, rounds)}`;
  }
  const rounds = Math.max(1, ...bracketMatches(data.matches).map((m) => m.round));
  return roundName(match.round, rounds);
}
