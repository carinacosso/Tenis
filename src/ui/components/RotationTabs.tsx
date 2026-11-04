import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Id } from '../../domain/common';
import { type Match, sideEntries } from '../../domain/match';
import { isRoundComplete, lastRoundNumber, nextRoundBlocker } from '../../domain/rotationStandings';
import { pointsOf } from '../../domain/scoring';
import { entryName } from '../format';
import { useRanking } from '../hooks/useRanking';
import type { TournamentData } from '../hooks/useTournament';
import { useServices } from '../ServicesContext';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, Card, EmptyState } from './ui';

function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

/** Nombre de una inscripción individual (en rotativos cada inscripción es un jugador). */
function useNameOf(data: TournamentData) {
  return (entryId: Id) => entryName(data.entriesById.get(entryId), data.players);
}

export function RotationPodium({ data }: { data: TournamentData }) {
  const ranking = useRanking(data);
  const nameOf = useNameOf(data);
  const [first, second, third] = ranking;
  return (
    <Card className="border-brand-700 bg-brand-50 dark:border-ball dark:bg-neutral-900">
      <p className="text-sm font-bold text-brand-800 uppercase dark:text-ball">Campeón</p>
      <p className="text-3xl font-black" data-testid="campeon">
        🏆 {first ? nameOf(first.entryId) : '—'}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lg">
        {second && (
          <>
            <dt className="font-semibold">2.º puesto</dt>
            <dd>{nameOf(second.entryId)}</dd>
          </>
        )}
        {third && (
          <>
            <dt className="font-semibold">3.º puesto</dt>
            <dd>{nameOf(third.entryId)}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function RotationMatchCard({
  match,
  nameOf,
  href,
}: {
  match: Match;
  nameOf: (id: Id) => string;
  href: string;
}) {
  const score = match.result ? pointsOf(match.result) : null;
  const winner = match.result?.winner ?? null;
  const row = (side: 'A' | 'B') => {
    const ids = sideEntries(side === 'A' ? match.sideA : match.sideB);
    const isWinner = winner === side;
    return (
      <div className="flex min-h-10 items-center gap-2">
        <span className={`flex-1 text-lg ${isWinner ? 'font-bold' : ''}`}>
          {isWinner && <span aria-label="Ganador">✓ </span>}
          {ids.map(nameOf).join(' / ')}
        </span>
        {score && (
          <span
            className={`text-xl tabular-nums ${isWinner ? 'font-bold' : 'text-neutral-600 dark:text-neutral-400'}`}
          >
            {side === 'A' ? score.a : score.b}
          </span>
        )}
      </div>
    );
  };
  return (
    <Link
      to={href}
      className={`block rounded-2xl border-2 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-900 ${
        match.result
          ? 'border-neutral-200 dark:border-neutral-800'
          : 'border-brand-700 dark:border-ball'
      }`}
    >
      <p className="mb-1 flex justify-between text-sm font-semibold text-neutral-600 uppercase dark:text-neutral-400">
        <span>Partido {match.position + 1}</span>
        {!match.result && <span className="text-brand-700 dark:text-ball">Cargar resultado</span>}
      </p>
      {row('A')}
      <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
      {row('B')}
      {match.result?.outcome === 'walkover' && (
        <p className="mt-1 text-sm font-bold text-red-700 uppercase dark:text-red-400">W.O.</p>
      )}
    </Link>
  );
}

export function RoundsTab({ data }: { data: TournamentData }) {
  const { tournaments } = useServices();
  const nameOf = useNameOf(data);
  const { tournament, matches, rounds } = data;
  const last = lastRoundNumber(rounds);
  const firstIncomplete = rounds.find((r) => !isRoundComplete(r.number, matches))?.number;
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  if (rounds.length === 0) {
    return (
      <EmptyState title="Todavía no hay rondas">
        <p className="text-lg text-neutral-700 dark:text-neutral-300">
          Inscribí a los jugadores y tocá <strong>Generar cruces</strong> en la pestaña Inscriptos.
        </p>
      </EmptyState>
    );
  }

  const current = selected ?? firstIncomplete ?? last;
  const round = rounds.find((r) => r.number === current);
  const inRound = matches
    .filter((m) => m.round === current)
    .sort((a, b) => a.position - b.position);
  const mexicano = tournament.format.kind === 'mexicano';
  const planned = tournament.plannedRounds ?? last;
  const blocker = mexicano ? nextRoundBlocker(tournament.plannedRounds, matches, rounds) : null;
  const canUndoLast =
    mexicano && current === last && last > 1 && inRound.every((m) => m.result === null);

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4" role="tablist" aria-label="Rondas">
        <div className="flex w-max gap-2">
          {rounds.map((r) => {
            const done = isRoundComplete(r.number, matches);
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={r.number === current}
                onClick={() => setSelected(r.number)}
                className={`min-h-12 rounded-xl border-2 px-4 font-semibold whitespace-nowrap ${
                  r.number === current
                    ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                    : 'border-neutral-300 dark:border-neutral-700'
                }`}
              >
                Ronda {r.number}
                {done ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-neutral-700 dark:text-neutral-300">
        Ronda {current} de {planned}
      </p>

      <ul className="flex flex-col gap-2" aria-label={`Ronda ${current}`}>
        {inRound.map((m) => (
          <li key={m.id}>
            <RotationMatchCard
              match={m}
              nameOf={nameOf}
              href={`/torneos/${tournament.id}/partidos/${m.id}`}
            />
          </li>
        ))}
      </ul>
      {round && round.restingEntryIds.length > 0 && (
        <p className="rounded-xl bg-neutral-100 p-3 text-lg dark:bg-neutral-900">
          <strong>Descansan:</strong> {round.restingEntryIds.map(nameOf).join(', ')}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-900">
          {error}
        </p>
      )}

      {mexicano && last < planned && (
        <div className="flex flex-col gap-2">
          <Button
            disabled={blocker !== null}
            onClick={() =>
              void tournaments.generateNextRound(tournament.id).then((r) => {
                if (!r.ok) setError(r.error);
                else {
                  setError(null);
                  setSelected(last + 1);
                }
              })
            }
          >
            Generar ronda {last + 1}
          </Button>
          {blocker && <p className="text-neutral-700 dark:text-neutral-300">{blocker}</p>}
        </div>
      )}
      {canUndoLast && (
        <Button variant="secondary" onClick={() => setConfirmUndo(true)}>
          Rearmar ronda {last}
        </Button>
      )}
      <ConfirmDialog
        open={confirmUndo}
        danger
        title={`¿Rearmar la ronda ${last}?`}
        message="Se borran los cruces de esta ronda (todavía no tiene resultados) para volver a generarla."
        confirmLabel="Sí, borrar ronda"
        onCancel={() => setConfirmUndo(false)}
        onConfirm={() => {
          setConfirmUndo(false);
          void tournaments.undoLastRound(tournament.id).then((r) => {
            if (!r.ok) setError(r.error);
            else setSelected(null);
          });
        }}
      />
    </>
  );
}

export function RankingTab({ data }: { data: TournamentData }) {
  const ranking = useRanking(data);
  const nameOf = useNameOf(data);
  if (data.rounds.length === 0) {
    return <EmptyState title="El ranking aparece cuando arranca el torneo" />;
  }
  const hasRestPoints = ranking.some((r) => r.restPoints > 0);
  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[340px] text-left text-lg" aria-label="Ranking">
          <thead>
            <tr className="border-b-2 border-neutral-300 text-sm text-neutral-600 uppercase dark:border-neutral-700 dark:text-neutral-400">
              <th scope="col" className="py-2 pr-2">
                #
              </th>
              <th scope="col" className="py-2 pr-2">
                Jugador
              </th>
              <th scope="col" className="py-2 pr-2 text-right" title="Partidos jugados">
                PJ
              </th>
              <th scope="col" className="py-2 pr-2 text-right" title="Partidos ganados">
                PG
              </th>
              <th scope="col" className="py-2 pr-2 text-right" title="Diferencia de puntos">
                Dif
              </th>
              <th scope="col" className="py-2 text-right">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.entryId} className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-2 pr-2 font-bold">{r.position}</td>
                <td className="py-2 pr-2 font-semibold">{nameOf(r.entryId)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.played}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.won}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {r.diff > 0 ? `+${r.diff}` : r.diff}
                </td>
                <td className="py-2 text-right font-bold tabular-nums">
                  {formatPoints(r.total)}
                  {r.restPoints > 0 && <span className="text-sm font-normal">*</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-neutral-700 dark:text-neutral-300">
        Orden: puntos, partidos ganados, diferencia de puntos y sorteo.
        {hasRestPoints &&
          ' * Incluye puntos por descanso (el promedio de puntos de la ronda en que descansó).'}
      </p>
    </>
  );
}
