import { describe, expect, it } from 'vitest';
import { StorageService, type StoragePort } from './storageService';

function fakePort(initial: boolean, grant: boolean) {
  let persisted = initial;
  let asked = 0;
  const port: StoragePort = {
    persisted: async () => persisted,
    persist: async () => {
      asked++;
      persisted = grant;
      return grant;
    },
  };
  return { port, asked: () => asked };
}

describe('StorageService', () => {
  it('pide la protección y la informa', async () => {
    const { port, asked } = fakePort(false, true);
    const service = new StorageService(port);
    expect(await service.status()).toBe('not_persisted');
    expect(await service.request()).toBe('persisted');
    expect(await service.status()).toBe('persisted');
    expect(asked()).toBe(1);
  });

  it('si ya estaba protegido no vuelve a pedir', async () => {
    const { port, asked } = fakePort(true, true);
    expect(await new StorageService(port).request()).toBe('persisted');
    expect(asked()).toBe(0);
  });

  it('si el navegador lo niega queda sin proteger', async () => {
    const { port } = fakePort(false, false);
    expect(await new StorageService(port).request()).toBe('not_persisted');
  });

  it('sin soporte o con error devuelve unsupported', async () => {
    expect(await new StorageService(null).request()).toBe('unsupported');
    const failing: StoragePort = {
      persisted: () => Promise.reject(new Error('x')),
      persist: () => Promise.reject(new Error('x')),
    };
    expect(await new StorageService(failing).status()).toBe('unsupported');
  });
});
