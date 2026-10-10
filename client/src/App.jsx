import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProblemsPage from './pages/ProblemsPage';
import ProblemPage from './pages/ProblemPage';
import DuelPage from './pages/DuelPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  const token = useAuthStore((s) => s.token);

  return (
    <Routes>
      <Route
        path="/"
        element={token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />}
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/problems" element={<ProblemsPage />} />
      <Route path="/problems/:slug" element={<ProblemPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/profile/:username" element={<ProfilePage />} />
      {/* /duels/new MUST come before /duels/:duelId to prevent 'new' matching :duelId */}
      <Route
        path="/duels/new"
        element={
          <ProtectedRoute>
            <DuelPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/duels/:duelId"
        element={
          <ProtectedRoute>
            <DuelPage />
          </ProtectedRoute>
        }
      />
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
