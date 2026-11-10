import { describe, expect, it } from 'vitest';
import { installMode, isIos } from './platform';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('instalación', () => {
  it('detecta iPhone y iPad (también el iPad que se presenta como Mac)', () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIos(IPAD_DESKTOP, 0)).toBe(false);
    expect(isIos(ANDROID, 5)).toBe(false);
  });

  it('elige el modo de instalación', () => {
    const base = { userAgent: ANDROID, standalone: false, hasPrompt: false, maxTouchPoints: 5 };
    expect(installMode({ ...base, standalone: true, hasPrompt: true })).toBe('installed');
    expect(installMode({ ...base, hasPrompt: true })).toBe('prompt');
    expect(installMode({ ...base, userAgent: IPHONE })).toBe('ios');
    expect(installMode(base)).toBe('other');
  });
});
