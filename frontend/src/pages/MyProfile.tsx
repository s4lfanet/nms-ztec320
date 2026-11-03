import { useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../stores/auth';
import { useTheme, type Theme } from '../stores/theme';
import { api, type User as UserType } from '../lib/api';
import { toast } from '../components/Toast';
import { User, Lock, Save, Eye, EyeOff, Image, Upload, RotateCcw, ShieldAlert, Palette, Languages } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Input, Select } from '../components/ui';

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function MyProfile() {
  const { t, i18n } = useTranslation();
  const { user, fetchUser } = useAuth();
  const { theme, set: setTheme } = useTheme();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [sidebarName, setSidebarName] = useState(user?.sidebar_name || 'Salfanet NMS');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: meData } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      return r.json();
    },
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (password && password !== confirmPass) {
        throw new Error(t('profile.passwordMismatch'));
      }
      const payload: Record<string, string> = { full_name: fullName };
      if (user?.is_super_admin) payload.sidebar_name = sidebarName;
      if (password) payload.password = password;
      const d = await api.updateProfile(payload);
      if (!d.success) throw new Error(t('error.generic'));
    },
    onSuccess: async () => {
      toast.success(t('profile.updated'));
      setPassword('');
      setConfirmPass('');
      await fetchUser();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadLogoMut = useMutation({
    mutationFn: async (file: File) => {
      if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
        throw new Error('Format tidak didukung. Gunakan PNG, JPG, WEBP, atau GIF.');
      }
      if (file.size > MAX_LOGO_SIZE) {
        throw new Error('Ukuran file maksimal 2MB.');
      }
      const formData = new FormData();
      formData.append('logo', file);
      const r = await fetch('/api/profile/logo', { method: 'POST', credentials: 'include', body: formData });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Upload failed');
      return d;
    },
    onSuccess: async () => {
      toast.success(t('profile.logoUpdated'));
      await fetchUser();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetLogoMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/profile/logo', { method: 'DELETE', credentials: 'include' });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Reset failed');
    },
    onSuccess: async () => {
      toast.success(t('profile.logoReset'));
      await fetchUser();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Language change applies instantly via i18n, then persists to the profile.
  const changeLanguage = (lng: 'id' | 'en') => {
    i18n.changeLanguage(lng);
    if (useAuth.getState().user) {
      api.updateProfile({ language: lng }).then(() => {
        useAuth.setState({ user: { ...useAuth.getState().user, language: lng } as UserType });
      }).catch(() => {});
    }
  };

  const perms = meData?.user?.permissions || user?.permissions || [];

  return (
    <PageContainer className="animate-fade-in">
      <PageHeader title={t('profile.title')} description={t('profile.subtitle')} />

      {user?.must_change_password && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-warning/30 bg-warning/10 mb-6">
          <ShieldAlert size={18} className="text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-tx1">{t('profile.mustChangeTitle')}</p>
            <p className="text-tx3 mt-0.5">
              {t('profile.mustChangeMsg')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card bodyClassName="p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
            <User size={36} className="text-accent" />
          </div>
          <h3 className="text-lg font-bold">{user?.full_name || 'Admin'}</h3>
          <p className="text-tx3 text-sm mt-1">@{user?.username}</p>
          <div className="mt-3">
            <span className="px-3 py-1 rounded-full bg-accent/15 text-accent text-xs font-medium">
              {user?.role || 'User'}
            </span>
          </div>
          <div className="mt-4 pt-4 border-t border-brd">
            <div className="text-xs text-tx3 mb-2">{t('profile.permissions')}</div>
            <div className="flex flex-wrap gap-1 justify-center">
              {perms.length > 0 ? perms.map((p: string) => (
                <span key={p} className="px-2 py-0.5 rounded text-[10px] bg-glass text-tx2 border border-brd">{p}</span>
              )) : <span className="text-xs text-tx3">{t('profile.noPermissions')}</span>}
            </div>
          </div>
        </Card>

        {/* Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card title={t('profile.prefs')} icon={<Palette size={18} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label={t('profile.theme')}
                value={theme}
                onChange={e => setTheme(e.target.value as Theme)}
                options={[
                  { value: 'dark', label: t('profile.themeDark') },
                  { value: 'light', label: t('profile.themeLight') },
                  { value: 'system', label: t('profile.themeSystem') },
                ]}
              />
              <Select
                label={<><Languages size={12} className="inline mr-1.5" />{t('profile.language')}</>}
                value={i18n.language}
                onChange={e => changeLanguage(e.target.value as 'id' | 'en')}
                options={[
                  { value: 'id', label: t('profile.langId') },
                  { value: 'en', label: t('profile.langEn') },
                ]}
              />
            </div>
          </Card>

          <Card title={t('profile.accountInfo')} icon={<User size={18} />}>
            <div className="space-y-4">
              <Input label={t('profile.fullName')} value={fullName} onChange={e => setFullName(e.target.value)} />
              {user?.is_super_admin && (
                <Input
                  label={t('profile.brandName')}
                  value={sidebarName}
                  onChange={e => setSidebarName(e.target.value)}
                  placeholder="Salfanet NMS"
                  helperText={t('profile.brandNameHint')}
                />
              )}
              <Input label={t('login.username')} value={user?.username || ''} disabled />
              <Input label={t('profile.role')} value={user?.role || ''} disabled />
            </div>
          </Card>

          {user?.is_super_admin && (
            <Card title={t('profile.companyLogo')} icon={<Image size={18} />}>
              <div className="flex items-center gap-5">
                <div className={`w-20 h-20 rounded-xl border border-brd flex items-center justify-center flex-shrink-0 overflow-hidden ${user?.logo_url ? 'bg-white p-2' : 'bg-glass'}`}>
                  {user?.logo_url ? (
                    <img src={user.logo_url} alt="Company logo" className="w-full h-full object-contain" />
                  ) : (
                    <Image size={28} className="text-tx3" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-tx2 mb-1">
                    {user?.logo_url ? t('profile.logoCustom') : t('profile.logoNone')}
                  </p>
                  <p className="text-xs text-tx3 mb-3">{t('profile.logoHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) uploadLogoMut.mutate(file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      variant="secondary"
                      className="text-xs px-3 py-1.5"
                      icon={<Upload size={14} />}
                      onClick={() => logoInputRef.current?.click()}
                      loading={uploadLogoMut.isPending}
                    >
                      {uploadLogoMut.isPending ? t('profile.uploading') : t('profile.uploadLogo')}
                    </Button>
                    {user?.logo_url && (
                      <Button
                        variant="ghost"
                        className="text-xs px-3 py-1.5"
                        icon={<RotateCcw size={14} />}
                        onClick={() => resetLogoMut.mutate()}
                        loading={resetLogoMut.isPending}
                      >
                        {t('profile.resetDefault')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card title={t('profile.changePassword')} icon={<Lock size={18} />}>
            <div className="space-y-4">
              <Input
                label={t('profile.newPassword')}
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('profile.newPasswordPh')}
                suffix={
                  <button type="button" onClick={() => setShowPass(!showPass)} className="hover:text-tx1 transition-colors">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
              <Input
                label={t('profile.confirmPassword')}
                type={showPass ? 'text' : 'password'}
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                placeholder={t('profile.confirmPasswordPh')}
                error={password && password !== confirmPass ? t('profile.passwordMismatch') : undefined}
              />
            </div>
          </Card>

          <Button
            variant="primary"
            icon={<Save size={16} />}
            onClick={() => updateMut.mutate()}
            loading={updateMut.isPending}
            disabled={password !== '' && password !== confirmPass}
          >
            {updateMut.isPending ? t('common.saving') : t('profile.saveChanges')}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
