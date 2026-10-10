import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getUserProfile, getMatchHistory } from '../api/leaderboard';

// All avatar color classes written as complete strings so Tailwind JIT includes them
const AVATAR_COLORS = [
  'bg-violet',
  'bg-[#8B5CF6]',
  'bg-[#0EA5E9]',
  'bg-[#10B981]',
  'bg-[#F59E0B]',
  'bg-[#EF4444]',
];

function avatarColor(username) {
  if (!username) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ProfilePage() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setProfileLoading(true);
    setProfileError(null);
    getUserProfile(username)
      .then((res) => setProfile(res.data.user))
      .catch((err) => {
        const status = err.response?.status;
        setProfileError(status === 404 ? 'not_found' : 'error');
      })
      .finally(() => setProfileLoading(false));
  }, [username]);

  useEffect(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory([]);
    setHistoryPage(1);
    getMatchHistory(username, 1, 10)
      .then((res) => {
        setHistory(res.data.history);
        setHistoryTotal(res.data.total);
      })
      .catch(() => setHistoryError('Failed to load match history.'))
      .finally(() => setHistoryLoading(false));
  }, [username]);

  const loadMore = async () => {
    const nextPage = historyPage + 1;
    setLoadingMore(true);
    try {
      const res = await getMatchHistory(username, nextPage, 10);
      setHistory((prev) => [...prev, ...res.data.history]);
      setHistoryPage(nextPage);
    } catch {
      setHistoryError('Failed to load more matches.');
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = history.length < historyTotal;

  // Loading state
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-void">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <p className="text-tx-muted">Loading profile…</p>
        </div>
      </div>
    );
  }

  // 404 or error
  if (profileError === 'not_found') {
    return (
      <div className="min-h-screen bg-void">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <p className="text-tx-muted">User not found.</p>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="min-h-screen bg-void">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <p className="text-crimson">Failed to load profile.</p>
        </div>
      </div>
    );
  }

  const totalGames = (profile.wins ?? 0) + (profile.losses ?? 0);
  const winRateDisplay =
    totalGames > 0 ? `${Math.round(((profile.wins ?? 0) / totalGames) * 100)}%` : 'N/A';
  const memberSince = formatDate(profile.createdAt);

  return (
    <div className="min-h-screen bg-void">
      <Navbar />
      <main className="max-w-2xl mx-auto px-6 py-10">
        {/* Profile header */}
        <div className="flex items-center gap-4">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white flex-shrink-0 ${avatarColor(profile.username)}`}
            aria-label={`${profile.username} avatar`}
          >
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-black text-2xl text-tx-primary">{profile.username}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-violet font-semibold">{profile.elo} Elo</span>
              <span className="text-tx-muted text-sm">· Rank #{profile.rank}</span>
            </div>
            <p className="text-tx-muted text-xs mt-0.5">Member since {memberSince}</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-surface border border-border rounded-xl p-5 text-center">
            <p className="text-3xl font-black text-lime">{profile.wins ?? 0}</p>
            <p className="text-xs text-tx-muted mt-1">Wins</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5 text-center">
            <p className="text-3xl font-black text-crimson">{profile.losses ?? 0}</p>
            <p className="text-xs text-tx-muted mt-1">Losses</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5 text-center">
            <p className="text-3xl font-black text-tx-primary">{winRateDisplay}</p>
            <p className="text-xs text-tx-muted mt-1">Win rate</p>
          </div>
        </div>

        {/* Match history */}
        <section>
          <h2 className="text-sm font-semibold text-tx-primary mt-8 mb-3">Match history</h2>

          {historyLoading ? (
            <p className="text-tx-muted text-sm">Loading match history…</p>
          ) : historyError ? (
            <p className="text-crimson text-sm">{historyError}</p>
          ) : history.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl px-6 py-8 text-center">
              <p className="text-tx-muted">No matches played yet.</p>
            </div>
          ) : (
            <>
              <div>
                {history.map((entry, idx) => {
                  const outcome = entry.outcome;
                  const delta = entry.delta;
                  return (
                    <div
                      key={`${entry.duelId}-${idx}`}
                      className="flex items-center justify-between py-3 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        {entry.opponent && entry.opponent !== 'Unknown' ? (
                          <Link
                            to={`/profile/${entry.opponent}`}
                            className="text-violet text-sm hover:text-violet-hi transition-colors"
                          >
                            {entry.opponent}
                          </Link>
                        ) : (
                          <span className="text-tx-muted text-sm">Unknown</span>
                        )}
                        {!entry.isRated && (
                          <span className="text-tx-muted text-xs">unrated</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        {entry.isRated ? (
                          outcome === 'win' ? (
                            <span className="text-lime text-xs font-semibold">WIN</span>
                          ) : outcome === 'loss' ? (
                            <span className="text-crimson text-xs font-semibold">LOSS</span>
                          ) : (
                            <span className="text-tx-muted text-xs font-semibold">DRAW</span>
                          )
                        ) : null}
                        {entry.isRated ? (
                          <span className={`text-xs font-medium ${delta > 0 ? 'text-lime' : delta < 0 ? 'text-crimson' : 'text-tx-muted'}`}>
                            {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta}
                          </span>
                        ) : (
                          <span className="text-tx-muted text-xs">—</span>
                        )}
                        <span className="text-tx-muted text-xs">{formatDate(entry.completedAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs text-violet hover:text-violet-hi mt-2 cursor-pointer disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
