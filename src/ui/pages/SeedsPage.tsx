import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { confirmedEntries, maxSeedsFor } from '../../domain/registration';
import { Page } from '../components/Layout';
import { Button } from '../components/ui';
import { entryName } from '../format';
import { useTournament } from '../hooks/useTournament';
import { useServices } from '../ServicesContext';

/** Elegir cabezas de serie tocando en orden: el primero que se toca es el 1. */
export function SeedsPage() {
  const { id = '' } = useParams();
  const state = useTournament(id);
  const { tournaments } = useServices();
  const navigate = useNavigate();
  const [order, setOrder] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = `/torneos/${id}?tab=inscriptos`;

  if (state.status !== 'ready') {
    return (
      <Page title="Cabezas de serie" back={back}>
        <p aria-busy="true">Cargando…</p>
      </Page>
    );
  }

  const confirmed = confirmedEntries(state.entries);
  const current =
    order ??
    confirmed
      .filter((e) => e.seed !== null)
      .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
      .map((e) => e.id);
  const max = maxSeedsFor(state.tournament, confirmed.length);
  const groups = state.tournament.format.kind === 'groups';

  const toggle = (entryId: string) => {
    setError(null);
    if (current.includes(entryId)) setOrder(current.filter((x) => x !== entryId));
    else if (current.length >= max) setError(`Como máximo puede haber ${max} cabezas de serie.`);
    else setOrder([...current, entryId]);
  };

  const save = async () => {
    const r = await tournaments.setSeeds(id, current);
    if (!r.ok) setError(r.error);
    else navigate(back, { replace: true });
  };

  return (
    <Page title="Cabezas de serie" back={back}>
      <p className="text-lg">
        Tocá a los favoritos en orden: el primero es el cabeza 1. Con {confirmed.length} inscriptos
        podés elegir hasta {max}. Son opcionales.
        {groups && ' Los cabezas van a grupos distintos.'}
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-900">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2" aria-label="Inscriptos">
        {confirmed.map((entry) => {
          const seed = current.indexOf(entry.id) + 1;
          return (
            <li key={entry.id}>
              <button
                type="button"
                aria-pressed={seed > 0}
                onClick={() => toggle(entry.id)}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left text-lg font-semibold ${
                  seed > 0
                    ? 'border-brand-800 bg-brand-50 dark:border-ball dark:bg-neutral-900'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <span className="w-10 text-center text-xl font-black">{seed > 0 ? seed : ''}</span>
                <span className="flex-1">{entryName(entry, state.players)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => setOrder([])}>
          Quitar todos
        </Button>
        <Button onClick={() => void save()}>Guardar</Button>
      </div>
    </Page>
  );
}
