import type { StandingRow } from '../../domain/standings';
import { TIEBREAK_LABELS, tiebreakOrderOf } from '../../domain/tournament';
import { entryName } from '../format';
import { useGroupTables } from '../hooks/useGroupTables';
import type { TournamentData } from '../hooks/useTournament';
import { Card, EmptyState } from './ui';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function StandingsTable({
  rows,
  data,
  label,
  qualifiers = 0,
}: {
  rows: readonly StandingRow[];
  data: TournamentData;
  label: string;
  qualifiers?: number;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[340px] text-left text-lg" aria-label={label}>
        <thead>
          <tr className="border-b-2 border-neutral-300 text-sm text-neutral-600 uppercase dark:border-neutral-700 dark:text-neutral-400">
            <th scope="col" className="py-2 pr-2">
              #
            </th>
            <th scope="col" className="py-2 pr-2">
              Jugador
            </th>
            <th scope="col" className="py-2 pr-2 text-right" title="Partidos jugados">
              PJ
            </th>
            <th scope="col" className="py-2 pr-2 text-right" title="Partidos ganados">
              PG
            </th>
            <th scope="col" className="py-2 pr-2 text-right" title="Diferencia de sets">
              Sets
            </th>
            <th scope="col" className="py-2 text-right" title="Diferencia de games">
              Games
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const qualified = r.position <= qualifiers;
            return (
              <tr
                key={r.entryId}
                className={`border-b border-neutral-200 dark:border-neutral-800 ${
                  qualified ? 'bg-brand-50 dark:bg-neutral-900' : ''
                }`}
              >
                <td className="py-2 pr-2 font-bold">
                  {r.position}
                  {qualified && <span className="sr-only"> (clasifica)</span>}
                </td>
                <td className="py-2 pr-2 font-semibold">
                  {entryName(data.entriesById.get(r.entryId), data.players)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.played}</td>
                <td className="py-2 pr-2 text-right font-bold tabular-nums">{r.won}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{signed(r.setDiff)}</td>
                <td className="py-2 text-right tabular-nums">{signed(r.gameDiff)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TiebreakNote({ data }: { data: TournamentData }) {
  const order = tiebreakOrderOf(data.tournament).map((c) => TIEBREAK_LABELS[c].toLowerCase());
  return (
    <p className="text-neutral-700 dark:text-neutral-300">
      Desempate: {order.join(', ')} y sorteo.
    </p>
  );
}

export function GroupsTab({ data }: { data: TournamentData }) {
  const tables = useGroupTables(data);
  if (data.groups.length === 0) {
    return <EmptyState title="Los grupos se arman al generar los cruces" />;
  }
  const qualifiers =
    data.tournament.format.kind === 'groups' ? data.tournament.format.qualifiersPerGroup : 0;
  return (
    <>
      {tables.map((table) => {
        const group = data.groups.find((g) => g.index === table.groupIndex);
        const name = `Grupo ${group?.name ?? ''}`;
        return (
          <section key={table.groupIndex} aria-label={name} className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{name}</h2>
            <StandingsTable
              rows={table.rows}
              data={data}
              label={`Tabla del ${name}`}
              qualifiers={qualifiers}
            />
          </section>
        );
      })}
      <p className="text-neutral-700 dark:text-neutral-300">
        Resaltados: los que clasifican al cuadro final ({qualifiers} por grupo).
      </p>
      <TiebreakNote data={data} />
    </>
  );
}

export function LeagueTableTab({ data }: { data: TournamentData }) {
  const [table] = useGroupTables(data);
  if (!table) return <EmptyState title="La tabla aparece al generar los cruces" />;
  return (
    <>
      <StandingsTable rows={table.rows} data={data} label="Tabla de posiciones" />
      <TiebreakNote data={data} />
    </>
  );
}

export function LeaguePodium({ data }: { data: TournamentData }) {
  const [table] = useGroupTables(data);
  const name = (row: StandingRow | undefined) =>
    row ? entryName(data.entriesById.get(row.entryId), data.players) : '—';
  const [first, second, third] = table?.rows ?? [];
  return (
    <Card className="border-brand-700 bg-brand-50 dark:border-ball dark:bg-neutral-900">
      <p className="text-sm font-bold text-brand-800 uppercase dark:text-ball">Campeón</p>
      <p className="text-3xl font-black" data-testid="campeon">
        🏆 {name(first)}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lg">
        <dt className="font-semibold">2.º puesto</dt>
        <dd>{name(second)}</dd>
        {third && (
          <>
            <dt className="font-semibold">3.º puesto</dt>
            <dd>{name(third)}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}
