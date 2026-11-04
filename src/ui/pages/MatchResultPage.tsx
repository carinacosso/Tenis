import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { resolveKnockout } from '../../domain/knockout';
import {
  type QuickSetScore,
  type SetScore,
  type MatchResult,
  type ResultOutcome,
  type SetsScoring,
  type Side,
  buildWalkover,
  buildSetsResult,
  isSuperTiebreakSet,
  quickSetScores,
  setsToWin,
} from '../../domain/scoring';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { OutcomeChooser, PartialSetsEditor, SideChooser } from '../components/OutcomeInputs';
import { isRotation } from '../../domain/tournament';
import { Page } from '../components/Layout';
import { Button, Card } from '../components/ui';
import { entryName } from '../format';
import { matchTitle } from '../matchTitle';
import { useTournament } from '../hooks/useTournament';
import { useServices } from '../ServicesContext';
import { ScoreResultForm } from './ScoreResultForm';

interface SetInput {
  winner: Side | null;
  score: QuickSetScore | null;
  tiebreakLoser: number | null;
}

const EMPTY_SET: SetInput = { winner: null, score: null, tiebreakLoser: null };

function fromSetScore(s: SetScore): SetInput {
  const winner: Side = s.a > s.b ? 'A' : 'B';
  const w = Math.max(s.a, s.b);
  const l = Math.min(s.a, s.b);
  return {
    winner,
    score: { winner: w, loser: l, tiebreak: w - l === 1 },
    tiebreakLoser: s.tiebreak ? Math.min(s.tiebreak.a, s.tiebreak.b) : null,
  };
}

function toSetScore(input: SetInput, config: SetsScoring): SetScore | null {
  if (!input.winner || !input.score) return null;
  const { winner: w, loser: l } = input.score;
  const set: SetScore = input.winner === 'A' ? { a: w, b: l } : { a: l, b: w };
  if (input.score.tiebreak && input.tiebreakLoser !== null) {
    const tl = input.tiebreakLoser;
    const tw = Math.max(config.tiebreak.points, tl + 2);
    set.tiebreak = input.winner === 'A' ? { a: tw, b: tl } : { a: tl, b: tw };
  }
  return set;
}

/** Sets a mostrar: hasta que alguien gane el partido, más uno vacío si falta definir. */
function visibleSets(inputs: SetInput[], config: SetsScoring): number {
  const needed = setsToWin(config.bestOf);
  let a = 0;
  let b = 0;
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (!input?.winner || !input.score) return i + 1;
    if (input.winner === 'A') a++;
    else b++;
    if (a === needed || b === needed) return i + 1;
  }
  return Math.min(inputs.length + 1, config.bestOf);
}

export function MatchResultPage() {
  const { id = '', matchId = '' } = useParams();
  const state = useTournament(id);
  const { tournaments } = useServices();
  const navigate = useNavigate();
  const [inputs, setInputs] = useState<SetInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ cleared: string[]; clear: boolean } | null>(null);
  const [outcomeChoice, setOutcomeChoice] = useState<ResultOutcome | null>(null);
  const [absentChoice, setAbsentChoice] = useState<Side | null>(null);
  const [partialChoice, setPartialChoice] = useState<SetScore[] | null>(null);
  const back = `/torneos/${id}?tab=partidos`;

  const resolved = useMemo(
    () => (state.status === 'ready' ? resolveKnockout(state.matches) : null),
    [state],
  );

  if (state.status !== 'ready' || !resolved) {
    return (
      <Page title="Resultado" back={back}>
        <p aria-busy="true">Cargando…</p>
      </Page>
    );
  }

  if (isRotation(state.tournament.format)) {
    const match = state.matches.find((m) => m.id === matchId);
    const rotationBack = `/torneos/${id}?tab=rondas`;
    if (!match) {
      return (
        <Page title="Resultado" back={rotationBack}>
          <p className="text-lg">No encontramos ese partido.</p>
        </Page>
      );
    }
    return <ScoreResultForm key={match.id} data={state} match={match} back={rotationBack} />;
  }

  const target = resolved.get(matchId);
  const config = state.tournament.scoring;
  if (
    !target ||
    (target.state !== 'ready' && target.state !== 'finished') ||
    config.kind !== 'sets'
  ) {
    return (
      <Page title="Resultado" back={back}>
        <p className="text-lg">Este partido no se puede cargar todavía.</p>
      </Page>
    );
  }

  const nameA = entryName(state.entriesById.get(target.a ?? ''), state.players);
  const nameB = entryName(state.entriesById.get(target.b ?? ''), state.players);
  const nameOf = (side: Side) => (side === 'A' ? nameA : nameB);

  const savedResult = target.match.result?.kind === 'sets' ? target.match.result : null;
  const savedOutcome = savedResult?.outcome ?? 'normal';
  const outcome: ResultOutcome = outcomeChoice ?? savedOutcome;
  const absent: Side | null =
    absentChoice ??
    (savedResult && savedOutcome !== 'normal' ? (savedResult.winner === 'A' ? 'B' : 'A') : null);
  const partial: SetScore[] =
    partialChoice ??
    (savedResult && (savedOutcome === 'retired' || savedOutcome === 'injury')
      ? savedResult.sets
      : []);
  const saved = savedResult && savedOutcome === 'normal' ? savedResult.sets.map(fromSetScore) : [];
  const current = inputs ?? saved;
  const count = visibleSets(current, config);

  const update = (index: number, change: Partial<SetInput>) => {
    setError(null);
    const next = [...current];
    while (next.length <= index) next.push(EMPTY_SET);
    const previous = next[index] ?? EMPTY_SET;
    next[index] = { ...previous, ...change };
    setInputs(next.slice(0, Math.max(index + 1, visibleSets(next, config))));
  };

  const submit = async (confirmed: boolean, clear = false) => {
    let result: MatchResult | null = null;
    if (!clear && outcome !== 'normal') {
      if (!absent) {
        setError(outcome === 'walkover' ? 'Elegí quién no se presentó.' : 'Elegí quién abandonó.');
        return;
      }
      const winner: Side = absent === 'A' ? 'B' : 'A';
      if (outcome === 'walkover') {
        const built = buildWalkover(config, winner);
        if (!built.ok) {
          setError(built.error);
          return;
        }
        result = built.result;
      } else {
        result = { kind: 'sets', outcome, sets: partial, winner };
      }
    } else if (!clear) {
      const sets = Array.from({ length: count }, (_, i) =>
        toSetScore(current[i] ?? EMPTY_SET, config),
      );
      if (sets.some((s) => s === null)) {
        setError('Completá todos los sets.');
        return;
      }
      const built = buildSetsResult(
        config,
        sets.filter((s): s is SetScore => s !== null),
      );
      if (!built.ok) {
        setError(built.error);
        return;
      }
      result = built.result;
    }
    const response = await tournaments.recordResult(matchId, result, confirmed);
    if (response.status === 'invalid') setError(response.error);
    else if (response.status === 'needsConfirmation')
      setPending({ cleared: response.cleared, clear });
    else navigate(back, { replace: true });
  };

  const affected = (pending?.cleared ?? []).map((mid) => {
    const r = resolved.get(mid);
    if (!r) return '';
    return `${matchTitle(r.match, state)}: ${entryName(state.entriesById.get(r.a ?? ''), state.players)} vs ${entryName(state.entriesById.get(r.b ?? ''), state.players)}`;
  });

  return (
    <Page title="Resultado" back={back}>
      <Card>
        <p className="text-sm font-semibold text-neutral-600 uppercase dark:text-neutral-400">
          {matchTitle(target.match, state)}
        </p>
        <p className="text-xl font-bold">{nameA}</p>
        <p className="text-neutral-600 dark:text-neutral-400">vs</p>
        <p className="text-xl font-bold">{nameB}</p>
      </Card>

      <OutcomeChooser
        value={outcome}
        onChange={(o) => {
          setError(null);
          setOutcomeChoice(o);
        }}
      />

      {outcome !== 'normal' && (
        <SideChooser
          label={outcome === 'walkover' ? '¿Quién no se presentó?' : '¿Quién abandonó?'}
          nameA={nameA}
          nameB={nameB}
          value={absent}
          onChange={(side) => {
            setError(null);
            setAbsentChoice(side);
          }}
        />
      )}
      {(outcome === 'retired' || outcome === 'injury') && (
        <PartialSetsEditor
          sets={partial}
          nameA={nameA}
          nameB={nameB}
          onChange={(sets) => {
            setError(null);
            setPartialChoice(sets);
          }}
        />
      )}
      {outcome === 'injury' && target.match.stage === 'group' && (
        <p className="rounded-xl bg-amber-100 p-3 font-medium text-amber-950">
          Por la lesión, pierde por W.O. los partidos que le quedan en la fase.
        </p>
      )}
      {outcome !== 'normal' && (
        <p className="text-neutral-700 dark:text-neutral-300">
          {outcome === 'walkover'
            ? 'En la tabla cuenta como 6-0 6-0 para el ganador.'
            : 'En la tabla se completa el partido a favor del rival.'}
        </p>
      )}

      {outcome === 'normal' &&
        Array.from({ length: count }, (_, index) => {
          const input = current[index] ?? EMPTY_SET;
          const superTb = isSuperTiebreakSet(config, index);
          return (
            <section
              key={index}
              aria-label={`Set ${index + 1}`}
              className="flex flex-col gap-3 rounded-2xl border-2 border-neutral-200 p-4 dark:border-neutral-800"
            >
              <h2 className="text-xl font-bold">
                {superTb ? 'Super tie-break' : `Set ${index + 1}`}
              </h2>
              <p className="font-semibold">¿Quién ganó?</p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={input.winner === side}
                    onClick={() => update(index, { winner: side })}
                    className={`min-h-14 rounded-xl border-2 px-2 text-lg font-semibold ${
                      input.winner === side
                        ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                        : 'border-neutral-400 dark:border-neutral-600'
                    }`}
                  >
                    {nameOf(side)}
                  </button>
                ))}
              </div>
              {input.winner && (
                <>
                  <p className="font-semibold">Resultado del set</p>
                  <div className="grid grid-cols-4 gap-2">
                    {quickSetScores(config, index).map((s) => {
                      const selected =
                        input.score?.winner === s.winner && input.score.loser === s.loser;
                      return (
                        <button
                          key={`${s.winner}-${s.loser}`}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => update(index, { score: s, tiebreakLoser: null })}
                          className={`min-h-14 rounded-xl border-2 text-xl font-bold tabular-nums ${
                            selected
                              ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                              : 'border-neutral-400 dark:border-neutral-600'
                          }`}
                        >
                          {s.winner}-{s.loser}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {input.score?.tiebreak && (
                <TiebreakInput
                  points={config.tiebreak.points}
                  value={input.tiebreakLoser}
                  onChange={(v) => update(index, { tiebreakLoser: v })}
                />
              )}
            </section>
          );
        })}

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-900">
          {error}
        </p>
      )}

      <Button onClick={() => void submit(false)}>Guardar resultado</Button>
      {target.match.result && (
        <Button variant="secondary" onClick={() => void submit(false, true)}>
          Borrar resultado
        </Button>
      )}

      <ConfirmDialog
        open={pending !== null}
        danger
        title="Esto cambia partidos ya jugados"
        message={`Se van a borrar estos resultados porque cambian los jugadores: ${affected.join('; ')}.`}
        confirmLabel="Sí, guardar y borrar"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const clear = pending?.clear ?? false;
          setPending(null);
          void submit(true, clear);
        }}
      />
    </Page>
  );
}

/** Tie-break opcional: solo se cargan los puntos del que perdió el tie-break. */
function TiebreakInput({
  points,
  value,
  onChange,
}: {
  points: number;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const options = Array.from({ length: points - 1 }, (_, i) => i);
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">Tie-break (opcional): puntos del que perdió</p>
      <div className="flex flex-wrap gap-2">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={`min-h-12 min-w-12 rounded-xl border-2 text-lg font-bold ${
              value === n
                ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                : 'border-neutral-400 dark:border-neutral-600'
            }`}
          >
            {n}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={points - 1}
          aria-label="Otro valor de tie-break"
          placeholder="más"
          value={value !== null && value >= points - 1 ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="min-h-12 w-20 rounded-xl border-2 border-neutral-400 bg-white px-2 text-lg dark:border-neutral-600 dark:bg-neutral-900"
        />
      </div>
    </div>
  );
}
