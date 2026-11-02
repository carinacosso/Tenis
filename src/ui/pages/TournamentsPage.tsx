import { Page } from '../components/Layout';
import { EmptyState } from '../components/ui';

export function TournamentsPage() {
  return (
    <Page title="Torneos">
      <EmptyState title="Todavía no hay torneos">
        <p className="text-lg text-neutral-700 dark:text-neutral-300">
          Muy pronto vas a poder crear torneos desde acá. Mientras tanto, cargá tus jugadores.
        </p>
      </EmptyState>
    </Page>
  );
}
