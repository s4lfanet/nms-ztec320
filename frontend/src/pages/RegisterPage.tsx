import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type PublicPackage, type RegisterData } from '../lib/api';
import {
  Zap, ArrowLeft, ArrowRight, Loader2, Building2, User, Lock,
  Phone, Mail, Globe, CheckCircle, Clock, ExternalLink, Cloud, Sparkles,
  Rocket, ShieldCheck, Wifi,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const preselectedPkg = (location.state as { packageId?: number })?.packageId;
  const [brandName, setBrandName] = useState('');
  const [baseDomain, setBaseDomain] = useState('salfa.my.id');
  const [nmsPrefix, setNmsPrefix] = useState('nms');

  useEffect(() => {
    fetch('/api/public/branding').then(r => r.json()).then(d => {
      const name = d.nms_name || 'FiberNMS';
      setBrandName(name);
      if (d.base_domain) setBaseDomain(d.base_domain);
      if (d.nms_prefix) setNmsPrefix(d.nms_prefix);
      document.title = `Daftar — ${name}`;
    }).catch(() => { setBrandName('FiberNMS'); });
  }, []);

  const [step, setStep] = useState(1); // 1=form, 2=success
  const [form, setForm] = useState<RegisterData>({
    name: '', subdomain: '', contact_name: '', contact_email: '',
    contact_phone: '', admin_name: '', admin_username: '', admin_password: '',
    package_id: preselectedPkg || 0,
  });
  const [regResult, setRegResult] = useState<{
    trial_end: string | null;
    subdomain: string;
    package: PublicPackage;
    cf_status?: string;
    cf_message?: string;
  } | null>(null);

  const { data: packages } = useQuery<PublicPackage[]>({
    queryKey: ['public-packages'],
    queryFn: api.publicPackages,
  });

  const registerMut = useMutation({
    mutationFn: () => api.publicRegister(form),
    onSuccess: (resp) => {
      const r = resp as Record<string, unknown>;
      setRegResult({
        trial_end: r.trial_end as string | null,
        subdomain: r.subdomain as string,
        package: resp.package,
        cf_status: r.cf_status as string | undefined,
        cf_message: r.cf_message as string | undefined,
      });
      setStep(2);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name || !form.subdomain || !form.contact_name || !form.contact_phone || !form.admin_username || !form.admin_password || !form.package_id) {
      toast.warning('Semua field wajib diisi kecuali email');
      return;
    }
    if (form.admin_password.length < 6) {
      toast.warning('Password minimal 6 karakter');
      return;
    }
    registerMut.mutate();
  };

  const benefits = [
    { icon: Rocket, text: 'Langsung aktif — trial 30 hari gratis, tanpa kartu kredit' },
    { icon: Cloud, text: 'Subdomain otomatis — langsung terhubung ke Cloudflare Tunnel' },
    { icon: ShieldCheck, text: 'Isolasi data aman — setiap tenant punya subdomain sendiri' },
    { icon: Wifi, text: 'Monitoring real-time OLT & ONU dari ZTE C320' },
  ];

  // ===== STEP 2: SUCCESS =====
  if (step === 2 && regResult) {
    const dashboardUrl = `https://${regResult.subdomain}.${baseDomain}/spa/login`;
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-tx1 flex flex-col">
        <nav className="border-b border-brd/50">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
                <Zap size={20} className="text-accent" />
              </div>
              <span className="text-lg font-bold">{brandName}</span>
            </button>
          </div>
        </nav>

        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-lg">
            <div className="glass-card rounded-3xl p-8 md:p-10 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-success/5 via-transparent to-accent/5 pointer-events-none" />
              <div className="relative">
                <div className="relative mx-auto mb-6">
                  <div className="absolute inset-0 bg-success/20 rounded-full blur-2xl animate-pulse" />
                  <div className="relative w-24 h-24 rounded-full bg-success/15 flex items-center justify-center">
                    <CheckCircle size={48} className="text-success" />
                  </div>
                </div>

                <h1 className="text-3xl font-bold mb-3">Pendaftaran Berhasil!</h1>
                <p className="text-sm text-tx3 mb-8 max-w-sm mx-auto">
                  Akun tenant Anda telah aktif dengan masa trial <strong className="text-accent">30 hari gratis</strong>.
                  Subdomain telah dikonfigurasi otomatis.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6 text-left">
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-tx3 mb-1">Paket</div>
                    <div className="font-semibold text-sm">{regResult.package.name}</div>
                  </div>
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-tx3 mb-1">Max OLT</div>
                    <div className="font-semibold text-sm">{regResult.package.max_olts} OLT</div>
                  </div>
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-tx3 mb-1 flex items-center gap-1"><Clock size={11} /> Trial berakhir</div>
                    <div className="font-semibold text-sm text-warning">
                      {regResult.trial_end
                        ? new Date(regResult.trial_end).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
                        : '30 hari dari sekarang'}
                    </div>
                  </div>
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-tx3 mb-1 flex items-center gap-1"><Cloud size={11} /> DNS Status</div>
                    <div className={cn('font-semibold text-sm flex items-center gap-1.5', regResult.cf_status === 'ok' ? 'text-success' : 'text-warning')}>
                      {regResult.cf_status === 'ok' ? <><CheckCircle size={12} /> Terkonfigurasi</> : <><Clock size={12} /> Manual setup</>}
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-xl p-4 mb-6 flex items-center justify-between">
                  <div className="text-left min-w-0">
                    <div className="text-xs text-tx3 mb-0.5">URL Dashboard</div>
                    <div className="text-sm font-mono text-accent truncate">{regResult.subdomain}.{baseDomain}</div>
                  </div>
                  <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2.5 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent transition-colors">
                    <ExternalLink size={18} />
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-accent/8 border border-accent/20 mb-6 text-left">
                  <p className="text-sm font-semibold text-accent mb-2 flex items-center gap-1.5">
                    <Sparkles size={14} /> Langkah Selanjutnya
                  </p>
                  <ol className="text-xs text-tx2 space-y-2 list-decimal list-inside">
                    <li>Login ke dashboard dengan username & password yang dibuat</li>
                    <li>Tambahkan OLT di menu <strong>OLT Settings</strong></li>
                    <li>Sebelum trial habis, perpanjang di menu <strong>Subscription</strong></li>
                  </ol>
                </div>

                <a href={dashboardUrl} className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all flex items-center justify-center gap-2 mb-3">
                  Masuk ke Dashboard <ExternalLink size={16} />
                </a>
                <button onClick={() => navigate('/')} className="w-full py-3 rounded-xl glass-card border border-brd hover:border-accent/50 text-sm font-medium transition-all">
                  Kembali ke Beranda
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== STEP 1: FORM =====
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-tx1">
      {/* Nav */}
      <nav className="border-b border-brd/50 sticky top-0 z-50 backdrop-blur-xl bg-[var(--bg-primary)]/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
              <Zap size={20} className="text-accent" />
            </div>
            <span className="text-lg font-bold">{brandName}</span>
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm text-tx2 hover:text-tx1 transition-colors">
            <ArrowLeft size={16} /> Kembali
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10">
          {/* Left: Benefits panel */}
          <div className="lg:col-span-2 lg:sticky lg:top-24 self-start">
            <div className="glass-card rounded-3xl p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent font-medium mb-5">
                  <Sparkles size={12} /> Trial 30 Hari Gratis
                </div>
                <h2 className="text-2xl font-bold mb-3 leading-tight">
                  Mulai Kelola Jaringan FTTH Anda Hari Ini
                </h2>
                <p className="text-sm text-tx3 mb-6">
                  Daftar sekarang, langsung aktif tanpa perlu pembayaran. Subdomain otomatis terkonfigurasi.
                </p>

                <div className="space-y-3">
                  {benefits.map((b, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <b.icon size={18} className="text-accent" />
                      </div>
                      <p className="text-sm text-tx2 pt-1.5">{b.text}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-brd/50">
                  <p className="text-xs text-tx3">
                    Sudah punya akun?{' '}
                    <button onClick={() => navigate('/login')} className="text-accent hover:underline font-medium">
                      Login di sini
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="lg:col-span-3">
            <div className="glass-card rounded-3xl p-6 md:p-8">
              {/* Progress */}
              <div className="flex items-center gap-2 mb-6">
                <div className="flex items-center gap-2 text-sm text-accent">
                  <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">1</div>
                  Data Diri
                </div>
                <div className="flex-1 h-px bg-brd" />
                <div className="flex items-center gap-2 text-sm text-tx3">
                  <div className="w-7 h-7 rounded-full bg-glass flex items-center justify-center text-xs font-bold">2</div>
                  Selesai
                </div>
              </div>

              <h1 className="text-xl font-bold mb-1">Daftar Tenant Baru</h1>
              <p className="text-xs text-tx3 mb-6">Lengkapi data berikut untuk membuat akun tenant</p>

              {/* Package Selection */}
              <div className="mb-5">
                <label className="text-sm font-medium mb-2.5 block">Pilih Paket</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(packages || []).map((pkg, i) => {
                    const isPopular = i === 1;
                    return (
                      <label
                        key={pkg.id}
                        className={cn(
                          'flex flex-col p-3.5 rounded-2xl border cursor-pointer transition-all relative',
                          form.package_id === pkg.id
                            ? 'border-accent bg-accent/10 ring-2 ring-accent/15'
                            : 'border-brd hover:border-accent/40'
                        )}
                      >
                        {isPopular && (
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-accent text-white text-[9px] font-bold">
                            POPULER
                          </div>
                        )}
                        <input
                          type="radio"
                          name="package"
                          checked={form.package_id === pkg.id}
                          onChange={() => setForm({ ...form, package_id: pkg.id })}
                          className="sr-only"
                        />
                        <span className="font-semibold text-sm">{pkg.name}</span>
                        <span className="text-xs text-tx3 mt-0.5">{pkg.max_olts} OLT</span>
                        <div className="mt-2 pt-2 border-t border-brd/40">
                          <span className="block text-xs font-bold text-accent">Trial 30 hari</span>
                          <span className="text-[10px] text-tx3">lalu Rp {pkg.price.toLocaleString('id-ID')}/bln</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-tx2">
                      <Building2 size={13} /> Nama ISP/Perusahaan
                    </label>
                    <input
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="PT Jaya Network"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-tx2">
                      <Globe size={13} /> Subdomain
                    </label>
                    <div className="flex items-center">
                      <input
                        value={form.subdomain}
                        onChange={e => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                        placeholder="jayanetwork"
                        className="w-full px-3.5 py-2.5 rounded-l-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                      />
                      <span className="px-3 py-2.5 rounded-r-xl bg-glass border border-l-0 border-brd text-xs text-tx3 whitespace-nowrap">
                        -{nmsPrefix}.{baseDomain}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-tx2">
                      <User size={13} /> Nama Kontak
                    </label>
                    <input
                      value={form.contact_name}
                      onChange={e => setForm({ ...form, contact_name: e.target.value })}
                      placeholder="Budi Santoso"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-tx2">
                      <Phone size={13} /> No. WhatsApp
                    </label>
                    <input
                      value={form.contact_phone}
                      onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                      placeholder="08123456789"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-tx2">
                    <Mail size={13} /> Email (opsional)
                  </label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={e => setForm({ ...form, contact_email: e.target.value })}
                    placeholder="budi@jayanetwork.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                  />
                </div>

                <div className="border-t border-brd/50 pt-4">
                  <h3 className="text-sm font-semibold mb-3">Akun Admin</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1.5 block text-tx2">Nama Admin</label>
                      <input
                        value={form.admin_name}
                        onChange={e => setForm({ ...form, admin_name: e.target.value })}
                        placeholder="Budi Santoso"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-tx2">
                        <User size={13} /> Username
                      </label>
                      <input
                        value={form.admin_username}
                        onChange={e => setForm({ ...form, admin_username: e.target.value })}
                        placeholder="budi_admin"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-tx2">
                      <Lock size={13} /> Password
                    </label>
                    <input
                      type="password"
                      value={form.admin_password}
                      onChange={e => setForm({ ...form, admin_password: e.target.value })}
                      placeholder="Minimal 6 karakter"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-glass border border-brd text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/10 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={registerMut.isPending || !form.package_id}
                className="w-full mt-6 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {registerMut.isPending
                  ? <><Loader2 size={18} className="animate-spin" /> Mendaftarkan...</>
                  : <>Daftar & Mulai Trial Gratis <ArrowRight size={18} /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
