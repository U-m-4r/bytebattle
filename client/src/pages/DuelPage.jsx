import { useEffect, useState, Suspense, lazy, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import CountdownOverlay from '../components/CountdownOverlay';
import useAuthStore from '../store/authStore';
import { createDuel, getDuel, getInviteInfo, joinDuel, cancelDuel, submitToDuel } from '../api/duels';
import { getSocket } from '../socket/socketClient';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const difficultyBadge = {
  easy:   'bg-lime/20 text-lime border border-lime/30',
  medium: 'bg-amber/20 text-amber border border-amber/30',
  hard:   'bg-crimson/20 text-crimson border border-crimson/30',
};

// ── helpers ─────────────────────────────────────────────────────────────────

function ProblemPanel({ problem }) {
  if (!problem) {
    return (
      <div className="flex items-center justify-center h-full text-tx-muted text-sm">
        Problem loading...
      </div>
    );
  }
  return (
    <div className="overflow-y-auto p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-tx-primary">{problem.title}</h2>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded capitalize ${difficultyBadge[problem.difficulty] ?? 'bg-elevated text-tx-body border border-border'}`}>
          {problem.difficulty}
        </span>
      </div>

      <div
        className="text-sm text-tx-body leading-relaxed"
        dangerouslySetInnerHTML={{ __html: problem.description.replace(/\n/g, '<br/>') }}
      />

      {Array.isArray(problem.examples) && problem.examples.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-tx-primary mb-2">Examples</h3>
          {problem.examples.map((ex, i) => (
            <div key={i} className="mb-3 bg-void border border-border rounded-lg p-3 text-xs font-mono">
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
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function DuelPage() {
  const { duelId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const [duel,         setDuel]         = useState(null);
  // 'loading' | 'join-prompt' | 'participant' | 'error'
  const [viewState,    setViewState]    = useState('loading');
  const [inviteInfo,   setInviteInfo]   = useState(null);
  const [joinError,    setJoinError]    = useState(null);
  const [joining,      setJoining]      = useState(false);

  const [code,         setCode]         = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [opponentOnline,  setOpponentOnline]  = useState(false);
  const [opponentTyping,  setOpponentTyping]  = useState(false);
  const [pageError,    setPageError]    = useState(null);
  const [countdownState, setCountdownState] = useState(null); // { startsAt: string } | null

  // Debounce typing indicator
  const typingTimer = useRef(null);

  // ── /duels/new ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!duelId) {
      const problemSlug = searchParams.get('problem');
      createDuel({})   // problem selected server-side
        .then(({ data }) => {
          const newId = data.duel?._id ?? data._id ?? data.duel?.id;
          navigate('/duels/' + newId, { replace: true });
        })
        .catch((err) => {
          const errBody = err.response?.data?.error;
          if (errBody?.code === 'DUEL_ALREADY_ACTIVE' && errBody?.existingDuelId) {
            navigate('/duels/' + errBody.existingDuelId, { replace: true });
            return;
          }
          setPageError(errBody?.message ?? 'Failed to create duel.');
          setViewState('error');
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load duel on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!duelId) return;

    getDuel(duelId)
      .then(({ data }) => {
        const d = data.duel ?? data;
        setDuel(d);
        setCode(d.problem?.functionSignature ?? '');
        setViewState('participant');
        // If duel is active but startsAt is still in the future, show countdown
        if (d.status === 'active' && d.startsAt && new Date(d.startsAt) > new Date()) {
          setCountdownState({ startsAt: d.startsAt });
        }
      })
      .catch((err) => {
        const status = err.response?.status;
        const errCode = err.response?.data?.error?.code;

        if (status === 403 && errCode === 'NOT_PARTICIPANT') {
          getInviteInfo(duelId)
            .then(({ data }) => {
              setInviteInfo(data.invite);
              setViewState('join-prompt');
            })
            .catch(() => {
              setPageError('This invite link is no longer valid.');
              setViewState('error');
            });
        } else {
          setPageError(err.response?.data?.error?.message ?? 'Failed to load duel.');
          setViewState('error');
        }
      });
  }, [duelId]);

  // ── Socket (only when participant) ─────────────────────────────────────────
  useEffect(() => {
    if (viewState !== 'participant' || !duelId) return;

    const socket = getSocket();
    socket.connect();
    socket.emit('duel:join', { duelId });

    const onState = ({ duel: updated }) => {
      setDuel(updated);
      // Seed the editor with the function signature if the editor is still empty
      if (!code && updated?.problem?.functionSignature) setCode(updated.problem.functionSignature);
    };

    const onCountdown = ({ startsAt, opponent, creator, problem, duel: fullDuel }) => {
      setCountdownState({ startsAt });
      // Prefer the fully populated duel when provided (reconnect path sends it)
      if (fullDuel) {
        setDuel(fullDuel);
        if (!code && fullDuel.problem?.functionSignature) setCode(fullDuel.problem.functionSignature);
      } else {
        setDuel((prev) =>
          prev
            ? {
                ...prev,
                startsAt,
                ...(opponent !== undefined && { opponent }),
                ...(creator !== undefined && { creator }),
                ...(problem !== undefined && { problem }),
              }
            : prev
        );
      }
    };

    const onOpponentJoined = ({ username, duel: updated }) => {
      setOpponentOnline(true);
      // If the server sent the full updated duel (with problem populated), use it
      if (updated) {
        setDuel(updated);
        if (!code && updated.problem?.functionSignature) {
          setCode(updated.problem.functionSignature);
        }
        // Show countdown overlay if the match hasn't started yet
        if (updated.status === 'active' && updated.startsAt && new Date(updated.startsAt) > new Date()) {
          setCountdownState({ startsAt: updated.startsAt });
        }
      }
      // Fallback: refresh from API to get populated duel
      else {
        getDuel(duelId).then(({ data }) => setDuel(data.duel ?? data)).catch(() => {});
      }
    };

    const onSubmission = ({ userId, status }) => {
      // Clear typing indicator when the opponent submits
      // Compare userId (string from server) against current user's id
      const myId = currentUser?._id ?? currentUser?.id;
      if (userId && userId !== myId) {
        setOpponentTyping(false);
      }
    };

    const onCompleted = ({ duel: completed }) => {
      if (completed) setDuel(completed);
      // Fallback: refresh from API if socket payload missing winner data
      else getDuel(duelId).then(({ data }) => setDuel(data.duel ?? data)).catch(() => {});
    };

    const onOpponentTyping = () => {
      setOpponentTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setOpponentTyping(false), 3000);
    };

    socket.on('duel:state', onState);
    socket.on('duel:countdown', onCountdown);
    socket.on('duel:opponent_joined', onOpponentJoined);
    socket.on('duel:submission', onSubmission);
    socket.on('duel:completed', onCompleted);
    socket.on('duel:opponent_typing', onOpponentTyping);

    return () => {
      clearTimeout(typingTimer.current);
      socket.emit('duel:leave', { duelId });
      socket.off('duel:state', onState);
      socket.off('duel:countdown', onCountdown);
      socket.off('duel:opponent_joined', onOpponentJoined);
      socket.off('duel:submission', onSubmission);
      socket.off('duel:completed', onCompleted);
      socket.off('duel:opponent_typing', onOpponentTyping);
    };
  }, [viewState, duelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Stable callback for CountdownOverlay — prevents useEffect restart loop
  // caused by a new inline arrow reference on every render.
  const handleCountdownComplete = useCallback(() => setCountdownState(null), []);

  const handleJoin = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const { data } = await joinDuel(duelId);
      const d = data.duel ?? data;
      setDuel(d);
      setCode(d.problem?.functionSignature ?? '');
      // If the duel is active but startsAt is still in the future, show countdown overlay
      if (d.status === 'active' && d.startsAt && new Date(d.startsAt) > new Date()) {
        setCountdownState({ startsAt: d.startsAt });
      }
      setViewState('participant');
    } catch (err) {
      setJoinError(err.response?.data?.error?.message ?? 'Failed to join duel.');
    } finally {
      setJoining(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelDuel(duelId);
      navigate('/problems');
    } catch (err) {
      setPageError(err.response?.data?.error?.message ?? 'Failed to cancel duel.');
    }
  };

  const handleEditorChange = (val) => {
    setCode(val ?? '');
    // Emit typing indicator (debounced on server side by socket)
    const socket = getSocket();
    if (socket?.connected) socket.emit('duel:typing', { duelId });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    try {
      if (countdownState) {
        setSubmitError('Match has not started yet — wait for the countdown to finish.');
        setSubmitting(false);
        return;
      }
      const { data } = await submitToDuel(duelId, { code, language: 'javascript' });
      setSubmitResult(data);
      // data.duel is now populated with winner/creator/opponent usernames
      if (data.duel) setDuel(data.duel);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) setSubmitError('Please log in to submit.');
      else if (status === 503) setSubmitError('Judge unavailable. Please try again later.');
      else setSubmitError(err.response?.data?.error?.message ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const myUsername = currentUser?.username;
  const isCreator = duel && duel.creatorId &&
    (duel.creatorId === currentUser?._id ||
     duel.creatorId === currentUser?.id ||
     duel.creator?.username === myUsername);

  const opponentData = isCreator ? duel?.opponent : duel?.creator;
  const opponentName = opponentData?.username ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────

  // (A) No duelId yet — creation in progress
  if (!duelId) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        {pageError ? (
          <div className="bg-surface border border-crimson/30 rounded-xl p-6 max-w-sm w-full text-center">
            <p className="text-crimson text-sm">{pageError}</p>
            <Link to="/problems" className="mt-4 inline-block text-violet hover:text-violet-hi text-sm transition-colors">
              Back to Problems
            </Link>
          </div>
        ) : (
          <p className="text-tx-muted text-sm">Creating arena...</p>
        )}
      </div>
    );
  }

  // (B) Loading
  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <p className="text-tx-muted text-sm">Preparing arena...</p>
      </div>
    );
  }

  // (C) Error
  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="bg-surface border border-crimson/30 rounded-xl p-6 max-w-sm w-full text-center">
          <p className="text-crimson text-sm mb-4">{pageError ?? 'Something went wrong.'}</p>
          <Link to="/problems" className="text-violet hover:text-violet-hi text-sm transition-colors">
            Back to Problems
          </Link>
        </div>
      </div>
    );
  }

  // (D) Join prompt
  if (viewState === 'join-prompt') {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center relative">
        {/* Brand mark */}
        <div className="absolute top-5 left-6 text-tx-muted text-sm font-semibold tracking-wide">
          ByteBattle
        </div>

        <div className="max-w-sm w-full bg-surface border border-border rounded-2xl p-8 text-center mx-4">
          {inviteInfo?.problem ? (
            <>
              <h1 className="text-2xl font-black text-tx-primary mb-2">{inviteInfo.problem.title}</h1>
              <span
                className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold capitalize mb-4 ${
                  difficultyBadge[inviteInfo.problem.difficulty] ?? 'bg-elevated text-tx-body border border-border'
                }`}
              >
                {inviteInfo.problem.difficulty}
              </span>
            </>
          ) : (
            <h1 className="text-2xl font-black text-tx-primary mb-4">Coding Duel</h1>
          )}

          <p className="text-tx-muted text-sm mb-5">You have been invited to duel.</p>

          {joinError && (
            <div className="mb-4 bg-crimson/10 border border-crimson/30 text-crimson rounded-lg px-4 py-3 text-sm text-left">
              {joinError}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full bg-violet hover:bg-violet-hi disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors mb-3"
          >
            {joining ? 'Joining...' : 'Accept & Enter Arena'}
          </button>
          <button
            onClick={() => navigate('/problems')}
            className="w-full bg-transparent border border-border hover:border-border-hi text-tx-muted hover:text-tx-primary font-medium px-6 py-2 rounded-lg transition-colors text-sm"
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  // ── Participant view (E) ─────────────────────────────────────────────────────
  const inviteLink = window.location.origin + '/duels/' + duelId;

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Countdown overlay renders on top */}
      {countdownState && (
        <CountdownOverlay
          startsAt={countdownState.startsAt}
          onComplete={handleCountdownComplete}
        />
      )}

      {/* Top bar h-12 */}
      <header className="h-12 bg-surface/80 backdrop-blur-sm border-b border-border flex items-center px-4 gap-3 shrink-0 z-10">
        <button
          onClick={() => navigate('/problems')}
          className="text-tx-muted hover:text-tx-primary text-sm transition-colors shrink-0"
        >
          ←
        </button>

        {/* Problem title + difficulty */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-tx-primary text-sm font-semibold truncate">
            {duel?.problem?.title ?? 'Arena'}
          </span>
          {duel?.problem?.difficulty && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize shrink-0 ${
              difficultyBadge[duel.problem.difficulty] ?? 'bg-elevated text-tx-body border border-border'
            }`}>
              {duel.problem.difficulty}
            </span>
          )}
        </div>

        {/* Spacer already provided by flex-1 above */}

        {/* vs opponent + typing indicator */}
        <div className="shrink-0 flex items-center gap-3">
          {opponentName ? (
            <span className="text-tx-muted text-sm">
              vs <span className="text-tx-primary">{opponentName}</span>
              {opponentData?.elo && (
                <span className="text-tx-muted ml-1 text-xs">({opponentData.elo})</span>
              )}
            </span>
          ) : (
            duel?.status === 'waiting' && (
              <span className="text-tx-muted text-sm">Waiting for opponent...</span>
            )
          )}
          {opponentTyping && (
            <span className="text-xs text-violet animate-pulse">typing...</span>
          )}
          {duel?.isRated === false && (
            <span className="text-xs text-amber bg-amber-dim border border-amber/20 px-2 py-0.5 rounded">
              Unrated
            </span>
          )}
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* WAITING state */}
        {duel.status === 'waiting' && (
          <div className="flex flex-col items-center gap-6 py-16 px-6">
            <h1 className="text-xl font-bold text-tx-primary">Waiting for opponent</h1>
            <p className="text-tx-muted text-sm">Share this invite link:</p>

            <div className="flex items-center gap-3 bg-void border border-border rounded-lg px-4 py-3 max-w-lg w-full">
              <span className="text-violet font-mono text-sm break-all flex-1">{inviteLink}</span>
              <button
                onClick={() => navigator.clipboard?.writeText(inviteLink)}
                className="text-tx-muted hover:text-tx-primary text-xs whitespace-nowrap transition-colors bg-surface hover:bg-elevated border border-border px-3 py-1.5 rounded"
              >
                Copy
              </button>
            </div>

            {duel.problem && (
              <div className="bg-surface border border-border rounded-lg px-5 py-3 flex items-center gap-3 max-w-lg w-full">
                <span className="text-tx-body text-sm font-medium flex-1">{duel.problem.title}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                  difficultyBadge[duel.problem.difficulty] ?? 'bg-elevated text-tx-body border border-border'
                }`}>
                  {duel.problem.difficulty}
                </span>
              </div>
            )}

            <button
              onClick={handleCancel}
              className="text-xs text-tx-muted hover:text-crimson transition-colors mt-4"
            >
              Cancel duel
            </button>
          </div>
        )}

        {/* ACTIVE state — two-column layout */}
        {duel.status === 'active' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: problem panel 40% */}
            <div className="w-[40%] border-r border-border overflow-y-auto">
              <ProblemPanel problem={duel.problem} />
            </div>

            {/* Right: editor 60% */}
            <div className="w-[60%] flex flex-col">
              {/* Editor header h-10 */}
              <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-elevated/50">
                <span className="text-xs text-tx-muted">JavaScript</span>
                <span className="text-xs text-amber/70">
                  Mock judge — results simulated
                </span>
              </div>

              {/* Monaco */}
              <div className="flex-1 min-h-0">
                <Suspense fallback={
                  <div className="h-full bg-void flex items-center justify-center text-tx-muted text-sm">
                    Loading editor...
                  </div>
                }>
                  <MonacoEditor
                    height="100%"
                    language="javascript"
                    theme="vs-dark"
                    value={code}
                    onChange={handleEditorChange}
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

                  {submitResult?.submission && (
                    <div className={`rounded px-3 py-2 text-xs border ${
                      submitResult.submission.status === 'accepted'
                        ? 'bg-lime/10 border-lime/30 text-lime'
                        : 'bg-crimson/10 border-crimson/30 text-crimson'
                    }`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold capitalize">{submitResult.submission.status?.replace(/_/g, ' ')}</span>
                        <span className="opacity-70">
                          {submitResult.submission.passedCount}/{submitResult.submission.totalCount} tests
                        </span>
                      </div>
                      {submitResult.submission.isMock && (
                        <p className="text-xs opacity-70 mt-0.5">
                          Mock judge: results are simulated, not real code execution.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: submit button */}
                <div className="shrink-0">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-violet hover:bg-violet-hi disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors"
                  >
                    {submitting ? 'Submitting...' : 'Submit Solution'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETED state */}
        {duel.status === 'completed' && (() => {
          const won = duel.winnerId &&
            (duel.winner?.username === myUsername ||
             duel.winnerId === currentUser?._id ||
             duel.winnerId === currentUser?.id);
          const winnerName = duel.winner?.username ?? null;
          return (
            <div className="flex flex-col items-center justify-center flex-1 px-6">
              <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-10 text-center">
                {winnerName ? (
                  <>
                    <p className={`text-4xl font-black mb-1 ${won ? 'text-lime' : 'text-tx-body'}`}>
                      {winnerName}
                    </p>
                    <p className="text-tx-muted text-sm mb-6">
                      {won ? 'wins' : 'defeated you'}
                    </p>
                  </>
                ) : (
                  <p className="text-tx-muted text-sm mb-6">No winner determined.</p>
                )}

                {duel.isRated === false && (
                  <p className="text-xs text-amber bg-amber-dim border border-amber/20 px-3 py-1.5 rounded inline-block mb-6">
                    Unrated match — does not affect competitive ratings.
                  </p>
                )}

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => navigate('/problems')}
                    className="bg-violet hover:bg-violet-hi text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                  >
                    Play again
                  </button>
                  <button
                    onClick={() => navigate('/leaderboard')}
                    className="bg-elevated hover:bg-border text-tx-body font-medium px-5 py-2 rounded-lg text-sm transition-colors border border-border"
                  >
                    Leaderboard
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* CANCELLED state */}
        {duel.status === 'cancelled' && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4">
            <p className="text-tx-muted text-sm">This duel was cancelled.</p>
            <Link to="/problems" className="text-violet hover:text-violet-hi text-sm transition-colors">
              Back to Problems
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
