import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/Layout';
import { ErrorBanner } from './components/ErrorBanner';
import { Loading } from './components/Loading';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useSettings } from './hooks/useData';
import { useApplyTheme } from './hooks/useTheme';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayerFormPage } from './pages/PlayerFormPage';
import { PlayersPage } from './pages/PlayersPage';
import { SettingsPage } from './pages/SettingsPage';
import { TournamentsPage } from './pages/TournamentsPage';

// Las pantallas de torneo se cargan aparte para que la app abra más rápido.
// Igual quedan guardadas para usarse sin internet (el service worker las precarga).
const TournamentPage = lazy(() =>
  import('./pages/TournamentPage').then((m) => ({ default: m.TournamentPage })),
);
const TournamentFormPage = lazy(() =>
  import('./pages/TournamentFormPage').then((m) => ({ default: m.TournamentFormPage })),
);
const MatchResultPage = lazy(() =>
  import('./pages/MatchResultPage').then((m) => ({ default: m.MatchResultPage })),
);
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const SeedsPage = lazy(() => import('./pages/SeedsPage').then((m) => ({ default: m.SeedsPage })));

export function App() {
  const settings = useSettings();
  useApplyTheme(settings.status === 'ready' ? settings.data.theme : undefined);

  return (
    <>
      <Suspense
        fallback={
          <div className="p-6">
            <Loading />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<TournamentsPage />} />
          <Route path="/torneos/nuevo" element={<TournamentFormPage />} />
          <Route path="/torneos/:id" element={<TournamentPage />} />
          <Route path="/torneos/:id/editar" element={<TournamentFormPage />} />
          <Route path="/torneos/:id/inscribir" element={<RegisterPage />} />
          <Route path="/torneos/:id/cabezas" element={<SeedsPage />} />
          <Route path="/torneos/:id/partidos/:matchId" element={<MatchResultPage />} />
          <Route path="/jugadores" element={<PlayersPage />} />
          <Route path="/jugadores/nuevo" element={<PlayerFormPage />} />
          <Route path="/jugadores/:id" element={<PlayerDetailPage />} />
          <Route path="/jugadores/:id/editar" element={<PlayerFormPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
      <UpdatePrompt />
      <ErrorBanner />
    </>
  );
}
