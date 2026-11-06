import type { Rng } from '../domain/random';
import { type StoragePort, browserStoragePort } from './storageService';

/** Dependencias externas inyectables, para que los servicios sean deterministas en tests. */
export interface AppDeps {
  now: () => Date;
  newId: () => string;
  random: Rng;
  /** Almacenamiento persistente del navegador (null o sin definir = no disponible). */
  storage?: StoragePort | null;
}

export const browserDeps: AppDeps = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
  random: () => Math.random(),
  storage: browserStoragePort(),
};
