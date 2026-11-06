import { useSyncExternalStore } from 'react';
import { type InstallMode, installMode } from './platform';

/** Evento que Chrome dispara cuando la app se puede instalar. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Se llama al arrancar, antes de montar React: el evento beforeinstallprompt
 * puede llegar muy temprano y hay que guardarlo para usarlo cuando se toque "Instalar".
 */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

function currentMode(): InstallMode {
  if (installed) return 'installed';
  return installMode({
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    hasPrompt: deferred !== null,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Modo de instalación actual, actualizado cuando el navegador ofrece instalar o se instala. */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, currentMode, () => 'other');
}

/** Abre el diálogo de instalación del navegador. Devuelve true si el usuario aceptó. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === 'accepted') installed = true;
  notify();
  return choice.outcome === 'accepted';
}
