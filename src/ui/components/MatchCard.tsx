import { Link } from 'react-router-dom';
import type { ResolvedMatch } from '../../domain/knockout';
import { formatResult } from '../../domain/scoring';

/** Tarjeta de partido: los dos lados, el ganador resaltado y el marcador. */
export function MatchCard({
  resolved,
  nameOf,
  title,
  href,
}: {
  resolved: ResolvedMatch;
  nameOf: (entryId: string | null) => string;
  title?: string;
  href?: string;
}) {
  const { match, a, b, state, winner } = resolved;
  const outcome = match.result?.outcome ?? 'normal';
  const sets = match.result?.kind === 'sets' && outcome !== 'walkover' ? match.result.sets : [];
  const outcomeNote =
    outcome === 'walkover'
      ? 'W.O.'
      : outcome === 'retired'
        ? 'Abandono'
        : outcome === 'injury'
          ? 'Lesión'
          : null;

  const row = (side: 'A' | 'B') => {
    const id = side === 'A' ? a : b;
    const source = side === 'A' ? match.sideA : match.sideB;
    const isWinner = winner !== null && id === winner;
    const label = source.kind === 'bye' ? 'Libre (bye)' : id === null ? 'A definir' : nameOf(id);
    return (
      <div className="flex min-h-10 items-center gap-2">
        <span
          className={`flex-1 truncate text-lg ${
            isWinner ? 'font-bold' : id === null ? 'text-neutral-500 italic' : ''
          }`}
        >
          {isWinner && <span aria-label="Ganador">✓ </span>}
          {label}
        </span>
        {sets.map((s, i) => (
          <span
            key={i}
            className={`w-7 text-center text-lg tabular-nums ${
              (side === 'A' ? s.a > s.b : s.b > s.a)
                ? 'font-bold'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {side === 'A' ? s.a : s.b}
          </span>
        ))}
      </div>
    );
  };

  const body = (
    <>
      {title && (
        <p className="mb-1 flex justify-between text-sm font-semibold text-neutral-600 uppercase dark:text-neutral-400">
          <span>{title}</span>
          {state === 'ready' && (
            <span className="text-brand-700 dark:text-ball">Cargar resultado</span>
          )}
          {state === 'bye' && <span>Pasa directo</span>}
        </p>
      )}
      {row('A')}
      <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
      {row('B')}
      {outcomeNote && (
        <p className="mt-1 text-sm font-bold text-red-700 uppercase dark:text-red-400">
          {outcomeNote}
        </p>
      )}
      {match.result && <span className="sr-only">Resultado: {formatResult(match.result)}</span>}
    </>
  );

  const className = `block rounded-2xl border-2 px-4 py-3 ${
    state === 'ready'
      ? 'border-brand-700 dark:border-ball'
      : 'border-neutral-200 dark:border-neutral-800'
  }`;

  return href ? (
    <Link to={href} className={`${className} active:bg-neutral-100 dark:active:bg-neutral-900`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
