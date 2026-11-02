import type { Rng } from '../domain/random';

/** Dependencias externas inyectables, para que los servicios sean deterministas en tests. */
export interface AppDeps {
  now: () => Date;
  newId: () => string;
  random: Rng;
}

export const browserDeps: AppDeps = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
  random: () => Math.random(),
};
