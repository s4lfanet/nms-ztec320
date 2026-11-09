import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Eye, EyeOff, LogOut } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { api, ApiError } from '../lib/api';
import { toast } from './Toast';
import { Button, Input } from './ui';

/**
 * Popup wajib ganti password. Tampil di atas halaman apa pun selama akun
 * masih bertanda must_change_password (password bawaan instalasi) dan tidak
 * bisa ditutup — hanya bisa diselesaikan dengan mengganti password atau keluar.
 */
export function ForcePasswordChange() {
  const { t } = useTranslation();
  const { user, fetchUser, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user?.must_change_password) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError(t('profile.passwordMismatch')); return; }
    setBusy(true);
    try {
      const d = await api.updateProfile({ password, current_password: current });
      if (!d.success) throw new Error(t('error.generic'));
      toast.success(t('profile.updated'));
      setCurrent(''); setPassword(''); setConfirm('');
      await fetchUser();
    } catch (err) {
      const code = err instanceof ApiError ? err.errorCode : undefined;
      setError(code ? t(`error.${code}`, { defaultValue: (err as Error).message }) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (
    <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1} aria-label="toggle password visibility">
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
  const type = show ? 'text' : 'password';

  return createPortal(
    <>
      <div className="modal-overlay" style={{ zIndex: 60 }} />
      <div className="modal-wrapper" style={{ zIndex: 61 }} role="dialog" aria-modal="true" aria-labelledby="force-pw-title">
        <form onSubmit={submit} className="relative glass-card w-full max-w-md p-5 md:p-6 rounded-t-2xl md:rounded-2xl animate-fade-in">
          <div className="flex items-start gap-3 mb-4">
            <div className="icon-badge w-10 h-10" data-color="warning"><ShieldAlert size={20} /></div>
            <div>
              <h2 id="force-pw-title" className="section-title">{t('profile.mustChangeTitle')}</h2>
              <p className="text-sm text-tx3 mt-1">{t('profile.forceMsg')}</p>
            </div>
          </div>
          <div className="space-y-3">
            <Input label={t('profile.currentPassword')} type={type} value={current} autoComplete="current-password"
              onChange={e => setCurrent(e.target.value)} suffix={toggle} autoFocus required />
            <Input label={t('profile.newPassword')} type={type} value={password} autoComplete="new-password"
              onChange={e => setPassword(e.target.value)} helperText={t('profile.forceHint')} required />
            <Input label={t('profile.confirmPassword')} type={type} value={confirm} autoComplete="new-password"
              onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p role="alert" className="text-sm text-danger mt-3">{error}</p>}
          <div className="flex items-center justify-between gap-2 mt-5">
            <Button variant="ghost" icon={<LogOut size={14} />} onClick={() => logout()}>{t('topbar.logout')}</Button>
            <Button type="submit" loading={busy} disabled={!current || !password || !confirm}>{t('profile.saveChanges')}</Button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
