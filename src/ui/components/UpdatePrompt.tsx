import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

/** Aviso de "Nueva versión disponible" cuando el service worker detecta una actualización. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl bg-neutral-900 p-4 text-white shadow-xl dark:bg-neutral-100 dark:text-neutral-950"
    >
      <p className="text-lg font-semibold">Hay una nueva versión disponible.</p>
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => void updateServiceWorker(true)}>Actualizar</Button>
        <Button
          variant="ghost"
          className="text-inherit dark:text-inherit"
          onClick={() => setNeedRefresh(false)}
        >
          Más tarde
        </Button>
      </div>
    </div>
  );
}
