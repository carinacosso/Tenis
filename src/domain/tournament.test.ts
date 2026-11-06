import { describe, expect, it } from 'vitest';
import { DEFAULT_SETS_SCORING } from './scoring';
import {
  DEFAULT_TIEBREAK_ORDER,
  type TournamentDraft,
  checkTiebreakOrder,
  hasStandings,
  tiebreakOrderOf,
  usesSeeds,
  formatChoice,
  formatFromChoice,
  formatLabel,
  isRotation,
  minEntriesFor,
  playersPerEntry,
  validateTournamentDraft,
} from './tournament';

const draft: TournamentDraft = {
  name: '  Torneo   Apertura ',
  date: '2026-03-15',
  venue: ' Club Náutico ',
  category: ' 4ta ',
  modality: 'singles',
  format: { kind: 'knockout' },
  scoring: DEFAULT_SETS_SCORING,
  maxEntries: 16,
  entryFee: 1500.555,
};

describe('validateTournamentDraft', () => {
  it('normaliza los datos válidos', () => {
    const r = validateTournamentDraft(draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      name: 'Torneo Apertura',
      venue: 'Club Náutico',
      category: '4ta',
      entryFee: 1500.56,
    });
  });

  it('marca errores', () => {
    const r = validateTournamentDraft({
      ...draft,
      name: ' ',
      date: '2026-02-30',
      category: '',
      maxEntries: 1,
      entryFee: -1,
      scoring: { ...DEFAULT_SETS_SCORING, bestOf: 1, decidingSet: 'superTiebreak' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ['category', 'date', 'entryFee', 'maxEntries', 'name', 'scoring'].sort(),
    );
  });

  it('no permite un cupo menor a los confirmados ni mayor al límite', () => {
    const r = validateTournamentDraft({ ...draft, maxEntries: 4 }, 6);
    expect(r).toEqual({ ok: false, errors: { maxEntries: 'Ya hay 6 inscriptos confirmados.' } });
    expect(validateTournamentDraft({ ...draft, maxEntries: 129 }).ok).toBe(false);
  });
});

describe('formatos rotativos', () => {
  const rotation: TournamentDraft = {
    ...draft,
    format: { kind: 'americano', variant: 'singles', rounds: null },
    scoring: { kind: 'points', target: 21 },
    modality: 'doubles',
  };

  it('fija la modalidad según el formato', () => {
    const r = validateTournamentDraft(rotation);
    expect(r.ok && r.value.modality).toBe('singles');
    const mex = validateTournamentDraft({ ...rotation, format: { kind: 'mexicano', rounds: 5 } });
    expect(mex.ok && mex.value.modality).toBe('doubles');
  });

  it('exige puntos o tiempo en rotativos y sets en eliminación directa', () => {
    expect(validateTournamentDraft({ ...rotation, scoring: DEFAULT_SETS_SCORING }).ok).toBe(false);
    expect(
      validateTournamentDraft({ ...rotation, scoring: { kind: 'time', minutes: 15 } }).ok,
    ).toBe(true);
    expect(validateTournamentDraft({ ...draft, scoring: { kind: 'points', target: 21 } }).ok).toBe(
      false,
    );
  });

  it('valida la cantidad de rondas', () => {
    const bad = validateTournamentDraft({
      ...rotation,
      format: { kind: 'americano', variant: 'doubles', rounds: 0 },
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.format).toBeDefined();
  });

  it('mínimos y jugadores por inscripción', () => {
    expect(minEntriesFor({ kind: 'mexicano', rounds: null })).toBe(4);
    expect(minEntriesFor({ kind: 'americano', variant: 'singles', rounds: null })).toBe(2);
    expect(
      playersPerEntry({ modality: 'doubles', format: { kind: 'mexicano', rounds: null } }),
    ).toBe(1);
    expect(playersPerEntry({ modality: 'doubles', format: { kind: 'knockout' } })).toBe(2);
  });

  it('etiquetas y conversión de formato', () => {
    const f = formatFromChoice('americano_mixed', 4);
    expect(f).toEqual({ kind: 'americano', variant: 'mixed', rounds: 4 });
    expect(formatChoice(f)).toBe('americano_mixed');
    expect(formatLabel(f)).toBe('Americano mixto');
    expect(isRotation(f)).toBe(true);
    expect(isRotation({ kind: 'knockout' })).toBe(false);
  });
});

describe('grupos y liga', () => {
  const groups: TournamentDraft = {
    ...draft,
    format: { kind: 'groups', groupCount: 3, qualifiersPerGroup: 2 },
  };

  it('valida grupos y clasificados', () => {
    expect(validateTournamentDraft(groups).ok).toBe(true);
    const bad = validateTournamentDraft({
      ...groups,
      format: { kind: 'groups', groupCount: 1, qualifiersPerGroup: 2 },
    });
    expect(bad.ok).toBe(false);
    const badQ = validateTournamentDraft({
      ...groups,
      format: { kind: 'groups', groupCount: 2, qualifiersPerGroup: 5 },
    });
    expect(badQ.ok).toBe(false);
  });

  it('se juegan por sets y la modalidad es libre', () => {
    expect(validateTournamentDraft({ ...groups, scoring: { kind: 'points', target: 21 } }).ok).toBe(
      false,
    );
    const league = validateTournamentDraft({
      ...draft,
      modality: 'doubles',
      format: { kind: 'league', doubleRound: true },
    });
    expect(league.ok && league.value.modality).toBe('doubles');
    expect(isRotation({ kind: 'league', doubleRound: false })).toBe(false);
  });

  it('valida el orden de desempate', () => {
    expect(
      validateTournamentDraft({
        ...groups,
        tiebreakOrder: ['headToHead', 'wins', 'gameDiff', 'setDiff'],
      }).ok,
    ).toBe(true);
    expect(
      validateTournamentDraft({ ...groups, tiebreakOrder: ['wins', 'wins', 'gameDiff', 'setDiff'] })
        .ok,
    ).toBe(false);
    expect(checkTiebreakOrder(DEFAULT_TIEBREAK_ORDER)).toBeNull();
    expect(tiebreakOrderOf({})).toEqual(['wins', 'setDiff', 'gameDiff', 'headToHead']);
  });

  it('mínimos, cabezas de serie y tablas', () => {
    expect(minEntriesFor({ kind: 'groups', groupCount: 3, qualifiersPerGroup: 1 })).toBe(6);
    expect(minEntriesFor({ kind: 'league', doubleRound: false })).toBe(3);
    expect(usesSeeds({ kind: 'groups', groupCount: 2, qualifiersPerGroup: 1 })).toBe(true);
    expect(usesSeeds({ kind: 'league', doubleRound: false })).toBe(false);
    expect(hasStandings({ kind: 'league', doubleRound: false })).toBe(true);
    expect(hasStandings({ kind: 'knockout' })).toBe(false);
    expect(formatLabel(formatFromChoice('groups'))).toBe('Grupos + playoffs');
  });
});
