import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BackIcon, SettingsIcon, TrophyIcon, UsersIcon } from './Icons';
import { IconButton } from './ui';

const tabs = [
  { to: '/', label: 'Torneos', icon: TrophyIcon, end: true },
  { to: '/jugadores', label: 'Jugadores', icon: UsersIcon, end: false },
  { to: '/ajustes', label: 'Ajustes', icon: SettingsIcon, end: false },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-neutral-800 dark:bg-neutral-950"
    >
      <ul className="mx-auto flex max-w-xl">
        {tabs.map(({ to, label, icon: TabIcon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-semibold ${
                  isActive
                    ? 'text-brand-800 dark:text-ball'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`
              }
            >
              <TabIcon />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Estructura de cada pantalla: encabezado fijo arriba y contenido con lugar para la barra inferior. */
export function Page({
  title,
  back,
  actions,
  children,
}: {
  title: string;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col pb-24">
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-1 border-b-2 border-neutral-200 bg-white/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        {back && (
          <IconButton label="Volver" onClick={() => navigate(back)}>
            <BackIcon />
          </IconButton>
        )}
        <h1 className={`flex-1 truncate text-2xl font-bold ${back ? '' : 'pl-2'}`}>{title}</h1>
        {actions}
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 py-4">{children}</main>
    </div>
  );
}
