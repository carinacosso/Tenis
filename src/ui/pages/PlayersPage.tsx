import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fullName, searchPlayers } from '../../domain/player';
import { ChevronIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { EmptyState } from '../components/ui';
import { useActivePlayers } from '../hooks/useData';
import { Loading } from '../components/Loading';

export function PlayersPage() {
  const players = useActivePlayers();
  const [query, setQuery] = useState('');

  const newButton = (
    <Link
      to="/jugadores/nuevo"
      className="inline-flex min-h-12 items-center gap-1 rounded-xl bg-brand-800 px-4 text-lg font-semibold text-white active:bg-brand-900 dark:bg-brand-700"
    >
      <PlusIcon /> Nuevo
    </Link>
  );

  return (
    <Page title="Jugadores" actions={newButton}>
      {players.status === 'loading' && <Loading />}
      {players.status === 'error' && (
        <p role="alert" className="font-semibold text-red-700 dark:text-red-400">
          No se pudieron cargar los jugadores.
        </p>
      )}
      {players.status === 'ready' && players.data.length === 0 && (
        <EmptyState title="Todavía no cargaste jugadores">
          <p className="text-lg text-neutral-700 dark:text-neutral-300">
            Los jugadores que cargues quedan guardados para usarlos en todos tus torneos.
          </p>
        </EmptyState>
      )}
      {players.status === 'ready' && players.data.length > 0 && (
        <PlayerList players={players.data} query={query} onQueryChange={setQuery} />
      )}
    </Page>
  );
}

function plural(n: number): string {
  return n === 1 ? '1 jugador' : `${n} jugadores`;
}

function PlayerList({
  players,
  query,
  onQueryChange,
}: {
  players: Parameters<typeof searchPlayers>[0];
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const results = searchPlayers(players, query);
  const total = players.length;
  return (
    <>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-neutral-500" />
        <input
          type="search"
          inputMode="search"
          aria-label="Buscar jugador"
          placeholder="Nombre, nivel o teléfono"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="min-h-14 w-full rounded-xl border-2 border-neutral-400 bg-white pr-4 pl-12 text-lg dark:border-neutral-600 dark:bg-neutral-900"
        />
      </div>
      <p className="text-neutral-700 dark:text-neutral-300" aria-live="polite">
        {query ? `${results.length} de ${plural(total)}` : plural(total)}
      </p>
      {results.length === 0 ? (
        <EmptyState title="Sin resultados">
          <p className="text-lg">Probá con otra búsqueda.</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Lista de jugadores">
          {results.map((p) => (
            <li key={p.id}>
              <Link
                to={`/jugadores/${p.id}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-neutral-200 px-4 py-2 active:bg-neutral-100 dark:border-neutral-800 dark:active:bg-neutral-900"
              >
                <div className="flex-1">
                  <p className="text-lg font-semibold">{fullName(p)}</p>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    {p.level}
                    {p.sex ? ` · ${p.sex === 'M' ? 'Hombre' : 'Mujer'}` : ''}
                  </p>
                </div>
                <ChevronIcon className="text-neutral-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
