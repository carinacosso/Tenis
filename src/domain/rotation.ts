import type { Id } from './common';
import type { Match, MatchPlan, Round, RoundPlan, SideSource } from './match';
import type { Sex } from './player';
import { type Rng, shuffle } from './random';
import type { AmericanoVariant } from './tournament';

/**
 * Formatos rotativos: Americano (dobles, singles, mixto) y Mexicano.
 * Las parejas y los rivales cambian en cada ronda; se minimizan las repeticiones
 * y los descansos se reparten de forma justa (descansa primero quien menos descansó).
 */

export interface RotationEntrant {
  id: Id;
  sex: Sex | null;
}

/** Contador simétrico de pares (compañeros o rivales). */
export class PairCounter {
  private readonly counts = new Map<string, number>();

  private key(a: Id, b: Id): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  get(a: Id, b: Id): number {
    return this.counts.get(this.key(a, b)) ?? 0;
  }

  add(a: Id, b: Id): void {
    const key = this.key(a, b);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  /** Mayor cantidad de veces que se repitió un mismo par. */
  max(): number {
    return Math.max(0, ...this.counts.values());
  }

  /** Suma de cuadrados: penaliza más las repeticiones concentradas. */
  sumSquares(): number {
    let total = 0;
    for (const c of this.counts.values()) total += c * c;
    return total;
  }
}

export interface RotationHistory {
  partners: PairCounter;
  opponents: PairCounter;
  rests: Map<Id, number>;
  /** Última ronda en que descansó cada uno (0 = nunca). */
  lastRest: Map<Id, number>;
}

export function emptyHistory(): RotationHistory {
  return {
    partners: new PairCounter(),
    opponents: new PairCounter(),
    rests: new Map(),
    lastRest: new Map(),
  };
}

function sideIds(source: SideSource): Id[] {
  return source.kind === 'entries' ? source.entryIds : [];
}

function recordMatch(history: RotationHistory, a: Id[], b: Id[]): void {
  for (const side of [a, b]) {
    for (let i = 0; i < side.length; i++)
      for (let j = i + 1; j < side.length; j++) history.partners.add(side[i] ?? '', side[j] ?? '');
  }
  for (const x of a) for (const y of b) history.opponents.add(x, y);
}

function recordRest(history: RotationHistory, ids: readonly Id[], round: number): void {
  for (const id of ids) {
    history.rests.set(id, (history.rests.get(id) ?? 0) + 1);
    history.lastRest.set(id, round);
  }
}

/** Reconstruye el historial a partir de rondas y partidos ya generados. */
export function historyFrom(
  matches: readonly Pick<Match, 'sideA' | 'sideB'>[],
  rounds: readonly Pick<Round, 'number' | 'restingEntryIds'>[],
): RotationHistory {
  const history = emptyHistory();
  for (const m of matches) recordMatch(history, sideIds(m.sideA), sideIds(m.sideB));
  for (const r of [...rounds].sort((x, y) => x.number - y.number))
    recordRest(history, r.restingEntryIds, r.number);
  return history;
}

/** Elige quiénes descansan: los que menos descansaron y, entre ellos, los que hace más que no descansan. */
export function pickResting(
  candidates: readonly Id[],
  count: number,
  history: RotationHistory,
  rng: Rng,
): Id[] {
  if (count <= 0) return [];
  const rests = (id: Id) => history.rests.get(id) ?? 0;
  const last = (id: Id) => history.lastRest.get(id) ?? 0;
  return shuffle(candidates, rng)
    .sort((a, b) => rests(a) - rests(b) || last(a) - last(b))
    .slice(0, count);
}

/** Método del círculo: rondas de emparejamientos donde cada par aparece una sola vez. */
export function circleRounds<T>(items: readonly T[]): [T, T][][] {
  const n = items.length;
  if (n < 2 || n % 2 !== 0) throw new Error('El método del círculo necesita una cantidad par.');
  let arr = [...items];
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== undefined && b !== undefined) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const first = arr[0];
    const last = arr[n - 1];
    if (first === undefined || last === undefined) break;
    arr = [first, last, ...arr.slice(1, n - 1)];
  }
  return rounds;
}

const PARTNER_WEIGHT = 10;
const sq = (n: number) => n * n;

/** Costo de un partido de dobles armado como bloque de 4: [a, b] vs [c, d]. */
function doublesBlockCost(slots: readonly Id[], start: number, h: RotationHistory): number {
  const a = slots[start] ?? '';
  const b = slots[start + 1] ?? '';
  const c = slots[start + 2] ?? '';
  const d = slots[start + 3] ?? '';
  return (
    PARTNER_WEIGHT * (sq(h.partners.get(a, b)) + sq(h.partners.get(c, d))) +
    sq(h.opponents.get(a, c)) +
    sq(h.opponents.get(a, d)) +
    sq(h.opponents.get(b, c)) +
    sq(h.opponents.get(b, d))
  );
}

/**
 * Busca la mejor distribución de una ronda intercambiando lugares (búsqueda local con reinicios).
 * Los lugares se agrupan en bloques (un partido); al intercambiar solo se recalculan los dos bloques
 * afectados. `canSwap` limita los intercambios (por ejemplo, en el mixto solo del mismo sexo).
 */
function optimizeSlots(
  initial: readonly Id[],
  blockSize: number,
  blockCost: (slots: readonly Id[], start: number) => number,
  canSwap: (i: number, j: number) => boolean,
  restarts: number,
  shuffleStart: (slots: readonly Id[]) => Id[],
): Id[] {
  const blocks = Math.floor(initial.length / blockSize);
  const totalCost = (slots: readonly Id[]) => {
    let c = 0;
    for (let b = 0; b < blocks; b++) c += blockCost(slots, b * blockSize);
    return c;
  };
  let best = [...initial];
  let bestCost = totalCost(best);
  for (let attempt = 0; attempt < restarts && bestCost > 0; attempt++) {
    const slots = attempt === 0 ? [...initial] : shuffleStart(initial);
    let current = totalCost(slots);
    let improved = true;
    while (improved && current > 0) {
      improved = false;
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          if (!canSwap(i, j)) continue;
          const bi = Math.floor(i / blockSize) * blockSize;
          const bj = Math.floor(j / blockSize) * blockSize;
          const before = blockCost(slots, bi) + (bj !== bi ? blockCost(slots, bj) : 0);
          const x = slots[i];
          const y = slots[j];
          if (x === undefined || y === undefined) continue;
          slots[i] = y;
          slots[j] = x;
          const after = blockCost(slots, bi) + (bj !== bi ? blockCost(slots, bj) : 0);
          if (after < before) {
            current += after - before;
            improved = true;
          } else {
            slots[i] = x;
            slots[j] = y;
          }
        }
      }
    }
    if (current < bestCost) {
      best = [...slots];
      bestCost = current;
    }
  }
  return best;
}

/** Agrupa parejas fijas de a dos, minimizando rivales repetidos. */
function arrangePairs(pairs: readonly [Id, Id][], h: RotationHistory, rng: Rng): [Id, Id][] {
  // Se trabaja con índices de pareja para no romperlas: cada bloque son 2 parejas.
  const pairAt = (slots: readonly Id[], k: number): [Id, Id] => pairs[Number(slots[k])] ?? ['', ''];
  const blockCost = (slots: readonly Id[], start: number) => {
    const [a, b] = pairAt(slots, start);
    const [x, y] = pairAt(slots, start + 1);
    return (
      sq(h.opponents.get(a, x)) +
      sq(h.opponents.get(a, y)) +
      sq(h.opponents.get(b, x)) +
      sq(h.opponents.get(b, y))
    );
  };
  const start = shuffle(
    pairs.map((_, i) => String(i)),
    rng,
  );
  const best = optimizeSlots(
    start,
    2,
    blockCost,
    () => true,
    20,
    (s) => shuffle(s, rng),
  );
  return best.map((_, k) => pairAt(best, k));
}

interface RoundDraft {
  resting: Id[];
  /** Cada partido: [ladoA, ladoB]. */
  matches: [Id[], Id[]][];
}

function blocksToMatches(slots: readonly Id[]): [Id[], Id[]][] {
  const matches: [Id[], Id[]][] = [];
  for (let m = 0; m + 3 < slots.length; m += 4) {
    const [a = '', b = '', c = '', d = ''] = slots.slice(m, m + 4);
    matches.push([
      [a, b],
      [c, d],
    ]);
  }
  return matches;
}

/** Cantidad de rondas de la rotación completa (cada uno juega con cada uno una vez). */
export function fullRotationRounds(
  kind: AmericanoVariant | 'mexicano',
  entrants: readonly RotationEntrant[],
): number {
  if (kind === 'mixed') {
    const men = entrants.filter((e) => e.sex === 'M').length;
    const women = entrants.filter((e) => e.sex === 'F').length;
    return Math.max(1, Math.max(men, women));
  }
  const n = entrants.length;
  return Math.max(1, n % 2 === 0 ? n - 1 : n);
}

/**
 * Genera todas las rondas de un Americano.
 * Arma varias planificaciones completas y se queda con la de menos repeticiones
 * (primero de compañeros, después de rivales).
 */
export function generateAmericano(
  entrants: readonly RotationEntrant[],
  variant: AmericanoVariant,
  roundsWanted: number | null,
  rng: Rng,
  newId: () => Id,
): { rounds: RoundPlan[]; matches: MatchPlan[] } {
  const total = roundsWanted ?? fullRotationRounds(variant, entrants);
  const n = entrants.length;
  const candidates = variant === 'singles' ? 1 : n <= 12 ? 12 : n <= 20 ? 6 : 2;
  let best: { drafts: RoundDraft[]; score: [number, number] } | null = null;
  for (let c = 0; c < candidates; c++) {
    // Se alternan dos estrategias: método del círculo (compañeros garantizados) y búsqueda libre.
    const { drafts, history } = buildAmericano(entrants, variant, total, rng, c % 2 === 0);
    const score: [number, number] = [history.partners.sumSquares(), history.opponents.sumSquares()];
    if (
      !best ||
      score[0] < best.score[0] ||
      (score[0] === best.score[0] && score[1] < best.score[1])
    ) {
      best = { drafts, score };
    }
  }
  return toPlans(best?.drafts ?? [], 1, newId);
}

function buildAmericano(
  entrants: readonly RotationEntrant[],
  variant: AmericanoVariant,
  total: number,
  rng: Rng,
  useCircle: boolean,
): { drafts: RoundDraft[]; history: RotationHistory } {
  const history = emptyHistory();
  const drafts: RoundDraft[] = [];
  const ids = entrants.map((e) => e.id);

  if (variant === 'singles') {
    if (ids.length < 2) throw new Error('Se necesitan al menos 2 jugadores.');
    let cycle: [Id | null, Id | null][][] = [];
    for (let r = 0; r < total; r++) {
      if (r % Math.max(1, cycle.length) === 0 || cycle.length === 0) {
        const base: (Id | null)[] = shuffle(ids, rng);
        if (base.length % 2 !== 0) base.push(null);
        cycle = circleRounds(base);
      }
      const pairs = cycle[r % cycle.length] ?? [];
      const resting = pairs
        .flatMap(([a, b]) => (a === null ? [b] : b === null ? [a] : []))
        .filter((x): x is Id => x !== null);
      const matches = pairs.flatMap(([a, b]): [Id[], Id[]][] =>
        a !== null && b !== null ? [[[a], [b]]] : [],
      );
      for (const [a, b] of matches) recordMatch(history, a, b);
      recordRest(history, resting, r + 1);
      drafts.push({ resting, matches });
    }
  } else if (variant === 'doubles') {
    if (ids.length < 4) throw new Error('Se necesitan al menos 4 jugadores.');
    let cycle: [Id, Id][][] = [];
    for (let r = 0; r < total; r++) {
      const roundNumber = r + 1;
      let draft: RoundDraft;
      if (ids.length % 4 === 0 && useCircle) {
        // Todos juegan: el método del círculo garantiza compañeros sin repetir durante N-1 rondas.
        if (r % Math.max(1, cycle.length) === 0 || cycle.length === 0)
          cycle = circleRounds(shuffle(ids, rng));
        const pairs = cycle[r % cycle.length] ?? [];
        const arranged = arrangePairs(pairs, history, rng);
        draft = { resting: [], matches: [] };
        for (let m = 0; m + 1 < arranged.length; m += 2) {
          draft.matches.push([[...(arranged[m] ?? [])], [...(arranged[m + 1] ?? [])]]);
        }
      } else {
        const playing = Math.floor(ids.length / 4) * 4;
        const resting = pickResting(ids, ids.length - playing, history, rng);
        const players = shuffle(
          ids.filter((id) => !resting.includes(id)),
          rng,
        );
        const slots = optimizeSlots(
          players,
          4,
          (s, start) => doublesBlockCost(s, start, history),
          () => true,
          25,
          (s) => shuffle(s, rng),
        );
        draft = { resting, matches: blocksToMatches(slots) };
      }
      for (const [a, b] of draft.matches) recordMatch(history, a, b);
      recordRest(history, draft.resting, roundNumber);
      drafts.push(draft);
    }
  } else {
    const men = shuffle(
      entrants.filter((e) => e.sex === 'M').map((e) => e.id),
      rng,
    );
    const women = shuffle(
      entrants.filter((e) => e.sex === 'F').map((e) => e.id),
      rng,
    );
    if (men.length < 2 || women.length < 2)
      throw new Error('Se necesitan al menos 2 hombres y 2 mujeres.');
    const perSex = Math.floor(Math.min(men.length, women.length) / 2) * 2;
    for (let r = 0; r < total; r++) {
      const roundNumber = r + 1;
      const restingMen = pickResting(men, men.length - perSex, history, rng);
      const restingWomen = pickResting(women, women.length - perSex, history, rng);
      const playingMen = men.filter((id) => !restingMen.includes(id));
      const playingWomen = women.filter((id) => !restingWomen.includes(id));
      // Arranque por rotación: hombre i con mujer (i + r); con todos jugando no repite compañera.
      const rotated = playingWomen.map((_, i) => playingWomen[(i + r) % playingWomen.length] ?? '');
      const initial: Id[] = [];
      for (let i = 0; i < perSex; i++) initial.push(playingMen[i] ?? '', rotated[i] ?? '');
      // Lugares pares = hombres, impares = mujeres; solo se intercambian del mismo sexo.
      const slots = optimizeSlots(
        initial,
        4,
        (s, start) => doublesBlockCost(s, start, history),
        (i, j) => i % 2 === j % 2,
        25,
        (s) => {
          const m = shuffle(
            s.filter((_, i) => i % 2 === 0),
            rng,
          );
          const w = shuffle(
            s.filter((_, i) => i % 2 === 1),
            rng,
          );
          return m.flatMap((id, i) => [id, w[i] ?? '']);
        },
      );
      const draft: RoundDraft = {
        resting: [...restingMen, ...restingWomen],
        matches: blocksToMatches(slots),
      };
      for (const [a, b] of draft.matches) recordMatch(history, a, b);
      recordRest(history, draft.resting, roundNumber);
      drafts.push(draft);
    }
  }

  return { drafts, history };
}

function toPlans(
  drafts: readonly RoundDraft[],
  firstRound: number,
  newId: () => Id,
): { rounds: RoundPlan[]; matches: MatchPlan[] } {
  const rounds: RoundPlan[] = [];
  const matches: MatchPlan[] = [];
  drafts.forEach((draft, i) => {
    const number = firstRound + i;
    rounds.push({ id: newId(), number, restingEntryIds: draft.resting });
    draft.matches.forEach(([a, b], position) => {
      matches.push({
        id: newId(),
        round: number,
        position,
        sideA: { kind: 'entries', entryIds: a },
        sideB: { kind: 'entries', entryIds: b },
      });
    });
  });
  return { rounds, matches };
}

/**
 * Genera una ronda de Mexicano a partir del orden (ranking o nivel, el mejor primero).
 * Descansan los que menos descansaron; el resto se agrupa de a 4: 1° y 4° vs 2° y 3°.
 */
export function generateMexicanoRound(
  ordered: readonly Id[],
  history: RotationHistory,
  roundNumber: number,
  rng: Rng,
  newId: () => Id,
): { rounds: RoundPlan[]; matches: MatchPlan[] } {
  if (ordered.length < 4) throw new Error('Se necesitan al menos 4 jugadores.');
  const playingCount = Math.floor(ordered.length / 4) * 4;
  const resting = pickResting(ordered, ordered.length - playingCount, history, rng);
  const playing = ordered.filter((id) => !resting.includes(id));
  const matches: [Id[], Id[]][] = [];
  for (let g = 0; g + 3 < playing.length; g += 4) {
    const [p1 = '', p2 = '', p3 = '', p4 = ''] = playing.slice(g, g + 4);
    matches.push([
      [p1, p4],
      [p2, p3],
    ]);
  }
  return toPlans([{ resting, matches }], roundNumber, newId);
}

/** Orden para la primera ronda del Mexicano: por nivel (según la lista de niveles), al azar si empatan. */
export function orderByLevel(
  entrants: readonly { id: Id; level: string }[],
  levels: readonly string[],
  rng: Rng,
): Id[] {
  const rank = (level: string) => {
    const i = levels.indexOf(level);
    return i < 0 ? levels.length : i;
  };
  return shuffle(entrants, rng)
    .sort((a, b) => rank(a.level) - rank(b.level))
    .map((e) => e.id);
}
