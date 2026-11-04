import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Match, sideEntries } from '../../domain/match';
import { lastRoundNumber } from '../../domain/rotationStandings';
import { type MatchResult, type Side, buildScoreResult, buildWalkover } from '../../domain/scoring';
import { OutcomeChooser, SideChooser } from '../components/OutcomeInputs';
import { Page } from '../components/Layout';
import { Button, Card } from '../components/ui';
import { entryName } from '../format';
import type { TournamentData } from '../hooks/useTournament';
import { useServices } from '../ServicesContext';

/** Carga de resultados a puntos (gana el primero que llega) o por tiempo (puede haber empate). */
export function ScoreResultForm({
  data,
  match,
  back,
}: {
  data: TournamentData;
  match: Match;
  back: string;
}) {
  const { tournaments } = useServices();
  const navigate = useNavigate();
  const config = data.tournament.scoring;
  const saved = match.result && match.result.kind !== 'sets' ? match.result : null;
  const [a, setA] = useState<number | null>(saved?.a ?? null);
  const [b, setB] = useState<number | null>(saved?.b ?? null);
  const [error, setError] = useState<string | null>(null);
  const [walkover, setWalkover] = useState(saved?.outcome === 'walkover');
  const [absent, setAbsent] = useState<Side | null>(
    saved?.outcome === 'walkover' ? (saved.winner === 'A' ? 'B' : 'A') : null,
  );

  const name = (side: Side) =>
    sideEntries(side === 'A' ? match.sideA : match.sideB)
      .map((id) => entryName(data.entriesById.get(id), data.players))
      .join(' / ');
  // En el Mexicano las rondas se arman según el ranking: avisar que las ya armadas no cambian.
  const laterRounds =
    data.tournament.format.kind === 'mexicano' && lastRoundNumber(data.rounds) > match.round;

  const save = async (clear: boolean) => {
    let result: MatchResult | null = null;
    if (!clear && walkover) {
      if (!absent) {
        setError('Elegí quién no se presentó.');
        return;
      }
      const built = buildWalkover(config, absent === 'A' ? 'B' : 'A');
      if (!built.ok) {
        setError(built.error);
        return;
      }
      result = built.result;
    } else if (!clear) {
      if (a === null || b === null) {
        setError('Completá el resultado.');
        return;
      }
      const built = buildScoreResult(config, a, b);
      if (!built.ok) {
        setError(built.error);
        return;
      }
      result = built.result;
    }
    const outcome = await tournaments.recordResult(match.id, result);
    if (outcome.status === 'invalid') setError(outcome.error);
    else navigate(back, { replace: true });
  };

  return (
    <Page title="Resultado" back={back}>
      <Card>
        <p className="text-sm font-semibold text-neutral-600 uppercase dark:text-neutral-400">
          Ronda {match.round} · Partido {match.position + 1}
        </p>
        <p className="text-xl font-bold">{name('A')}</p>
        <p className="text-neutral-600 dark:text-neutral-400">vs</p>
        <p className="text-xl font-bold">{name('B')}</p>
      </Card>

      {config.kind === 'points' && (
        <OutcomeChooser
          value={walkover ? 'walkover' : 'normal'}
          options={['normal', 'walkover']}
          onChange={(o) => {
            setError(null);
            setWalkover(o === 'walkover');
          }}
        />
      )}
      {walkover && (
        <SideChooser
          label="¿Quién no se presentó?"
          nameA={name('A')}
          nameB={name('B')}
          value={absent}
          onChange={(side) => {
            setError(null);
            setAbsent(side);
          }}
        />
      )}
      {config.kind === 'points' && !walkover && (
        <PointsInput
          target={config.target}
          nameA={name('A')}
          nameB={name('B')}
          a={a}
          b={b}
          onChange={(x, y) => {
            setError(null);
            setA(x);
            setB(y);
          }}
        />
      )}
      {config.kind === 'time' && (
        <>
          <p className="text-lg">Anotá los puntos de cada lado al terminar el tiempo.</p>
          <Stepper
            label={name('A')}
            value={a ?? 0}
            onChange={(v) => {
              setError(null);
              setA(v);
              if (b === null) setB(0);
            }}
          />
          <Stepper
            label={name('B')}
            value={b ?? 0}
            onChange={(v) => {
              setError(null);
              setB(v);
              if (a === null) setA(0);
            }}
          />
        </>
      )}

      {laterRounds && (
        <p className="rounded-xl bg-amber-100 p-3 font-medium text-amber-950">
          El ranking se recalcula. Las rondas siguientes ya armadas no cambian.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-900">
          {error}
        </p>
      )}
      <Button onClick={() => void save(false)}>Guardar resultado</Button>
      {match.result && (
        <Button variant="secondary" onClick={() => void save(true)}>
          Borrar resultado
        </Button>
      )}
    </Page>
  );
}

/** A puntos fijos: se elige quién ganó y los puntos del que perdió. */
function PointsInput({
  target,
  nameA,
  nameB,
  a,
  b,
  onChange,
}: {
  target: number;
  nameA: string;
  nameB: string;
  a: number | null;
  b: number | null;
  onChange: (a: number | null, b: number | null) => void;
}) {
  const winner: Side | null = a === target ? 'A' : b === target ? 'B' : null;
  const loserPoints = winner === 'A' ? b : winner === 'B' ? a : null;
  const choose = (side: Side, loser: number | null) =>
    side === 'A' ? onChange(target, loser) : onChange(loser, target);

  return (
    <section
      aria-label="Resultado"
      className="flex flex-col gap-3 rounded-2xl border-2 border-neutral-200 p-4 dark:border-neutral-800"
    >
      <p className="font-semibold">¿Quién llegó a {target}?</p>
      <div className="grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={winner === side}
            onClick={() => choose(side, loserPoints)}
            className={`min-h-14 rounded-xl border-2 px-2 text-lg font-semibold ${
              winner === side
                ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                : 'border-neutral-400 dark:border-neutral-600'
            }`}
          >
            {side === 'A' ? nameA : nameB}
          </button>
        ))}
      </div>
      {winner && (
        <>
          <p className="font-semibold">Puntos de {winner === 'A' ? nameB : nameA}</p>
          {target <= 40 ? (
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: target }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={loserPoints === n}
                  onClick={() => choose(winner, n)}
                  className={`min-h-12 rounded-xl border-2 text-lg font-bold tabular-nums ${
                    loserPoints === n
                      ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                      : 'border-neutral-400 dark:border-neutral-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="number"
              inputMode="numeric"
              aria-label="Puntos del que perdió"
              value={loserPoints ?? ''}
              onChange={(e) =>
                choose(winner, e.target.value === '' ? null : Number(e.target.value))
              }
              className="min-h-14 rounded-xl border-2 border-neutral-400 bg-white px-4 text-lg dark:border-neutral-600 dark:bg-neutral-900"
            />
          )}
        </>
      )}
    </section>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const button =
    'h-16 w-16 rounded-2xl border-2 border-neutral-900 text-3xl font-bold active:bg-neutral-100 dark:border-neutral-100 dark:active:bg-neutral-800';
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-lg font-semibold">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={`Restar un punto a ${label}`}
          className={button}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label={`Puntos de ${label}`}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          className="h-16 w-24 rounded-xl border-2 border-neutral-400 bg-white text-center text-3xl font-bold tabular-nums dark:border-neutral-600 dark:bg-neutral-900"
        />
        <button
          type="button"
          aria-label={`Sumar un punto a ${label}`}
          className={button}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
