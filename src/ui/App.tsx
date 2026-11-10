import { Suspense, lazy, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/Layout';
import { ErrorBanner } from './components/ErrorBanner';
import { PageErrorBoundary } from './components/PageErrorBoundary';
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
const loadTournamentPage = () => import('./pages/TournamentPage');
const loadTournamentFormPage = () => import('./pages/TournamentFormPage');
const loadMatchResultPage = () => import('./pages/MatchResultPage');
const loadRegisterPage = () => import('./pages/RegisterPage');
const loadSeedsPage = () => import('./pages/SeedsPage');

const TournamentPage = lazy(() =>
  loadTournamentPage().then((m) => ({ default: m.TournamentPage })),
);
const TournamentFormPage = lazy(() =>
  loadTournamentFormPage().then((m) => ({ default: m.TournamentFormPage })),
);
const MatchResultPage = lazy(() =>
  loadMatchResultPage().then((m) => ({ default: m.MatchResultPage })),
);
const RegisterPage = lazy(() => loadRegisterPage().then((m) => ({ default: m.RegisterPage })));
const SeedsPage = lazy(() => loadSeedsPage().then((m) => ({ default: m.SeedsPage })));

/**
 * Precarga en segundo plano todas las pantallas que se cargan aparte, para que después
 * se puedan abrir aunque se corte internet.
 */
function preloadPages(): void {
  for (const load of [
    loadTournamentPage,
    loadTournamentFormPage,
    loadMatchResultPage,
    loadRegisterPage,
    loadSeedsPage,
  ]) {
    load().catch(() => undefined);
  }
}

export function App() {
  const settings = useSettings();
  const location = useLocation();
  useApplyTheme(settings.status === 'ready' ? settings.data.theme : undefined);
  useEffect(() => {
    const timer = setTimeout(preloadPages, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <PageErrorBoundary resetKey={location.pathname}>
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
      </PageErrorBoundary>
      <BottomNav />
      <UpdatePrompt />
      <ErrorBanner />
    </>
  );
}
