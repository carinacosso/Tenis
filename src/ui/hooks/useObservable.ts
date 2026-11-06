import { useEffect, useState } from 'react';
import type { ErrorListener, Listener, Unsubscribe } from '../../data/ports';

export type Observed<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

/**
 * Se suscribe a una fuente observable de los servicios y devuelve su último valor.
 * `subscribe` debe ser estable (por ejemplo, envuelto en useCallback).
 */
export function useObservable<T>(
  subscribe: (listener: Listener<T>, onError: ErrorListener) => Unsubscribe,
): Observed<T> {
  const [state, setState] = useState<Observed<T>>({ status: 'loading' });
  useEffect(
    () =>
      subscribe(
        (data) => setState({ status: 'ready', data }),
        (error) => setState({ status: 'error', error }),
      ),
    [subscribe],
  );
  return state;
}
