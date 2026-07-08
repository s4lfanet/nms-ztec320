import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SubscriptionPackage, type Tenant, type Subscription, type TransactionRecord, type InvoiceRecord } from '../lib/api';
import { Building2, Package, CreditCard, Plus, Trash2, CheckCircle, XCircle, Clock, X, Edit3, Settings, Receipt, FileText, Info, Shield } from 'lucide-react';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { cn } from '../lib/utils';

type Tab = 'packages' | 'tenants' | 'subscriptions' | 'transactions' | 'invoices' | 'settings';

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('packages');
  const qc = useQueryClient();

  const { data: packages } = useQuery({ queryKey: ['admin-packages'], queryFn: api.adminPackages });
  const { data: tenants } = useQuery({ queryKey: ['admin-tenants'], queryFn: api.adminTenants });
  const { data: subscriptions } = useQuery({ queryKey: ['admin-subscriptions'], queryFn: api.adminSubscriptions });
  const { data: transactions } = useQuery({ queryKey: ['admin-transactions'], queryFn: api.adminTransactions });
  const { data: invoices } = useQuery({ queryKey: ['admin-invoices'], queryFn: api.adminInvoices });

  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: 'packages', label: 'Packages', icon: Package },
    { key: 'tenants', label: 'Tenants', icon: Building2 },
    { key: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { key: 'transactions', label: 'Transactions', icon: Receipt },
    { key: 'invoices', label: 'Invoices', icon: FileText },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const tabDescriptions: Record<Tab, string> = {
    packages: 'Kelola paket subscription yang tersedia untuk tenant. Atur harga, jumlah OLT, durasi, dan fitur.',
    tenants: 'Manajemen semua tenant dalam sistem. Tambah, edit, suspend, atau hapus tenant beserta admin user-nya.',
    subscriptions: 'Kelola subscription aktif untuk setiap tenant. Assign paket, extend durasi, atau suspend subscription.',
    transactions: 'Riwayat semua transaksi pembayaran via Duitku. Pantau status pembayaran registrasi dan renewal.',
    invoices: 'Daftar semua invoice yang dihasilkan sistem. Invoice otomatis dibuat saat notifikasi expiry terkirim.',
    settings: 'Konfigurasi sistem NMS — branding, payment gateway, dan pengaturan global.',
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Shield size={22} className="text-accent" />
          Admin Panel — SaaS Management
        </h1>
        <p className="text-tx2 text-xs md:text-sm mt-1">{tabDescriptions[tab]}</p>
      </div>

      <div className="tab-scroll flex gap-2 flex-wrap pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0',
              tab === t.key ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:text-tx1 border border-brd')}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'packages' && <PackagesTab packages={packages || []} qc={qc} />}
      {tab === 'tenants' && <TenantsTab tenants={tenants || []} packages={packages || []} qc={qc} />}
      {tab === 'subscriptions' && <SubscriptionsTab subscriptions={subscriptions || []} tenants={tenants || []} packages={packages || []} qc={qc} />}
      {tab === 'transactions' && <TransactionsTab transactions={transactions || []} />}
      {tab === 'invoices' && <InvoicesTab invoices={invoices || []} />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function SettingsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['system-config'], queryFn: api.getSystemConfig });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) setForm(data.config);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateSystemConfig(data),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  if (isLoading) return <div className="text-tx3 text-sm">Loading...</div>;

  const fields = [
    { key: 'nms_name', label: 'Nama NMS', placeholder: 'Salfanet NMS', section: 'Branding', helper: 'Nama brand yang ditampilkan di halaman login, landing page, dan dashboard.' },
    { key: 'base_url', label: 'Base URL Host', placeholder: 'https://salfanet.id', section: 'Branding', helper: 'URL utama untuk callback dan link registrasi.' },
    { key: 'admin_service_phone', label: 'Nomor Layanan Admin (WA/Telepon)', placeholder: '6285121111220', section: 'Branding', helper: 'Nomor WhatsApp/telepon untuk kontak layanan. Format: kode negara tanpa + (contoh: 62xxx).' },
    { key: 'duitku_merchant_code', label: 'Duitku Merchant Code', placeholder: 'DXXXX', section: 'Payment Gateway (Duitku)', helper: 'Kode merchant dari dashboard Duitku. Format: DXXXX.' },
    { key: 'duitku_api_key', label: 'Duitku API Key', placeholder: 'xxxx-xxxx-xxxx', section: 'Payment Gateway (Duitku)', helper: 'API key dari dashboard Duitku. Jangan dibagikan kepada pihak yang tidak berwenang.' },
    { key: 'duitku_callback_url', label: 'Duitku Callback URL', placeholder: 'https://salfanet.id/api/payment/duitku-callback', section: 'Payment Gateway (Duitku)', helper: 'URL endpoint untuk menerima callback status pembayaran dari Duitku.' },
    { key: 'cf_api_token', label: 'Cloudflare API Token', placeholder: 'xxxx-xxxx-xxxx', section: 'Cloudflare Tunnel', helper: 'API Token dari Cloudflare dashboard (My Profile > API Tokens). Permission: Account > Cloudflare Tunnel > Edit, Zone > DNS > Edit.' },
    { key: 'cf_account_id', label: 'Cloudflare Account ID', placeholder: 'd83c0816c55667c5a67c303505f5a67b', section: 'Cloudflare Tunnel', helper: 'Account ID dari Cloudflare dashboard (halaman utama, sidebar kanan).' },
    { key: 'cf_tunnel_id', label: 'Tunnel ID', placeholder: '89bcacf1-ef63-4664-aa7c-d166cdd2055e', section: 'Cloudflare Tunnel', helper: 'ID tunnel dari Cloudflare Zero Trust > Networks > Tunnels.' },
    { key: 'cf_tunnel_name', label: 'Tunnel Name (opsional)', placeholder: 'fibernms-tunnel', section: 'Cloudflare Tunnel', helper: 'Nama tunnel untuk referensi. Opsional.' },
    { key: 'cf_zone_name', label: 'Zone/Domain Name', placeholder: 'salfa.my.id', section: 'Cloudflare Tunnel', helper: 'Nama domain/zone yang aktif di Cloudflare. Subdomain tenant akan dibuat di bawah domain ini.' },
  ];

  const sections = [...new Set(fields.map(f => f.section))];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">System Settings</h2>
        {saved && <span className="text-sm text-success flex items-center gap-1"><CheckCircle size={16} /> Saved</span>}
      </div>

      {sections.map(section => (
        <div key={section} className="glass-card p-4 md:p-6">
          <h3 className="text-sm font-semibold text-tx2 mb-4">{section}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.filter(f => f.section === section).map(f => (
              <div key={f.key}>
                <label className="text-xs text-tx2 mb-1 block font-medium">{f.label}</label>
                <input
                  value={form[f.key] || ''}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
                />
                <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> {f.helper}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="glass-card p-4 md:p-6">
        <h3 className="text-sm font-semibold text-tx2 mb-2">Payment Gateway Environment</h3>
        <p className="text-[11px] text-tx3 mb-4 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Sandbox untuk testing, Production untuk menerima pembayaran real. Pastikan konfigurasi merchant sudah benar sebelum beralih ke Production.</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="env" checked={(form['duitku_environment'] || 'sandbox') === 'sandbox'} onChange={() => setForm({ ...form, duitku_environment: 'sandbox' })} className="accent-[var(--accent)]" />
            <span className="text-sm text-tx1">Sandbox (Testing)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="env" checked={form['duitku_environment'] === 'production'} onChange={() => setForm({ ...form, duitku_environment: 'production' })} className="accent-[var(--accent)]" />
            <span className="text-sm text-tx1">Production (Live)</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => saveMut.mutate(form)}
          disabled={saveMut.isPending}
          className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50"
        >
          {saveMut.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
      {saveMut.isError && <p className="text-sm text-danger text-right">Failed to save: {(saveMut.error as Error)?.message}</p>}
    </div>
  );
}

function PackagesTab({ packages, qc }: { packages: SubscriptionPackage[]; qc: ReturnType<typeof useQueryClient> }) {
  const [showForm, setShowForm] = useState(false);
  const [editPkg, setEditPkg] = useState<SubscriptionPackage | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: 150000, max_olts: 1, duration_days: 30, features: '', is_active: true });

  const createMut = useMutation({
    mutationFn: () => api.adminCreatePackage(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-packages'] }); setShowForm(false); setForm({ name: '', description: '', price: 150000, max_olts: 1, duration_days: 30, features: '', is_active: true }); toast.success('Package created'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: () => api.adminUpdatePackage(editPkg!.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-packages'] }); setEditPkg(null); setForm({ name: '', description: '', price: 150000, max_olts: 1, duration_days: 30, features: '', is_active: true }); toast.success('Package updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.adminDeletePackage(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-packages'] }); toast.success('Package deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (p: SubscriptionPackage) => {
    setEditPkg(p);
    setForm({ name: p.name, description: p.description, price: p.price, max_olts: p.max_olts, duration_days: p.duration_days, features: p.features || '', is_active: p.is_active });
  };

  const isEditing = !!editPkg;
  const showEditForm = showForm || isEditing;

  const canSubmit = form.name.trim() !== '' && form.price >= 0 && form.max_olts >= 1 && form.duration_days >= 1;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold">Subscription Packages</h2>
          <p className="text-xs text-tx3 mt-0.5">{packages.length} paket tersedia · {packages.filter(p => p.is_active).length} aktif</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditPkg(null); setForm({ name: '', description: '', price: 150000, max_olts: 1, duration_days: 30, features: '', is_active: true }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">
          <Plus size={16} /> New Package
        </button>
      </div>

      {showEditForm && (
        <div className="glass-card p-4 md:p-5 mb-4">
          <h3 className="text-sm font-semibold mb-1">{isEditing ? `Edit: ${editPkg?.name}` : 'Create New Package'}</h3>
          <p className="text-[11px] text-tx3 mb-4">Isi informasi paket subscription. Field dengan <span className="text-danger">*</span> wajib diisi.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Package Name <span className="text-danger">*</span></label>
              <input placeholder="contoh: Starter, Business, Enterprise" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Description</label>
              <input placeholder="Deskripsi singkat paket" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Price (IDR) <span className="text-danger">*</span></label>
              <input type="number" min={0} step={10000} placeholder="150000" value={form.price} onChange={e => setForm({ ...form, price: +e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Harga dalam Rupiah per periode subscription.</p>
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Max OLTs <span className="text-danger">*</span></label>
              <input type="number" min={1} placeholder="1" value={form.max_olts} onChange={e => setForm({ ...form, max_olts: +e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Jumlah maksimal OLT yang bisa dikelola tenant dengan paket ini.</p>
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Duration (days) <span className="text-danger">*</span></label>
              <input type="number" min={1} placeholder="30" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: +e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Durasi subscription dalam hari. 30 = 1 bulan, 365 = 1 tahun.</p>
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Features</label>
              <input placeholder="contoh: onu_management,vlan_config,alerts" value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Fitur paket, dipisahkan koma. Kosongkan jika semua fitur aktif.</p>
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2.5">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="accent-[var(--accent)] w-4 h-4" />
                <span className="text-sm text-tx1">Active — Paket tersedia untuk registrasi tenant baru</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => isEditing ? updateMut.mutate() : createMut.mutate()} disabled={!canSubmit} className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {isEditing ? 'Save Changes' : 'Create Package'}
            </button>
            <button onClick={() => { setShowForm(false); setEditPkg(null); }} className="px-4 py-2 rounded-xl bg-glass border border-brd text-sm hover:bg-glass-hover transition-all">Cancel</button>
          </div>
          {!canSubmit && <p className="text-[11px] text-tx3 mt-2">Nama, harga ≥ 0, max OLT ≥ 1, dan durasi ≥ 1 hari wajib diisi.</p>}
        </div>
      )}

      {packages.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm text-tx3">Belum ada paket subscription.</p>
          <p className="text-xs text-tx3 mt-1">Klik "New Package" untuk membuat paket pertama.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {packages.map(p => (
            <div key={p.id} className="glass-card p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-lg truncate">{p.name}</h3>
                  <p className="text-xs text-tx3 line-clamp-2">{p.description || 'No description'}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg hover:bg-accent/15 text-accent transition-colors" title="Edit package">
                    <Edit3 size={16} />
                  </button>
                  <button onClick={() => deleteMut.mutate(p.id)} className="p-1.5 rounded-lg hover:bg-danger/15 text-danger transition-colors" title="Delete package">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm border-t border-brd/50 pt-3 mt-2">
                <div className="flex justify-between"><span className="text-tx3 text-xs">Price</span><span className="font-medium">Rp {p.price.toLocaleString('id-ID')}</span></div>
                <div className="flex justify-between"><span className="text-tx3 text-xs">Max OLTs</span><span className="font-medium">{p.max_olts} unit</span></div>
                <div className="flex justify-between"><span className="text-tx3 text-xs">Duration</span><span className="font-medium">{p.duration_days} hari</span></div>
                {p.features && <div className="flex justify-between gap-2"><span className="text-tx3 text-xs flex-shrink-0">Features</span><span className="font-medium text-xs text-right truncate" title={p.features}>{p.features}</span></div>}
                <div className="flex justify-between items-center"><span className="text-tx3 text-xs">Status</span>
                  {p.is_active ? <span className="flex items-center gap-1 text-xs text-success"><CheckCircle size={14} /> Active</span> : <span className="flex items-center gap-1 text-xs text-danger"><XCircle size={14} /> Inactive</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TenantsTab({ tenants, packages, qc }: { tenants: Tenant[]; packages: SubscriptionPackage[]; qc: ReturnType<typeof useQueryClient> }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', subdomain: '', contact_name: '', contact_email: '', contact_phone: '', admin_name: '', admin_username: '', admin_password: 'changeme123' });
  const [assignSub, setAssignSub] = useState<{ tenantId: number; packageId: number } | null>(null);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState({ name: '', subdomain: '', contact_name: '', contact_email: '', contact_phone: '' });
  const [baseDomain, setBaseDomain] = useState('salfa.my.id');

  useEffect(() => {
    fetch('/api/public/branding').then(r => r.json()).then(d => {
      if (d.base_domain) setBaseDomain(d.base_domain);
    }).catch(() => {});
  }, []);

  const createMut = useMutation({
    mutationFn: () => api.adminCreateTenant(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); setShowForm(false); setForm({ name: '', subdomain: '', contact_name: '', contact_email: '', contact_phone: '', admin_name: '', admin_username: '', admin_password: 'changeme123' }); toast.success('Tenant created successfully'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create tenant'),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.adminUpdateTenant(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); toast.success('Tenant status updated'); },
    onError: () => toast.error('Failed to update status'),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const t = tenants.find(t => t.id === id);
      const ok = await confirm({ title: 'Delete Tenant', message: `Delete "${t?.name || id}"? This will permanently delete all OLTs, ONUs, users, subscriptions, and FTTH data for this tenant. This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' });
      if (!ok) throw new Error('cancelled');
      return api.adminDeleteTenant(id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); toast.success('Tenant deleted'); setTimeout(() => window.location.reload(), 1500); },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error('Delete failed'); },
  });
  const assignMut = useMutation({
    mutationFn: ({ tenantId, packageId }: { tenantId: number; packageId: number }) => api.adminCreateSubscription({ tenant_id: tenantId, package_id: packageId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); qc.invalidateQueries({ queryKey: ['admin-subscriptions'] }); setAssignSub(null); toast.success('Package assigned & activated'); },
    onError: () => toast.error('Failed to assign package'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof editForm }) => api.adminUpdateTenant(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); setEditTenant(null); toast.success('Tenant updated successfully'); },
    onError: () => toast.error('Failed to update tenant'),
  });

  const canCreateTenant = form.name.trim() !== '' && form.subdomain.trim() !== '' && form.admin_username.trim() !== '' && form.admin_password.length >= 6;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold">Tenants</h2>
          <p className="text-xs text-tx3 mt-0.5">{tenants.length} tenant terdaftar · {tenants.filter(t => t.status === 'active').length} aktif</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">
          <Plus size={16} /> New Tenant
        </button>
      </div>

      {showForm && (
        <div className="glass-card p-4 md:p-5 mb-4">
          <h3 className="text-sm font-semibold mb-1">Create New Tenant</h3>
          <p className="text-[11px] text-tx3 mb-4">Buat tenant baru beserta akun admin. Field dengan <span className="text-danger">*</span> wajib diisi.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Tenant Name <span className="text-danger">*</span></label>
              <input placeholder="contoh: PT Salfanet" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Subdomain <span className="text-danger">*</span></label>
              <input placeholder="contoh: company1" value={form.subdomain} onChange={e => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Hanya huruf kecil, angka, dan tanda hubung. Akses: <strong>{form.subdomain || 'subdomain'}.{baseDomain}</strong></p>
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Contact Name</label>
              <input placeholder="Nama kontak tenant" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Contact Email</label>
              <input type="email" placeholder="email@company.com" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Contact Phone</label>
              <input type="tel" placeholder="628xxxxxxxxxx" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div className="md:col-span-2 border-t border-brd/50 pt-3 mt-1">
              <p className="text-xs font-semibold text-tx2 mb-3">Admin Account</p>
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Admin Full Name</label>
              <input placeholder="contoh: John Doe" value={form.admin_name} onChange={e => setForm({ ...form, admin_name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Admin Username <span className="text-danger">*</span></label>
              <input placeholder="contoh: admin" value={form.admin_username} onChange={e => setForm({ ...form, admin_username: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-tx2 mb-1 block font-medium">Admin Password <span className="text-danger">*</span></label>
              <input type="password" placeholder="Minimal 6 karakter" value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Password awal untuk admin tenant. Minimal 6 karakter. Admin dapat mengganti password setelah login.</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => createMut.mutate()} disabled={!canCreateTenant || createMut.isPending} className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {createMut.isPending ? 'Creating...' : 'Create Tenant'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-glass border border-brd text-sm hover:bg-glass-hover transition-all">Cancel</button>
          </div>
          {!canCreateTenant && <p className="text-[11px] text-tx3 mt-2">Nama tenant, subdomain, username, dan password (min 6 karakter) wajib diisi.</p>}
        </div>
      )}

      {tenants.length === 0 && !showForm ? (
        <div className="glass-card p-8 text-center">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm text-tx3">Belum ada tenant terdaftar.</p>
          <p className="text-xs text-tx3 mt-1">Klik "New Tenant" untuk membuat tenant pertama, atau tenant dapat registrasi mandiri via halaman landing.</p>
        </div>
      ) : (
      <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brd text-left text-tx2">
              <th className="py-2 px-3">Tenant</th>
              <th className="py-2 px-3">Subdomain</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3 text-center">Users</th>
              <th className="py-2 px-3 text-center">OLTs</th>
              <th className="py-2 px-3">Subscription</th>
              <th className="py-2 px-3">Contact</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                <td className="py-2 px-3">
                  <div className="font-medium">{t.name}</div>
                  {t.created_at && <div className="text-[10px] text-tx3">{new Date(t.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                </td>
                <td className="py-2 px-3 text-tx2 text-xs">{t.subdomain}.{baseDomain}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    t.status === 'active' ? 'bg-success/20 text-success' :
                    t.status === 'suspended' ? 'bg-warning/20 text-warning' :
                    'bg-danger/20 text-danger'
                  }`}>{t.status}</span>
                </td>
                <td className="py-2 px-3 text-center">{t.user_count}</td>
                <td className="py-2 px-3 text-center">{t.olt_count}</td>
                <td className="py-2 px-3">
                  {t.subscription ? (
                    <div>
                      <div className="text-xs font-medium">{t.subscription.package_name}</div>
                      <div className={`text-[10px] ${t.subscription.is_active ? 'text-success' : 'text-danger'}`}>
                        {t.subscription.days_remaining}d remaining
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-tx3 italic">No subscription</span>
                  )}
                </td>
                <td className="py-2 px-3 text-xs text-tx2">
                  {t.contact_name || t.contact_email || t.contact_phone ? (
                    <div>
                      {t.contact_name && <div className="truncate max-w-[120px]" title={t.contact_name}>{t.contact_name}</div>}
                      {t.contact_email && <div className="truncate max-w-[120px] text-tx3" title={t.contact_email}>{t.contact_email}</div>}
                    </div>
                  ) : <span className="text-tx3 italic">-</span>}
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setAssignSub({ tenantId: t.id, packageId: packages[0]?.id || 0 })}
                      className="text-xs px-2 py-1 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
                      title="Assign package to tenant"
                    >Assign</button>
                    <button
                      onClick={() => { setEditTenant(t); setEditForm({ name: t.name, subdomain: t.subdomain, contact_name: t.contact_name, contact_email: t.contact_email, contact_phone: t.contact_phone }); }}
                      className="p-1 rounded-lg hover:bg-accent/15 text-tx3 hover:text-accent transition-colors"
                      title="Edit tenant"
                    ><Edit3 size={14} /></button>
                    <button
                      onClick={() => toggleMut.mutate({ id: t.id, status: t.status === 'active' ? 'suspended' : 'active' })}
                      className="text-xs px-2 py-1 rounded-lg bg-warning/15 text-warning hover:bg-warning/25 transition-colors"
                    >{t.status === 'active' ? 'Suspend' : 'Activate'}</button>
                    <button onClick={() => deleteMut.mutate(t.id)} className="p-1 rounded-lg hover:bg-danger/15 text-danger transition-colors" title="Delete tenant"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {tenants.map(t => (
          <div key={t.id} className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{t.name}</div>
                <div className="text-xs text-tx3 truncate">{t.subdomain}.{baseDomain}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                t.status === 'active' ? 'bg-success/20 text-success' :
                t.status === 'suspended' ? 'bg-warning/20 text-warning' :
                'bg-danger/20 text-danger'
              }`}>{t.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-tx3 text-[10px] uppercase">Users</div><div className="font-medium">{t.user_count}</div></div>
              <div><div className="text-tx3 text-[10px] uppercase">OLTs</div><div className="font-medium">{t.olt_count}</div></div>
              <div><div className="text-tx3 text-[10px] uppercase">Pkg</div><div className="font-medium truncate">{t.subscription?.package_name || '-'}</div></div>
            </div>
            {t.subscription && (
              <div className={`text-xs ${t.subscription.is_active ? 'text-success' : 'text-danger'}`}>{t.subscription.days_remaining}d remaining</div>
            )}
            {(t.contact_name || t.contact_email) && (
              <div className="text-xs text-tx3 border-t border-brd/50 pt-2">
                {t.contact_name && <div>{t.contact_name}</div>}
                {t.contact_email && <div>{t.contact_email}</div>}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button onClick={() => setAssignSub({ tenantId: t.id, packageId: packages[0]?.id || 0 })}
                className="text-xs px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors">Assign</button>
              <button onClick={() => { setEditTenant(t); setEditForm({ name: t.name, subdomain: t.subdomain, contact_name: t.contact_name, contact_email: t.contact_email, contact_phone: t.contact_phone }); }}
                className="p-2 rounded-lg hover:bg-accent/15 text-tx3 hover:text-accent transition-colors"><Edit3 size={14} /></button>
              <button onClick={() => toggleMut.mutate({ id: t.id, status: t.status === 'active' ? 'suspended' : 'active' })}
                className="text-xs px-3 py-1.5 rounded-lg bg-warning/15 text-warning hover:bg-warning/25 transition-colors">{t.status === 'active' ? 'Suspend' : 'Activate'}</button>
              <button onClick={() => deleteMut.mutate(t.id)} className="p-2 rounded-lg hover:bg-danger/15 text-danger transition-colors"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      </>
      )}

      {editTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditTenant(null)}>
          <div className="glass-card p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-base flex items-center gap-2"><Edit3 size={18} className="text-accent" /> Edit Tenant</h3>
              <button onClick={() => setEditTenant(null)} className="p-1.5 rounded-lg hover:bg-glass transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-tx2 mb-1 block font-medium">Tenant Name</label>
                <input value={editForm.name} readOnly disabled
                  className="w-full px-3 py-2.5 rounded-xl bg-glass/50 border border-brd text-sm text-tx3 cursor-not-allowed opacity-70" />
                <p className="text-[11px] text-tx3 mt-1">Nama tenant tidak dapat diubah.</p>
              </div>
              <div>
                <label className="text-xs text-tx2 mb-1 block font-medium">Subdomain</label>
                <input value={editForm.subdomain} onChange={e => setEditForm({ ...editForm, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
                <p className="text-[11px] text-tx3 mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Hanya huruf kecil, angka, dan tanda hubung. URL: {editForm.subdomain || 'subdomain'}.{baseDomain}</p>
              </div>
              <div>
                <label className="text-xs text-tx2 mb-1 block font-medium">Contact Name</label>
                <input placeholder="Nama kontak" value={editForm.contact_name} onChange={e => setEditForm({ ...editForm, contact_name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              </div>
              <div>
                <label className="text-xs text-tx2 mb-1 block font-medium">Contact Email</label>
                <input type="email" placeholder="email@company.com" value={editForm.contact_email} onChange={e => setEditForm({ ...editForm, contact_email: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              </div>
              <div>
                <label className="text-xs text-tx2 mb-1 block font-medium">Contact Phone</label>
                <input type="tel" placeholder="628xxxxxxxxxx" value={editForm.contact_phone} onChange={e => setEditForm({ ...editForm, contact_phone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditTenant(null)} className="px-4 py-2 rounded-xl bg-glass border border-brd text-sm hover:bg-glass-hover transition-all">Cancel</button>
              <button onClick={() => updateMut.mutate({ id: editTenant.id, data: editForm })} className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {assignSub && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAssignSub(null)}>
          <div className="glass-card p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-base">Assign Package</h3>
              <button onClick={() => setAssignSub(null)} className="p-1.5 rounded-lg hover:bg-glass transition-colors"><X size={18} /></button>
            </div>
            <p className="text-[11px] text-tx3 mb-4 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Pilih paket untuk tenant ini. Subscription aktif akan di-override dan tenant akan langsung diaktifkan.</p>
            <label className="text-xs text-tx2 mb-1 block font-medium">Pilih Paket</label>
            <select
              value={assignSub.packageId}
              onChange={e => setAssignSub({ ...assignSub, packageId: +e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none mb-4"
            >
              {packages.length === 0 && <option value={0}>No packages available</option>}
              {packages.map(p => <option key={p.id} value={p.id}>{p.name} — Rp {p.price.toLocaleString('id-ID')} ({p.max_olts} OLTs, {p.duration_days}d)</option>)}
            </select>
            <button
              onClick={() => assignMut.mutate(assignSub)}
              disabled={!assignSub.packageId || assignMut.isPending}
              className="w-full px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >{assignMut.isPending ? 'Assigning...' : 'Assign & Activate'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionsTab({ subscriptions, tenants, packages, qc }: { subscriptions: Subscription[]; tenants: Tenant[]; packages: SubscriptionPackage[]; qc: ReturnType<typeof useQueryClient> }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tenant_id: 0, package_id: 0 });
  const [extendId, setExtendId] = useState<number | null>(null);
  const [extendDays, setExtendDays] = useState(30);

  const createMut = useMutation({
    mutationFn: () => api.adminCreateSubscription(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-subscriptions'] }); qc.invalidateQueries({ queryKey: ['admin-tenants'] }); setShowForm(false); toast.success('Subscription created & activated'); },
    onError: () => toast.error('Failed to create subscription'),
  });
  const extendMut = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) => api.adminExtendSubscription(id, days),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-subscriptions'] }); qc.invalidateQueries({ queryKey: ['admin-tenants'] }); setExtendId(null); toast.success(`Subscription extended by ${extendDays} days`); },
    onError: () => toast.error('Failed to extend subscription'),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.adminUpdateSubscription(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-subscriptions'] }); qc.invalidateQueries({ queryKey: ['admin-tenants'] }); toast.success('Subscription status updated'); },
    onError: () => toast.error('Failed to update status'),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <p className="text-xs text-tx3 mt-0.5">{subscriptions.length} total · {subscriptions.filter(s => s.status === 'active').length} aktif · {subscriptions.filter(s => s.status === 'expired').length} expired</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all">
          <Plus size={16} /> New Subscription
        </button>
      </div>

      {showForm && (
        <div className="glass-card p-4 md:p-5 mb-4">
          <h3 className="text-sm font-semibold mb-1">Create New Subscription</h3>
          <p className="text-[11px] text-tx3 mb-4">Assign paket ke tenant. Subscription aktif yang lama akan di-cancel dan diganti dengan yang baru.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Tenant</label>
              <select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: +e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none">
                <option value={0}>— Pilih tenant —</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subdomain})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-tx2 mb-1 block font-medium">Package</label>
              <select value={form.package_id} onChange={e => setForm({ ...form, package_id: +e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none">
                <option value={0}>— Pilih paket —</option>
                {packages.map(p => <option key={p.id} value={p.id}>{p.name} — Rp {p.price.toLocaleString('id-ID')} ({p.max_olts} OLTs, {p.duration_days}d)</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => createMut.mutate()} disabled={!form.tenant_id || !form.package_id || createMut.isPending} className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {createMut.isPending ? 'Creating...' : 'Create & Activate'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-glass border border-brd text-sm hover:bg-glass-hover transition-all">Cancel</button>
          </div>
        </div>
      )}

      {subscriptions.length === 0 && !showForm ? (
        <div className="glass-card p-8 text-center">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm text-tx3">Belum ada subscription aktif.</p>
          <p className="text-xs text-tx3 mt-1">Klik "New Subscription" untuk assign paket ke tenant, atau tenant dapat registrasi mandiri via halaman landing.</p>
        </div>
      ) : (
      <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brd text-left text-tx2">
              <th className="py-2 px-3">Tenant</th>
              <th className="py-2 px-3">Package</th>
              <th className="py-2 px-3">Start</th>
              <th className="py-2 px-3">End</th>
              <th className="py-2 px-3">Days Left</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map(s => (
              <tr key={s.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                <td className="py-2 px-3 font-medium">{s.tenant_name}</td>
                <td className="py-2 px-3">{s.package_name}</td>
                <td className="py-2 px-3 text-tx2 text-xs">{s.start_date ? new Date(s.start_date).toLocaleDateString() : '-'}</td>
                <td className="py-2 px-3 text-tx2 text-xs">{s.end_date ? new Date(s.end_date).toLocaleDateString() : '-'}</td>
                <td className="py-2 px-3">
                  <span className={`flex items-center gap-1 ${s.days_remaining <= 7 ? 'text-danger' : s.days_remaining <= 30 ? 'text-warning' : 'text-success'}`}>
                    <Clock size={14} /> {s.days_remaining}d
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    s.status === 'active' ? 'bg-success/20 text-success' :
                    s.status === 'expired' ? 'bg-danger/20 text-danger' :
                    'bg-glass text-tx3'
                  }`}>{s.status}</span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setExtendId(s.id); setExtendDays(30); }} className="text-xs px-2 py-1 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors">Extend</button>
                    {s.status === 'active' ? (
                      <button onClick={() => statusMut.mutate({ id: s.id, status: 'suspended' })} className="text-xs px-2 py-1 rounded-lg bg-warning/15 text-warning hover:bg-warning/25 transition-colors">Suspend</button>
                    ) : (
                      <button onClick={() => statusMut.mutate({ id: s.id, status: 'active' })} className="text-xs px-2 py-1 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors">Activate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {subscriptions.map(s => (
          <div key={s.id} className="glass-card p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm truncate">{s.tenant_name}</div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                s.status === 'active' ? 'bg-success/20 text-success' :
                s.status === 'expired' ? 'bg-danger/20 text-danger' :
                'bg-glass text-tx3'
              }`}>{s.status}</span>
            </div>
            <div className="text-xs text-tx3">{s.package_name}</div>
            <div className="flex items-center gap-4 text-xs">
              <div><span className="text-tx3">Start:</span> <span className="text-tx2">{s.start_date ? new Date(s.start_date).toLocaleDateString() : '-'}</span></div>
              <div><span className="text-tx3">End:</span> <span className="text-tx2">{s.end_date ? new Date(s.end_date).toLocaleDateString() : '-'}</span></div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`flex items-center gap-1 text-xs font-medium ${s.days_remaining <= 7 ? 'text-danger' : s.days_remaining <= 30 ? 'text-warning' : 'text-success'}`}>
                <Clock size={12} /> {s.days_remaining}d remaining
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => { setExtendId(s.id); setExtendDays(30); }} className="text-xs px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors">Extend</button>
                {s.status === 'active' ? (
                  <button onClick={() => statusMut.mutate({ id: s.id, status: 'suspended' })} className="text-xs px-3 py-1.5 rounded-lg bg-warning/15 text-warning hover:bg-warning/25 transition-colors">Suspend</button>
                ) : (
                  <button onClick={() => statusMut.mutate({ id: s.id, status: 'active' })} className="text-xs px-3 py-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors">Activate</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      </>
      )}

      {extendId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setExtendId(null)}>
          <div className="glass-card p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-base">Extend Subscription</h3>
              <button onClick={() => setExtendId(null)} className="p-1.5 rounded-lg hover:bg-glass transition-colors"><X size={18} /></button>
            </div>
            <p className="text-[11px] text-tx3 mb-4 flex items-start gap-1"><Info size={11} className="mt-0.5 flex-shrink-0" /> Perpanjang durasi subscription. Jika subscription sudah expired, perpanjangan dihitung dari hari ini.</p>
            <label className="text-xs text-tx2 mb-1 block font-medium">Jumlah Hari</label>
            <div className="flex gap-2">
              <input type="number" min={1} value={extendDays} onChange={e => setExtendDays(+e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
              <button onClick={() => extendMut.mutate({ id: extendId, days: extendDays })} disabled={extendDays < 1 || extendMut.isPending} className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {extendMut.isPending ? 'Extending...' : `Extend ${extendDays}d`}
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setExtendDays(7)} className="text-xs px-2 py-1 rounded-lg bg-glass border border-brd hover:bg-glass-hover transition-colors">+7d</button>
              <button onClick={() => setExtendDays(30)} className="text-xs px-2 py-1 rounded-lg bg-glass border border-brd hover:bg-glass-hover transition-colors">+30d</button>
              <button onClick={() => setExtendDays(90)} className="text-xs px-2 py-1 rounded-lg bg-glass border border-brd hover:bg-glass-hover transition-colors">+90d</button>
              <button onClick={() => setExtendDays(365)} className="text-xs px-2 py-1 rounded-lg bg-glass border border-brd hover:bg-glass-hover transition-colors">+365d</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function TransactionsTab({ transactions }: { transactions: TransactionRecord[] }) {
  const statusColor = (s: string) => s === 'paid' ? 'text-success' : s === 'pending' ? 'text-warning' : s === 'failed' ? 'text-danger' : 'text-tx3';
  const statusIcon = (s: string) => s === 'paid' ? <CheckCircle size={14} className="text-success" /> : s === 'pending' ? <Clock size={14} className="text-warning" /> : <XCircle size={14} className="text-danger" />;

  const totalPaid = transactions.filter(t => t.status === 'paid').reduce((sum, t) => sum + t.amount, 0);
  const totalPending = transactions.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount, 0);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Payment Transactions</h2>
        <p className="text-xs text-tx3 mt-0.5">{transactions.length} transaksi · {transactions.filter(t => t.status === 'paid').length} paid · {transactions.filter(t => t.status === 'pending').length} pending</p>
      </div>

      {/* Summary Cards */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="glass-card p-3 md:p-4 border border-success/20 bg-success/5">
            <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">Total Paid</p>
            <div className="text-lg md:text-xl font-bold text-success mt-1">Rp {totalPaid.toLocaleString('id-ID')}</div>
          </div>
          <div className="glass-card p-3 md:p-4 border border-warning/20 bg-warning/5">
            <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">Total Pending</p>
            <div className="text-lg md:text-xl font-bold text-warning mt-1">Rp {totalPending.toLocaleString('id-ID')}</div>
          </div>
          <div className="glass-card p-3 md:p-4 border border-brd">
            <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">Total Transactions</p>
            <div className="text-lg md:text-xl font-bold mt-1">{transactions.length}</div>
          </div>
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Receipt size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm text-tx3">Belum ada transaksi pembayaran.</p>
          <p className="text-xs text-tx3 mt-1">Transaksi akan muncul saat tenant melakukan pembayaran via Duitku.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brd text-tx3 text-xs">
                  <th className="py-2 px-3 text-left">Order ID</th>
                  <th className="py-2 px-3 text-left">Tenant</th>
                  <th className="py-2 px-3 text-left">Package</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3 text-left">Method</th>
                  <th className="py-2 px-3 text-left">Status</th>
                  <th className="py-2 px-3 text-left">Created</th>
                  <th className="py-2 px-3 text-left">Paid At</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                    <td className="py-2 px-3 font-mono text-xs">{t.merchant_order_id}</td>
                    <td className="py-2 px-3 font-medium">{t.tenant_name}</td>
                    <td className="py-2 px-3">{t.package_name}</td>
                    <td className="py-2 px-3 text-right font-medium">Rp {t.amount.toLocaleString('id-ID')}</td>
                    <td className="py-2 px-3 text-xs">{t.payment_method || '-'}</td>
                    <td className="py-2 px-3">
                      <span className={`flex items-center gap-1.5 ${statusColor(t.status)}`}>
                        {statusIcon(t.status)} {t.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-tx3">{t.created_at ? new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                    <td className="py-2 px-3 text-xs text-tx3">{t.paid_at ? new Date(t.paid_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {transactions.map(t => (
              <div key={t.id} className="glass-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-tx3">{t.merchant_order_id}</span>
                  <span className={`flex items-center gap-1 text-xs font-medium ${statusColor(t.status)}`}>
                    {statusIcon(t.status)} {t.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{t.tenant_name}</span>
                  <span className="text-sm font-bold">Rp {t.amount.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-xs text-tx3">
                  <span>{t.package_name}</span>
                  <span>{t.payment_method || '-'}</span>
                </div>
                <div className="text-xs text-tx3">{t.created_at ? new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


function InvoicesTab({ invoices }: { invoices: InvoiceRecord[] }) {
  const statusColor = (s: string) => s === 'paid' ? 'text-success' : s === 'unpaid' ? 'text-warning' : s === 'expired' ? 'text-danger' : 'text-tx3';
  const typeBadge = (t: string) => t === 'auto' ? 'bg-blue-500/15 text-blue-400' : t === 'pg' ? 'bg-green-500/15 text-green-400' : 'bg-purple-500/15 text-purple-400';
  const typeLabel = (t: string) => t === 'auto' ? 'Auto' : t === 'pg' ? 'PG (Duitku)' : t;

  const totalUnpaid = invoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + i.amount, 0);
  const totalPaidInv = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Invoices</h2>
        <p className="text-xs text-tx3 mt-0.5">{invoices.length} invoice · {invoices.filter(i => i.status === 'paid').length} paid · {invoices.filter(i => i.status === 'unpaid').length} unpaid</p>
      </div>

      {/* Summary Cards */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="glass-card p-3 md:p-4 border border-success/20 bg-success/5">
            <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">Total Paid</p>
            <div className="text-lg md:text-xl font-bold text-success mt-1">Rp {totalPaidInv.toLocaleString('id-ID')}</div>
          </div>
          <div className="glass-card p-3 md:p-4 border border-warning/20 bg-warning/5">
            <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">Total Unpaid</p>
            <div className="text-lg md:text-xl font-bold text-warning mt-1">Rp {totalUnpaid.toLocaleString('id-ID')}</div>
          </div>
          <div className="glass-card p-3 md:p-4 border border-brd">
            <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">Total Invoices</p>
            <div className="text-lg md:text-xl font-bold mt-1">{invoices.length}</div>
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm text-tx3">Belum ada invoice.</p>
          <p className="text-xs text-tx3 mt-1">Invoice otomatis dibuat saat notifikasi expiry subscription terkirim.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brd text-tx3 text-xs">
                  <th className="py-2 px-3 text-left">Invoice #</th>
                  <th className="py-2 px-3 text-left">Tenant</th>
                  <th className="py-2 px-3 text-left">Package</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3 text-left">Type</th>
                  <th className="py-2 px-3 text-left">Status</th>
                  <th className="py-2 px-3 text-left">Due Date</th>
                  <th className="py-2 px-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                    <td className="py-2 px-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="py-2 px-3 font-medium">{inv.tenant_name}</td>
                    <td className="py-2 px-3">{inv.package_name}</td>
                    <td className="py-2 px-3 text-right font-medium">Rp {inv.amount.toLocaleString('id-ID')}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${typeBadge(inv.invoice_type)}`}>{typeLabel(inv.invoice_type)}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-medium ${statusColor(inv.status)}`}>{inv.status}</span>
                    </td>
                    <td className="py-2 px-3 text-xs text-tx3">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td className="py-2 px-3 text-xs text-tx3">{inv.created_at ? new Date(inv.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {invoices.map(inv => (
              <div key={inv.id} className="glass-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-tx3">{inv.invoice_number}</span>
                  <span className={`text-xs font-medium ${statusColor(inv.status)}`}>{inv.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{inv.tenant_name}</span>
                  <span className="text-sm font-bold">Rp {inv.amount.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-xs text-tx3">
                  <span>{inv.package_name}</span>
                  <span className={`px-2 py-0.5 rounded-full ${typeBadge(inv.invoice_type)}`}>{typeLabel(inv.invoice_type)}</span>
                </div>
                {inv.description && <p className="text-xs text-tx3">{inv.description}</p>}
                <div className="text-xs text-tx3">
                  {inv.due_date ? `Due: ${new Date(inv.due_date).toLocaleDateString('id-ID')}` : ''}
                  {inv.paid_at ? ` - Paid: ${new Date(inv.paid_at).toLocaleDateString('id-ID')}` : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
