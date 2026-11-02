import type { ValidationResult } from '../domain/common';
import {
  type AppSettings,
  type ThemePreference,
  addLevel,
  moveLevel,
  removeLevel,
} from '../domain/settings';
import type { ErrorListener, Listener, Repositories, Unsubscribe } from '../data/ports';

export class SettingsService {
  constructor(private readonly repos: Repositories) {}

  get(): Promise<AppSettings> {
    return this.repos.settings.get();
  }

  observe(listener: Listener<AppSettings>, onError?: ErrorListener): Unsubscribe {
    return this.repos.settings.observe(listener, onError);
  }

  private async patch(change: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...(await this.repos.settings.get()), ...change };
    await this.repos.settings.save(next);
    return next;
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    await this.patch({ theme });
  }

  async addLevel(level: string): Promise<ValidationResult<string[]>> {
    const result = addLevel((await this.get()).levels, level);
    if (result.ok) await this.patch({ levels: result.value });
    return result;
  }

  /** No permite quitar un nivel que tienen asignado jugadores activos. */
  async removeLevel(level: string): Promise<ValidationResult<string[]>> {
    const inUse = (await this.repos.players.listActive()).filter((p) => p.level === level).length;
    if (inUse > 0) {
      const who = inUse === 1 ? '1 jugador tiene' : `${inUse} jugadores tienen`;
      return { ok: false, errors: { level: `No se puede quitar: ${who} ese nivel.` } };
    }
    const result = removeLevel((await this.get()).levels, level);
    if (result.ok) await this.patch({ levels: result.value });
    return result;
  }

  async moveLevel(level: string, direction: -1 | 1): Promise<void> {
    await this.patch({ levels: moveLevel((await this.get()).levels, level, direction) });
  }
}
