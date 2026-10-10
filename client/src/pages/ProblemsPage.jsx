import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProblems } from '../api/problems';
import { createDuel } from '../api/duels';

// All dot color classes written as complete strings so Tailwind JIT includes them
const dotColors = {
  easy: 'bg-lime',
  medium: 'bg-amber',
  hard: 'bg-crimson',
};

export default function ProblemsPage() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [duelLoading, setDuelLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getProblems()
      .then(({ data }) => {
        setProblems(data.problems ?? data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load problems.');
        setLoading(false);
      });
  }, []);

  const handleNewDuel = async () => {
    setDuelLoading(true);
    try {
      const { data } = await createDuel({});
      const newId = data.duel?._id ?? data._id ?? data.duel?.id;
      navigate('/duels/' + newId);
    } catch (err) {
      const errBody = err.response?.data?.error;
      if (errBody?.code === 'DUEL_ALREADY_ACTIVE' && errBody?.existingDuelId) {
        navigate('/duels/' + errBody.existingDuelId);
        return;
      }
      if (errBody?.code === 'NO_PROBLEMS_AVAILABLE') {
        setError('No problems available for duels right now.');
        return;
      }
      setError(errBody?.message ?? 'Failed to create duel.');
    } finally {
      setDuelLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-void">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-tx-primary">Problems</h1>
            {!loading && !error && (
              <span className="text-xs text-tx-muted bg-surface border border-border px-2 py-0.5 rounded-full">
                {problems.length} problem{problems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={handleNewDuel}
            disabled={duelLoading}
            className="bg-violet hover:bg-violet-hi disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            {duelLoading ? 'Starting...' : 'Start a duel'}
          </button>
        </div>

        {loading && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="animate-pulse bg-elevated h-12 rounded mx-4 my-2" />
            <div className="animate-pulse bg-elevated h-12 rounded mx-4 my-2" />
            <div className="animate-pulse bg-elevated h-12 rounded mx-4 my-2" />
          </div>
        )}

        {error && !loading && (
          <div className="bg-crimson/10 border border-crimson/30 text-crimson rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && problems.length === 0 && (
          <div className="bg-surface border border-border rounded-xl py-12 text-center">
            <p className="text-tx-muted">No problems available yet.</p>
          </div>
        )}

        {!loading && !error && problems.length > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-xs text-tx-muted font-medium px-4 py-3">Title</th>
                  <th className="text-xs text-tx-muted font-medium px-4 py-3">Difficulty</th>
                  <th className="text-xs text-tx-muted font-medium px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem) => {
                  const d = problem.difficulty;
                  return (
                    <tr
                      key={problem.slug}
                      className="hover:bg-elevated transition-colors border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-tx-primary font-medium">{problem.title}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-sm">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${dotColors[d] ?? 'bg-tx-muted'}`}
                          />
                          <span className="text-tx-body capitalize">{d}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/problems/${problem.slug}`)}
                          className="text-xs text-tx-muted hover:text-tx-primary border border-border hover:border-border-hi px-3 py-1.5 rounded transition-colors"
                        >
                          Solve
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
