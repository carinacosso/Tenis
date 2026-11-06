import type { EntityBase, Id } from './common';
import type { MatchResult } from './scoring';

/** De dónde sale cada lado de un partido. */
export type SideSource =
  | { kind: 'entry'; entryId: Id }
  | { kind: 'bye' }
  | { kind: 'winnerOf'; matchId: Id }
  /** Formatos rotativos: inscripciones individuales que juegan juntas en ese partido. */
  | { kind: 'entries'; entryIds: Id[] };

export interface Match extends EntityBase {
  tournamentId: Id;
  /** Ronda, desde 1. */
  round: number;
  /** Posición dentro de la ronda, desde 0 (de arriba hacia abajo en el cuadro, o número de cancha). */
  position: number;
  sideA: SideSource;
  sideB: SideSource;
  result: MatchResult | null;
  /** Etapa: fase de grupos/liga o cuadro final de playoffs. Sin valor = cuadro principal. */
  stage?: MatchStage;
  /** Grupo al que pertenece (fase de grupos y liga). */
  groupId?: Id;
}

export type MatchStage = 'group' | 'playoff' | 'consolation';

/** Grupo de la fase de grupos (en la liga hay un único grupo). */
export interface Group extends EntityBase {
  tournamentId: Id;
  /** "A", "B"… o "Liga". */
  name: string;
  /** Orden del grupo (0 = A). */
  index: number;
  entryIds: Id[];
}

export type GroupPlan = Pick<Group, 'id' | 'name' | 'index' | 'entryIds'>;

/** Partido generado por el sorteo, antes de agregarle los campos de persistencia. */
export type MatchPlan = Pick<Match, 'id' | 'round' | 'position' | 'sideA' | 'sideB'> &
  Partial<Pick<Match, 'stage' | 'groupId'>>;

/** Ronda de un formato rotativo: guarda quiénes descansan. */
export interface Round extends EntityBase {
  tournamentId: Id;
  number: number;
  restingEntryIds: Id[];
}

export type RoundPlan = Pick<Round, 'id' | 'number' | 'restingEntryIds'>;

/** Inscripciones de un lado en formatos rotativos. */
export function sideEntries(source: SideSource): Id[] {
  if (source.kind === 'entries') return source.entryIds;
  if (source.kind === 'entry') return [source.entryId];
  return [];
}
