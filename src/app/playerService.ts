import { LOCAL_OWNER, type Id, type ValidationResult } from '../domain/common';
import {
  type Player,
  type PlayerDraft,
  type PlayerField,
  findPossibleDuplicates,
  validatePlayerDraft,
} from '../domain/player';
import type { ErrorListener, Listener, Repositories, Unsubscribe } from '../data/ports';
import type { AppDeps } from './deps';

export class PlayerService {
  constructor(
    private readonly repos: Repositories,
    private readonly deps: AppDeps,
  ) {}

  observeActive(listener: Listener<Player[]>, onError?: ErrorListener): Unsubscribe {
    return this.repos.players.observeActive(listener, onError);
  }

  /** Incluye jugadores borrados, para mostrar nombres en torneos donde participaron. */
  observeAll(listener: Listener<Player[]>, onError?: ErrorListener): Unsubscribe {
    return this.repos.players.observeAll(listener, onError);
  }

  get(id: Id): Promise<Player | undefined> {
    return this.repos.players.getById(id);
  }

  async findDuplicates(draft: PlayerDraft, excludeId?: Id): Promise<Player[]> {
    return findPossibleDuplicates(await this.repos.players.listActive(), draft, excludeId);
  }

  async create(draft: PlayerDraft): Promise<ValidationResult<Player, PlayerField>> {
    const { levels } = await this.repos.settings.get();
    const validation = validatePlayerDraft(draft, levels);
    if (!validation.ok) return validation;
    const now = this.deps.now().toISOString();
    const player: Player = {
      id: this.deps.newId(),
      ownerId: LOCAL_OWNER,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...validation.value,
    };
    await this.repos.players.save(player);
    return { ok: true, value: player };
  }

  async update(id: Id, draft: PlayerDraft): Promise<ValidationResult<Player, PlayerField>> {
    const existing = await this.repos.players.getById(id);
    if (!existing || existing.deletedAt !== null) {
      return { ok: false, errors: { firstName: 'El jugador no existe.' } };
    }
    const { levels } = await this.repos.settings.get();
    // Si el nivel del jugador se quitó de la lista, se permite conservarlo al editar.
    const allowed = levels.includes(existing.level) ? levels : [...levels, existing.level];
    const validation = validatePlayerDraft(draft, allowed);
    if (!validation.ok) return validation;
    const player: Player = {
      ...existing,
      ...validation.value,
      updatedAt: this.deps.now().toISOString(),
    };
    await this.repos.players.save(player);
    return { ok: true, value: player };
  }

  /** Borrado lógico: el jugador deja de aparecer pero se conserva para el historial. */
  async remove(id: Id): Promise<void> {
    const existing = await this.repos.players.getById(id);
    if (!existing || existing.deletedAt !== null) return;
    const now = this.deps.now().toISOString();
    await this.repos.players.save({ ...existing, deletedAt: now, updatedAt: now });
  }
}
