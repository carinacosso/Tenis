import { useEffect, useState } from 'react';
import type { PersistenceState } from '../../app/storageService';
import { useServices } from '../ServicesContext';
import { Button, Card } from './ui';
import { Loading } from './Loading';

const TEXTS: Record<PersistenceState, { title: string; body: string }> = {
  persisted: {
    title: 'Datos protegidos',
    body: 'El navegador no va a borrar tus jugadores y torneos por su cuenta.',
  },
  not_persisted: {
    title: 'Datos sin proteger',
    body: 'El navegador podría borrarlos si el teléfono se queda sin espacio o si no usás la app por un tiempo. Instalar la app y usarla seguido ayuda a que el navegador acepte protegerlos.',
  },
  unsupported: {
    title: 'Protección no disponible',
    body: 'Este navegador no permite pedir que los datos no se borren.',
  },
};

/** Estado del almacenamiento persistente, en Ajustes. */
export function StorageCard() {
  const { storage } = useServices();
  const [state, setState] = useState<PersistenceState | null>(null);

  useEffect(() => {
    let active = true;
    void storage.status().then((s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
    };
  }, [storage]);

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Almacenamiento</h2>
      {state === null ? (
        <Loading label="Revisando…" />
      ) : (
        <>
          <p
            className={`text-lg font-bold ${
              state === 'persisted'
                ? 'text-brand-800 dark:text-ball'
                : 'text-amber-700 dark:text-amber-300'
            }`}
            data-testid="estado-almacenamiento"
          >
            {state === 'persisted' ? '✓ ' : '⚠ '}
            {TEXTS[state].title}
          </p>
          <p className="text-neutral-700 dark:text-neutral-300">{TEXTS[state].body}</p>
          {state === 'not_persisted' && (
            <Button variant="secondary" onClick={() => void storage.request().then(setState)}>
              Pedir protección de nuevo
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
