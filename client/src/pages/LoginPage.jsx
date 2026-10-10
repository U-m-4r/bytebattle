import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, googleSignIn, isLoading, error, token, clearError } = useAuthStore();

  const [form, setForm] = useState({ email: '', password: '' });

  // Redirect if already authenticated
  useEffect(() => {
    if (token) navigate('/dashboard', { replace: true });
  }, [token, navigate]);

  // Clear store error when unmounting
  useEffect(() => () => clearError(), [clearError]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(form);
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl p-8">
        <h1 className="font-black text-2xl text-tx-primary tracking-tight mb-1">ByteBattle</h1>
        <p className="text-tx-muted text-sm mb-8">Competitive coding arena</p>

        <h2 className="text-tx-primary font-semibold text-base mb-6">Sign in to continue</h2>

        {error && (
          <div className="bg-crimson/10 border border-crimson/30 text-crimson text-sm rounded-lg px-3 py-2.5 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs text-tx-muted font-medium mb-1.5">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              className="w-full bg-void border border-border rounded-lg px-3 py-2.5 text-sm text-tx-primary placeholder-tx-muted focus:outline-none focus:border-violet transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs text-tx-muted font-medium mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              className="w-full bg-void border border-border rounded-lg px-3 py-2.5 text-sm text-tx-primary placeholder-tx-muted focus:outline-none focus:border-violet transition-colors"
              placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-violet hover:bg-violet-hi disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-2"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-surface px-3 text-xs text-tx-muted">or</span>
          </div>
        </div>

        <GoogleLogin
          onSuccess={(response) => googleSignIn(response.credential)}
          onError={() => {}}
          theme="filled_black"
          shape="rectangular"
          text="continue_with"
          width="320"
        />

        <p className="text-xs text-tx-muted mt-6 text-center">
          Don't have an account?{' '}
          <Link to="/register" className="text-violet hover:text-violet-hi transition-colors">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
