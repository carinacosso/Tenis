/**
 * Cómo se puede instalar la app en este dispositivo:
 * - installed: ya está instalada (se abrió desde la pantalla de inicio).
 * - prompt: el navegador ofrece instalar con un toque (Chrome/Edge en Android y escritorio).
 * - ios: iPhone/iPad, se instala desde el botón Compartir → "Agregar a inicio".
 * - other: otro navegador; se muestran instrucciones generales.
 */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'other';

export interface PlatformInfo {
  userAgent: string;
  /** display-mode: standalone, o navigator.standalone en iOS. */
  standalone: boolean;
  /** Hay un evento beforeinstallprompt guardado. */
  hasPrompt: boolean;
  maxTouchPoints: number;
}

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS se presenta como Mac de escritorio, pero tiene pantalla táctil.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function installMode(info: PlatformInfo): InstallMode {
  if (info.standalone) return 'installed';
  if (info.hasPrompt) return 'prompt';
  if (isIos(info.userAgent, info.maxTouchPoints)) return 'ios';
  return 'other';
}
