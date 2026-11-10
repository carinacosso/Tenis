import { Link } from 'react-router-dom';
import { MODALITY_LABELS, STATUS_LABELS, type Tournament } from '../../domain/tournament';
import { ChevronIcon, PlusIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { EmptyState } from '../components/ui';
import { InstallCard } from '../install/InstallCard';
import { formatDate } from '../format';
import { useActiveTournaments } from '../hooks/useTournament';
import { Loading } from '../components/Loading';

const STATUS_STYLES: Record<Tournament['status'], string> = {
  registration: 'bg-amber-200 text-amber-950',
  in_progress: 'bg-brand-800 text-white',
  finished: 'bg-neutral-300 text-neutral-900',
};

function TournamentItem({ t }: { t: Tournament }) {
  return (
    <li>
      <Link
        to={`/torneos/${t.id}`}
        className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-neutral-200 px-4 py-3 active:bg-neutral-100 dark:border-neutral-800 dark:active:bg-neutral-900"
      >
        <div className="flex-1">
          <p className="text-lg font-semibold">{t.name}</p>
          <p className="text-neutral-700 dark:text-neutral-300">
            {t.category} · {MODALITY_LABELS[t.modality]} · {formatDate(t.date)}
          </p>
          <span
            className={`mt-1 inline-block rounded-lg px-2 py-0.5 text-sm font-bold ${STATUS_STYLES[t.status]}`}
          >
            {STATUS_LABELS[t.status]}
          </span>
        </div>
        <ChevronIcon className="text-neutral-500" />
      </Link>
    </li>
  );
}

export function TournamentsPage() {
  const tournaments = useActiveTournaments();

  const newButton = (
    <Link
      to="/torneos/nuevo"
      className="inline-flex min-h-12 items-center gap-1 rounded-xl bg-brand-800 px-4 text-lg font-semibold text-white active:bg-brand-900 dark:bg-brand-700"
    >
      <PlusIcon /> Nuevo
    </Link>
  );

  if (tournaments.status !== 'ready') {
    return (
      <Page title="Torneos" actions={newButton}>
        {tournaments.status === 'error' ? (
          <p role="alert">No se pudieron cargar los torneos.</p>
        ) : (
          <Loading />
        )}
      </Page>
    );
  }

  const byDateDesc = (a: Tournament, b: Tournament) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  const current = tournaments.data.filter((t) => t.status !== 'finished').sort(byDateDesc);
  const finished = tournaments.data.filter((t) => t.status === 'finished').sort(byDateDesc);

  return (
    <Page title="Torneos" actions={newButton}>
      <InstallCard compact={tournaments.data.length > 0} />
      {tournaments.data.length === 0 && (
        <EmptyState title="Todavía no hay torneos">
          <p className="text-lg text-neutral-700 dark:text-neutral-300">
            Tocá <strong>Nuevo</strong> para crear el primero.
          </p>
        </EmptyState>
      )}
      {current.length > 0 && (
        <section aria-labelledby="activos" className="flex flex-col gap-2">
          <h2 id="activos" className="text-xl font-bold">
            Activos
          </h2>
          <ul className="flex flex-col gap-2">
            {current.map((t) => (
              <TournamentItem key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}
      {finished.length > 0 && (
        <section aria-labelledby="finalizados" className="flex flex-col gap-2">
          <h2 id="finalizados" className="text-xl font-bold">
            Finalizados
          </h2>
          <ul className="flex flex-col gap-2">
            {finished.map((t) => (
              <TournamentItem key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
