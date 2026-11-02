import { describe, expect, it } from 'vitest';
import { DEFAULT_SETS_SCORING } from './scoring';
import { type TournamentDraft, validateTournamentDraft } from './tournament';

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
