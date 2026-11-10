import { useEffect } from 'react';
import type { ThemePreference } from '../../domain/settings';

/** Aplica la preferencia de tema al documento y la recuerda para el próximo arranque. */
export function useApplyTheme(theme: ThemePreference | undefined): void {
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Sin localStorage (modo privado): solo se pierde evitar el parpadeo inicial.
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#0a0a0a' : '#14532d');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
