import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Player, fullName, searchPlayers } from '../../domain/player';
import { activeEntries, confirmedEntries } from '../../domain/registration';
import { playersPerEntry } from '../../domain/tournament';
import { PlusIcon, SearchIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { Button, EmptyState } from '../components/ui';
import { entryName } from '../format';
import { useTournament } from '../hooks/useTournament';
import { useServices } from '../ServicesContext';
import { Loading } from '../components/Loading';

/** Inscripción rápida: en singles un toque inscribe; en dobles se eligen los dos de la pareja. */
export function RegisterPage() {
  const { id = '' } = useParams();
  const state = useTournament(id);
  const { tournaments } = useServices();
  const [query, setQuery] = useState('');
  const [partner, setPartner] = useState<Player | null>(null);
  const [toast, showToast] = useToast();
  const [error, setError] = useState<string | null>(null);
  const back = `/torneos/${id}?tab=inscriptos`;

  if (state.status !== 'ready') {
    return (
      <Page title="Inscribir" back={back}>
        {state.status === 'loading' ? <Loading /> : <p>No encontramos el torneo.</p>}
      </Page>
    );
  }

  const { tournament, entries, players } = state;
  const doubles = playersPerEntry(tournament) === 2;
  const mixed = tournament.format.kind === 'americano' && tournament.format.variant === 'mixed';
  const registered = new Set(activeEntries(entries).flatMap((e) => e.playerIds));
  const available = searchPlayers([...players.values()], query).filter(
    (p) => !registered.has(p.id) && p.id !== partner?.id,
  );
  const confirmedCount = confirmedEntries(entries).length;
  const full = confirmedCount >= tournament.maxEntries;

  const register = async (ids: string[]) => {
    const r = await tournaments.register(tournament.id, ids);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setPartner(null);
    setQuery('');
    const name = entryName(r.value, players);
    showToast(r.value.status === 'waitlist' ? `${name}: a lista de espera` : `${name} inscripto`);
  };

  const onPick = (player: Player) => {
    if (!doubles) void register([player.id]);
    else if (!partner) setPartner(player);
    else void register([partner.id, player.id]);
  };

  if (tournament.drawGeneratedAt !== null) {
    return (
      <Page title="Inscribir" back={back}>
        <p className="text-lg">Los cruces ya están generados: la inscripción está cerrada.</p>
      </Page>
    );
  }

  return (
    <Page title="Inscribir" back={back}>
      <p className="text-lg font-semibold" aria-live="polite">
        {confirmedCount} / {tournament.maxEntries} {doubles ? 'parejas' : 'jugadores'}
        {full && ' · cupo completo: los nuevos van a lista de espera'}
      </p>

      {doubles && (
        <div
          className="rounded-2xl bg-neutral-100 p-3 text-lg dark:bg-neutral-900"
          aria-live="polite"
        >
          {partner ? (
            <div className="flex items-center gap-2">
              <span className="flex-1">
                Pareja: <strong>{fullName(partner)}</strong> + elegí el compañero
              </span>
              <Button variant="ghost" className="min-h-12" onClick={() => setPartner(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            'Elegí el primer jugador de la pareja.'
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-900">
          {error}
        </p>
      )}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-neutral-500" />
        <input
          type="search"
          aria-label="Buscar jugador"
          placeholder="Buscar jugador"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-14 w-full rounded-xl border-2 border-neutral-400 bg-white pr-4 pl-12 text-lg dark:border-neutral-600 dark:bg-neutral-900"
        />
      </div>

      <Link
        to={`/jugadores/nuevo?volver=${encodeURIComponent(`/torneos/${id}/inscribir`)}`}
        className="inline-flex min-h-14 items-center justify-center gap-1 rounded-2xl border-2 border-neutral-900 text-lg font-semibold dark:border-neutral-100"
      >
        <PlusIcon /> Cargar jugador nuevo
      </Link>

      {available.length === 0 ? (
        <EmptyState title={query ? 'Sin resultados' : 'No quedan jugadores para inscribir'} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Jugadores disponibles">
          {available.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-neutral-200 px-4 text-left active:bg-neutral-100 dark:border-neutral-800 dark:active:bg-neutral-900"
              >
                <span className="flex-1">
                  <span className="block text-lg font-semibold">{fullName(p)}</span>
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {p.level}
                    {mixed &&
                      (p.sex === 'M'
                        ? ' · Hombre'
                        : p.sex === 'F'
                          ? ' · Mujer'
                          : ' · sin sexo indicado')}
                  </span>
                </span>
                <PlusIcon className="text-brand-700 dark:text-ball" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Toast message={toast} />
    </Page>
  );
}
