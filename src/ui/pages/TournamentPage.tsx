import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  type ResolvedMatch,
  knockoutPodium,
  resolveKnockout,
  roundName,
} from '../../domain/knockout';
import {
  type Entry,
  checkCanGenerateDraw,
  confirmedEntries,
  paymentSummary,
  waitlist,
} from '../../domain/registration';
import { describeScoring } from '../../domain/scoring';
import {
  MODALITY_LABELS,
  STATUS_LABELS,
  formatLabel,
  isRotation,
  usesSeeds,
} from '../../domain/tournament';
import { ConfirmDialog, type ConfirmDialogProps } from '../components/ConfirmDialog';
import { PlusIcon, TrashIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { MatchCard } from '../components/MatchCard';
import { RankingTab, RotationPodium, RoundsTab } from '../components/RotationTabs';
import { GroupsTab, LeaguePodium, LeagueTableTab } from '../components/StandingsTabs';
import { bracketMatches, matchTitle } from '../matchTitle';
import { Tabs } from '../components/Tabs';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { Button, Card, EmptyState } from '../components/ui';
import { entryName, formatDate, formatMoney } from '../format';
import { type TournamentData, useTournament } from '../hooks/useTournament';
import { useServices } from '../ServicesContext';

type Tab = 'inscriptos' | 'partidos' | 'cuadro' | 'rondas' | 'ranking' | 'grupos' | 'tabla';
type Confirm = Omit<ConfirmDialogProps, 'open' | 'onCancel'>;

export function TournamentPage() {
  const { id = '' } = useParams();
  const state = useTournament(id);
  const [params, setParams] = useSearchParams();

  if (state.status !== 'ready') {
    return (
      <Page title="Torneo" back="/">
        {state.status === 'loading' && <p aria-busy="true">Cargando…</p>}
        {state.status === 'missing' && <p className="text-lg">No encontramos ese torneo.</p>}
        {state.status === 'error' && <p role="alert">No se pudo cargar el torneo.</p>}
      </Page>
    );
  }

  const { tournament } = state;
  const rotation = isRotation(tournament.format);
  const kind = tournament.format.kind;
  const tabs: { value: Tab; label: string }[] = [{ value: 'inscriptos', label: 'Inscriptos' }];
  if (rotation)
    tabs.push({ value: 'rondas', label: 'Rondas' }, { value: 'ranking', label: 'Ranking' });
  else if (kind === 'league')
    tabs.push({ value: 'tabla', label: 'Tabla' }, { value: 'partidos', label: 'Partidos' });
  else if (kind === 'groups')
    tabs.push(
      { value: 'grupos', label: 'Grupos' },
      { value: 'partidos', label: 'Partidos' },
      { value: 'cuadro', label: 'Cuadro' },
    );
  else tabs.push({ value: 'partidos', label: 'Partidos' }, { value: 'cuadro', label: 'Cuadro' });
  const started = tournament.drawGeneratedAt !== null;
  const playTab: Tab = rotation ? 'rondas' : 'partidos';
  const defaultTab: Tab = !started ? 'inscriptos' : playTab;
  const requested = params.get('tab');
  const tab: Tab = tabs.find((t) => t.value === requested)?.value ?? defaultTab;

  return (
    <Page
      title={tournament.name}
      back="/"
      actions={
        <Link
          to={`/torneos/${tournament.id}/editar`}
          className="inline-flex min-h-12 items-center rounded-xl px-3 text-lg font-semibold active:bg-neutral-100 dark:active:bg-neutral-800"
        >
          Editar
        </Link>
      }
    >
      <div className="text-neutral-700 dark:text-neutral-300">
        <p className="font-semibold text-neutral-950 dark:text-neutral-50">
          {tournament.category} · {MODALITY_LABELS[tournament.modality]} ·{' '}
          {formatLabel(tournament.format)}
        </p>
        <p>
          {formatDate(tournament.date)}
          {tournament.venue ? ` · ${tournament.venue}` : ''} · {STATUS_LABELS[tournament.status]}
        </p>
        <p>{describeScoring(tournament.scoring)}</p>
      </div>

      {tournament.status === 'finished' &&
        (rotation ? (
          <RotationPodium data={state} />
        ) : kind === 'league' ? (
          <LeaguePodium data={state} />
        ) : (
          <PodiumCard data={state} />
        ))}

      <Tabs<Tab>
        label="Secciones del torneo"
        tabs={tabs}
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
      />

      {tab === 'inscriptos' && (
        <EntriesTab
          data={state}
          onDrawGenerated={() => setParams({ tab: playTab }, { replace: true })}
        />
      )}
      {tab === 'partidos' && <MatchesTab data={state} />}
      {tab === 'cuadro' && <BracketTab data={state} />}
      {tab === 'rondas' && <RoundsTab data={state} />}
      {tab === 'ranking' && <RankingTab data={state} />}
      {tab === 'grupos' && <GroupsTab data={state} />}
      {tab === 'tabla' && <LeagueTableTab data={state} />}

      <DangerZone data={state} />
    </Page>
  );
}

function PodiumCard({ data }: { data: TournamentData }) {
  const podium = knockoutPodium(bracketMatches(data.matches));
  const name = (id: string | null) =>
    id ? entryName(data.entriesById.get(id), data.players) : '—';
  return (
    <Card className="border-brand-700 bg-brand-50 dark:border-ball dark:bg-neutral-900">
      <p className="text-sm font-bold text-brand-800 uppercase dark:text-ball">Campeón</p>
      <p className="text-3xl font-black" data-testid="campeon">
        🏆 {name(podium.champion)}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lg">
        <dt className="font-semibold">Subcampeón</dt>
        <dd>{name(podium.runnerUp)}</dd>
        {podium.thirds.length > 0 && (
          <>
            <dt className="font-semibold">Semifinalistas</dt>
            <dd>{podium.thirds.map(name).join(' · ')}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

// ── Inscriptos ────────────────────────────────────────────

function EntriesTab({
  data,
  onDrawGenerated,
}: {
  data: TournamentData;
  onDrawGenerated: () => void;
}) {
  const { tournaments } = useServices();
  const { tournament, entries, players } = data;
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toast, notify] = useToast();
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmedEntries(entries);
  const waiting = waitlist(entries);
  const open = tournament.drawGeneratedAt === null;
  const summary = paymentSummary(entries);
  const seedsEnabled = usesSeeds(tournament.format);
  const unit =
    tournament.modality === 'doubles' && !isRotation(tournament.format) ? 'parejas' : 'jugadores';
  const seeded = confirmed.filter((e) => e.seed !== null).length;

  const askWithdraw = (entry: Entry) =>
    setConfirm({
      title: '¿Dar de baja?',
      message: `${entryName(entry, players)} deja de estar inscripto.${
        entry.status === 'confirmed' && waiting.length > 0
          ? ' El primero de la lista de espera ocupa su lugar.'
          : ''
      }`,
      confirmLabel: 'Sí, dar de baja',
      danger: true,
      onConfirm: () => {
        setConfirm(null);
        void tournaments.withdraw(entry.id).then((r) => {
          if (!r.ok) setError(r.error);
          else if (r.value.length > 0)
            notify(`${r.value.map((e) => entryName(e, players)).join(', ')} pasó a confirmado`);
        });
      },
    });

  const askGenerate = () => {
    const problem = checkCanGenerateDraw(tournament, entries);
    if (problem) {
      setError(problem);
      return;
    }
    setConfirm({
      title: '¿Generar los cruces?',
      message: `Se sortea el cuadro con ${confirmed.length} ${unit}${
        seeded > 0 ? ` y ${seeded} cabezas de serie` : ''
      }. La inscripción se cierra.`,
      confirmLabel: 'Generar cruces',
      onConfirm: () => {
        setConfirm(null);
        void tournaments.generateDraw(tournament.id).then((r) => {
          if (r.ok) onDrawGenerated();
          else setError(r.error);
        });
      },
    });
  };

  return (
    <>
      <Card className="flex flex-col gap-1">
        <p className="text-2xl font-bold" data-testid="contador-inscriptos">
          {confirmed.length} / {tournament.maxEntries} {unit}
        </p>
        {waiting.length > 0 && <p className="text-lg">{waiting.length} en lista de espera</p>}
        {tournament.entryFee > 0 && (
          <p className="text-lg">
            Cobrado {formatMoney(summary.paid)} · Pendiente {formatMoney(summary.pending)}
          </p>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-900">
          {error}
        </p>
      )}

      {open && (
        <div className={`grid gap-3 ${seedsEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Link
            to={`/torneos/${tournament.id}/inscribir`}
            className="inline-flex min-h-14 items-center justify-center gap-1 rounded-2xl bg-brand-800 text-lg font-semibold text-white dark:bg-brand-700"
          >
            <PlusIcon /> Inscribir
          </Link>
          {seedsEnabled && (
            <Link
              to={`/torneos/${tournament.id}/cabezas`}
              className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-neutral-900 text-lg font-semibold dark:border-neutral-100"
            >
              Cabezas de serie
            </Link>
          )}
        </div>
      )}

      {confirmed.length === 0 ? (
        <EmptyState title="Todavía no hay inscriptos" />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Inscriptos confirmados">
          {[...confirmed]
            .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
            .map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                data={data}
                canWithdraw={open}
                onWithdraw={() => askWithdraw(entry)}
              />
            ))}
        </ul>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="espera" className="flex flex-col gap-2">
          <h2 id="espera" className="text-xl font-bold">
            Lista de espera
          </h2>
          <ol className="flex flex-col gap-2" aria-label="Lista de espera">
            {waiting.map((entry, i) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                data={data}
                position={i + 1}
                canWithdraw={open}
                onWithdraw={() => askWithdraw(entry)}
              />
            ))}
          </ol>
        </section>
      )}

      {open && (
        <Button onClick={askGenerate} className="mt-2">
          Generar cruces
        </Button>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        {...(confirm ?? EMPTY_CONFIRM)}
      />
      <Toast message={toast} />
    </>
  );
}

const EMPTY_CONFIRM: Confirm = {
  title: '',
  message: '',
  confirmLabel: '',
  onConfirm: () => undefined,
};

function EntryRow({
  entry,
  data,
  position,
  canWithdraw,
  onWithdraw,
}: {
  entry: Entry;
  data: TournamentData;
  position?: number;
  canWithdraw: boolean;
  onWithdraw: () => void;
}) {
  const { tournaments } = useServices();
  const { players, tournament } = data;
  const name = entryName(entry, players);
  return (
    <li className="flex flex-col gap-2 rounded-2xl border-2 border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        {entry.seed !== null && (
          <span
            className="rounded-lg bg-brand-800 px-2 py-0.5 font-bold text-white"
            title="Cabeza de serie"
          >
            [{entry.seed}]
          </span>
        )}
        {position !== undefined && <span className="font-bold">{position}.</span>}
        <span className="flex-1 text-lg font-semibold">{name}</span>
        {canWithdraw && (
          <button
            type="button"
            aria-label={`Dar de baja a ${name}`}
            onClick={onWithdraw}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-red-700 active:bg-red-50 dark:text-red-400"
          >
            <TrashIcon />
          </button>
        )}
      </div>
      {tournament.entryFee > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.payments.map((p) => {
            const player = players.get(p.playerId);
            const paid = p.status === 'paid';
            const who = entry.payments.length > 1 && player ? `${player.firstName}: ` : '';
            return (
              <button
                key={p.playerId}
                type="button"
                aria-pressed={paid}
                aria-label={`Pago de ${player ? `${player.firstName} ${player.lastName}` : 'jugador'}: ${
                  paid ? 'pagado' : 'pendiente'
                }`}
                onClick={() =>
                  void tournaments.setPayment(entry.id, p.playerId, paid ? 'pending' : 'paid')
                }
                className={`min-h-11 rounded-xl px-3 font-semibold ${
                  paid
                    ? 'bg-brand-800 text-white dark:bg-brand-700'
                    : 'border-2 border-amber-600 text-amber-800 dark:text-amber-300'
                }`}
              >
                {who}
                {paid ? `Pagó ${formatMoney(p.amount)}` : `Debe ${formatMoney(p.amount)}`}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

// ── Partidos ──────────────────────────────────────────────

function useResolved(data: TournamentData) {
  return useMemo(() => {
    const resolved = [...resolveKnockout(data.matches).values()];
    const bracket = bracketMatches(data.matches);
    const rounds = Math.max(0, ...bracket.map((m) => m.round));
    const nameOf = (entryId: string | null) =>
      entryId ? entryName(data.entriesById.get(entryId), data.players) : 'A definir';
    const titleOf = (r: ResolvedMatch) => matchTitle(r.match, data);
    const inBracket = new Set(bracket.map((m) => m.id));
    return { resolved, rounds, nameOf, titleOf, inBracket };
  }, [data]);
}

function NoDraw() {
  return (
    <EmptyState title="Todavía no hay cruces">
      <p className="text-lg text-neutral-700 dark:text-neutral-300">
        Inscribí a los jugadores y tocá <strong>Generar cruces</strong> en la pestaña Inscriptos.
      </p>
    </EmptyState>
  );
}

function MatchesTab({ data }: { data: TournamentData }) {
  const { resolved, nameOf, titleOf } = useResolved(data);
  if (data.matches.length === 0) return <NoDraw />;

  const byOrder = (x: ResolvedMatch, y: ResolvedMatch) =>
    x.match.round - y.match.round || x.match.position - y.match.position;
  const ready = resolved.filter((r) => r.state === 'ready').sort(byOrder);
  const finished = resolved.filter((r) => r.state === 'finished').sort((x, y) => byOrder(y, x));
  const waiting = resolved.filter((r) => r.state === 'waiting').length;
  const href = (r: ResolvedMatch) => `/torneos/${data.tournament.id}/partidos/${r.match.id}`;

  return (
    <>
      <section aria-labelledby="para-jugar" className="flex flex-col gap-2">
        <h2 id="para-jugar" className="text-xl font-bold">
          Para jugar ({ready.length})
        </h2>
        {ready.length === 0 && (
          <p className="text-neutral-700 dark:text-neutral-300">
            {data.tournament.status === 'finished'
              ? 'El torneo terminó.'
              : 'No hay partidos listos.'}
          </p>
        )}
        {ready.map((r) => (
          <MatchCard
            key={r.match.id}
            resolved={r}
            nameOf={nameOf}
            title={titleOf(r)}
            href={href(r)}
          />
        ))}
      </section>
      {waiting > 0 && (
        <p className="text-neutral-700 dark:text-neutral-300">
          {waiting} {waiting === 1 ? 'partido espera' : 'partidos esperan'} a que se definan sus
          jugadores.
        </p>
      )}
      {finished.length > 0 && (
        <section aria-labelledby="terminados" className="flex flex-col gap-2">
          <h2 id="terminados" className="text-xl font-bold">
            Terminados ({finished.length})
          </h2>
          {finished.map((r) => (
            <MatchCard
              key={r.match.id}
              resolved={r}
              nameOf={nameOf}
              title={titleOf(r)}
              href={href(r)}
            />
          ))}
        </section>
      )}
    </>
  );
}

// ── Cuadro ────────────────────────────────────────────────

function BracketTab({ data }: { data: TournamentData }) {
  const { resolved: all, rounds, nameOf, inBracket } = useResolved(data);
  const resolved = all.filter((r) => inBracket.has(r.match.id));
  const firstPending = resolved
    .filter((r) => r.state === 'ready')
    .reduce((min, r) => Math.min(min, r.match.round), rounds);
  const [selected, setSelected] = useState<number | null>(null);
  if (data.matches.length === 0) return <NoDraw />;
  if (resolved.length === 0) {
    return (
      <EmptyState title="Todavía no hay cuadro final">
        <p className="text-lg text-neutral-700 dark:text-neutral-300">
          Se arma solo cuando terminan todos los partidos de los grupos.
        </p>
      </EmptyState>
    );
  }
  const round = selected ?? Math.max(1, firstPending);
  const inRound = resolved
    .filter((r) => r.match.round === round)
    .sort((x, y) => x.match.position - y.match.position);

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4" role="tablist" aria-label="Rondas">
        <div className="flex w-max gap-2">
          {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === round}
              onClick={() => setSelected(r)}
              className={`min-h-12 rounded-xl border-2 px-4 font-semibold whitespace-nowrap ${
                r === round
                  ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >
              {roundName(r, rounds)}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-2" aria-label={roundName(round, rounds)}>
        {inRound.map((r) => (
          <li key={r.match.id}>
            <MatchCard
              resolved={r}
              nameOf={nameOf}
              title={`Partido ${r.match.position + 1}`}
              href={
                r.state === 'ready' || r.state === 'finished'
                  ? `/torneos/${data.tournament.id}/partidos/${r.match.id}`
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}

// ── Acciones peligrosas ───────────────────────────────────

function DangerZone({ data }: { data: TournamentData }) {
  const { tournaments } = useServices();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { tournament, matches } = data;
  const canUndo = tournament.drawGeneratedAt !== null && matches.every((m) => m.result === null);

  return (
    <section
      aria-label="Acciones del torneo"
      className="mt-6 flex flex-col gap-3 border-t-2 border-neutral-200 pt-4 dark:border-neutral-800"
    >
      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-900">
          {error}
        </p>
      )}
      {canUndo && (
        <Button
          variant="secondary"
          onClick={() =>
            setConfirm({
              title: '¿Deshacer el sorteo?',
              message: 'Se borran los cruces y se vuelve a abrir la inscripción.',
              confirmLabel: 'Sí, deshacer',
              danger: true,
              onConfirm: () => {
                setConfirm(null);
                void tournaments.undoDraw(tournament.id).then((r) => {
                  if (!r.ok) setError(r.error);
                });
              },
            })
          }
        >
          Deshacer sorteo
        </Button>
      )}
      <Button
        variant="danger"
        onClick={() =>
          setConfirm({
            title: '¿Eliminar el torneo?',
            message: `Se elimina "${tournament.name}" con sus inscriptos y resultados.`,
            confirmLabel: 'Sí, eliminar',
            danger: true,
            onConfirm: () => {
              setConfirm(null);
              void tournaments.remove(tournament.id).then(() => navigate('/', { replace: true }));
            },
          })
        }
      >
        <TrashIcon /> Eliminar torneo
      </Button>
      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        {...(confirm ?? EMPTY_CONFIRM)}
      />
    </section>
  );
}
