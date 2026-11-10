import { useEffect, useState } from 'react';
import { Button } from './ui';

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  return typeof reason === 'string' ? reason : 'Error desconocido';
}

/**
 * Muestra cualquier error que no se haya manejado en la pantalla, en lugar de que la acción
 * "no haga nada". El detalle sirve para reportar el problema.
 */
export function ErrorBanner() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => setError(messageOf(event.reason));
    const onError = (event: ErrorEvent) => setError(messageOf(event.error ?? event.message));
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  if (!error) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl bg-red-700 p-4 text-white shadow-xl"
    >
      <p className="text-lg font-bold">Algo salió mal y no se pudo completar.</p>
      <p className="text-sm break-words opacity-90" data-testid="detalle-error">
        {error}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button className="bg-white text-red-800" onClick={() => window.location.reload()}>
          Reabrir la app
        </Button>
        <Button variant="ghost" className="text-white" onClick={() => setError(null)}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
