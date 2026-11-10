import { type FormEvent, useState } from 'react';
import type { ThemePreference } from '../../domain/settings';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StorageCard } from '../components/StorageCard';
import { InstallCard } from '../install/InstallCard';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { Button, Card, ChoiceGroup, IconButton, TextField } from '../components/ui';
import { useSettings } from '../hooks/useData';
import { useServices } from '../ServicesContext';
import { Loading } from '../components/Loading';

const THEME_OPTIONS = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export function SettingsPage() {
  const settings = useSettings();
  const services = useServices();
  const [newLevel, setNewLevel] = useState('');
  const [levelError, setLevelError] = useState<string | undefined>();
  const [toRemove, setToRemove] = useState<string | null>(null);

  if (settings.status !== 'ready') {
    return (
      <Page title="Ajustes">
        <Loading />
      </Page>
    );
  }

  const { theme, levels } = settings.data;

  const onAddLevel = async (e: FormEvent) => {
    e.preventDefault();
    const result = await services.settings.addLevel(newLevel);
    if (result.ok) {
      setNewLevel('');
      setLevelError(undefined);
    } else setLevelError(result.errors.level);
  };

  const onRemoveLevel = async (level: string) => {
    setToRemove(null);
    const result = await services.settings.removeLevel(level);
    setLevelError(result.ok ? undefined : result.errors.level);
  };

  return (
    <Page title="Ajustes">
      <Card>
        <ChoiceGroup
          label="Apariencia"
          options={THEME_OPTIONS}
          value={theme}
          onChange={(v) => void services.settings.setTheme(v)}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Niveles de jugadores</h2>
        <p className="text-neutral-700 dark:text-neutral-300">
          Son las opciones que aparecen al cargar un jugador.
        </p>
        <ul className="flex flex-col gap-1" aria-label="Niveles">
          {levels.map((level, i) => (
            <li
              key={level}
              className="flex min-h-12 items-center gap-1 rounded-xl bg-neutral-100 pl-4 dark:bg-neutral-800"
            >
              <span className="flex-1 text-lg font-semibold">{level}</span>
              <IconButton
                label={`Subir ${level}`}
                disabled={i === 0}
                onClick={() => void services.settings.moveLevel(level, -1)}
              >
                <ArrowUpIcon />
              </IconButton>
              <IconButton
                label={`Bajar ${level}`}
                disabled={i === levels.length - 1}
                onClick={() => void services.settings.moveLevel(level, 1)}
              >
                <ArrowDownIcon />
              </IconButton>
              <IconButton label={`Quitar ${level}`} onClick={() => setToRemove(level)}>
                <TrashIcon />
              </IconButton>
            </li>
          ))}
        </ul>
        <form className="flex flex-col gap-3" onSubmit={onAddLevel} noValidate>
          <TextField
            label="Nuevo nivel"
            placeholder="Ej.: Damas B"
            value={newLevel}
            error={levelError}
            onChange={(e) => {
              setNewLevel(e.target.value);
              setLevelError(undefined);
            }}
          />
          <Button type="submit" variant="secondary">
            Agregar nivel
          </Button>
        </form>
      </Card>

      <InstallCard />

      <StorageCard />

      <Card>
        <h2 className="text-xl font-bold">Acerca de</h2>
        <p className="mt-1 text-neutral-700 dark:text-neutral-300">
          Versión {__APP_VERSION__}. Tus datos se guardan solo en este dispositivo.
        </p>
      </Card>

      <ConfirmDialog
        open={toRemove !== null}
        danger
        title="¿Quitar nivel?"
        message={`El nivel "${toRemove ?? ''}" ya no va a aparecer al cargar jugadores.`}
        confirmLabel="Sí, quitar"
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove !== null) void onRemoveLevel(toRemove);
        }}
      />
    </Page>
  );
}
