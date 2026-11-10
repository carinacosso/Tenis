import { describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '../data/memory/memoryRepositories';
import { HealthService } from './healthService';

describe('HealthService', () => {
  it('la base responde', async () => {
    expect(await new HealthService(createMemoryRepositories()).isDatabaseResponsive()).toBe(true);
  });

  it('si la base queda colgada, avisa que no responde', async () => {
    const repos = { ...createMemoryRepositories(), ping: () => new Promise<void>(() => undefined) };
    expect(await new HealthService(repos, 20).isDatabaseResponsive()).toBe(false);
  });

  it('si la base da error, avisa que no responde', async () => {
    const repos = {
      ...createMemoryRepositories(),
      ping: () => Promise.reject(new Error('cerrada')),
    };
    expect(await new HealthService(repos, 20).isDatabaseResponsive()).toBe(false);
  });
});
