import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/Layout';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useSettings } from './hooks/useData';
import { useApplyTheme } from './hooks/useTheme';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayerFormPage } from './pages/PlayerFormPage';
import { PlayersPage } from './pages/PlayersPage';
import { SettingsPage } from './pages/SettingsPage';
import { TournamentsPage } from './pages/TournamentsPage';

export function App() {
  const settings = useSettings();
  useApplyTheme(settings.status === 'ready' ? settings.data.theme : undefined);

  return (
    <>
      <Routes>
        <Route path="/" element={<TournamentsPage />} />
        <Route path="/jugadores" element={<PlayersPage />} />
        <Route path="/jugadores/nuevo" element={<PlayerFormPage />} />
        <Route path="/jugadores/:id" element={<PlayerDetailPage />} />
        <Route path="/jugadores/:id/editar" element={<PlayerFormPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
      <UpdatePrompt />
    </>
  );
}
