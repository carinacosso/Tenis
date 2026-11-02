import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { type Player, fullName } from '../../domain/player';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PhoneIcon, TrashIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { Button, Card } from '../components/ui';
import { useServices } from '../ServicesContext';

type LoadState =
  { status: 'loading' } | { status: 'missing' } | { status: 'ready'; player: Player };

export function PlayerDetailPage() {
  const { id = '' } = useParams();
  const { players } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    void players.get(id).then((player) => {
      if (!active) return;
      setState(
        player && player.deletedAt === null ? { status: 'ready', player } : { status: 'missing' },
      );
    });
    return () => {
      active = false;
    };
  }, [id, players]);

  if (state.status === 'loading') {
    return (
      <Page title="Jugador" back="/jugadores">
        <p aria-busy="true">Cargando…</p>
      </Page>
    );
  }
  if (state.status === 'missing') {
    return (
      <Page title="Jugador" back="/jugadores">
        <p className="text-lg">No encontramos ese jugador.</p>
      </Page>
    );
  }

  const { player } = state;
  const whatsapp = `https://wa.me/${player.phone.replace(/\D/g, '')}`;

  return (
    <Page title={fullName(player)} back="/jugadores">
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-lg">
          <dt className="font-semibold">Nivel</dt>
          <dd>{player.level}</dd>
          <dt className="font-semibold">Teléfono</dt>
          <dd>{player.phone}</dd>
          <dt className="font-semibold">Sexo</dt>
          <dd>{player.sex === 'M' ? 'Hombre' : player.sex === 'F' ? 'Mujer' : 'Sin indicar'}</dd>
          {player.notes && (
            <>
              <dt className="font-semibold">Notas</dt>
              <dd>{player.notes}</dd>
            </>
          )}
        </dl>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={`tel:${player.phone}`}
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-neutral-900 text-lg font-semibold dark:border-neutral-100"
        >
          <PhoneIcon /> Llamar
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-neutral-900 text-lg font-semibold dark:border-neutral-100"
        >
          WhatsApp
        </a>
      </div>

      <Link
        to={`/jugadores/${player.id}/editar`}
        className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-brand-800 text-lg font-semibold text-white dark:bg-brand-700"
      >
        Editar
      </Link>

      <section aria-labelledby="historial" className="flex flex-col gap-2">
        <h2 id="historial" className="text-xl font-bold">
          Torneos jugados
        </h2>
        <p className="text-neutral-700 dark:text-neutral-300">
          Todavía no jugó torneos. Acá vas a ver su historial y sus estadísticas.
        </p>
      </section>

      <Button variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)}>
        <TrashIcon /> Eliminar jugador
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="¿Eliminar jugador?"
        message={`${fullName(player)} va a dejar de aparecer en la lista de jugadores.`}
        confirmLabel="Sí, eliminar"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void players.remove(player.id).then(() => navigate('/jugadores', { replace: true }));
        }}
      />
    </Page>
  );
}
