import type { ResultOutcome, SetScore, Side } from '../../domain/scoring';
import { OUTCOME_LABELS } from '../../domain/scoring';
import { ChoiceGroup } from './ui';

/** Elegir cómo terminó el partido: normal, W.O., abandono o lesión. */
export function OutcomeChooser({
  value,
  onChange,
  options = ['normal', 'walkover', 'retired', 'injury'],
}: {
  value: ResultOutcome;
  onChange: (value: ResultOutcome) => void;
  options?: readonly ResultOutcome[];
}) {
  return (
    <ChoiceGroup<ResultOutcome>
      label="¿Cómo terminó?"
      options={options.map((o) => ({ value: o, label: OUTCOME_LABELS[o] }))}
      value={value}
      onChange={onChange}
    />
  );
}

/** Elegir el lado que no se presentó o abandonó (el que pierde). */
export function SideChooser({
  label,
  nameA,
  nameB,
  value,
  onChange,
}: {
  label: string;
  nameA: string;
  nameB: string;
  value: Side | null;
  onChange: (side: Side) => void;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <p className="font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={value === side}
            onClick={() => onChange(side)}
            className={`min-h-14 rounded-xl border-2 px-2 text-lg font-semibold ${
              value === side
                ? 'border-red-700 bg-red-700 text-white'
                : 'border-neutral-400 dark:border-neutral-600'
            }`}
          >
            {side === 'A' ? nameA : nameB}
          </button>
        ))}
      </div>
    </section>
  );
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const button =
    'h-12 w-12 rounded-xl border-2 border-neutral-900 text-2xl font-bold active:bg-neutral-100 dark:border-neutral-100 dark:active:bg-neutral-800';
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Restar a ${label}`}
        className={button}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <span className="w-10 text-center text-2xl font-bold tabular-nums" aria-label={label}>
        {value}
      </span>
      <button
        type="button"
        aria-label={`Sumar a ${label}`}
        className={button}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

/** Sets jugados hasta el abandono: el último puede quedar a medias. */
export function PartialSetsEditor({
  sets,
  nameA,
  nameB,
  onChange,
}: {
  sets: SetScore[];
  nameA: string;
  nameB: string;
  onChange: (sets: SetScore[]) => void;
}) {
  const update = (index: number, change: Partial<SetScore>) =>
    onChange(sets.map((s, i) => (i === index ? { ...s, ...change } : s)));
  return (
    <section aria-label="Sets jugados" className="flex flex-col gap-3">
      <p className="font-semibold">Games jugados hasta que abandonó</p>
      {sets.length === 0 && (
        <p className="text-neutral-700 dark:text-neutral-300">
          Sin sets: abandonó antes de empezar.
        </p>
      )}
      {sets.map((set, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-2xl border-2 border-neutral-200 p-3 dark:border-neutral-800"
        >
          <p className="font-bold">Set {i + 1}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="flex-1 truncate">{nameA}</span>
            <Counter
              label={`Set ${i + 1}, ${nameA}`}
              value={set.a}
              onChange={(a) => update(i, { a })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex-1 truncate">{nameB}</span>
            <Counter
              label={`Set ${i + 1}, ${nameB}`}
              value={set.b}
              onChange={(b) => update(i, { b })}
            />
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange([...sets, { a: 0, b: 0 }])}
          className="min-h-12 rounded-xl border-2 border-neutral-900 font-semibold dark:border-neutral-100"
        >
          Agregar set
        </button>
        <button
          type="button"
          disabled={sets.length === 0}
          onClick={() => onChange(sets.slice(0, -1))}
          className="min-h-12 rounded-xl border-2 border-neutral-400 font-semibold disabled:opacity-40 dark:border-neutral-600"
        >
          Quitar último
        </button>
      </div>
    </section>
  );
}
