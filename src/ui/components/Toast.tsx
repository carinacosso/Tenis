import { useEffect, useState } from 'react';
import type { ToastMessage } from '../hooks/useToast';

export function Toast({ message }: { message: ToastMessage }) {
  const [visibleId, setVisibleId] = useState<number | null>(null);

  useEffect(() => {
    if (!message) return;
    const show = setTimeout(() => setVisibleId(message.id), 0);
    const hide = setTimeout(() => setVisibleId(null), 2500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [message]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center"
    >
      {message && visibleId === message.id && (
        <p className="rounded-2xl bg-neutral-900 px-5 py-3 text-lg font-semibold text-white shadow-xl dark:bg-neutral-100 dark:text-neutral-950">
          {message.text}
        </p>
      )}
    </div>
  );
}
