import { useCallback, useState } from 'react';

export type ToastMessage = { id: number; text: string } | null;

/** Estado del Toast: `show(texto)` lo muestra (aunque el texto se repita). */
export function useToast(): [ToastMessage, (text: string) => void] {
  const [message, setMessage] = useState<ToastMessage>(null);
  const show = useCallback(
    (text: string) => setMessage((prev) => ({ id: (prev?.id ?? 0) + 1, text })),
    [],
  );
  return [message, show];
}

/** Mensaje breve que se oculta solo. Cambiar `message.id` para volver a mostrarlo. */
