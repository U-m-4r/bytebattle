import { useNavigate, Link, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function Navbar() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const problemsActive =
    location.pathname === '/problems' || location.pathname.startsWith('/problems/');
  const leaderboardActive = location.pathname === '/leaderboard';

  return (
    <nav className="bg-void border-b border-border h-14 flex items-center px-6 gap-6">
      <span className="font-black text-lg text-tx-primary tracking-tight">ByteBattle</span>

      <div className="flex items-center gap-5 flex-1">
        <Link
          to="/problems"
          className={
            problemsActive
              ? 'text-sm text-tx-primary border-b-2 border-violet transition-colors'
              : 'text-sm text-tx-body hover:text-tx-primary transition-colors'
          }
          style={problemsActive ? { marginBottom: '-1px' } : undefined}
        >
          Problems
        </Link>
        <Link
          to="/leaderboard"
          className={
            leaderboardActive
              ? 'text-sm text-tx-primary border-b-2 border-violet transition-colors'
              : 'text-sm text-tx-body hover:text-tx-primary transition-colors'
          }
          style={leaderboardActive ? { marginBottom: '-1px' } : undefined}
        >
          Leaderboard
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {token && user ? (
          <>
            <Link
              to={`/profile/${user.username}`}
              className="text-sm text-violet hover:text-violet-hi transition-colors font-medium"
            >
              {user.username}
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-tx-muted hover:text-tx-body transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              className="border border-border text-tx-body hover:border-border-hi hover:text-tx-primary px-3 py-1.5 rounded text-sm transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="bg-violet hover:bg-violet-hi text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
