import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { toast } from '../components/Toast';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Card, Input } from '../components/ui';

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
      <Card bodyClassName="p-6 sm:p-8">
        <h2 className="text-xl font-semibold mb-1 font-display">Sign In</h2>
        <p className="text-xs text-tx3 mb-6">Masuk ke dashboard monitoring Anda</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="h-11"
            autoFocus
            required
          />

          <Input
            label="Password"
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="h-11"
            required
            suffix={
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="hover:text-tx2 transition-colors"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          <Button type="submit" variant="primary" loading={loading} className="w-full h-11 glow-accent">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
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
      </Card>

      {/* Forgot Password Card */}
      {showForgot && (
        <Card className="mt-4" bodyClassName="p-6 sm:p-8">
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
              <Button
                type="button"
                variant="primary"
                className="mt-6"
                onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotIdentifier(''); }}
              >
                Kembali ke Login
              </Button>
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
                <Input
                  label="Username"
                  type="text"
                  value={forgotIdentifier}
                  onChange={e => setForgotIdentifier(e.target.value)}
                  placeholder="Masukkan username Anda"
                  className="h-11"
                  autoFocus
                  required
                />
                <Button type="submit" variant="primary" loading={forgotLoading} className="w-full h-11 glow-accent">
                  {forgotLoading ? 'Mengirim...' : 'Kirim Permintaan Reset'}
                </Button>
              </form>
            </>
          )}
        </Card>
      )}
    </AuthLayout>
  );
}
