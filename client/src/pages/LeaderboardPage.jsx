import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import useAuthStore from '../store/authStore';
import { getLeaderboard } from '../api/leaderboard';

export default function LeaderboardPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [players, setPlayers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getLeaderboard(page)
      .then(({ data }) => {
        if (cancelled) return;
        setPlayers(data.players);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load leaderboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="min-h-screen bg-void">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-tx-primary">Leaderboard</h1>
        <p className="text-tx-muted text-sm mt-1">Ranked by competitive Elo rating</p>

        {loading && (
          <div className="flex items-center justify-center min-h-[200px]">
            <p className="text-tx-muted text-sm">Loading leaderboard…</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-crimson/10 border border-crimson/30 text-crimson rounded-lg px-4 py-3 text-sm mt-6">
            {error}
          </div>
        )}

        {!loading && !error && players.length === 0 && (
          <div className="bg-surface border border-border rounded-xl py-12 text-center mt-6">
            <p className="text-tx-muted">No players yet.</p>
          </div>
        )}

        {!loading && !error && players.length > 0 && (
          <>
            <div className="bg-surface border border-border rounded-xl overflow-hidden mt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-xs text-tx-muted font-medium px-4 py-3 w-16">Rank</th>
                    <th className="text-xs text-tx-muted font-medium px-4 py-3 text-left">Player</th>
                    <th className="text-xs text-tx-muted font-medium px-4 py-3 text-right">Elo</th>
                    <th className="text-xs text-tx-muted font-medium px-4 py-3 text-right">W</th>
                    <th className="text-xs text-tx-muted font-medium px-4 py-3 text-right">L</th>
                    <th className="text-xs text-tx-muted font-medium px-4 py-3 text-right">Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const isMe = currentUser?.username === player.username;
                    const rank = player.rank;
                    return (
                      <tr
                        key={player.username}
                        className={`border-b border-border last:border-0 transition-colors${
                          rank === 1 ? ' border-l-2 border-l-violet' : ''
                        }${isMe ? ' bg-violet-dim/30' : ''}`}
                      >
                        <td className="px-4 py-3 text-center">
                          {rank === 1 ? (
                            <span className="text-violet font-black text-lg">1</span>
                          ) : rank === 2 || rank === 3 ? (
                            <span className="text-tx-body font-bold">{rank}</span>
                          ) : (
                            <span className="text-tx-muted text-sm">{rank}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-left">
                          <Link
                            to={`/profile/${player.username}`}
                            className="text-violet hover:text-violet-hi text-sm font-medium transition-colors"
                          >
                            {player.username}
                          </Link>
                          {isMe && (
                            <span className="ml-2 text-xs text-tx-muted">you</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-tx-primary text-sm font-semibold">
                          {player.elo}
                        </td>
                        <td className="px-4 py-3 text-right text-tx-muted text-xs">{player.wins}</td>
                        <td className="px-4 py-3 text-right text-tx-muted text-xs">{player.losses}</td>
                        <td className="px-4 py-3 text-right text-tx-muted text-xs">
                          {player.winRate !== null
                            ? `${(player.winRate * 100).toFixed(0)}%`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="border border-border text-tx-body hover:border-border-hi hover:text-tx-primary px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-xs text-tx-muted">
                Page {page} of {pages}
                <span className="ml-2 opacity-60">({total} players)</span>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="border border-border text-tx-body hover:border-border-hi hover:text-tx-primary px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
