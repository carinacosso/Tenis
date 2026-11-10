import type { Repositories } from '../data/ports';

/**
 * Comprueba que la base de datos responda dentro de un tiempo razonable.
 * En iPhone, cuando la app vuelve de segundo plano, la conexión con la base
 * puede quedar colgada sin dar error; en ese caso conviene reabrir la app.
 */
export class HealthService {
  constructor(
    private readonly repos: Repositories,
    private readonly timeoutMs = 2500,
  ) {}

  async isDatabaseResponsive(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), this.timeoutMs);
    });
    try {
      return await Promise.race([this.repos.ping().then(() => true), timeout]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
