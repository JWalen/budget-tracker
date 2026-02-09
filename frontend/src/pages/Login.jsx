import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Wallet, Shield } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password, needsMfa ? mfaCode : null);

      if (result.requiresMfa) {
        setNeedsMfa(true);
        setLoading(false);
        return;
      }

      // Check if there's a pending invite token to handle after login
      const pendingInviteToken = sessionStorage.getItem('pendingInviteToken');
      if (pendingInviteToken) {
        sessionStorage.removeItem('pendingInviteToken');
        navigate(`/invite/${pendingInviteToken}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Budget Tracker</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Take control of your finances</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            {needsMfa ? 'Two-Factor Authentication' : 'Welcome back'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!needsMfa ? (
              <>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-4 p-3 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                  <Shield className="w-5 h-5 text-primary-600" />
                  <p className="text-sm text-primary-800 dark:text-primary-300">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>
                <label className="label">Authentication Code</label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  required
                />
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full btn-primary py-3">
              {loading ? 'Signing in...' : needsMfa ? 'Verify' : 'Sign In'}
            </button>

            {needsMfa && (
              <button
                type="button"
                onClick={() => {
                  setNeedsMfa(false);
                  setMfaCode('');
                  setError('');
                }}
                className="w-full btn-secondary"
              >
                Back to Login
              </button>
            )}
          </form>

          {!needsMfa && (
            <p className="mt-6 text-center text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                Create one
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
