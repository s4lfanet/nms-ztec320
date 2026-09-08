import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../stores/auth';
import { toast } from '../components/Toast';
import { User, Lock, Save, Eye, EyeOff } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Input } from '../components/ui';

export function MyProfile() {
  const { user, fetchUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [sidebarName, setSidebarName] = useState(user?.sidebar_name || 'Salfanet NMS');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);

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
        throw new Error('Passwords do not match');
      }
      const payload: Record<string, string> = { full_name: fullName };
      if (user?.is_super_admin) payload.sidebar_name = sidebarName;
      if (password) payload.password = password;
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Update failed');
    },
    onSuccess: async () => {
      toast.success('Profile updated');
      setPassword('');
      setConfirmPass('');
      await fetchUser();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const perms = meData?.user?.permissions || user?.permissions || [];

  return (
    <PageContainer className="animate-fade-in">
      <PageHeader title="My Profile" description="Manage your account settings" />

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
            <div className="text-xs text-tx3 mb-2">Permissions</div>
            <div className="flex flex-wrap gap-1 justify-center">
              {perms.length > 0 ? perms.map((p: string) => (
                <span key={p} className="px-2 py-0.5 rounded text-[10px] bg-glass text-tx2 border border-brd">{p}</span>
              )) : <span className="text-xs text-tx3">No permissions assigned</span>}
            </div>
          </div>
        </Card>

        {/* Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Account Information" icon={<User size={18} />}>
            <div className="space-y-4">
              <Input label="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} />
              {user?.is_super_admin && (
                <Input
                  label="Sidebar / Brand Name"
                  value={sidebarName}
                  onChange={e => setSidebarName(e.target.value)}
                  placeholder="Salfanet NMS"
                  helperText="Branding name shown in sidebar & topbar (set via SystemConfig)"
                />
              )}
              <Input label="Username" value={user?.username || ''} disabled />
              <Input label="Role" value={user?.role || ''} disabled />
            </div>
          </Card>

          <Card title="Change Password" icon={<Lock size={18} />}>
            <div className="space-y-4">
              <Input
                label="New Password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Leave empty to keep current"
                suffix={
                  <button type="button" onClick={() => setShowPass(!showPass)} className="hover:text-tx1 transition-colors">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
              <Input
                label="Confirm Password"
                type={showPass ? 'text' : 'password'}
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                placeholder="Repeat new password"
                error={password && password !== confirmPass ? 'Passwords do not match' : undefined}
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
            {updateMut.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
