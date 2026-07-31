import { type ReactNode } from 'react';
import { Zap, Activity, Radio, Server, ShieldCheck, Wifi, Network } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
  brandName: string;
  onBack?: () => void;
}

export function AuthLayout({ children, brandName }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)] text-tx1">
      {/* Left: Visual Panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12">
        {/* Background gradient + effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-surface)] via-[var(--bg-primary)] to-[#0A1020]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-64 h-64 bg-success/5 rounded-full blur-3xl" />

        {/* Animated fiber beam line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] fiber-beam opacity-40" />

        {/* Top: Logo + Brand */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center glow-accent">
              <Zap size={26} className="text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight">{brandName}</h1>
              <p className="text-xs text-tx3 mt-0.5">Network Management System</p>
            </div>
          </div>
        </div>

        {/* Middle: Hero content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md">
          <h2 className="text-3xl xl:text-4xl font-bold font-display leading-tight mb-4">
            Kelola Jaringan FTTH<br />
            <span className="text-accent">dari Satu Dashboard</span>
          </h2>
          <p className="text-sm text-tx2 leading-relaxed mb-8">
            Monitoring OLT & ONU real-time, provisioning otomatis, manajemen ZTE OLT —
            semua dalam satu platform terintegrasi.
          </p>

          {/* Feature highlights */}
          <div className="space-y-3">
            {[
              { icon: Activity, title: 'Real-time Monitoring', desc: 'Status ONU, RX power, traffic — live update' },
              { icon: Radio, title: 'ZTE OLT Support', desc: 'ZTE C320, C300, C600, C650 — SNMP + Telnet' },
              { icon: Server, title: 'OLT Provisioning', desc: 'Register, configure, manage ONUs via CLI/SNMP' },
              { icon: ShieldCheck, title: 'Secure & Isolated', desc: 'Multi-tenant dengan isolasi data per subdomain' },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-glass/60 border border-brd flex items-center justify-center flex-shrink-0 group-hover:border-accent/30 transition-colors">
                  <f.icon size={18} className="text-accent" />
                </div>
                <div className="pt-1">
                  <p className="text-sm font-medium text-tx1">{f.title}</p>
                  <p className="text-xs text-tx3 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Stats badge */}
        <div className="relative z-10 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-tx3">System Operational</span>
          </div>
          <div className="h-4 w-px bg-brd" />
          <div className="flex items-center gap-2 text-xs text-tx3">
            <Wifi size={14} className="text-accent" />
            <span>FTTH Ready</span>
          </div>
          <div className="h-4 w-px bg-brd" />
          <div className="flex items-center gap-2 text-xs text-tx3">
            <Network size={14} className="text-accent" />
            <span>Multi-Vendor</span>
          </div>
        </div>
      </div>

      {/* Right: Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-y-auto">
        {/* Mobile background effects */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none lg:hidden">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/5 rounded-full blur-3xl" />
        </div>

        {/* Mobile logo (visible only on mobile, above form) */}
        <div className="lg:hidden fixed top-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center glow-accent">
            <Zap size={24} className="text-accent" />
          </div>
          <h1 className="text-lg font-bold font-display">{brandName}</h1>
        </div>

        <div className="relative w-full max-w-md animate-fade-in mt-20 lg:mt-0">
          {children}
        </div>
      </div>
    </div>
  );
}
