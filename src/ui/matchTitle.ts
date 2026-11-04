import { groupMatches, playoffMatches } from '../domain/groups';
import { roundName } from '../domain/knockout';
import type { Match } from '../domain/match';
import type { TournamentData } from './hooks/useTournament';

/** Título corto de un partido: "Grupo A · Fecha 2", "Fecha 3" (liga) o el nombre de la ronda del cuadro. */
export function matchTitle(match: Match, data: Pick<TournamentData, 'matches' | 'groups'>): string {
  if (match.stage === 'group') {
    const group = data.groups.find((g) => g.id === match.groupId);
    return data.groups.length > 1 && group
      ? `Grupo ${group.name} · Fecha ${match.round}`
      : `Fecha ${match.round}`;
  }
  const bracket = match.stage === 'playoff' ? playoffMatches(data.matches) : data.matches;
  const rounds = Math.max(1, ...bracket.map((m) => m.round));
  return roundName(match.round, rounds);
}

/** Partidos del cuadro (sin la fase de grupos). */
export function bracketMatches(matches: readonly Match[]): Match[] {
  const group = new Set(groupMatches(matches).map((m) => m.id));
  return matches.filter((m) => !group.has(m.id));
}
