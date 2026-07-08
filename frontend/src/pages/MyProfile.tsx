import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../stores/auth';
import { toast } from '../components/Toast';
import { User, Lock, Save, Eye, EyeOff } from 'lucide-react';

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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">My Profile</h1>
        <p className="text-tx2 text-xs md:text-sm mt-1">Manage your account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="glass-card p-6 text-center">
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
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold flex items-center gap-2 mb-4"><User size={18} /> Account Information</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-tx3 block mb-1">Full Name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none transition-colors" />
              </div>
              {user?.is_super_admin && (
              <div>
                <label className="text-xs text-tx3 block mb-1">Sidebar / Brand Name</label>
                <input value={sidebarName} onChange={e => setSidebarName(e.target.value)}
                  className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none transition-colors"
                  placeholder="Salfanet NMS" />
                <p className="text-xs text-tx3 mt-1">Branding name shown in sidebar & topbar (set via SystemConfig)</p>
              </div>
              )}
              <div>
                <label className="text-xs text-tx3 block mb-1">Username</label>
                <input value={user?.username || ''} disabled
                  className="w-full h-10 px-4 rounded-lg bg-glass/50 border border-brd text-sm text-tx3 cursor-not-allowed" />
              </div>
              <div>
                <label className="text-xs text-tx3 block mb-1">Role</label>
                <input value={user?.role || ''} disabled
                  className="w-full h-10 px-4 rounded-lg bg-glass/50 border border-brd text-sm text-tx3 cursor-not-allowed" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold flex items-center gap-2 mb-4"><Lock size={18} /> Change Password</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-tx3 block mb-1">New Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full h-10 px-4 pr-10 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none transition-colors"
                    placeholder="Leave empty to keep current" />
                  <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-tx3 block mb-1">Confirm Password</label>
                <input type={showPass ? 'text' : 'password'} value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                  className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none transition-colors"
                  placeholder="Repeat new password" />
              </div>
              {password && password !== confirmPass && (
                <p className="text-xs text-danger">Passwords do not match</p>
              )}
            </div>
          </div>

          <button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending || (password !== '' && password !== confirmPass)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-all disabled:opacity-50"
          >
            <Save size={16} /> {updateMut.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
