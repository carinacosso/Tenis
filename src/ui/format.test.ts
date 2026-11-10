import { describe, expect, it } from 'vitest';
import { formatBuildTime } from './format';

describe('formatBuildTime', () => {
  it('muestra fecha y hora de la versión', () => {
    expect(formatBuildTime('2026-11-10T16:05:00.000Z', 'America/Argentina/Buenos_Aires')).toBe(
      'del 10/11/2026 a las 13:05',
    );
  });

  it('una fecha inválida no muestra nada', () => {
    expect(formatBuildTime('no es fecha')).toBe('');
  });
});
