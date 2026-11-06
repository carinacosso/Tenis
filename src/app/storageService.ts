/** Acceso al almacenamiento persistente del navegador (navigator.storage). */
export interface StoragePort {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

/**
 * persisted: el navegador no va a borrar los datos por su cuenta.
 * not_persisted: puede borrarlos si falta espacio o si no se usa la app por un tiempo.
 * unsupported: el navegador no ofrece esta protección.
 */
export type PersistenceState = 'persisted' | 'not_persisted' | 'unsupported';

export class StorageService {
  constructor(private readonly port: StoragePort | null) {}

  async status(): Promise<PersistenceState> {
    if (!this.port) return 'unsupported';
    try {
      return (await this.port.persisted()) ? 'persisted' : 'not_persisted';
    } catch {
      return 'unsupported';
    }
  }

  /** Pide que los datos no se borren. Si ya estaba concedido, no vuelve a pedir. */
  async request(): Promise<PersistenceState> {
    if (!this.port) return 'unsupported';
    try {
      if (await this.port.persisted()) return 'persisted';
      return (await this.port.persist()) ? 'persisted' : 'not_persisted';
    } catch {
      return 'unsupported';
    }
  }
}

/** Implementación del navegador, o null si no existe navigator.storage.persist. */
export function browserStoragePort(): StoragePort | null {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  return {
    persisted: () => navigator.storage.persisted(),
    persist: () => navigator.storage.persist(),
  };
}
