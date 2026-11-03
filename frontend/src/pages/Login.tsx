import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, ArrowLeft, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../stores/auth';
import { toast } from '../components/Toast';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Card, Input } from '../components/ui';
import { cn } from '../lib/utils';

export function Login() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const isMainDomain = window.location.hostname === 'nms.salfa.my.id' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    fetch('/api/public/branding').then(r => r.json()).then(d => {
      setBrandName(d.nms_name || 'FiberNMS');
      setLogoUrl(d.logo_url || null);
    }).catch(() => { setBrandName('FiberNMS'); });
  }, []);

  if (authLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(username, password);
    if (ok) {
      setLoading(false);
      setSuccess(true);
      toast.success(t('login.welcome'));
      const u = useAuth.getState().user;
      // Brief success beat before navigating — lets the button's checkmark
      // transition actually be seen instead of the page swapping instantly.
      await new Promise(r => setTimeout(r, 550));
      if (u?.is_super_admin) {
        navigate('/dashboard/admin');
      } else {
        navigate('/dashboard');
      }
    } else {
      const st = useAuth.getState();
      const msg = st.errorCode
        ? t(`error.${st.errorCode}`, { seconds: st.errorData?.retry_after as number | undefined })
        : (st.error || t('error.invalid_credentials'));
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <AuthLayout brandName={brandName} logoUrl={logoUrl}>
      {/* Login Card */}
      <Card bodyClassName="p-6 sm:p-8">
        <h2 className="text-xl font-semibold mb-1 font-display">{t('login.signIn')}</h2>
        <p className="text-xs text-tx3 mb-6">{t('login.subtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label={t('login.username')}
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={t('login.usernamePh')}
            className="h-11"
            autoFocus
            required
          />

          <Input
            label={t('login.password')}
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('login.passwordPh')}
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

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading || success}
            className={cn('w-full h-11 glow-accent transition-colors duration-300', success && 'cursor-default')}
            style={success ? { background: 'var(--color-success)' } : undefined}
          >
            {success ? (
              <span className="inline-flex items-center gap-1.5 animate-check-pop">
                <Check size={18} strokeWidth={3} />
                {t('login.success')}
              </span>
            ) : loading ? t('login.signingIn') : t('login.signIn')}
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
              {t('login.forgot')}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-tx3 mt-6">
          {t('login.secure')}
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
            <h2 className="text-xl font-semibold font-display">{t('login.resetTitle')}</h2>
          </div>

          {forgotSuccess ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className="text-sm text-tx2 mb-2">{t('login.resetSent')}</p>
              <p className="text-xs text-tx3">{t('login.resetSentHint')}</p>
              <Button
                type="button"
                variant="primary"
                className="mt-6"
                onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotIdentifier(''); }}
              >
                {t('login.backToLogin')}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-tx3 mb-5">
                {t('login.resetHint')}
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
                    toast.success(t('login.resetRequestSent'));
                  } else {
                    toast.error(d.message || t('error.generic'));
                  }
                } catch {
                  toast.error(t('login.networkError'));
                }
                setForgotLoading(false);
              }} className="space-y-5">
                <Input
                  label={t('login.username')}
                  type="text"
                  value={forgotIdentifier}
                  onChange={e => setForgotIdentifier(e.target.value)}
                  placeholder={t('login.usernamePh')}
                  className="h-11"
                  autoFocus
                  required
                />
                <Button type="submit" variant="primary" loading={forgotLoading} className="w-full h-11 glow-accent">
                  {forgotLoading ? t('login.sending') : t('login.sendReset')}
                </Button>
              </form>
            </>
          )}
        </Card>
      )}
    </AuthLayout>
  );
}
