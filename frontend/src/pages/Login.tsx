import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { toast } from '../components/Toast';
import { AuthLayout } from '../components/AuthLayout';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [brandName, setBrandName] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const isMainDomain = window.location.hostname === 'nms.salfa.my.id' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    fetch('/api/public/branding').then(r => r.json()).then(d => {
      setBrandName(d.nms_name || 'FiberNMS');
    }).catch(() => { setBrandName('FiberNMS'); });
  }, []);

  if (authLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(username, password);
    if (ok) {
      toast.success('Welcome back!');
      const u = useAuth.getState().user;
      if (u?.is_super_admin) {
        navigate('/dashboard/admin');
      } else {
        navigate('/dashboard');
      }
    } else {
      toast.error(useAuth.getState().error || 'Invalid username or password');
    }
    setLoading(false);
  };

  return (
    <AuthLayout brandName={brandName}>
      {/* Login Card */}
      <div className="glass-card p-6 sm:p-8">
        <h2 className="text-xl font-semibold mb-1 font-display">Sign In</h2>
        <p className="text-xs text-tx3 mb-6">Masuk ke dashboard monitoring Anda</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-tx2 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full h-11 px-4 rounded-xl bg-glass border border-brd text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/50 transition-colors"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-tx2 mb-2">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full h-11 px-4 pr-11 rounded-xl bg-glass border border-brd text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/50 transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx2 transition-colors"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed glow-accent"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        {!isMainDomain && !showForgot && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => { setShowForgot(true); }}
              className="text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1.5"
            >
              <KeyRound size={14} />
              Lupa Password?
            </button>
          </div>
        )}

        <p className="text-center text-xs text-tx3 mt-6">
          Secure connection • Credentials encrypted
        </p>
      </div>

      {/* Forgot Password Card */}
      {showForgot && (
        <div className="glass-card p-6 sm:p-8 mt-4">
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotIdentifier(''); }}
              className="text-tx3 hover:text-tx2 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-semibold font-display">Reset Password</h2>
          </div>

          {forgotSuccess ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className="text-sm text-tx2 mb-2">Password baru telah dikirim via WhatsApp!</p>
              <p className="text-xs text-tx3">Cek WhatsApp nomor terdaftar tenant Anda untuk password baru. Silakan login dengan password tersebut.</p>
              <button
                type="button"
                onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotIdentifier(''); }}
                className="mt-6 px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
              >
                Kembali ke Login
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-tx3 mb-5">
                Masukkan username Anda. Password baru akan dikirim langsung via WhatsApp ke nomor terdaftar tenant.
              </p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setForgotLoading(true);
                try {
                  const r = await fetch('/api/public/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier: forgotIdentifier }),
                  });
                  const d = await r.json();
                  if (d.success) {
                    setForgotSuccess(true);
                    toast.success('Reset request sent!');
                  } else {
                    toast.error(d.message || 'Failed to send request');
                  }
                } catch {
                  toast.error('Network error. Please try again.');
                }
                setForgotLoading(false);
              }} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-tx2 mb-2">Username</label>
                  <input
                    type="text"
                    value={forgotIdentifier}
                    onChange={e => setForgotIdentifier(e.target.value)}
                    placeholder="Masukkan username Anda"
                    className="w-full h-11 px-4 rounded-xl bg-glass border border-brd text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/50 transition-colors"
                    autoFocus
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full h-11 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed glow-accent"
                >
                  {forgotLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Mengirim...
                    </span>
                  ) : 'Kirim Permintaan Reset'}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
