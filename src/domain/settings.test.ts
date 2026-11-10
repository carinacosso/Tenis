import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, addLevel, isBackupOverdue, moveLevel, removeLevel } from './settings';

describe('niveles', () => {
  it('agrega un nivel limpiando espacios', () => {
    expect(addLevel(['1ra'], '  Damas   A ')).toEqual({ ok: true, value: ['1ra', 'Damas A'] });
  });

  it('rechaza vacíos y repetidos (sin importar tildes ni mayúsculas)', () => {
    expect(addLevel(['1ra'], '   ').ok).toBe(false);
    expect(addLevel(['Iniciación'], 'iniciacion').ok).toBe(false);
  });

  it('no permite quedarse sin niveles', () => {
    expect(removeLevel(['1ra'], '1ra').ok).toBe(false);
    expect(removeLevel(['1ra', '2da'], '1ra')).toEqual({ ok: true, value: ['2da'] });
  });

  it('mueve niveles respetando los bordes', () => {
    expect(moveLevel(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveLevel(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveLevel(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveLevel(['a', 'b', 'c'], 'z', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('isBackupOverdue', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');

  it('avisa si nunca se hizo backup', () => {
    expect(isBackupOverdue(DEFAULT_SETTINGS, now)).toBe(true);
  });

  it('avisa si pasaron más de 7 días', () => {
    const settings = { ...DEFAULT_SETTINGS, lastBackupAt: '2026-03-03T11:59:00.000Z' };
    expect(isBackupOverdue(settings, now)).toBe(true);
  });

  it('no avisa si pasaron 7 días o menos', () => {
    const settings = { ...DEFAULT_SETTINGS, lastBackupAt: '2026-03-03T12:00:00.000Z' };
    expect(isBackupOverdue(settings, now)).toBe(false);
  });

  it('no avisa si el recordatorio por días está desactivado', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      backupReminder: { onTournamentFinish: true, everyDays: 0 },
    };
    expect(isBackupOverdue(settings, now)).toBe(false);
  });
});
