/** Dependencias externas inyectables, para que los servicios sean deterministas en tests. */
export interface AppDeps {
  now: () => Date;
  newId: () => string;
}

export const browserDeps: AppDeps = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};
