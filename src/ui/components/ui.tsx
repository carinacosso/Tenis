import type { ButtonHTMLAttributes, ComponentProps, InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-800 text-white active:bg-brand-900 dark:bg-brand-700 dark:active:bg-brand-800',
  secondary:
    'border-2 border-neutral-900 text-neutral-950 active:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-50 dark:active:bg-neutral-800',
  danger: 'bg-red-700 text-white active:bg-red-800',
  ghost: 'text-neutral-900 active:bg-neutral-100 dark:text-neutral-100 dark:active:bg-neutral-800',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl active:bg-neutral-200 disabled:opacity-30 dark:active:bg-neutral-800 ${className}`}
      {...props}
    />
  );
}

export function TextField({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-14 rounded-xl border-2 bg-white px-4 text-lg dark:bg-neutral-900 ${
          error
            ? 'border-red-700 dark:border-red-400'
            : 'border-neutral-400 dark:border-neutral-600'
        }`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-neutral-600 dark:text-neutral-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Grupo de opciones como botones grandes (más cómodo que un select en el celular). */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-base font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-12 min-w-16 rounded-xl border-2 px-4 text-lg font-semibold ${
                selected
                  ? 'border-brand-800 bg-brand-800 text-white dark:border-brand-700 dark:bg-brand-700'
                  : 'border-neutral-400 dark:border-neutral-600'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border-2 border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="text-xl font-bold">{title}</p>
      {children}
    </div>
  );
}
