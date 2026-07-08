import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type PublicPackage } from '../lib/api';
import {
  Zap, Activity, Network, CreditCard, Shield, Server, Smartphone,
  BarChart3, Bell, ArrowRight, Check, Wifi, Radio,
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [brandName, setBrandName] = useState('');
  const { data: packages } = useQuery<PublicPackage[]>({
    queryKey: ['public-packages'],
    queryFn: api.publicPackages,
  });

  useEffect(() => {
    fetch('/api/public/branding').then(r => r.json()).then(d => {
      const name = d.nms_name || 'FiberNMS';
      setBrandName(name);
      document.title = name;
    }).catch(() => { setBrandName('FiberNMS'); });
  }, []);

  const features = [
    { icon: Network, title: 'OLT Monitoring', desc: 'Real-time monitoring ZTE C320 — signal power, port status, card info.' },
    { icon: Activity, title: 'ONU Management', desc: 'Kelola ribuan ONU — registrasi, status, reset, delete, migrasi PON.' },
    { icon: BarChart3, title: 'Analytics & Reports', desc: 'Dashboard interaktif dengan statistik ONU online/offline, signal quality.' },
    { icon: Bell, title: 'Alert Notifications', desc: 'Notifikasi WhatsApp & Telegram otomatis untuk ONU offline, LOS, DyingGasp.' },
    { icon: CreditCard, title: 'Billing & Invoice', desc: 'Sistem billing otomatis dengan payment gateway Duitku, invoice auto-generate.' },
    { icon: Shield, title: 'Multi-Tenant Security', desc: 'Isolasi data per tenant, RBAC, role-based permissions, secure authentication.' },
    { icon: Server, title: 'FTTH Infrastructure', desc: 'Manajemen ODP, ODC, OTB, jalur kabel — visualisasi topologi fiber.' },
    { icon: Smartphone, title: 'Mobile Responsive', desc: 'Tampilan optimal di desktop, tablet, dan mobile — kelola dari mana saja.' },
  ];

  const advantages = [
    'Setup cepat — langsung pakai tanpa instalasi software',
    'Dukungan ZTE C320 firmware V2.1.0+',
    'Auto-sync via SNMP & Telnet',
    'Pembayaran online via Duitku (VA, e-wallet, QRIS)',
    'Multi-tenant — isolasi data aman per ISP',
    'Notifikasi otomatis ke teknisi & pelanggan',
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-tx1">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--bg-primary)]/80 border-b border-brd/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
              <Zap size={20} className="text-accent" />
            </div>
            <span className="text-lg font-bold">{brandName}</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-tx2">
            <a href="#features" className="hover:text-tx1 transition-colors">Fitur</a>
            <a href="#advantages" className="hover:text-tx1 transition-colors">Keunggulan</a>
            <a href="#pricing" className="hover:text-tx1 transition-colors">Paket</a>
            <button onClick={() => navigate('/login')} className="hover:text-tx1 transition-colors">Login</button>
          </div>
          <button
            onClick={() => navigate('/register')}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all"
          >
            Daftar Sekarang
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-sm text-accent mb-6">
            <Radio size={14} /> Network Management System untuk ISP Fiber
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 max-w-4xl mx-auto">
            Kelola Jaringan FTTH Anda dengan
            <span className="text-accent"> Mudah & Profesional</span>
          </h1>
          <p className="text-lg text-tx2 max-w-2xl mx-auto mb-10">
            Platform SaaS untuk monitoring OLT & ONU, manajemen pelanggan, billing otomatis,
            dan notifikasi real-time. Dirancang khusus untuk ISP fiber optik di Indonesia.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/register')}
              className="px-8 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all flex items-center gap-2 text-lg"
            >
              Mulai Sekarang <ArrowRight size={20} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3.5 rounded-xl glass-card border border-brd hover:border-accent/50 font-medium transition-all text-lg"
            >
              Login Dashboard
            </button>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-tx3">
            <div className="flex items-center gap-2"><Check size={16} className="text-success" /> Tanpa instalasi</div>
            <div className="flex items-center gap-2"><Check size={16} className="text-success" /> Pembayaran online</div>
            <div className="flex items-center gap-2"><Check size={16} className="text-success" /> Support ZTE C320</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Fitur Utama</h2>
            <p className="text-tx2 max-w-2xl mx-auto">Semua yang Anda butuhkan untuk mengelola jaringan fiber optik dalam satu platform</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div key={i} className="glass-card p-6 rounded-2xl hover:border-accent/30 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                  <f.icon size={24} className="text-accent" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-tx3">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section id="advantages" className="py-20 px-4 sm:px-6 bg-glass/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Keunggulan Layanan</h2>
            <p className="text-tx2">Kenapa memilih {brandName} untuk bisnis ISP Anda</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {advantages.map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl glass-card">
                <div className="w-6 h-6 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check size={14} className="text-success" />
                </div>
                <span className="text-sm text-tx2">{a}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Paket Langganan</h2>
            <p className="text-tx2">Pilih paket sesuai kebutuhan bisnis Anda</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {(packages || []).map((pkg, i) => {
              const isPopular = i === 1;
              return (
                <div
                  key={pkg.id}
                  className={`glass-card rounded-2xl p-8 relative ${isPopular ? 'border-accent ring-2 ring-accent/20' : ''}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-white text-xs font-medium">
                      Populer
                    </div>
                  )}
                  <h3 className="text-xl font-bold mb-1">{pkg.name}</h3>
                  <p className="text-sm text-tx3 mb-4">{pkg.description || `${pkg.max_olts} OLT, ${pkg.duration_days} hari`}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">Rp {pkg.price.toLocaleString('id-ID')}</span>
                    <span className="text-sm text-tx3"> / {pkg.duration_days} hari</span>
                  </div>
                  <ul className="space-y-2 mb-8 text-sm">
                    <li className="flex items-center gap-2"><Check size={16} className="text-success" /> {pkg.max_olts} OLT</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-success" /> Unlimited ONU</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-success" /> {pkg.duration_days} hari aktif</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-success" /> WhatsApp & Telegram notif</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-success" /> Billing & invoice otomatis</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-success" /> FTTH infrastructure</li>
                  </ul>
                  <button
                    onClick={() => navigate('/register', { state: { packageId: pkg.id } })}
                    className={`w-full py-3 rounded-xl font-medium transition-all ${
                      isPopular
                        ? 'bg-accent hover:bg-accent-hover text-white'
                        : 'glass-card border border-brd hover:border-accent/50'
                    }`}
                  >
                    Pilih {pkg.name}
                  </button>
                </div>
              );
            })}
            {!packages && (
              <div className="col-span-full text-center text-tx3 py-8">Memuat paket...</div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center glass-card rounded-3xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-accent/5" />
          <div className="relative">
            <Wifi size={40} className="text-accent mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-4">Siap Memulai?</h2>
            <p className="text-tx2 mb-8 max-w-xl mx-auto">
              Daftar sekarang, pilih paket, bayar online, dan langsung kelola jaringan fiber Anda.
              Tanpa intervensi admin, sepenuhnya self-service.
            </p>
            <button
              onClick={() => navigate('/register')}
              className="px-8 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all inline-flex items-center gap-2 text-lg"
            >
              Daftar Sekarang <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brd/50 py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Zap size={18} className="text-accent" />
                </div>
                <span className="font-bold">{brandName}</span>
              </div>
              <p className="text-sm text-tx3">Network Management System untuk ISP fiber optik di Indonesia.</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Fitur</h4>
              <ul className="space-y-2 text-sm text-tx3">
                <li>OLT Monitoring</li>
                <li>ONU Management</li>
                <li>Billing & Invoice</li>
                <li>FTTH Infrastructure</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Perusahaan</h4>
              <ul className="space-y-2 text-sm text-tx3">
                <li>Tentang Kami</li>
                <li>Kontak</li>
                <li>Dokumentasi</li>
                <li>Support</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Kontak</h4>
              <ul className="space-y-2 text-sm text-tx3">
                <li>Email: info@salfa.my.id</li>
                <li>WhatsApp: 0899-0674-626</li>
                <li>nms.salfa.my.id</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-brd/50 pt-6 text-center text-sm text-tx3">
            &copy; {new Date().getFullYear()} {brandName} by Salfanet. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
