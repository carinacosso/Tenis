import { type Id, LOCAL_OWNER, type ValidationResult } from '../domain/common';
import {
  type Match,
  applyKnockoutResult,
  generateKnockout,
  isKnockoutFinished,
} from '../domain/knockout';
import {
  type Entry,
  type PaymentStatus,
  checkCanGenerateDraw,
  checkRegistration,
  checkSeeds,
  confirmedEntries,
  entriesToPromote,
  statusForNewEntry,
} from '../domain/registration';
import { type MatchResult, checkResult } from '../domain/scoring';
import {
  LOCKED_AFTER_DRAW,
  type Tournament,
  type TournamentDraft,
  type TournamentField,
  validateTournamentDraft,
} from '../domain/tournament';
import type { ErrorListener, Listener, Repositories, Unsubscribe } from '../data/ports';
import type { AppDeps } from './deps';

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

export type RecordResultOutcome =
  | { status: 'saved'; cleared: Id[] }
  | { status: 'needsConfirmation'; cleared: Id[] }
  | { status: 'invalid'; error: string };

const ok = <T>(value: T): ActionResult<T> => ({ ok: true, value });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

export class TournamentService {
  constructor(
    private readonly repos: Repositories,
    private readonly deps: AppDeps,
  ) {}

  private stamp(): string {
    return this.deps.now().toISOString();
  }

  // ── Lectura ─────────────────────────────────────────────

  observeActive(listener: Listener<Tournament[]>, onError?: ErrorListener): Unsubscribe {
    return this.repos.tournaments.observeActive(listener, onError);
  }

  observeById(
    id: Id,
    listener: Listener<Tournament | undefined>,
    onError?: ErrorListener,
  ): Unsubscribe {
    return this.repos.tournaments.observeById(id, listener, onError);
  }

  observeEntries(id: Id, listener: Listener<Entry[]>, onError?: ErrorListener): Unsubscribe {
    return this.repos.entries.observeByTournament(id, listener, onError);
  }

  observeMatches(id: Id, listener: Listener<Match[]>, onError?: ErrorListener): Unsubscribe {
    return this.repos.matches.observeByTournament(id, listener, onError);
  }

  get(id: Id): Promise<Tournament | undefined> {
    return this.repos.tournaments.getById(id);
  }

  private async requireTournament(id: Id): Promise<Tournament> {
    const tournament = await this.repos.tournaments.getById(id);
    if (!tournament || tournament.deletedAt !== null) throw new Error('El torneo no existe.');
    return tournament;
  }

  // ── Torneo ──────────────────────────────────────────────

  async create(draft: TournamentDraft): Promise<ValidationResult<Tournament, TournamentField>> {
    const validation = validateTournamentDraft(draft);
    if (!validation.ok) return validation;
    const now = this.stamp();
    const tournament: Tournament = {
      id: this.deps.newId(),
      ownerId: LOCAL_OWNER,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...validation.value,
      status: 'registration',
      drawGeneratedAt: null,
      finishedAt: null,
    };
    await this.repos.tournaments.save(tournament);
    return { ok: true, value: tournament };
  }

  async update(
    id: Id,
    draft: TournamentDraft,
  ): Promise<ValidationResult<Tournament, TournamentField>> {
    const existing = await this.requireTournament(id);
    const entries = await this.repos.entries.listByTournament(id);
    const validation = validateTournamentDraft(draft, confirmedEntries(entries).length);
    if (!validation.ok) return validation;
    if (existing.drawGeneratedAt !== null) {
      const changed = LOCKED_AFTER_DRAW.find(
        (field) => JSON.stringify(existing[field]) !== JSON.stringify(validation.value[field]),
      );
      if (changed) {
        return {
          ok: false,
          errors: { [changed]: 'No se puede cambiar después de generar los cruces.' },
        };
      }
    }
    const tournament: Tournament = { ...existing, ...validation.value, updatedAt: this.stamp() };
    await this.repos.transaction(async () => {
      await this.repos.tournaments.save(tournament);
      await this.promoteWaitlist(tournament);
    });
    return { ok: true, value: tournament };
  }

  /** Borrado lógico del torneo. */
  async remove(id: Id): Promise<void> {
    const existing = await this.requireTournament(id);
    const now = this.stamp();
    await this.repos.tournaments.save({ ...existing, deletedAt: now, updatedAt: now });
  }

  // ── Inscripción ─────────────────────────────────────────

  async register(tournamentId: Id, playerIds: Id[]): Promise<ActionResult<Entry>> {
    const tournament = await this.requireTournament(tournamentId);
    const entries = await this.repos.entries.listByTournament(tournamentId);
    const error = checkRegistration(tournament, entries, playerIds);
    if (error) return fail(error);
    const players = await Promise.all(playerIds.map((pid) => this.repos.players.getById(pid)));
    if (players.some((p) => !p || p.deletedAt !== null)) return fail('El jugador no existe.');
    const now = this.stamp();
    const entry: Entry = {
      id: this.deps.newId(),
      ownerId: LOCAL_OWNER,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      tournamentId,
      playerIds,
      status: statusForNewEntry(tournament, entries),
      registeredAt: now,
      seed: null,
      payments: playerIds.map((playerId) => ({
        playerId,
        amount: tournament.entryFee,
        status: 'pending',
      })),
    };
    await this.repos.entries.saveMany([entry]);
    return ok(entry);
  }

  /** Da de baja una inscripción y promueve automáticamente a la lista de espera. */
  async withdraw(entryId: Id): Promise<ActionResult<Entry[]>> {
    const entry = (await this.repos.entries.listAll()).find((e) => e.id === entryId);
    if (!entry || entry.status === 'withdrawn') return fail('La inscripción no existe.');
    const tournament = await this.requireTournament(entry.tournamentId);
    if (tournament.drawGeneratedAt !== null) {
      return fail('Los cruces ya están generados. Para dar de baja, primero deshacé el sorteo.');
    }
    return this.repos.transaction(async () => {
      await this.repos.entries.saveMany([
        { ...entry, status: 'withdrawn', seed: null, updatedAt: this.stamp() },
      ]);
      return ok(await this.promoteWaitlist(tournament));
    });
  }

  private async promoteWaitlist(tournament: Tournament): Promise<Entry[]> {
    const entries = await this.repos.entries.listByTournament(tournament.id);
    const now = this.stamp();
    const promoted = entriesToPromote(tournament, entries).map((e): Entry => ({
      ...e,
      status: 'confirmed',
      updatedAt: now,
    }));
    if (promoted.length > 0) await this.repos.entries.saveMany(promoted);
    return promoted;
  }

  async setPayment(entryId: Id, playerId: Id, status: PaymentStatus): Promise<void> {
    const entry = (await this.repos.entries.listAll()).find((e) => e.id === entryId);
    if (!entry) return;
    await this.repos.entries.saveMany([
      {
        ...entry,
        payments: entry.payments.map((p) => (p.playerId === playerId ? { ...p, status } : p)),
        updatedAt: this.stamp(),
      },
    ]);
  }

  /** Define los cabezas de serie en orden (el primero es el cabeza 1). */
  async setSeeds(tournamentId: Id, orderedEntryIds: Id[]): Promise<ActionResult> {
    const tournament = await this.requireTournament(tournamentId);
    if (tournament.drawGeneratedAt !== null) return fail('Los cruces ya están generados.');
    const entries = await this.repos.entries.listByTournament(tournamentId);
    const error = checkSeeds(entries, orderedEntryIds);
    if (error) return fail(error);
    const now = this.stamp();
    const changed = entries.flatMap((e): Entry[] => {
      const index = orderedEntryIds.indexOf(e.id);
      const seed = index >= 0 ? index + 1 : null;
      return seed === e.seed ? [] : [{ ...e, seed, updatedAt: now }];
    });
    await this.repos.entries.saveMany(changed);
    return ok(undefined);
  }

  // ── Cruces ──────────────────────────────────────────────

  async generateDraw(tournamentId: Id): Promise<ActionResult<Match[]>> {
    const tournament = await this.requireTournament(tournamentId);
    if (tournament.drawGeneratedAt !== null) return fail('Los cruces ya están generados.');
    const entries = await this.repos.entries.listByTournament(tournamentId);
    const error = checkCanGenerateDraw(tournament, entries);
    if (error) return fail(error);
    const now = this.stamp();
    const plans = generateKnockout(
      confirmedEntries(entries).map((e) => ({ id: e.id, seed: e.seed })),
      this.deps.random,
      this.deps.newId,
    );
    const matches: Match[] = plans.map((plan) => ({
      ...plan,
      ownerId: LOCAL_OWNER,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      tournamentId,
      result: null,
    }));
    await this.repos.transaction(async () => {
      await this.repos.matches.deleteByTournament(tournamentId);
      await this.repos.matches.saveMany(matches);
      await this.repos.tournaments.save({
        ...tournament,
        status: 'in_progress',
        drawGeneratedAt: now,
        updatedAt: now,
      });
    });
    return ok(matches);
  }

  /** Deshace el sorteo (solo si no hay resultados cargados) y reabre la inscripción. */
  async undoDraw(tournamentId: Id): Promise<ActionResult> {
    const tournament = await this.requireTournament(tournamentId);
    const matches = await this.repos.matches.listByTournament(tournamentId);
    if (matches.some((m) => m.result !== null)) {
      return fail('Ya hay resultados cargados: no se puede deshacer el sorteo.');
    }
    await this.repos.transaction(async () => {
      await this.repos.matches.deleteByTournament(tournamentId);
      const reopened: Tournament = {
        ...tournament,
        status: 'registration',
        drawGeneratedAt: null,
        finishedAt: null,
        updatedAt: this.stamp(),
      };
      await this.repos.tournaments.save(reopened);
      await this.promoteWaitlist(reopened);
    });
    return ok(undefined);
  }

  // ── Resultados ──────────────────────────────────────────

  /**
   * Carga, corrige o borra (`result = null`) el resultado de un partido.
   * Si el cambio afecta partidos posteriores que ya tenían resultado, devuelve
   * `needsConfirmation` sin guardar nada, salvo que se pase `confirmed = true`.
   */
  async recordResult(
    matchId: Id,
    result: MatchResult | null,
    confirmed = false,
  ): Promise<RecordResultOutcome> {
    const target = (await this.repos.matches.listAll()).find((m) => m.id === matchId);
    if (!target) return { status: 'invalid', error: 'El partido no existe.' };
    const tournament = await this.requireTournament(target.tournamentId);
    if (result !== null) {
      const check = checkResult(tournament.scoring, result);
      if (!check.ok) return { status: 'invalid', error: check.error };
    }
    const matches = await this.repos.matches.listByTournament(tournament.id);
    let applied: ReturnType<typeof applyKnockoutResult>;
    try {
      applied = applyKnockoutResult(matches, matchId, result);
    } catch (error) {
      return { status: 'invalid', error: error instanceof Error ? error.message : String(error) };
    }
    if (applied.cleared.length > 0 && !confirmed) {
      return { status: 'needsConfirmation', cleared: applied.cleared };
    }
    const now = this.stamp();
    const before = new Map(matches.map((m) => [m.id, m]));
    const changed = applied.matches
      .filter((m) => JSON.stringify(m.result) !== JSON.stringify(before.get(m.id)?.result))
      .map((m) => ({ ...m, updatedAt: now }));
    const finished = isKnockoutFinished(applied.matches);
    await this.repos.transaction(async () => {
      await this.repos.matches.saveMany(changed);
      if (finished !== (tournament.status === 'finished')) {
        await this.repos.tournaments.save({
          ...tournament,
          status: finished ? 'finished' : 'in_progress',
          finishedAt: finished ? now : null,
          updatedAt: now,
        });
      }
    });
    return { status: 'saved', cleared: applied.cleared };
  }
}
