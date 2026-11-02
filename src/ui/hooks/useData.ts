import { useCallback } from 'react';
import type { ErrorListener, Listener } from '../../data/ports';
import type { Player } from '../../domain/player';
import type { AppSettings } from '../../domain/settings';
import { useServices } from '../ServicesContext';
import { type Observed, useObservable } from './useObservable';

export function useActivePlayers(): Observed<Player[]> {
  const { players } = useServices();
  return useObservable(
    useCallback(
      (listener: Listener<Player[]>, onError: ErrorListener) =>
        players.observeActive(listener, onError),
      [players],
    ),
  );
}

export function useSettings(): Observed<AppSettings> {
  const { settings } = useServices();
  return useObservable(
    useCallback(
      (listener: Listener<AppSettings>, onError: ErrorListener) =>
        settings.observe(listener, onError),
      [settings],
    ),
  );
}
