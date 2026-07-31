import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { TutorialBanner } from '../components/TutorialBanner';
import { api, type RoleData } from '../lib/api';
import { useAuth } from '../stores/auth';
import { useHasPerm } from '../hooks/useHasPerm';
import { Users, Trash2, Shield, User, Plus, Edit3, X, Save, Phone } from 'lucide-react';

export function UserManagement() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const hasPerm = useHasPerm();
  const canManage = !currentUser?.is_super_admin && hasPerm('manage_users');
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [userModal, setUserModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null);
  const [roleModal, setRoleModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null);

  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: api.users,
  });

  const { data: permsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: api.permissions,
  });

  const userList = data?.users || [];
  const roleList = data?.roles || [];
  const permissions = permsData?.permissions || {};

  // User mutations
  const createUserMut = useMutation({
    mutationFn: api.createUser,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); setUserModal(null); },
    onError: (e: Error) => toast.error(e.message || 'Create failed'),
  });

  const updateUserMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.updateUser>[1] }) => api.updateUser(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); setUserModal(null); },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const deleteUserMut = useMutation({
    mutationFn: async (id: number) => {
      const u = userList.find(x => x.id === id);
      const ok = await confirm({ title: 'Delete User', message: `Delete user "${u?.full_name}"? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' });
      if (!ok) throw new Error('cancelled');
      return api.deleteUser(id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted'); },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error('Delete failed'); },
  });

  // Role mutations
  const createRoleMut = useMutation({
    mutationFn: api.createRole,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Role created'); setRoleModal(null); },
    onError: (e: Error) => toast.error(e.message || 'Create failed'),
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.updateRole>[1] }) => api.updateRole(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Role updated'); setRoleModal(null); },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const deleteRoleMut = useMutation({
    mutationFn: async (id: number) => {
      const r = roleList.find(x => x.id === id);
      const ok = await confirm({ title: 'Delete Role', message: `Delete role "${r?.name}"? Users with this role will lose access.`, confirmLabel: 'Delete', variant: 'danger' });
      if (!ok) throw new Error('cancelled');
      return api.deleteRole(id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Role deleted'); },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error('Delete failed'); },
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">User Management</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">Manage users and roles</p>
        </div>
        <div className="flex items-center gap-2">
          <TutorialBanner
            title="Panduan User Management"
            steps={[
              { title: 'Users Tab', content: <><p>Daftar user di sistem. Tambah/edit/hapus user. Setiap user punya: username, name, role, phone, dan status (active/disabled).</p><p className="text-xs text-tx3 mt-1">Role menentukan permission apa yang dimiliki user (view, configure, manage, dll).</p></> },
              { title: 'Roles Tab', content: <><p>Daftar role dengan permission. Tambah/edit/hapus role (kecuali system role). Setiap role punya set permission yang bisa di-toggle.</p><p className="text-xs text-tx3 mt-1">Permission contoh: <code>view_onus</code>, <code>configure_onu</code>, <code>settings_ip_olts</code>, <code>manage_users</code>.</p></> },
            ]}
            tips={
              <>
                <strong className="text-tx2">Tips:</strong>
                <ul className="mt-1 ml-4 space-y-0.5">
                  <li>System role (Admin, Operator, Viewer) tidak bisa dihapus</li>
                  <li>Technician role untuk field technician — hanya bisa view ONU</li>
                  <li>Disable user untuk sementara tanpa hapus (toggle status)</li>
                </ul>
              </>
            }
          />
          {tab === 'users' ? (
            canManage && <button onClick={() => setUserModal({ mode: 'add' })}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">
              <Plus size={16} /> Add User
            </button>
          ) : (
            canManage && <button onClick={() => setRoleModal({ mode: 'add' })}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">
              <Plus size={16} /> Add Role
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-glass border border-brd w-fit">
        <button onClick={() => setTab('users')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', tab === 'users' ? 'bg-accent text-white' : 'text-tx2 hover:bg-glass')}>
          <Users size={14} className="inline mr-2" /> Users
        </button>
        <button onClick={() => setTab('roles')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', tab === 'roles' ? 'bg-accent text-white' : 'text-tx2 hover:bg-glass')}>
          <Shield size={14} className="inline mr-2" /> Roles
        </button>
      </div>

      {tab === 'users' && (
        <div className="glass-card overflow-hidden">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-brd">
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Phone</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-tx3 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {userList.map(u => (
                <tr key={u.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center"><User size={14} className="text-accent" /></div>
                      <span className="font-medium">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-tx2">{u.username}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-accent/15 text-accent">{u.role}</span></td>
                  <td className="px-4 py-3">
                    {u.phone ? (
                      <span className="flex items-center gap-1.5 text-sm text-tx2"><Phone size={12} className="text-tx3" /> {u.phone}</span>
                    ) : <span className="text-sm text-tx3">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && <button onClick={() => setUserModal({ mode: 'edit', id: u.id })}
                        className="p-1.5 rounded-lg hover:bg-accent/15 text-tx3 hover:text-accent transition-colors" title="Edit">
                        <Edit3 size={14} />
                      </button>}
                      {canManage && u.id !== currentUser?.id && (
                        <button onClick={() => deleteUserMut.mutate(u.id)}
                          className="p-1.5 rounded-lg hover:bg-danger/15 text-tx3 hover:text-danger transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brd/50">
            {userList.map(u => (
              <div key={u.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0"><User size={15} className="text-accent" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{u.full_name}</div>
                    <div className="text-xs text-tx3 truncate">{u.username}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-accent/15 text-accent flex-shrink-0">{u.role}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canManage && <button onClick={() => setUserModal({ mode: 'edit', id: u.id })}
                      className="p-1.5 rounded-lg hover:bg-accent/15 text-tx3 hover:text-accent transition-colors">
                      <Edit3 size={14} />
                    </button>}
                    {canManage && u.id !== currentUser?.id && (
                      <button onClick={() => deleteUserMut.mutate(u.id)}
                        className="p-1.5 rounded-lg hover:bg-danger/15 text-tx3 hover:text-danger transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {u.phone && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-tx3"><Phone size={11} /> {u.phone}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className="grid gap-3 md:gap-4 md:grid-cols-2">
          {roleList.map(r => {
            const permList = r.permissions ? r.permissions.split(',').map(p => p.trim()).filter(Boolean) : [];
            return (
              <div key={r.id} className="glass-card p-4 md:p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm md:text-base">{r.name}</h3>
                    {r.is_system && <span className="px-2 py-0.5 rounded-full text-xs bg-info/15 text-info">System</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {canManage && <button onClick={() => setRoleModal({ mode: 'edit', id: r.id })}
                      className="p-1.5 rounded-lg hover:bg-accent/15 text-tx3 hover:text-accent transition-colors" title="Edit">
                      <Edit3 size={14} />
                    </button>}
                    {canManage && !r.is_system && (
                      <button onClick={() => deleteRoleMut.mutate(r.id)}
                        className="p-1.5 rounded-lg hover:bg-danger/15 text-tx3 hover:text-danger transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-tx3 text-xs md:text-sm mb-3">{r.description}</p>
                <div className="flex flex-wrap gap-1">
                  {permList.slice(0, 5).map(p => (
                    <span key={p} className="px-2 py-0.5 rounded text-xs bg-glass text-tx3">{permissions[p] || p}</span>
                  ))}
                  {permList.length > 5 && (
                    <span className="px-2 py-0.5 rounded text-xs bg-glass text-tx3">+{permList.length - 5} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {userModal && (
        <UserModal
          mode={userModal.mode}
          id={userModal.id}
          roles={roleList}
          onClose={() => setUserModal(null)}
          onSave={(data) => {
            if (userModal.mode === 'add') createUserMut.mutate(data);
            else if (userModal.id) updateUserMut.mutate({ id: userModal.id, data });
          }}
          loading={createUserMut.isPending || updateUserMut.isPending}
        />
      )}

      {roleModal && (
        <RoleModal
          mode={roleModal.mode}
          id={roleModal.id}
          roles={roleList}
          permissions={permissions}
          onClose={() => setRoleModal(null)}
          onSave={(data) => {
            if (roleModal.mode === 'add') createRoleMut.mutate(data);
            else if (roleModal.id) updateRoleMut.mutate({ id: roleModal.id, data });
          }}
          loading={createRoleMut.isPending || updateRoleMut.isPending}
        />
      )}
    </div>
  );
}


function UserModal({ mode, id, roles, onClose, onSave, loading }: {
  mode: 'add' | 'edit'; id?: number;
  roles: RoleData[];
  onClose: () => void;
  onSave: (data: { full_name: string; username: string; password: string; role_id: number | null; phone: string }) => void;
  loading: boolean;
}) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<number | null>(null);
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    api.getUser(id).then(res => {
      if (res.success && res.user) {
        setFullName(res.user.full_name || '');
        setUsername(res.user.username || '');
        setRoleId(res.user.role_id ?? null);
        setPhone(res.user.phone || '');
        setLoaded(true);
      }
    }).catch(() => setLoaded(true));
  }, [id, mode]);

  const handleSubmit = () => {
    if (!fullName || !username || (!password && mode === 'add')) {
      toast.error('Please fill all required fields');
      return;
    }
    onSave({ full_name: fullName, username, password, role_id: roleId, phone });
  };

  if (!loaded) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-overlay" />
      <div className="relative glass-card w-full max-w-md p-5 md:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <User size={18} className="text-accent" /> {mode === 'add' ? 'Add User' : 'Edit User'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-glass transition-colors"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-tx3 mb-1 block">Full Name *</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Enter full name"
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
          </div>
          <div>
            <label className="text-xs text-tx3 mb-1 block">Username *</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username"
              disabled={mode === 'edit'}
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none disabled:opacity-50" />
          </div>
          <div>
            <label className="text-xs text-tx3 mb-1 block">Password {mode === 'add' ? '*' : '(leave blank to keep)'}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'add' ? 'Enter password' : 'Leave blank to keep current'}
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
          </div>
          <div>
            <label className="text-xs text-tx3 mb-1 block">Role</label>
            <select value={roleId ?? ''} onChange={e => setRoleId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none">
              <option value="">— Select role —</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-tx3 mb-1 block">Phone Number <span className="text-tx3/60">(for WA alerts)</span></label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 628123456789"
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-glass border border-brd text-sm hover:bg-glass/80 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50">
            <Save size={14} /> {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}


function RoleModal({ mode, id, roles, permissions, onClose, onSave, loading }: {
  mode: 'add' | 'edit'; id?: number;
  roles: RoleData[];
  permissions: Record<string, string>;
  onClose: () => void;
  onSave: (data: { name: string; description: string; permissions: string[] }) => void;
  loading: boolean;
}) {
  const role = mode === 'edit' ? roles.find(r => r.id === id) : null;
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(
    role?.permissions ? role.permissions.split(',').map(p => p.trim()).filter(Boolean) : []
  );

  const togglePerm = (perm: string) => {
    setSelectedPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const handleSubmit = () => {
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    onSave({ name, description, permissions: selectedPerms });
  };

  const isSystem = role?.is_system ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-overlay" />
      <div className="relative glass-card w-full max-w-lg p-5 md:p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Shield size={18} className="text-accent" /> {mode === 'add' ? 'Add Role' : 'Edit Role'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-glass transition-colors"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-tx3 mb-1 block">Role Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter role name"
              disabled={isSystem}
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none disabled:opacity-50" />
          </div>
          <div>
            <label className="text-xs text-tx3 mb-1 block">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Enter description"
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
          </div>
          <div>
            <label className="text-xs text-tx3 mb-2 block">Permissions</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(permissions).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-glass border border-brd cursor-pointer hover:border-accent/30 transition-all">
                  <input type="checkbox" checked={selectedPerms.includes(key)} onChange={() => togglePerm(key)}
                    className="accent-accent" />
                  <span className="text-xs text-tx2">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-glass border border-brd text-sm hover:bg-glass/80 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50">
            <Save size={14} /> {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
