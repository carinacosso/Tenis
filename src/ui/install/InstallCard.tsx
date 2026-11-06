import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import { promptInstall, useInstallMode } from './installState';

const WHY =
  'Instalada abre más rápido, funciona sin internet y el teléfono cuida mejor los datos guardados.';

/**
 * Botón "Instalar app" con su explicación. No se muestra si la app ya está instalada.
 * En Android/Chrome instala con un toque; en iPhone y otros navegadores muestra los pasos.
 */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const mode = useInstallMode();
  const [steps, setSteps] = useState(false);
  if (mode === 'installed') return null;

  const onInstall = () => {
    if (mode === 'prompt') void promptInstall();
    else setSteps(true);
  };

  return (
    <Card className="flex flex-col gap-3 border-brand-700 dark:border-ball">
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden="true">
          📲
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Instalá la app</h2>
          {!compact && <p className="text-neutral-700 dark:text-neutral-300">{WHY}</p>}
        </div>
      </div>
      <Button onClick={onInstall}>Instalar app</Button>
      <InstallSteps open={steps} ios={mode === 'ios'} onClose={() => setSteps(false)} />
    </Card>
  );
}

function InstallSteps({
  open,
  ios,
  onClose,
}: {
  open: boolean;
  ios: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const steps = ios
    ? [
        'Abrí esta página en Safari.',
        'Tocá el botón Compartir (el cuadrado con la flecha hacia arriba), abajo en el centro de la pantalla.',
        'Deslizá hacia abajo y tocá "Agregar a inicio".',
        'Tocá "Agregar". La app aparece en tu pantalla de inicio: abrila siempre desde ahí.',
      ]
    : [
        'Tocá el menú del navegador (los tres puntos ⋮, arriba a la derecha).',
        'Elegí "Instalar app" o "Agregar a la pantalla principal".',
        'Confirmá. La app aparece en tu pantalla de inicio: abrila siempre desde ahí.',
      ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="install-title" className="text-2xl font-bold">
          {ios ? 'Instalar en iPhone' : 'Instalar la app'}
        </h2>
        <ol className="mt-4 flex list-decimal flex-col gap-3 pl-6 text-lg">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-4 text-neutral-700 dark:text-neutral-300">{WHY}</p>
        <Button ref={closeRef} className="mt-6 w-full" onClick={onClose}>
          Entendido
        </Button>
      </div>
    </div>
  );
}
