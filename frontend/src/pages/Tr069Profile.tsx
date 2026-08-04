import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Server, Lock, Unlock } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { TutorialBanner } from '../components/TutorialBanner';
import { useHasPerm } from '../hooks/useHasPerm';

interface Tr069Profile {
  id: number;
  name: string;
  acs_url: string;
  acs_username: string;
  acs_password: string;
  default_olt_id: number | null;
  vlan: number;
  vlan_mode: string; // 'tag' or 'untag'
  default_olt_name?: string | null;
}

export default function Tr069Profile() {
  const qc = useQueryClient();
  const hasPerm = useHasPerm();
  const canManage = hasPerm('manage_tr069');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; profile?: Tr069Profile } | null>(null);
  const [showPass, setShowPass] = useState<Record<number, boolean>>({});

  const { data: profiles = [], isLoading } = useQuery<Tr069Profile[]>({
    queryKey: ['tr069-profiles'],
    queryFn: () => fetch('/api/tr069', { credentials: 'include' }).then(r => r.json()),
  });

  const { data: dashData } = useQuery({
    queryKey: ['olts'],
    queryFn: api.dashboard,
  });
  const olts = dashData?.olts || [];

  // Fetch VLAN list from first OLT (or all OLTs)
  const [vlanList, setVlanList] = useState<Array<{ vlan_id: number; name: string }>>([]);
  useEffect(() => {
    if (olts.length > 0) {
      fetch(`/api/olt/${olts[0].id}/vlans`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.vlans) setVlanList(d.vlans); })
        .catch(() => {});
    }
  }, [olts]);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tr069/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tr069-profiles'] }); toast.success('Profile deleted'); },
    onError: () => toast.error('Delete failed'),
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">TR069 Profile</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">Manage ACS profiles for TR069 remote management</p>
        </div>
        <div className="flex items-center gap-2">
          <TutorialBanner
            guideId="tr069"
            title="Panduan TR069 Profile"
            steps={[
              { title: 'Create Profile', content: <><p>Buat TR069 profile untuk ACS (Auto Configuration Server) seperti GenieACS. Setiap profile berisi: ACS URL, username, password, VLAN, dan VLAN mode.</p><p className="text-xs text-tx3 mt-1">Profile bisa di-assign ke default OLT tertentu untuk auto-fill saat provisioning.</p></> },
              { title: 'Use in Provisioning', content: <><p>Saat register/provision ONU, pilih TR069 profile dari dropdown — ACS URL, username, password, dan VLAN akan auto-fill.</p><p className="text-xs text-tx3 mt-1">Tanpa profile, TR069 config harus diinput manual setiap kali provisioning.</p></> },
            ]}
            tips={
              <>
                <strong className="text-tx2">Tips:</strong>
                <ul className="mt-1 ml-4 space-y-0.5">
                  <li>Buat satu profile per ACS server (contoh: GenieACS-Production, GenieACS-Test)</li>
                  <li>Password terenkripsi di database — tidak ditampilkan plain text</li>
                </ul>
              </>
            }
          />
          {canManage && <button onClick={() => setModal({ mode: 'add' })} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} />
            Create
          </button>}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-brd bg-glass/30 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-tx3 text-sm">Loading...</div>
        ) : profiles.length === 0 ? (
          <div className="p-8 text-center text-tx3 text-sm">No TR069 profiles yet. Click "Create" to add one.</div>
        ) : (
          <>
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-brd text-tx3 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Profile Name</th>
                <th className="px-4 py-3 text-left">ACS URL</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Password</th>
                <th className="px-4 py-3 text-left">Default OLT</th>
                <th className="px-4 py-3 text-left">VLAN</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => (
                <tr key={p.id} className="border-b border-brd/50 hover:bg-glass/30 transition-colors">
                  <td className="px-4 py-3 text-tx3">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-tx2 font-mono text-xs">{p.acs_url}</td>
                  <td className="px-4 py-3 text-tx2">{p.acs_username}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{showPass[p.id] ? p.acs_password : '••••••••'}</span>
                      <button onClick={() => setShowPass(s => ({ ...s, [p.id]: !s[p.id] }))} className="text-tx3 hover:text-tx1">
                        {showPass[p.id] ? <Unlock size={14} /> : <Lock size={14} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {p.default_olt_name ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-glass border border-brd text-xs">
                        <Server size={12} />
                        {p.default_olt_name}
                      </span>
                    ) : <span className="text-tx3">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{p.vlan_mode === 'tag' ? p.vlan : 'untag'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${p.vlan_mode === 'tag' ? 'border-accent/30 text-accent bg-accent/5' : 'border-brd text-tx3'}`}>{p.vlan_mode === 'tag' ? 'Tag' : 'Untag'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canManage && <button onClick={() => setModal({ mode: 'edit', profile: p })} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-tx1" title="Edit">
                        <Pencil size={16} />
                      </button>}
                      {canManage && <button
                        onClick={() => { if (confirm(`Delete profile "${p.name}"?`)) deleteMut.mutate(p.id); }}
                        className="p-1.5 rounded-lg hover:bg-danger/10 text-tx3 hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brd/50">
            {profiles.map((p, i) => (
              <div key={p.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-tx3">#{i + 1}</span>
                      <span className="font-medium text-sm truncate">{p.name}</span>
                    </div>
                    <div className="text-xs text-tx3 font-mono mt-0.5 truncate">{p.acs_url}</div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border flex-shrink-0 ${p.vlan_mode === 'tag' ? 'border-accent/30 text-accent bg-accent/5' : 'border-brd text-tx3'}`}>{p.vlan_mode === 'tag' ? 'Tag' : 'Untag'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-tx3">User:</span> <span className="text-tx2">{p.acs_username}</span>
                  </div>
                  <div>
                    <span className="text-tx3">Pass:</span>{' '}
                    <span className="font-mono text-tx2">{showPass[p.id] ? p.acs_password : '••••••••'}</span>
                    <button onClick={() => setShowPass(s => ({ ...s, [p.id]: !s[p.id] }))} className="text-tx3 hover:text-tx1 ml-1 inline">
                      {showPass[p.id] ? <Unlock size={11} className="inline" /> : <Lock size={11} className="inline" />}
                    </button>
                  </div>
                  <div>
                    <span className="text-tx3">VLAN:</span> <span className="font-mono text-tx2">{p.vlan_mode === 'tag' ? p.vlan : 'untag'}</span>
                  </div>
                  <div>
                    <span className="text-tx3">OLT:</span>{' '}
                    {p.default_olt_name ? (
                      <span className="inline-flex items-center gap-1 text-tx2"><Server size={10} className="inline" /> {p.default_olt_name}</span>
                    ) : <span className="text-tx3">—</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-brd/30">
                  {canManage && <button onClick={() => setModal({ mode: 'edit', profile: p })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors">
                    <Pencil size={13} /> Edit
                  </button>}
                  {canManage && <button onClick={() => { if (confirm(`Delete profile "${p.name}"?`)) deleteMut.mutate(p.id); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-danger transition-colors ml-auto">
                    <Trash2 size={13} />
                  </button>}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <Tr069Modal
          mode={modal.mode}
          profile={modal.profile}
          olts={olts.map((o: any) => ({ id: o.id, name: o.name }))}
          vlanList={vlanList}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); qc.invalidateQueries({ queryKey: ['tr069-profiles'] }); toast.success(modal.mode === 'add' ? 'Profile created!' : 'Profile updated!'); }}
        />
      )}
    </div>
  );
}

function Tr069Modal({ mode, profile, olts, vlanList, onClose, onSuccess }: {
  mode: 'add' | 'edit';
  profile?: Tr069Profile;
  olts: { id: number; name: string }[];
  vlanList: Array<{ vlan_id: number; name: string }>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: profile?.name || '',
    acs_url: profile?.acs_url || '',
    acs_username: profile?.acs_username || '',
    acs_password: profile?.acs_password || '',
    vlan: profile?.vlan || 0,
    vlan_mode: profile?.vlan_mode || 'tag',
    default_olt_id: profile?.default_olt_id || null,
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name || !form.acs_url) return;
    setSubmitting(true);
    try {
      const url = mode === 'add' ? '/api/tr069' : `/api/tr069/${profile!.id}`;
      const method = mode === 'add' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed');
      onSuccess();
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" />
      <div className="relative w-full max-w-md rounded-t-2xl md:rounded-2xl border border-brd bg-surface shadow-xl max-h-[90vh] overflow-y-auto animate-slide-up md:animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-brd sticky top-0 bg-surface z-10">
          <h3 className="font-semibold">{mode === 'add' ? 'Add TR069 Profile' : 'Edit TR069 Profile'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-glass text-tx3"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="label-sm mb-1">Profile Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g. ACS-SVR-MAIN" />
          </div>
          <div>
            <label className="label-sm mb-1">ACS URL</label>
            <input value={form.acs_url} onChange={e => setForm({ ...form, acs_url: e.target.value })} className="input-field" placeholder="e.g. http://10.10.10.100:7547" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label-sm mb-1">Username</label>
              <input value={form.acs_username} onChange={e => setForm({ ...form, acs_username: e.target.value })} className="input-field" placeholder="e.g. acs_admin" />
            </div>
            <div>
              <label className="label-sm mb-1">Password</label>
              <input value={form.acs_password} onChange={e => setForm({ ...form, acs_password: e.target.value })} className="input-field" placeholder="e.g. Admin@123" />
            </div>
          </div>
          <div>
            <label className="label-sm mb-1">VLAN</label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" checked={form.vlan_mode === 'tag'} onChange={() => setForm({ ...form, vlan_mode: 'tag' })} />
                  Tag
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="radio" checked={form.vlan_mode === 'untag'} onChange={() => setForm({ ...form, vlan_mode: 'untag' })} />
                  Untag
                </label>
              </div>
              {form.vlan_mode === 'tag' && (
                vlanList.length > 0 ? (
                  <select value={form.vlan} onChange={e => setForm({ ...form, vlan: parseInt(e.target.value) || 0 })} className="input-field flex-1">
                    <option value={0}>Select VLAN...</option>
                    {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                  </select>
                ) : (
                  <input type="number" value={form.vlan} onChange={e => setForm({ ...form, vlan: parseInt(e.target.value) || 0 })} className="input-field flex-1" placeholder="1010" />
                )
              )}
            </div>
            {form.vlan_mode === 'untag' && <p className="text-xs text-tx3 mt-1">Untag mode: no VLAN tag applied to TR069 traffic.</p>}
          </div>
          <div>
            <label className="label-sm mb-1">Default OLT (optional)</label>
            <select value={form.default_olt_id || ''} onChange={e => setForm({ ...form, default_olt_id: e.target.value ? parseInt(e.target.value) : null })} className="input-field">
              <option value="">— None —</option>
              {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <p className="text-xs text-tx3 mt-1">If selected, this profile will be automatically applied when registering an ONT on that OLT.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-brd sticky bottom-0 bg-surface">
          <button onClick={onClose} className="btn-ghost">Close</button>
          <button onClick={submit} disabled={submitting || !form.name || !form.acs_url} className="btn-primary">
            {submitting ? 'Saving...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
