import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import useAuthStore from '../store/authStore';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wins = user?.wins ?? 0;
  const losses = user?.losses ?? 0;
  const totalGames = wins + losses;
  const winRate =
    totalGames > 0 ? `${Math.round((wins / totalGames) * 100)}%` : 'N/A';

  return (
    <div className="min-h-screen bg-void">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-tx-primary mb-1">
          Welcome back, {user?.username ?? 'Developer'}
        </h1>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mt-6 mb-8">
          <div className="bg-surface border border-border rounded-xl p-5">
            <p className="text-3xl font-black text-violet">{user?.elo ?? 1200}</p>
            <p className="text-xs text-tx-muted mt-1">Elo</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <p className="text-3xl font-black text-lime">{wins}</p>
            <p className="text-xs text-tx-muted mt-1">Wins</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <p className="text-3xl font-black text-tx-primary">{losses}</p>
            <p className="text-xs text-tx-muted mt-1">Losses</p>
          </div>
        </div>

        <span className="text-tx-muted text-sm mt-2 block">
          Win rate: {winRate}
        </span>

        {/* Actions */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => navigate('/problems')}
            className="bg-violet hover:bg-violet-hi text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Browse problems
          </button>
          <Link
            to="/leaderboard"
            className="border border-border text-tx-body hover:border-border-hi hover:text-tx-primary px-5 py-2 rounded-lg text-sm transition-colors inline-block"
          >
            Leaderboard
          </Link>
          {user?.username && (
            <Link
              to={`/profile/${user.username}`}
              className="border border-border text-tx-body hover:border-border-hi hover:text-tx-primary px-5 py-2 rounded-lg text-sm transition-colors inline-block"
            >
              My profile
            </Link>
          )}
        </div>

        <p className="text-xs text-tx-muted mt-8">
          Start a duel from the Problems page — click Duel next to any problem.
        </p>
      </main>
    </div>
  );
}
