import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Id } from '../../domain/common';
import { fullName } from '../../domain/player';
import type { PlayerStats, PlayerTournamentRecord } from '../../domain/playerHistory';
import { formatDate } from '../format';
import { useActivePlayers } from '../hooks/useData';
import { useServices } from '../ServicesContext';
import { Card } from './ui';

type History = { records: PlayerTournamentRecord[]; stats: PlayerStats };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-100 p-3 text-center dark:bg-neutral-800">
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{label}</p>
    </div>
  );
}

/** Estadísticas e historial de torneos de un jugador. */
export function PlayerHistory({ playerId }: { playerId: Id }) {
  const { players } = useServices();
  const all = useActivePlayers();
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    let active = true;
    void players.history(playerId).then((h) => {
      if (active) setHistory(h);
    });
    return () => {
      active = false;
    };
  }, [players, playerId]);

  if (!history) return <p aria-busy="true">Cargando historial…</p>;
  const { records, stats } = history;
  const nameOf = (id: Id) => {
    const p = all.status === 'ready' ? all.data.find((x) => x.id === id) : undefined;
    return p ? fullName(p) : 'otro jugador';
  };

  return (
    <>
      <section aria-labelledby="estadisticas" className="flex flex-col gap-2">
        <h2 id="estadisticas" className="text-xl font-bold">
          Estadísticas
        </h2>
        {stats.tournaments === 0 ? (
          <p className="text-neutral-700 dark:text-neutral-300">
            Todavía no jugó torneos. Acá vas a ver sus números cuando juegue.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" data-testid="estadisticas">
              <Stat label="Torneos" value={String(stats.tournaments)} />
              <Stat label="Títulos" value={String(stats.titles)} />
              <Stat label="Podios" value={String(stats.podiums)} />
              <Stat label="Partidos" value={String(stats.played)} />
              <Stat label="Ganados" value={String(stats.won)} />
              <Stat
                label="Efectividad"
                value={stats.winRate === null ? '—' : `${stats.winRate} %`}
              />
            </div>
            {(stats.setsWon > 0 || stats.setsLost > 0 || stats.gamesWon > 0) && (
              <p className="text-neutral-700 dark:text-neutral-300">
                Sets {stats.setsWon}-{stats.setsLost} · Games {stats.gamesWon}-{stats.gamesLost}
              </p>
            )}
            {(stats.pointsFor > 0 || stats.pointsAgainst > 0) && (
              <p className="text-neutral-700 dark:text-neutral-300">
                Puntos (Americano/Mexicano): {stats.pointsFor} a favor, {stats.pointsAgainst} en
                contra
              </p>
            )}
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Los W.O. no cuentan como partido jugado.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="historial" className="flex flex-col gap-2">
        <h2 id="historial" className="text-xl font-bold">
          Torneos jugados
        </h2>
        {records.length === 0 ? (
          <p className="text-neutral-700 dark:text-neutral-300">
            Todavía no se anotó en ningún torneo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Historial de torneos">
            {records.map((r) => (
              <li key={r.tournamentId}>
                <Link to={`/torneos/${r.tournamentId}`} className="block active:opacity-70">
                  <Card className={r.champion ? 'border-brand-700 dark:border-ball' : ''}>
                    <p className="text-lg font-semibold">
                      {r.champion && '🏆 '}
                      {r.name}
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300">
                      {formatDate(r.date)} · {r.format}
                    </p>
                    {r.partnerIds.length > 0 && (
                      <p className="text-neutral-700 dark:text-neutral-300">
                        Con {r.partnerIds.map(nameOf).join(', ')}
                      </p>
                    )}
                    <p className="mt-1 font-bold">{r.placement}</p>
                    {r.played > 0 && (
                      <p className="text-neutral-700 dark:text-neutral-300">
                        {r.won} {r.won === 1 ? 'ganado' : 'ganados'} · {r.lost}{' '}
                        {r.lost === 1 ? 'perdido' : 'perdidos'}
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
