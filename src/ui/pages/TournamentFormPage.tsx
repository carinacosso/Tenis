import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_POINTS_SCORING,
  DEFAULT_SETS_SCORING,
  POINT_TARGETS,
  type ScoringConfig,
  type SetsScoring,
  describeScoring,
} from '../../domain/scoring';
import {
  FORMAT_LABELS,
  type FormatChoice,
  LOCKED_AFTER_DRAW,
  type Modality,
  type Tournament,
  type TournamentDraft,
  type TournamentField,
  formatChoice,
  DEFAULT_TIEBREAK_ORDER,
  TIEBREAK_LABELS,
  type TiebreakCriterion,
  formatFromChoice,
  hasStandings,
  isRotation,
} from '../../domain/tournament';
import { ArrowDownIcon, ArrowUpIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { Button, Card, ChoiceGroup, IconButton, TextField } from '../components/ui';
import { todayIso } from '../format';
import { useSettings } from '../hooks/useData';
import { useServices } from '../ServicesContext';

function emptyDraft(): TournamentDraft {
  return {
    name: '',
    date: todayIso(),
    venue: '',
    category: '',
    modality: 'singles',
    format: { kind: 'knockout' },
    scoring: DEFAULT_SETS_SCORING,
    maxEntries: 16,
    entryFee: 0,
    tiebreakOrder: [...DEFAULT_TIEBREAK_ORDER],
  };
}

function toDraft(t: Tournament): TournamentDraft {
  const { name, date, venue, category, modality, format, scoring, maxEntries, entryFee } = t;
  return {
    name,
    date,
    venue,
    category,
    modality,
    format,
    scoring,
    maxEntries,
    entryFee,
    tiebreakOrder: t.tiebreakOrder ?? [...DEFAULT_TIEBREAK_ORDER],
  };
}

const FORMAT_HELP: Record<FormatChoice, string> = {
  knockout: 'Cuadro: el que pierde queda afuera.',
  groups: 'Primero grupos todos contra todos; los mejores de cada grupo pasan a un cuadro final.',
  league: 'Todos contra todos; gana el primero de la tabla.',
  americano_doubles: 'Parejas que cambian cada ronda; cada uno suma los puntos de su pareja.',
  americano_singles: 'Todos contra todos, suma de puntos individual.',
  americano_mixed: 'Como el Americano dobles, con parejas siempre hombre + mujer.',
  mexicano: 'Desde la ronda 2 se cruzan según el ranking: 1° y 4° vs 2° y 3°.',
};

const yesNo = [
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
] as const;

export function TournamentFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { tournaments } = useServices();
  const settings = useSettings();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<TournamentDraft>(emptyDraft);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(!editing);
  const [errors, setErrors] = useState<Partial<Record<TournamentField, string>>>({});
  // Los números se editan como texto para permitir borrar el campo mientras se escribe.
  const [maxText, setMaxText] = useState('16');
  const [feeText, setFeeText] = useState('0');
  const [roundsText, setRoundsText] = useState('');
  const [customTarget, setCustomTarget] = useState('');
  const [minutesText, setMinutesText] = useState('15');
  const [groupCountText, setGroupCountText] = useState('2');

  useEffect(() => {
    if (id === undefined) return;
    let active = true;
    void tournaments.get(id).then((t) => {
      if (!active || !t) return;
      setDraft(toDraft(t));
      setMaxText(String(t.maxEntries));
      setFeeText(String(t.entryFee));
      if (isRotation(t.format) && t.format.rounds !== null) setRoundsText(String(t.format.rounds));
      const { scoring } = t;
      if (scoring.kind === 'points' && !POINT_TARGETS.some((p) => p === scoring.target))
        setCustomTarget(String(scoring.target));
      if (t.scoring.kind === 'time') setMinutesText(String(t.scoring.minutes));
      if (t.format.kind === 'groups') setGroupCountText(String(t.format.groupCount));
      setLocked(t.drawGeneratedAt !== null);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [id, tournaments]);

  const set = <K extends TournamentField>(field: K, value: TournamentDraft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const rotation = isRotation(draft.format);
  const choice = formatChoice(draft.format);

  const chooseFormat = (next: FormatChoice) => {
    const nextFormat = formatFromChoice(next, null);
    setRoundsText('');
    setGroupCountText('2');
    setDraft((d) => {
      const nextRotation = isRotation(nextFormat);
      // Al cambiar entre familias de formatos, se pasa a una puntuación compatible.
      let scoring: ScoringConfig = d.scoring;
      if (nextRotation && d.scoring.kind === 'sets') scoring = DEFAULT_POINTS_SCORING;
      if (!nextRotation && d.scoring.kind !== 'sets') scoring = DEFAULT_SETS_SCORING;
      return { ...d, format: nextFormat, scoring };
    });
    setErrors((e) => ({ ...e, format: undefined, scoring: undefined }));
  };

  const sets: SetsScoring = draft.scoring.kind === 'sets' ? draft.scoring : DEFAULT_SETS_SCORING;
  const setSets = (change: Partial<SetsScoring>) => {
    const next = { ...sets, ...change };
    if (next.bestOf === 1) next.decidingSet = 'full';
    set('scoring', next);
  };

  // Opción marcada: por tiempo, un objetivo estándar (16, 21…) u "Otro" (customTarget con valor).
  const pointsMode =
    draft.scoring.kind === 'time'
      ? 'time'
      : customTarget !== '' || draft.scoring.kind !== 'points'
        ? 'custom'
        : String(draft.scoring.target);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const toNumber = (text: string) =>
      text.trim() === '' ? Number.NaN : Number(text.replace(',', '.'));
    let format = draft.format;
    if (isRotation(format)) {
      format = { ...format, rounds: roundsText.trim() === '' ? null : toNumber(roundsText) };
    }
    if (format.kind === 'groups') format = { ...format, groupCount: toNumber(groupCountText) };
    let scoring = draft.scoring;
    if (rotation && pointsMode === 'custom')
      scoring = { kind: 'points', target: toNumber(customTarget) };
    if (rotation && pointsMode === 'time')
      scoring = { kind: 'time', minutes: toNumber(minutesText) };
    const full: TournamentDraft = {
      ...draft,
      format,
      scoring,
      maxEntries: toNumber(maxText),
      entryFee: feeText.trim() === '' ? 0 : toNumber(feeText),
    };
    const result = editing ? await tournaments.update(id, full) : await tournaments.create(full);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    navigate(`/torneos/${result.value.id}`, { replace: true });
  };

  const title = editing ? 'Editar torneo' : 'Nuevo torneo';
  const back = editing ? `/torneos/${id}` : '/';
  if (!loaded) {
    return (
      <Page title={title} back={back}>
        <p aria-busy="true">Cargando…</p>
      </Page>
    );
  }

  const isLocked = (field: TournamentField) => locked && LOCKED_AFTER_DRAW.includes(field);
  const levels = settings.status === 'ready' ? settings.data.levels : [];
  const unit = rotation ? 'jugadores' : draft.modality === 'doubles' ? 'parejas' : 'jugadores';

  return (
    <Page title={title} back={back}>
      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <TextField
          label="Nombre del torneo"
          value={draft.name}
          error={errors.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <TextField
          label="Fecha"
          type="date"
          value={draft.date}
          error={errors.date}
          onChange={(e) => set('date', e.target.value)}
        />
        <TextField
          label="Lugar (opcional)"
          value={draft.venue}
          error={errors.venue}
          onChange={(e) => set('venue', e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <TextField
            label="Categoría"
            value={draft.category}
            error={errors.category}
            hint="Escribila o elegí un nivel."
            onChange={(e) => set('category', e.target.value)}
          />
          <div className="flex flex-wrap gap-2" aria-label="Niveles sugeridos">
            {levels.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => set('category', level)}
                className="min-h-10 rounded-xl border-2 border-neutral-300 px-3 font-semibold dark:border-neutral-700"
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {locked && (
          <p className="rounded-xl bg-amber-100 p-3 font-medium text-amber-950">
            Los cruces ya están generados: la modalidad, el formato y la puntuación no se pueden
            cambiar.
          </p>
        )}

        <fieldset disabled={isLocked('format')} className="flex flex-col gap-2 disabled:opacity-60">
          <ChoiceGroup<FormatChoice>
            label="Formato"
            options={(Object.keys(FORMAT_LABELS) as FormatChoice[]).map((value) => ({
              value,
              label: FORMAT_LABELS[value],
            }))}
            value={choice}
            error={errors.format}
            onChange={chooseFormat}
          />
          <p className="text-neutral-700 dark:text-neutral-300">{FORMAT_HELP[choice]}</p>
        </fieldset>

        {!rotation && (
          <fieldset disabled={isLocked('modality')} className="disabled:opacity-60">
            <ChoiceGroup<Modality>
              label="Modalidad"
              options={[
                { value: 'singles', label: 'Singles' },
                { value: 'doubles', label: 'Dobles' },
              ]}
              value={draft.modality}
              error={errors.modality}
              onChange={(v) => set('modality', v)}
            />
          </fieldset>
        )}

        {rotation && (
          <fieldset disabled={isLocked('format')} className="disabled:opacity-60">
            <TextField
              label="Cantidad de rondas"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="Automático"
              value={roundsText}
              error={errors.format}
              hint="Vacío = rotación completa (todos juegan con todos una vez)."
              onChange={(e) => {
                setRoundsText(e.target.value);
                setErrors((x) => ({ ...x, format: undefined }));
              }}
            />
          </fieldset>
        )}

        {draft.format.kind === 'groups' && (
          <fieldset
            disabled={isLocked('format')}
            className="flex flex-col gap-4 disabled:opacity-60"
          >
            <TextField
              label="Cantidad de grupos"
              type="number"
              inputMode="numeric"
              min={2}
              value={groupCountText}
              error={errors.format}
              onChange={(e) => {
                setGroupCountText(e.target.value);
                setErrors((x) => ({ ...x, format: undefined }));
              }}
            />
            <ChoiceGroup
              label="Clasifican por grupo"
              options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v }))}
              value={String(draft.format.qualifiersPerGroup)}
              onChange={(v) =>
                draft.format.kind === 'groups' &&
                set('format', { ...draft.format, qualifiersPerGroup: Number(v) })
              }
            />
          </fieldset>
        )}

        {draft.format.kind === 'league' && (
          <fieldset disabled={isLocked('format')} className="disabled:opacity-60">
            <ChoiceGroup
              label="Partidos entre cada par"
              options={[
                { value: 'single', label: 'Solo ida' },
                { value: 'double', label: 'Ida y vuelta' },
              ]}
              value={draft.format.doubleRound ? 'double' : 'single'}
              onChange={(v) => set('format', { kind: 'league', doubleRound: v === 'double' })}
            />
          </fieldset>
        )}

        {hasStandings(draft.format) && (
          <Card>
            <fieldset
              disabled={isLocked('tiebreakOrder')}
              className="flex flex-col gap-2 disabled:opacity-60"
            >
              <legend className="text-xl font-bold">Desempate de la tabla</legend>
              <p className="text-neutral-700 dark:text-neutral-300">
                Se aplica en este orden; si siguen empatados, sorteo.
              </p>
              <TiebreakEditor
                order={draft.tiebreakOrder ?? [...DEFAULT_TIEBREAK_ORDER]}
                onChange={(order) => set('tiebreakOrder', order)}
              />
              {errors.tiebreakOrder && (
                <p className="font-medium text-red-700 dark:text-red-400">{errors.tiebreakOrder}</p>
              )}
            </fieldset>
          </Card>
        )}

        <Card>
          <fieldset
            disabled={isLocked('scoring')}
            className="flex flex-col gap-4 disabled:opacity-60"
          >
            <legend className="text-xl font-bold">Puntuación</legend>
            {rotation ? (
              <>
                <ChoiceGroup
                  label="Cada partido"
                  options={[
                    ...POINT_TARGETS.map((p) => ({ value: String(p), label: `A ${p}` })),
                    { value: 'custom', label: 'Otro' },
                    { value: 'time', label: 'Por tiempo' },
                  ]}
                  value={pointsMode}
                  onChange={(v) => {
                    setErrors((x) => ({ ...x, scoring: undefined }));
                    if (v === 'time') {
                      setCustomTarget('');
                      set('scoring', { kind: 'time', minutes: Number(minutesText) || 15 });
                    } else if (v === 'custom') {
                      setCustomTarget(customTarget || '18');
                      set('scoring', { kind: 'points', target: Number(customTarget) || 18 });
                    } else {
                      setCustomTarget('');
                      set('scoring', { kind: 'points', target: Number(v) });
                    }
                  }}
                />
                {pointsMode === 'custom' && (
                  <TextField
                    label="Puntos para ganar"
                    type="number"
                    inputMode="numeric"
                    value={customTarget}
                    onChange={(e) => setCustomTarget(e.target.value)}
                  />
                )}
                {pointsMode === 'time' && (
                  <TextField
                    label="Minutos por partido"
                    type="number"
                    inputMode="numeric"
                    value={minutesText}
                    hint="Al terminar el tiempo se anotan los puntos; puede haber empate."
                    onChange={(e) => setMinutesText(e.target.value)}
                  />
                )}
              </>
            ) : (
              <>
                <ChoiceGroup
                  label="Games por set"
                  options={[
                    { value: '6', label: 'A 6' },
                    { value: '4', label: 'A 4' },
                  ]}
                  value={String(sets.gamesPerSet)}
                  onChange={(v) => setSets({ gamesPerSet: v === '4' ? 4 : 6 })}
                />
                <ChoiceGroup
                  label="Sets"
                  options={[
                    { value: '1', label: '1 set' },
                    { value: '3', label: '2 de 3' },
                    { value: '5', label: '3 de 5' },
                  ]}
                  value={String(sets.bestOf)}
                  onChange={(v) => setSets({ bestOf: v === '1' ? 1 : v === '5' ? 5 : 3 })}
                />
                <ChoiceGroup
                  label="Tie-break"
                  options={[
                    { value: 'no', label: 'No' },
                    { value: '7', label: 'A 7' },
                    { value: '10', label: 'A 10' },
                  ]}
                  value={sets.tiebreak.enabled ? String(sets.tiebreak.points) : 'no'}
                  onChange={(v) =>
                    setSets({
                      tiebreak:
                        v === 'no'
                          ? { enabled: false, points: 7 }
                          : { enabled: true, points: Number(v) },
                    })
                  }
                />
                {sets.bestOf > 1 && (
                  <ChoiceGroup
                    label="Set decisivo"
                    options={[
                      { value: 'full', label: 'Set completo' },
                      { value: 'superTiebreak', label: 'Super tie-break a 10' },
                    ]}
                    value={sets.decidingSet}
                    onChange={(v) => setSets({ decidingSet: v })}
                  />
                )}
                <ChoiceGroup
                  label="Punto de oro (sin ventaja)"
                  options={yesNo}
                  value={sets.goldenPoint ? 'yes' : 'no'}
                  onChange={(v) => setSets({ goldenPoint: v === 'yes' })}
                />
                <p className="font-medium" aria-live="polite">
                  {describeScoring(sets)}
                </p>
              </>
            )}
            {errors.scoring && (
              <p className="font-medium text-red-700 dark:text-red-400">{errors.scoring}</p>
            )}
          </fieldset>
        </Card>

        <TextField
          label="Cupo máximo"
          type="number"
          inputMode="numeric"
          min={2}
          value={maxText}
          error={errors.maxEntries}
          hint={`Cantidad de ${unit}.`}
          onChange={(e) => {
            setMaxText(e.target.value);
            setErrors((x) => ({ ...x, maxEntries: undefined }));
          }}
        />
        <TextField
          label="Inscripción por jugador ($)"
          type="number"
          inputMode="decimal"
          min={0}
          value={feeText}
          error={errors.entryFee}
          onChange={(e) => {
            setFeeText(e.target.value);
            setErrors((x) => ({ ...x, entryFee: undefined }));
          }}
        />
        <Button type="submit">{editing ? 'Guardar cambios' : 'Crear torneo'}</Button>
      </form>
    </Page>
  );
}

function TiebreakEditor({
  order,
  onChange,
}: {
  order: TiebreakCriterion[];
  onChange: (order: TiebreakCriterion[]) => void;
}) {
  const move = (index: number, delta: -1 | 1) => {
    const next = [...order];
    const a = next[index];
    const b = next[index + delta];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[index + delta] = a;
    onChange(next);
  };
  return (
    <ol className="flex flex-col gap-1" aria-label="Orden de desempate">
      {order.map((criterion, i) => (
        <li
          key={criterion}
          className="flex min-h-12 items-center gap-1 rounded-xl bg-neutral-100 pl-4 dark:bg-neutral-800"
        >
          <span className="w-6 font-bold">{i + 1}.</span>
          <span className="flex-1 text-lg font-semibold">{TIEBREAK_LABELS[criterion]}</span>
          <IconButton
            label={`Subir ${TIEBREAK_LABELS[criterion]}`}
            disabled={i === 0}
            onClick={() => move(i, -1)}
          >
            <ArrowUpIcon />
          </IconButton>
          <IconButton
            label={`Bajar ${TIEBREAK_LABELS[criterion]}`}
            disabled={i === order.length - 1}
            onClick={() => move(i, 1)}
          >
            <ArrowDownIcon />
          </IconButton>
        </li>
      ))}
    </ol>
  );
}
