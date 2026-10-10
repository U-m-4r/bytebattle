import { useEffect, useState, Suspense, lazy } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getProblem, submitSolution } from '../api/problems';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const difficultyBadge = {
  easy:   'bg-lime/20 text-lime border border-lime/30',
  medium: 'bg-amber/20 text-amber border border-amber/30',
  hard:   'bg-crimson/20 text-crimson border border-crimson/30',
};

export default function ProblemPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user  = useAuthStore((s) => s.user);

  const [problem,     setProblem]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState(null);

  const [code,        setCode]        = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [result,      setResult]      = useState(null);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    getProblem(slug)
      .then(({ data }) => {
        const p = data.problem ?? data;
        setProblem(p);
        setCode(p.functionSignature ?? '');
        setLoading(false);
      })
      .catch(() => {
        setFetchError('Failed to load problem.');
        setLoading(false);
      });
  }, [slug]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    setSubmitError(null);
    try {
      const { data } = await submitSolution({
        problemSlug: slug,
        code,
        language: 'javascript',
      });
      setResult(data);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        setSubmitError('Please log in to submit.');
      } else if (status === 503) {
        setSubmitError('Judge unavailable. Please try again later.');
      } else {
        setSubmitError(
          err.response?.data?.error?.message ?? 'Submission failed. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <p className="text-tx-muted text-sm">Loading problem…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="bg-crimson/10 border border-crimson/30 text-crimson rounded-lg px-4 py-3 text-sm max-w-sm">
          {fetchError}
        </div>
      </div>
    );
  }

  const passedCount =
    result?.results?.filter((r) => r.passed === true).length ?? 0;
  const totalCount = result?.results?.length ?? 0;
  const allPassed  = result && passedCount === totalCount && totalCount > 0;

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Sticky top bar */}
      <header className="h-12 border-b border-border flex items-center px-4 gap-4 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={() => navigate('/problems')}
          className="text-tx-muted hover:text-tx-primary text-sm transition-colors"
        >
          ← Problems
        </button>

        {/* Title + difficulty */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-tx-primary text-sm font-semibold truncate">{problem.title}</span>
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize shrink-0 ${
              difficultyBadge[problem.difficulty] ?? 'bg-elevated text-tx-body border border-border'
            }`}
          >
            {problem.difficulty}
          </span>
        </div>

        {/* Auth state */}
        <div className="shrink-0 text-sm">
          {token && user ? (
            <Link to={`/profile/${user.username}`} className="text-tx-muted hover:text-tx-primary transition-colors">
              {user.username}
            </Link>
          ) : (
            <Link to="/login" className="text-violet hover:text-violet-hi transition-colors">
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column — problem info (40%) */}
        <div className="w-[40%] overflow-y-auto px-5 py-5 border-r border-border">
          <h1 className="text-lg font-bold text-tx-primary mb-1">{problem.title}</h1>
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
              difficultyBadge[problem.difficulty] ?? 'bg-elevated text-tx-body border border-border'
            }`}
          >
            {problem.difficulty}
          </span>

          <div
            className="text-sm text-tx-body leading-relaxed mt-4"
            dangerouslySetInnerHTML={{
              __html: problem.description.replace(/\n/g, '<br/>'),
            }}
          />

          {Array.isArray(problem.examples) && problem.examples.length > 0 && (
            <div className="mt-5">
              <h2 className="text-sm font-semibold text-tx-primary mb-2">Examples</h2>
              {problem.examples.map((ex, i) => (
                <div
                  key={i}
                  className="bg-void border border-border rounded-lg p-3 mt-3 font-mono text-xs"
                >
                  <div className="mb-1">
                    <span className="text-tx-muted">Input: </span>
                    <span className="text-lime">{ex.input}</span>
                  </div>
                  <div className="mb-1">
                    <span className="text-tx-muted">Output: </span>
                    <span className="text-violet-hi">{ex.output}</span>
                  </div>
                  {ex.explanation && (
                    <div className="text-tx-body font-sans mt-1">{ex.explanation}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column — editor (60%) */}
        <div className="w-[60%] flex flex-col">
          {/* Editor header */}
          <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-elevated/50">
            <span className="text-xs text-tx-muted">JavaScript</span>
            <span className="text-xs text-amber">
              Results are simulated — not real execution.
            </span>
          </div>

          {/* Monaco */}
          <div className="flex-1 min-h-0">
            <Suspense
              fallback={
                <div className="h-full bg-void flex items-center justify-center text-tx-muted text-sm">
                  Loading editor…
                </div>
              }
            >
              <MonacoEditor
                height="100%"
                language="javascript"
                theme="vs-dark"
                defaultValue={problem.functionSignature ?? ''}
                onChange={(val) => setCode(val ?? '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            </Suspense>
          </div>

          {/* Submit area */}
          <div className="border-t border-border px-4 py-3 flex items-start justify-between gap-4">
            {/* Left: errors + result */}
            <div className="flex-1 min-w-0 space-y-2">
              {submitError && (
                <div className="bg-crimson/10 border border-crimson/30 text-crimson rounded px-3 py-2 text-xs">
                  {submitError}
                </div>
              )}

              {result?.isMock && (
                <p className="text-xs text-amber/70">
                  ⚠ Mock judge: results are simulated, not real code execution.
                </p>
              )}

              {result && (
                <div className={`rounded-lg px-3 py-2 text-xs border ${
                  allPassed
                    ? 'bg-lime/10 border-lime/30 text-lime'
                    : 'bg-crimson/10 border-crimson/30 text-crimson'
                }`}>
                  <p className="font-semibold mb-1">
                    {allPassed
                      ? `All ${totalCount} test cases passed`
                      : `${passedCount}/${totalCount} test cases passed`}
                  </p>
                  <div className="space-y-1 mt-1">
                    {result.results?.map((r, i) => (
                      <div key={i} className="text-xs opacity-80">
                        <span className="text-tx-muted">Test {i + 1}: </span>
                        <span className="capitalize">{r.status?.replace(/_/g, ' ')}</span>
                        {r.actualOutput !== undefined && r.actualOutput !== null && (
                          <span className="ml-2 font-mono">{String(r.actualOutput)}</span>
                        )}
                        {r.stderr && (
                          <div className="mt-0.5 text-amber font-mono whitespace-pre-wrap">{r.stderr}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: submit button */}
            <div className="shrink-0">
              {!token ? (
                <Link to="/login" className="text-sm text-tx-muted hover:text-tx-primary transition-colors">
                  Sign in to submit
                </Link>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-violet hover:bg-violet-hi disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
