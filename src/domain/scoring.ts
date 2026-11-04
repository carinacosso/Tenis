/** Configuración de puntuación y validación de resultados. */

export type Side = 'A' | 'B';

export interface SetsScoring {
  kind: 'sets';
  gamesPerSet: 4 | 6;
  /** Cantidad máxima de sets: 1, 3 (2 de 3) o 5 (3 de 5). */
  bestOf: 1 | 3 | 5;
  /** Tie-break cuando el set llega a iguales en `gamesPerSet` (6-6 o 4-4). */
  tiebreak: { enabled: boolean; points: number };
  /** El set decisivo se juega completo o como super tie-break a 10. */
  decidingSet: 'full' | 'superTiebreak';
  /** Punto de oro (sin ventaja). Es solo informativo: no se cargan puntos dentro de cada game. */
  goldenPoint: boolean;
}

export interface PointsScoring {
  kind: 'points';
  /** Gana el primero que llega a esta cantidad de puntos. */
  target: number;
}

export interface TimeScoring {
  kind: 'time';
  minutes: number;
}

export type ScoringConfig = SetsScoring | PointsScoring | TimeScoring;

export const SUPER_TIEBREAK_POINTS = 10;

export const POINT_TARGETS = [16, 21, 24, 32] as const;

export const DEFAULT_POINTS_SCORING: PointsScoring = { kind: 'points', target: 21 };

export const DEFAULT_SETS_SCORING: SetsScoring = {
  kind: 'sets',
  gamesPerSet: 6,
  bestOf: 3,
  tiebreak: { enabled: true, points: 7 },
  decidingSet: 'full',
  goldenPoint: false,
};

/** Puntuación de un set. En un super tie-break, `a` y `b` son los puntos. */
export interface SetScore {
  a: number;
  b: number;
  /** Puntos del tie-break (opcional; solo en sets que terminan G+1 a G). */
  tiebreak?: { a: number; b: number };
}

export interface SetsResult {
  kind: 'sets';
  outcome: 'normal';
  sets: SetScore[];
  winner: Side;
}

export interface PointsResult {
  kind: 'points';
  outcome: 'normal';
  a: number;
  b: number;
  winner: Side;
}

/** Partido por tiempo: puede terminar empatado (winner = null). */
export interface TimeResult {
  kind: 'time';
  outcome: 'normal';
  a: number;
  b: number;
  winner: Side | null;
}

export type MatchResult = SetsResult | PointsResult | TimeResult;

export type ResultWinner = Side | null;

export type ResultCheck = { ok: true; winner: Side } | { ok: false; error: string };

export function setsToWin(bestOf: SetsScoring['bestOf']): number {
  return Math.ceil(bestOf / 2);
}

/** Indica si el set número `index` (desde 0) se juega como super tie-break. */
export function isSuperTiebreakSet(config: SetsScoring, index: number): boolean {
  return config.decidingSet === 'superTiebreak' && config.bestOf > 1 && index === config.bestOf - 1;
}

const isCount = (n: number) => Number.isInteger(n) && n >= 0;

/** Valida un tie-break o super tie-break: al menos `target` puntos y 2 de diferencia. */
function isValidTiebreak(winner: number, loser: number, target: number): boolean {
  if (!isCount(winner) || !isCount(loser) || winner <= loser) return false;
  if (winner < target) return false;
  return winner === target ? winner - loser >= 2 : winner - loser === 2;
}

/** Devuelve un mensaje de error, o null si el set es válido. */
export function checkSet(config: SetsScoring, set: SetScore, index: number): string | null {
  const label = `Set ${index + 1}`;
  const { a, b } = set;
  if (!isCount(a) || !isCount(b)) return `${label}: los valores deben ser números enteros.`;
  if (a === b) return `${label}: no puede terminar empatado.`;
  const w = Math.max(a, b);
  const l = Math.min(a, b);

  if (isSuperTiebreakSet(config, index)) {
    if (set.tiebreak) return `${label}: el super tie-break no lleva tie-break aparte.`;
    return isValidTiebreak(w, l, SUPER_TIEBREAK_POINTS)
      ? null
      : `${label}: ${a}-${b} no es un super tie-break válido (a ${SUPER_TIEBREAK_POINTS}, por 2).`;
  }

  const g = config.gamesPerSet;
  const invalid = `${label}: ${a}-${b} no es un resultado válido para sets a ${g}.`;

  if (config.tiebreak.enabled) {
    const isTiebreakSet = w === g + 1 && l === g;
    const ok = (w === g && l <= g - 2) || (w === g + 1 && l === g - 1) || isTiebreakSet;
    if (!ok) return invalid;
    if (set.tiebreak) {
      if (!isTiebreakSet) return `${label}: solo un set ${g + 1}-${g} lleva tie-break.`;
      const tbWinner = set.tiebreak.a > set.tiebreak.b ? 'a' : 'b';
      const setWinner = a > b ? 'a' : 'b';
      const tw = Math.max(set.tiebreak.a, set.tiebreak.b);
      const tl = Math.min(set.tiebreak.a, set.tiebreak.b);
      if (tbWinner !== setWinner || !isValidTiebreak(tw, tl, config.tiebreak.points)) {
        return `${label}: el tie-break ${set.tiebreak.a}-${set.tiebreak.b} no es válido.`;
      }
    }
    return null;
  }

  // Sin tie-break: se juega con ventaja hasta sacar 2 games de diferencia.
  if (set.tiebreak) return `${label}: este torneo se juega sin tie-break.`;
  const ok = (w === g && l <= g - 2) || (w > g && w - l === 2);
  return ok ? null : invalid;
}

/** Valida un resultado por sets completo y devuelve el ganador. */
export function checkSetsResult(config: SetsScoring, sets: readonly SetScore[]): ResultCheck {
  if (sets.length === 0) return { ok: false, error: 'Cargá al menos un set.' };
  const needed = setsToWin(config.bestOf);
  let wonA = 0;
  let wonB = 0;
  for (const [index, set] of sets.entries()) {
    if (wonA === needed || wonB === needed) {
      return { ok: false, error: `Sobra el set ${index + 1}: el partido ya estaba definido.` };
    }
    const error = checkSet(config, set, index);
    if (error) return { ok: false, error };
    if (set.a > set.b) wonA++;
    else wonB++;
  }
  if (wonA < needed && wonB < needed)
    return { ok: false, error: 'Faltan sets: el partido no está terminado.' };
  return { ok: true, winner: wonA > wonB ? 'A' : 'B' };
}

/** Valida un partido a puntos fijos: gana el primero que llega al objetivo. */
export function checkPointsResult(config: PointsScoring, a: number, b: number): ResultCheck {
  if (!isCount(a) || !isCount(b))
    return { ok: false, error: 'Los puntos deben ser números enteros.' };
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  if (w !== config.target || l >= config.target) {
    return { ok: false, error: `Gana el primero que llega a ${config.target} puntos.` };
  }
  return { ok: true, winner: a > b ? 'A' : 'B' };
}

/** Valida un partido por tiempo: puntos enteros, se permite el empate. */
export function checkTimeResult(a: number, b: number): TimeCheck {
  if (!isCount(a) || !isCount(b))
    return { ok: false, error: 'Los puntos deben ser números enteros.' };
  return { ok: true, winner: a === b ? null : a > b ? 'A' : 'B' };
}

export type TimeCheck = { ok: true; winner: Side | null } | { ok: false; error: string };

/** Valida un resultado contra la configuración del torneo. */
export function checkResult(config: ScoringConfig, result: MatchResult): TimeCheck {
  let check: TimeCheck;
  if (config.kind === 'sets' && result.kind === 'sets')
    check = checkSetsResult(config, result.sets);
  else if (config.kind === 'points' && result.kind === 'points')
    check = checkPointsResult(config, result.a, result.b);
  else if (config.kind === 'time' && result.kind === 'time')
    check = checkTimeResult(result.a, result.b);
  else return { ok: false, error: 'El tipo de resultado no corresponde al torneo.' };
  if (check.ok && check.winner !== result.winner) {
    return { ok: false, error: 'El ganador no coincide con el resultado.' };
  }
  return check;
}

/** Arma un resultado a puntos o por tiempo, validado. */
export function buildScoreResult(
  config: ScoringConfig,
  a: number,
  b: number,
): { ok: true; result: PointsResult | TimeResult } | { ok: false; error: string } {
  if (config.kind === 'points') {
    const check = checkPointsResult(config, a, b);
    if (!check.ok) return check;
    return { ok: true, result: { kind: 'points', outcome: 'normal', a, b, winner: check.winner } };
  }
  if (config.kind === 'time') {
    const check = checkTimeResult(a, b);
    if (!check.ok) return check;
    return { ok: true, result: { kind: 'time', outcome: 'normal', a, b, winner: check.winner } };
  }
  return { ok: false, error: 'Este torneo se juega por sets.' };
}

/** Puntos de cada lado en formatos a puntos o por tiempo (null si es por sets). */
export function pointsOf(result: MatchResult): { a: number; b: number } | null {
  return result.kind === 'sets' ? null : { a: result.a, b: result.b };
}

/** Crea un resultado por sets válido, calculando el ganador. */
export function buildSetsResult(
  config: SetsScoring,
  sets: SetScore[],
): { ok: true; result: SetsResult } | { ok: false; error: string } {
  const check = checkSetsResult(config, sets);
  if (!check.ok) return check;
  return { ok: true, result: { kind: 'sets', outcome: 'normal', sets, winner: check.winner } };
}

/**
 * Resultados posibles de un set desde el punto de vista del ganador, para los botones de carga rápida.
 * Ej. sets a 6 con tie-break: 6-0 … 6-4, 7-5, 7-6.
 */
export interface QuickSetScore {
  winner: number;
  loser: number;
  tiebreak: boolean;
}

export function quickSetScores(config: SetsScoring, index: number): QuickSetScore[] {
  if (isSuperTiebreakSet(config, index)) {
    return Array.from({ length: SUPER_TIEBREAK_POINTS - 1 }, (_, l) => ({
      winner: SUPER_TIEBREAK_POINTS,
      loser: l,
      tiebreak: false,
    }));
  }
  const g: number = config.gamesPerSet;
  const scores: QuickSetScore[] = Array.from({ length: g - 1 }, (_, l) => ({
    winner: g,
    loser: l,
    tiebreak: false,
  }));
  if (config.tiebreak.enabled) {
    scores.push({ winner: g + 1, loser: g - 1, tiebreak: false });
    scores.push({ winner: g + 1, loser: g, tiebreak: true });
  } else {
    for (let w = g + 1; w <= g + 4; w++) scores.push({ winner: w, loser: w - 2, tiebreak: false });
  }
  return scores;
}

/** Formatea el resultado desde el lado A: "6-3 7-6(5)". */
export function formatResult(result: MatchResult): string {
  if (result.kind !== 'sets') return `${result.a}-${result.b}`;
  return result.sets
    .map((s) => {
      const tb = s.tiebreak ? `(${Math.min(s.tiebreak.a, s.tiebreak.b)})` : '';
      return `${s.a}-${s.b}${tb}`;
    })
    .join(' ');
}

/** Formatea el resultado desde el punto de vista del ganador: "6-3 6-7(5) 10-8". */
export function formatResultForWinner(result: MatchResult): string {
  if (result.winner !== 'B') return formatResult(result);
  if (result.kind !== 'sets') return `${result.b}-${result.a}`;
  return formatResult({
    ...result,
    sets: result.sets.map((s) => ({
      a: s.b,
      b: s.a,
      ...(s.tiebreak ? { tiebreak: { a: s.tiebreak.b, b: s.tiebreak.a } } : {}),
    })),
  });
}

/** Valida la configuración de puntuación elegida al crear el torneo. */
export function checkScoringConfig(config: ScoringConfig): string | null {
  switch (config.kind) {
    case 'sets':
      if (config.gamesPerSet !== 4 && config.gamesPerSet !== 6)
        return 'Los sets son a 4 o a 6 games.';
      if (![1, 3, 5].includes(config.bestOf)) return 'La cantidad de sets debe ser 1, 3 o 5.';
      if (config.bestOf === 1 && config.decidingSet === 'superTiebreak')
        return 'Con un solo set no hay super tie-break.';
      if (
        config.tiebreak.enabled &&
        (!Number.isInteger(config.tiebreak.points) ||
          config.tiebreak.points < 5 ||
          config.tiebreak.points > 15)
      )
        return 'El tie-break debe ser a entre 5 y 15 puntos.';
      return null;
    case 'points':
      return Number.isInteger(config.target) && config.target >= 1 && config.target <= 99
        ? null
        : 'Los puntos deben ser entre 1 y 99.';
    case 'time':
      return Number.isInteger(config.minutes) && config.minutes >= 1 && config.minutes <= 240
        ? null
        : 'El tiempo debe ser entre 1 y 240 minutos.';
  }
}

/** Describe la configuración en una línea: "2 de 3 sets a 6 · tie-break a 7 · super tie-break". */
export function describeScoring(config: ScoringConfig): string {
  if (config.kind === 'points') return `Partidos a ${config.target} puntos`;
  if (config.kind === 'time') return `Por tiempo: ${config.minutes} minutos`;
  const sets =
    config.bestOf === 1
      ? `1 set a ${config.gamesPerSet}`
      : `${setsToWin(config.bestOf)} de ${config.bestOf} sets a ${config.gamesPerSet}`;
  const parts = [sets];
  parts.push(config.tiebreak.enabled ? `tie-break a ${config.tiebreak.points}` : 'sin tie-break');
  if (config.decidingSet === 'superTiebreak' && config.bestOf > 1)
    parts.push('super tie-break en el decisivo');
  if (config.goldenPoint) parts.push('punto de oro');
  return parts.join(' · ');
}
