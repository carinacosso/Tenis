import { describe, expect, it } from 'vitest';
import { generateGroupStage } from './groups';
import { applyKnockoutResult, generateKnockout, resolveKnockout } from './knockout';
import type { Match } from './match';
import { type TournamentBundle, playerHistory } from './playerHistory';
import { seededRng } from './random';
import { generateAmericano } from './rotation';
import { type MatchResult, buildWalkover, DEFAULT_SETS_SCORING } from './scoring';
import { makeEntry, makeTournament, toMatches, win } from './testFactories';

function idGen(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Inscripción de un jugador "pN" con id "eN". */
const entry = (n: number, tournamentId = 't-1') =>
  makeEntry({ id: `e${n}`, playerIds: [`p${n}`], tournamentId });

/** Juega todo el cuadro haciendo ganar siempre al lado A. */
function playAll(matches: Match[]): Match[] {
  let current = matches;
  for (;;) {
    const ready = [...resolveKnockout(current).values()].find((r) => r.state === 'ready');
    if (!ready) return current;
    current = applyKnockoutResult(current, ready.match.id, win('A')).matches;
  }
}

function knockoutBundle(count: number, finished: boolean): TournamentBundle {
  const entries = Array.from({ length: count }, (_, i) => entry(i + 1));
  const plans = generateKnockout(
    entries.map((e) => ({ id: e.id, seed: null })),
    seededRng(3),
    idGen('k'),
  );
  const matches = finished ? playAll(toMatches(plans)) : toMatches(plans);
  return {
    tournament: makeTournament({
      status: finished ? 'finished' : 'in_progress',
      drawGeneratedAt: '2026-01-02T00:00:00.000Z',
    }),
    entries,
    matches,
    rounds: [],
    groups: [],
  };
}

describe('playerHistory', () => {
  it('eliminación directa: campeón, subcampeón y ronda en la que perdió', () => {
    const bundle = knockoutBundle(4, true);
    const resolved = [...resolveKnockout(bundle.matches).values()];
    const final = resolved.find((r) => r.match.round === 2);
    const semi = resolved.find((r) => r.match.round === 1);
    const player = (entryId: string | null | undefined) => (entryId ?? '').replace('e', 'p');

    const champ = playerHistory(player(final?.winner), [bundle]);
    expect(champ.records[0]).toMatchObject({
      placement: 'Campeón',
      champion: true,
      podium: true,
      won: 2,
    });
    expect(champ.stats).toMatchObject({
      tournaments: 1,
      titles: 1,
      podiums: 1,
      played: 2,
      won: 2,
      winRate: 100,
    });
    expect(champ.stats.setsWon).toBe(4);
    expect(champ.stats.gamesWon).toBe(24);

    expect(playerHistory(player(final?.loser), [bundle]).records[0]?.placement).toBe('Subcampeón');
    const loser = playerHistory(player(semi?.loser), [bundle]);
    expect(loser.records[0]).toMatchObject({ placement: 'Perdió en semifinal', podium: true });
    expect(loser.stats).toMatchObject({ played: 1, won: 0, lost: 1, winRate: 0 });
  });

  it('torneo en juego y torneo sin empezar', () => {
    const playing = playerHistory('p1', [knockoutBundle(4, false)]);
    expect(playing.records[0]?.placement).toBe('En juego');
    const notStarted: TournamentBundle = {
      ...knockoutBundle(4, false),
      tournament: makeTournament(),
    };
    const r = playerHistory('p1', [notStarted]);
    expect(r.records[0]?.placement).toBe('Inscripto (todavía no empezó)');
    expect(r.stats.tournaments).toBe(0);
  });

  it('no cuenta lista de espera, bajas, torneos borrados ni W.O.', () => {
    const bundle = knockoutBundle(2, false);
    const [m] = bundle.matches;
    if (!m) throw new Error();
    const wo = buildWalkover(DEFAULT_SETS_SCORING, 'A');
    if (!wo.ok) throw new Error();
    const withWo = {
      ...bundle,
      matches: applyKnockoutResult(bundle.matches, m.id, wo.result).matches,
    };
    const result = playerHistory('p1', [withWo]);
    expect(result.stats.played).toBe(0);

    const waiting = { ...bundle, entries: [{ ...entry(1), status: 'waitlist' as const }] };
    expect(playerHistory('p1', [waiting]).records).toHaveLength(0);
    const deleted = {
      ...bundle,
      tournament: { ...bundle.tournament, deletedAt: '2026-01-03T00:00:00.000Z' },
    };
    expect(playerHistory('p1', [deleted]).records).toHaveLength(0);
  });

  it('el abandono cuenta como partido y suma solo lo jugado', () => {
    const bundle = knockoutBundle(2, false);
    const [m] = bundle.matches;
    if (!m || m.sideA.kind !== 'entry') throw new Error();
    const retired: MatchResult = {
      kind: 'sets',
      outcome: 'retired',
      sets: [{ a: 4, b: 2 }],
      winner: 'B',
    };
    const played = {
      ...bundle,
      matches: applyKnockoutResult(bundle.matches, m.id, retired).matches,
    };
    const sideA = playerHistory(m.sideA.entryId.replace('e', 'p'), [played]);
    expect(sideA.stats).toMatchObject({
      played: 1,
      lost: 1,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 4,
      gamesLost: 2,
    });
  });

  it('un set a medias empatado tampoco cuenta como set', () => {
    const bundle = knockoutBundle(2, false);
    const [m] = bundle.matches;
    if (!m || m.sideB.kind !== 'entry') throw new Error();
    const retired: MatchResult = {
      kind: 'sets',
      outcome: 'retired',
      sets: [{ a: 2, b: 2 }],
      winner: 'A',
    };
    const played = {
      ...bundle,
      matches: applyKnockoutResult(bundle.matches, m.id, retired).matches,
    };
    const sideB = playerHistory(m.sideB.entryId.replace('e', 'p'), [played]);
    expect(sideB.stats).toMatchObject({ setsWon: 0, setsLost: 0, gamesWon: 2, gamesLost: 2 });
  });

  it('dobles: muestra al compañero', () => {
    const bundle = knockoutBundle(2, false);
    const pair = {
      ...bundle,
      entries: [makeEntry({ id: 'e1', playerIds: ['p1', 'p9'] }), entry(2)],
    };
    expect(playerHistory('p9', [pair]).records[0]?.partnerIds).toEqual(['p1']);
  });

  it('liga y Americano: puesto en la tabla y puntos', () => {
    const entries = [1, 2, 3].map((n) => entry(n));
    const stage = generateGroupStage(
      [{ id: 'g', name: 'Liga', index: 0, entryIds: entries.map((e) => e.id) }],
      false,
      seededRng(4),
      idGen('l'),
    );
    const matches = toMatches(stage.matches).map((m) => ({ ...m, result: win('A') }));
    const league: TournamentBundle = {
      tournament: makeTournament({
        id: 't-1',
        format: { kind: 'league', doubleRound: false },
        status: 'finished',
        drawGeneratedAt: '2026-01-02T00:00:00.000Z',
      }),
      entries,
      matches,
      rounds: [],
      groups: [
        {
          ...makeEntry(),
          id: 'g',
          name: 'Liga',
          index: 0,
          entryIds: entries.map((e) => e.id),
          tournamentId: 't-1',
        },
      ],
    };
    const placements = [1, 2, 3].map(
      (n) => playerHistory(`p${n}`, [league]).records[0]?.placement ?? '',
    );
    expect(placements.filter((p) => p.startsWith('Campeón (1.º de 3)'))).toHaveLength(1);
    expect(placements.some((p) => p === '3.º de 3')).toBe(true);

    const rot = generateAmericano(
      [1, 2, 3, 4].map((n) => ({ id: `e${n}`, sex: null })),
      'doubles',
      1,
      seededRng(1),
      idGen('r'),
    );
    const points = (a: number, b: number): MatchResult => ({
      kind: 'points',
      outcome: 'normal',
      a,
      b,
      winner: a > b ? 'A' : 'B',
    });
    const americano: TournamentBundle = {
      tournament: makeTournament({
        format: { kind: 'americano', variant: 'doubles', rounds: 1 },
        scoring: { kind: 'points', target: 21 },
        status: 'in_progress',
        drawGeneratedAt: '2026-01-02T00:00:00.000Z',
      }),
      entries: [1, 2, 3, 4].map((n) => entry(n)),
      matches: toMatches(rot.matches).map((m) => ({ ...m, result: points(21, 15) })),
      rounds: rot.rounds.map((r) => ({ ...makeEntry(), ...r, tournamentId: 't-1' })),
      groups: [],
    };
    const p1 = playerHistory('p1', [americano]);
    expect(p1.records[0]?.placement).toMatch(/^En juego \(va [1-4]\.º de 4\)$/);
    expect(p1.stats.pointsFor + p1.stats.pointsAgainst).toBe(36);
  });

  it('ordena por fecha, el más reciente primero', () => {
    const a = knockoutBundle(2, false);
    const b = {
      ...knockoutBundle(2, false),
      tournament: { ...a.tournament, id: 't-2', name: 'Otro', date: '2026-09-01' },
    };
    expect(playerHistory('p1', [a, b]).records.map((r) => r.name)).toEqual([
      'Otro',
      'Torneo de prueba',
    ]);
  });
});
