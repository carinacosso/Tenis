import type { Id } from './common';
import { consolationMatches, mainDrawMatches } from './consolation';
import { computeGroupTables, isGroupStageComplete, playoffMatches } from './groups';
import { knockoutPodium, resolveKnockout, roundName } from './knockout';
import type { Group, Match, Round, SideSource } from './match';
import type { Entry } from './registration';
import { rotationStandings } from './rotationStandings';
import { isOpenSet, pointsOf } from './scoring';
import { tallyResult } from './standings';
import { type Tournament, formatLabel, isRotation } from './tournament';
import { superTiebreakIndex } from './groups';

/** Todo lo de un torneo que hace falta para calcular el historial de un jugador. */
export interface TournamentBundle {
  tournament: Tournament;
  entries: readonly Entry[];
  matches: readonly Match[];
  rounds: readonly Round[];
  groups: readonly Group[];
}

export interface PlayerTournamentRecord {
  tournamentId: Id;
  name: string;
  date: string;
  format: string;
  status: Tournament['status'];
  /** Compañero de pareja fija (dobles), si tiene. */
  partnerIds: Id[];
  /** "Campeón", "Subcampeón", "Perdió en Cuartos de final", "2.º de 8", "En juego"… */
  placement: string;
  champion: boolean;
  podium: boolean;
  played: number;
  won: number;
  lost: number;
}

export interface PlayerStats {
  /** Torneos en los que jugó (con cruces generados). */
  tournaments: number;
  titles: number;
  podiums: number;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  /** Porcentaje de partidos ganados (0 a 100), o null si no jugó. */
  winRate: number | null;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
}

const emptyStats = (): PlayerStats => ({
  tournaments: 0,
  titles: 0,
  podiums: 0,
  played: 0,
  won: 0,
  lost: 0,
  drawn: 0,
  winRate: null,
  setsWon: 0,
  setsLost: 0,
  gamesWon: 0,
  gamesLost: 0,
  pointsFor: 0,
  pointsAgainst: 0,
});

/** Inscripciones de cada lado de cada partido (resuelve "ganador de…" en los cuadros). */
function sidesOf(matches: readonly Match[]): Map<Id, [Id[], Id[]]> {
  const resolved = resolveKnockout(matches);
  const side = (source: SideSource, resolvedId: Id | null): Id[] =>
    source.kind === 'entries' ? source.entryIds : resolvedId ? [resolvedId] : [];
  return new Map(
    matches.map((m) => {
      const r = resolved.get(m.id);
      return [m.id, [side(m.sideA, r?.a ?? null), side(m.sideB, r?.b ?? null)]];
    }),
  );
}

/** Puesto en un cuadro de eliminación: campeón, subcampeón o la ronda en la que perdió. */
function bracketPlacement(
  matches: readonly Match[],
  entryId: Id,
): { text: string; champion: boolean; podium: boolean } | null {
  if (matches.length === 0) return null;
  const podium = knockoutPodium(matches);
  if (podium.champion === entryId) return { text: 'Campeón', champion: true, podium: true };
  if (podium.runnerUp === entryId) return { text: 'Subcampeón', champion: false, podium: true };
  const rounds = Math.max(...matches.map((m) => m.round));
  const lost = [...resolveKnockout(matches).values()].find((r) => r.loser === entryId);
  if (!lost) return null;
  return {
    text: `Perdió en ${roundName(lost.match.round, rounds).toLowerCase()}`,
    champion: false,
    podium: podium.thirds.includes(entryId),
  };
}

function tablePlacement(
  position: number,
  total: number,
  finished: boolean,
): { text: string; champion: boolean; podium: boolean } {
  if (!finished)
    return { text: `En juego (va ${position}.º de ${total})`, champion: false, podium: false };
  if (position === 1) return { text: `Campeón (1.º de ${total})`, champion: true, podium: true };
  return { text: `${position}.º de ${total}`, champion: false, podium: position <= 3 };
}

function placementFor(bundle: TournamentBundle, entry: Entry) {
  const { tournament, entries, matches, rounds, groups } = bundle;
  const finished = tournament.status === 'finished';
  const playing = { text: 'En juego', champion: false, podium: false };
  const confirmed = entries.filter((e) => e.status === 'confirmed' && e.deletedAt === null);
  const { format } = tournament;

  if (isRotation(format)) {
    const ranking = rotationStandings(
      confirmed.map((e) => e.id),
      matches,
      rounds,
      tournament.id,
    );
    const row = ranking.find((r) => r.entryId === entry.id);
    return row ? tablePlacement(row.position, ranking.length, finished) : playing;
  }
  if (format.kind === 'league') {
    const [table] = computeGroupTables(tournament, groups, matches);
    const row = table?.rows.find((r) => r.entryId === entry.id);
    return row && table ? tablePlacement(row.position, table.rows.length, finished) : playing;
  }
  if (format.kind === 'groups') {
    const playoff = playoffMatches(matches);
    const inPlayoff = playoff.some((m) =>
      [m.sideA, m.sideB].some((s) => s.kind === 'entry' && s.entryId === entry.id),
    );
    if (inPlayoff) return bracketPlacement(playoff, entry.id) ?? playing;
    if (!isGroupStageComplete(matches)) return { ...playing, text: 'En juego (fase de grupos)' };
    for (const table of computeGroupTables(tournament, groups, matches)) {
      const row = table.rows.find((r) => r.entryId === entry.id);
      const group = groups.find((g) => g.index === table.groupIndex);
      if (row)
        return {
          text: `${row.position}.º del Grupo ${group?.name ?? ''}`,
          champion: false,
          podium: false,
        };
    }
    return playing;
  }
  const main = bracketPlacement(mainDrawMatches(matches), entry.id) ?? playing;
  const consolation = consolationMatches(matches);
  if (consolation.length > 0 && knockoutPodium(consolation).champion === entry.id) {
    return { ...main, text: `${main.text} · Campeón de consolación` };
  }
  return main;
}

/**
 * Historial y estadísticas de un jugador en todos sus torneos.
 * Cuenta solo inscripciones confirmadas. Los W.O. no cuentan como partido jugado (no hubo juego);
 * los abandonos sí (como ganado o perdido) y suman los sets y games que se jugaron.
 */
export function playerHistory(
  playerId: Id,
  bundles: readonly TournamentBundle[],
): { records: PlayerTournamentRecord[]; stats: PlayerStats } {
  const stats = emptyStats();
  const records: PlayerTournamentRecord[] = [];

  for (const bundle of bundles) {
    const { tournament, entries, matches } = bundle;
    if (tournament.deletedAt !== null) continue;
    const entry = entries.find(
      (e) => e.deletedAt === null && e.status === 'confirmed' && e.playerIds.includes(playerId),
    );
    if (!entry) continue;

    const started = tournament.drawGeneratedAt !== null;
    const record: PlayerTournamentRecord = {
      tournamentId: tournament.id,
      name: tournament.name,
      date: tournament.date,
      format: formatLabel(tournament.format),
      status: tournament.status,
      partnerIds: entry.playerIds.filter((id) => id !== playerId),
      placement: 'Inscripto (todavía no empezó)',
      champion: false,
      podium: false,
      played: 0,
      won: 0,
      lost: 0,
    };

    if (started) {
      stats.tournaments++;
      const placement = placementFor(bundle, entry);
      record.placement = placement.text;
      record.champion = placement.champion;
      record.podium = placement.podium;
      if (placement.champion) stats.titles++;
      if (placement.podium) stats.podiums++;

      const superIndex = superTiebreakIndex(tournament);
      const sides = sidesOf(matches);
      for (const match of matches) {
        const result = match.result;
        if (!result || result.outcome === 'walkover') continue;
        const [a, b] = sides.get(match.id) ?? [[], []];
        const side = a.includes(entry.id) ? 'A' : b.includes(entry.id) ? 'B' : null;
        if (!side) continue;
        record.played++;
        stats.played++;
        if (result.winner === null) stats.drawn++;
        else if (result.winner === side) {
          record.won++;
          stats.won++;
        } else {
          record.lost++;
          stats.lost++;
        }
        const points = pointsOf(result);
        if (points) {
          stats.pointsFor += side === 'A' ? points.a : points.b;
          stats.pointsAgainst += side === 'A' ? points.b : points.a;
        } else {
          const t = tallyResult(result, superIndex);
          stats.gamesWon += side === 'A' ? t.gamesA : t.gamesB;
          stats.gamesLost += side === 'A' ? t.gamesB : t.gamesA;
          // En un abandono, el set que quedó a medias no cuenta como set ganado ni perdido.
          const last = result.kind === 'sets' ? result.sets.at(-1) : undefined;
          const open =
            result.kind === 'sets' &&
            tournament.scoring.kind === 'sets' &&
            last !== undefined &&
            isOpenSet(tournament.scoring, last, result.sets.length - 1);
          const unfinishedA = open && last && last.a > last.b ? 1 : 0;
          // (el conteo de sets le asigna un set empatado al lado B)
          const unfinishedB = open && last && !(last.a > last.b) ? 1 : 0;
          stats.setsWon += side === 'A' ? t.setsA - unfinishedA : t.setsB - unfinishedB;
          stats.setsLost += side === 'A' ? t.setsB - unfinishedB : t.setsA - unfinishedA;
        }
      }
    }
    records.push(record);
  }

  stats.winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : null;
  records.sort((x, y) => y.date.localeCompare(x.date) || x.name.localeCompare(y.name));
  return { records, stats };
}
