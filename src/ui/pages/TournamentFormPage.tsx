import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_SETS_SCORING, type SetsScoring, describeScoring } from '../../domain/scoring';
import {
  FORMAT_LABELS,
  LOCKED_AFTER_DRAW,
  type Modality,
  type Tournament,
  type TournamentDraft,
  type TournamentField,
} from '../../domain/tournament';
import { Page } from '../components/Layout';
import { Button, Card, ChoiceGroup, TextField } from '../components/ui';
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
  };
}

function toDraft(t: Tournament): TournamentDraft {
  const { name, date, venue, category, modality, format, scoring, maxEntries, entryFee } = t;
  return { name, date, venue, category, modality, format, scoring, maxEntries, entryFee };
}

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

  useEffect(() => {
    if (id === undefined) return;
    let active = true;
    void tournaments.get(id).then((t) => {
      if (!active || !t) return;
      setDraft(toDraft(t));
      setMaxText(String(t.maxEntries));
      setFeeText(String(t.entryFee));
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

  const scoring: SetsScoring = draft.scoring.kind === 'sets' ? draft.scoring : DEFAULT_SETS_SCORING;
  const setScoring = (change: Partial<SetsScoring>) => {
    const next = { ...scoring, ...change };
    if (next.bestOf === 1) next.decidingSet = 'full';
    set('scoring', next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const full: TournamentDraft = {
      ...draft,
      maxEntries: maxText.trim() === '' ? Number.NaN : Number(maxText),
      entryFee: feeText.trim() === '' ? 0 : Number(feeText.replace(',', '.')),
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

        <ChoiceGroup
          label="Formato"
          options={[{ value: 'knockout', label: FORMAT_LABELS.knockout }]}
          value={draft.format.kind}
          onChange={() => set('format', { kind: 'knockout' })}
        />
        <p className="-mt-3 text-neutral-600 dark:text-neutral-400">
          Grupos, liga, Americano y Mexicano llegan en las próximas versiones.
        </p>

        <Card>
          <fieldset
            disabled={isLocked('scoring')}
            className="flex flex-col gap-4 disabled:opacity-60"
          >
            <legend className="text-xl font-bold">Puntuación</legend>
            <ChoiceGroup
              label="Games por set"
              options={[
                { value: '6', label: 'A 6' },
                { value: '4', label: 'A 4' },
              ]}
              value={String(scoring.gamesPerSet)}
              onChange={(v) => setScoring({ gamesPerSet: v === '4' ? 4 : 6 })}
            />
            <ChoiceGroup
              label="Sets"
              options={[
                { value: '1', label: '1 set' },
                { value: '3', label: '2 de 3' },
                { value: '5', label: '3 de 5' },
              ]}
              value={String(scoring.bestOf)}
              onChange={(v) => setScoring({ bestOf: v === '1' ? 1 : v === '5' ? 5 : 3 })}
            />
            <ChoiceGroup
              label="Tie-break"
              options={[
                { value: 'no', label: 'No' },
                { value: '7', label: 'A 7' },
                { value: '10', label: 'A 10' },
              ]}
              value={scoring.tiebreak.enabled ? String(scoring.tiebreak.points) : 'no'}
              onChange={(v) =>
                setScoring({
                  tiebreak:
                    v === 'no'
                      ? { enabled: false, points: 7 }
                      : { enabled: true, points: Number(v) },
                })
              }
            />
            {scoring.bestOf > 1 && (
              <ChoiceGroup
                label="Set decisivo"
                options={[
                  { value: 'full', label: 'Set completo' },
                  { value: 'superTiebreak', label: 'Super tie-break a 10' },
                ]}
                value={scoring.decidingSet}
                onChange={(v) => setScoring({ decidingSet: v })}
              />
            )}
            <ChoiceGroup
              label="Punto de oro (sin ventaja)"
              options={yesNo}
              value={scoring.goldenPoint ? 'yes' : 'no'}
              onChange={(v) => setScoring({ goldenPoint: v === 'yes' })}
            />
            <p className="font-medium" aria-live="polite">
              {describeScoring(scoring)}
            </p>
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
          hint={draft.modality === 'doubles' ? 'Cantidad de parejas.' : 'Cantidad de jugadores.'}
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
