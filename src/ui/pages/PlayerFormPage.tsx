import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  EMPTY_PLAYER_DRAFT,
  type Player,
  type PlayerDraft,
  type PlayerField,
  type Sex,
  fullName,
} from '../../domain/player';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Page } from '../components/Layout';
import { Button, ChoiceGroup, TextField } from '../components/ui';
import { useSettings } from '../hooks/useData';
import { useServices } from '../ServicesContext';

const SEX_OPTIONS = [
  { value: 'none', label: 'Sin indicar' },
  { value: 'M', label: 'Hombre' },
  { value: 'F', label: 'Mujer' },
] as const;

type SexChoice = (typeof SEX_OPTIONS)[number]['value'];

function toDraft(player: Player): PlayerDraft {
  const { firstName, lastName, phone, sex, level, notes } = player;
  return { firstName, lastName, phone, sex, level, notes };
}

export function PlayerFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { players } = useServices();
  const settings = useSettings();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<PlayerDraft>(EMPTY_PLAYER_DRAFT);
  const [loaded, setLoaded] = useState(!editing);
  const [notFound, setNotFound] = useState(false);
  const [originalLevel, setOriginalLevel] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<PlayerField, string>>>({});
  const [duplicates, setDuplicates] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    let active = true;
    void players.get(id).then((player) => {
      if (!active) return;
      if (!player || player.deletedAt !== null) setNotFound(true);
      else {
        setDraft(toDraft(player));
        setOriginalLevel(player.level);
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [id, players]);

  const update = <K extends PlayerField>(field: K, value: PlayerDraft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const save = async () => {
    setSaving(true);
    const result = editing ? await players.update(id, draft) : await players.create(draft);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    navigate(`/jugadores/${result.value.id}`, { replace: true });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = await players.findDuplicates(draft, id);
    if (found.length > 0) setDuplicates(found);
    else await save();
  };

  const back = editing ? `/jugadores/${id}` : '/jugadores';
  const title = editing ? 'Editar jugador' : 'Nuevo jugador';

  if (notFound) {
    return (
      <Page title={title} back="/jugadores">
        <p className="text-lg">No encontramos ese jugador.</p>
      </Page>
    );
  }

  if (!loaded || settings.status !== 'ready') {
    return (
      <Page title={title} back={back}>
        <p aria-busy="true">Cargando…</p>
      </Page>
    );
  }

  const levels = settings.data.levels;
  const levelOptions = [
    ...levels,
    ...(originalLevel && !levels.includes(originalLevel) ? [originalLevel] : []),
  ].map((l) => ({ value: l, label: l }));
  const sexValue: SexChoice = draft.sex ?? 'none';

  return (
    <Page title={title} back={back}>
      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <TextField
          label="Nombre"
          autoComplete="given-name"
          autoCapitalize="words"
          value={draft.firstName}
          error={errors.firstName}
          onChange={(e) => update('firstName', e.target.value)}
        />
        <TextField
          label="Apellido"
          autoComplete="family-name"
          autoCapitalize="words"
          value={draft.lastName}
          error={errors.lastName}
          onChange={(e) => update('lastName', e.target.value)}
        />
        <TextField
          label="Teléfono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Con código de área. Ej.: 11 5555 1234"
          value={draft.phone}
          error={errors.phone}
          onChange={(e) => update('phone', e.target.value)}
        />
        <ChoiceGroup
          label="Nivel"
          options={levelOptions}
          value={draft.level || null}
          error={errors.level}
          onChange={(v) => update('level', v)}
        />
        <ChoiceGroup<SexChoice>
          label="Sexo (opcional)"
          options={SEX_OPTIONS}
          value={sexValue}
          error={errors.sex}
          onChange={(v) => update('sex', v === 'none' ? null : (v satisfies Sex))}
        />
        <TextField
          label="Notas (opcional)"
          value={draft.notes}
          error={errors.notes}
          onChange={(e) => update('notes', e.target.value)}
        />
        <Button type="submit" disabled={saving}>
          {editing ? 'Guardar cambios' : 'Guardar jugador'}
        </Button>
      </form>
      <ConfirmDialog
        open={duplicates.length > 0}
        title="¿Jugador repetido?"
        message={`Ya existe un jugador parecido: ${duplicates
          .map((p) => `${fullName(p)} (${p.phone})`)
          .join(', ')}. ¿Querés guardarlo igual?`}
        confirmLabel="Guardar igual"
        onConfirm={() => {
          setDuplicates([]);
          void save();
        }}
        onCancel={() => setDuplicates([])}
      />
    </Page>
  );
}
