import { useEffect, useState } from 'react';
import { Button } from './ui';

/** Tiempo tras el cual "Cargando…" pasa a ofrecer reabrir la app. */
export const SLOW_LOADING_MS = 8000;

/**
 * Indicador de carga. Si tarda demasiado (por ejemplo, porque la base de datos del teléfono
 * quedó colgada), ofrece reabrir la app en lugar de quedarse esperando para siempre.
 */
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!slow) {
    return (
      <p aria-busy="true" className="text-lg">
        {label}
      </p>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-amber-100 p-4 text-amber-950">
      <p className="text-lg font-semibold">Está tardando más de lo normal.</p>
      <p>
        A veces pasa cuando la app vuelve de estar en segundo plano. Reabrila: tus datos quedan
        guardados.
      </p>
      <Button onClick={() => window.location.reload()}>Reabrir la app</Button>
    </div>
  );
}
