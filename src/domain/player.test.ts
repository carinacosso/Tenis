import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLAYER_DRAFT,
  type PlayerDraft,
  comparePlayers,
  findPossibleDuplicates,
  fullName,
  isValidPhone,
  matchesPlayerQuery,
  normalizePhone,
  searchPlayers,
  shortName,
  validatePlayerDraft,
} from './player';
import { DEFAULT_LEVELS } from './settings';
import { makePlayer } from './testFactories';

const validDraft: PlayerDraft = {
  firstName: '  Ana   María ',
  lastName: ' Gómez ',
  phone: '+54 9 11 5555-1234',
  sex: 'F',
  level: '3ra',
  notes: '  zurda  ',
};

describe('validatePlayerDraft', () => {
  it('normaliza espacios, teléfono y notas cuando los datos son válidos', () => {
    const result = validatePlayerDraft(validDraft, DEFAULT_LEVELS);
    expect(result).toEqual({
      ok: true,
      value: {
        firstName: 'Ana María',
        lastName: 'Gómez',
        phone: '+5491155551234',
        sex: 'F',
        level: '3ra',
        notes: 'zurda',
      },
    });
  });

  it('acepta jugador sin sexo', () => {
    const result = validatePlayerDraft({ ...validDraft, sex: null }, DEFAULT_LEVELS);
    expect(result.ok).toBe(true);
  });

  it('marca como obligatorios nombre, apellido, teléfono y nivel', () => {
    const result = validatePlayerDraft(EMPTY_PLAYER_DRAFT, DEFAULT_LEVELS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['firstName', 'lastName', 'level', 'phone']);
  });

  it('rechaza un nivel que no está en la lista', () => {
    const result = validatePlayerDraft({ ...validDraft, level: 'Pro' }, DEFAULT_LEVELS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.level).toBe('El nivel no está en la lista.');
  });

  it('rechaza teléfonos inválidos', () => {
    const result = validatePlayerDraft({ ...validDraft, phone: 'abc123' }, DEFAULT_LEVELS);
    expect(result.ok).toBe(false);
  });

  it('rechaza nombres demasiado largos', () => {
    const result = validatePlayerDraft(
      { ...validDraft, firstName: 'a'.repeat(61) },
      DEFAULT_LEVELS,
    );
    expect(result.ok).toBe(false);
  });
});

describe('teléfono', () => {
  it.each([
    ['+54 9 11 5555-1234', true],
    ['(011) 4555-1234', true],
    ['1155551234', true],
    ['12345', false],
    ['1234567890123456', false],
    ['11 5555 abcd', false],
    ['11+5555', false],
  ])('isValidPhone(%s) = %s', (phone, expected) => {
    expect(isValidPhone(phone)).toBe(expected);
  });

  it('normalizePhone deja solo dígitos y el + inicial', () => {
    expect(normalizePhone(' +54 (11) 5555-1234 ')).toBe('+541155551234');
    expect(normalizePhone('011 4555-1234')).toBe('01145551234');
  });
});

describe('nombres', () => {
  it('fullName y shortName', () => {
    const p = makePlayer({ firstName: 'juan', lastName: 'Pérez' });
    expect(fullName(p)).toBe('juan Pérez');
    expect(shortName(p)).toBe('J. Pérez');
  });
});

describe('búsqueda', () => {
  const jose = makePlayer({
    id: '1',
    firstName: 'José',
    lastName: 'Núñez',
    phone: '1144440000',
    level: '5ta',
  });
  const anaAlvarez = makePlayer({
    id: '2',
    firstName: 'Ana',
    lastName: 'Álvarez',
    phone: '1133330000',
    level: '3ra',
  });
  const anaZapata = makePlayer({
    id: '3',
    firstName: 'Ana',
    lastName: 'Zapata',
    phone: '1122220000',
    level: '3ra',
  });
  const borrado = makePlayer({
    id: '4',
    firstName: 'Borrado',
    lastName: 'Alvarez',
    deletedAt: '2026-02-01T00:00:00.000Z',
  });
  const players = [jose, anaAlvarez, anaZapata, borrado];

  it('ignora tildes y mayúsculas', () => {
    expect(matchesPlayerQuery(jose, 'jose nunez')).toBe(true);
    expect(matchesPlayerQuery(anaAlvarez, 'ALVAREZ')).toBe(true);
  });

  it('exige que todas las palabras coincidan', () => {
    expect(matchesPlayerQuery(anaAlvarez, 'ana zapata')).toBe(false);
    expect(matchesPlayerQuery(anaZapata, 'ana zapata')).toBe(true);
  });

  it('busca por teléfono y nivel', () => {
    expect(searchPlayers(players, '4444').map((p) => p.id)).toEqual(['1']);
    expect(searchPlayers(players, '3ra').map((p) => p.id)).toEqual(['2', '3']);
  });

  it('excluye borrados y ordena por apellido', () => {
    expect(searchPlayers(players, '').map((p) => p.id)).toEqual(['2', '1', '3']);
  });

  it('comparePlayers ordena por apellido y después por nombre', () => {
    const a = makePlayer({ firstName: 'Bruno', lastName: 'Díaz' });
    const b = makePlayer({ firstName: 'Ana', lastName: 'diaz' });
    expect(comparePlayers(a, b)).toBeGreaterThan(0);
  });
});

describe('findPossibleDuplicates', () => {
  const players = [
    makePlayer({ id: '1', firstName: 'José', lastName: 'Núñez', phone: '1144440000' }),
    makePlayer({ id: '2', firstName: 'Ana', lastName: 'Gómez', phone: '1133330000' }),
  ];

  it('detecta mismo nombre sin importar tildes', () => {
    const draft = { ...EMPTY_PLAYER_DRAFT, firstName: 'jose', lastName: 'nunez' };
    expect(findPossibleDuplicates(players, draft).map((p) => p.id)).toEqual(['1']);
  });

  it('detecta mismo teléfono', () => {
    const draft = { ...EMPTY_PLAYER_DRAFT, firstName: 'X', lastName: 'Y', phone: '11 3333-0000' };
    expect(findPossibleDuplicates(players, draft).map((p) => p.id)).toEqual(['2']);
  });

  it('excluye al propio jugador al editar', () => {
    const draft = { ...EMPTY_PLAYER_DRAFT, firstName: 'José', lastName: 'Núñez' };
    expect(findPossibleDuplicates(players, draft, '1')).toEqual([]);
  });
});
