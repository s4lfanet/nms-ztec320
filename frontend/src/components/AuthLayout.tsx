import { type CSSProperties, type ReactNode } from 'react';
import { Wifi } from 'lucide-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt, faTowerBroadcast, faServer, faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '../lib/utils';

interface AuthLayoutProps {
  children: ReactNode;
  brandName: string;
  logoUrl?: string | null;
  onBack?: () => void;
}

const features = [
  { icon: faBolt, title: 'Real-time Monitoring', desc: 'Status ONU, RX power, traffic — live update' },
  { icon: faTowerBroadcast, title: 'ZTE OLT Support', desc: 'ZTE C320, C300, C600, C650 — SNMP + SSH/Telnet' },
  { icon: faServer, title: 'OLT Provisioning', desc: 'Register, configure, manage ONUs via CLI/SNMP' },
  { icon: faShieldHalved, title: 'Secure & Isolated', desc: 'Multi-tenant dengan isolasi data per subdomain' },
];

function delayStyle(ms: number): CSSProperties {
  return { '--d': `${ms}ms` } as CSSProperties;
}

export function AuthLayout({ children, brandName, logoUrl }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)] text-tx1">
      {/* Left: Visual Panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12">
        {/* Layered background: base gradient + drifting blobs + dot grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-surface)] via-[var(--bg-primary)] to-[var(--bg-primary)]" />
        <div className="absolute inset-0 auth-dot-grid opacity-60" style={{ maskImage: 'radial-gradient(ellipse 90% 70% at 30% 40%, black 30%, transparent 85%)', WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 30% 40%, black 30%, transparent 85%)' }} />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/8 rounded-full blur-3xl auth-blob" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-500/6 rounded-full blur-3xl auth-blob-slow" />
        <div className="absolute top-1/2 right-0 w-64 h-64 bg-success/6 rounded-full blur-3xl auth-blob" />

        {/* Top: Logo + Brand */}
        <div className="relative z-10 stagger-in" style={delayStyle(0)}>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              {/* Broadcast rings — decorative, echoes the network/FTTH domain */}
              {!logoUrl && (
                <>
                  <span className="signal-ring" style={{ animationDelay: '0s' }} />
                  <span className="signal-ring" style={{ animationDelay: '1.1s' }} />
                </>
              )}
              <div className={cn(
                'relative w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden',
                logoUrl ? 'bg-white p-1.5' : 'bg-accent/15 glow-accent',
              )}>
                {logoUrl ? <img src={logoUrl} alt={brandName} className="w-full h-full object-contain" /> : <FontAwesomeIcon icon={faTowerBroadcast} className="text-accent" style={{ fontSize: 22 }} />}
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight">{brandName}</h1>
              <p className="text-xs text-tx3 mt-0.5">Network Management System</p>
            </div>
          </div>
        </div>

        {/* Middle: Hero content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md">
          <h2 className="text-3xl xl:text-4xl font-bold font-display leading-tight mb-4 stagger-in" style={delayStyle(80)}>
            Kelola Jaringan FTTH<br />
            <span className="text-accent">dari Satu Dashboard</span>
          </h2>
          <p className="text-sm text-tx2 leading-relaxed mb-8 stagger-in" style={delayStyle(160)}>
            Monitoring OLT & ONU real-time, provisioning otomatis, manajemen ZTE OLT —
            semua dalam satu platform terintegrasi.
          </p>

          {/* Feature highlights */}
          <div className="space-y-3">
            {features.map((f, i) => (
              <div key={f.title} className="flex items-start gap-3 group stagger-in" style={delayStyle(240 + i * 90)}>
                <div className="icon-badge w-10 h-10 flex-shrink-0 group-hover:scale-105">
                  <FontAwesomeIcon icon={f.icon} style={{ fontSize: 16 }} />
                </div>
                <div className="pt-1.5">
                  <p className="text-sm font-medium text-tx1">{f.title}</p>
                  <p className="text-xs text-tx3 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Stats badge */}
        <div className="relative z-10 flex items-center gap-6 stagger-in" style={delayStyle(620)}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-tx3">System Operational</span>
          </div>
          <div className="h-4 w-px bg-brd" />
          <div className="flex items-center gap-2 text-xs text-tx3">
            <Wifi size={14} className="text-accent" />
            <span>FTTH Ready</span>
          </div>
        </div>
      </div>

      {/* Right: Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-y-auto">
        {/* Mobile background effects */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none lg:hidden">
          <div className="absolute inset-0 auth-dot-grid opacity-40" />
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-accent/5 rounded-full blur-3xl auth-blob" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/5 rounded-full blur-3xl auth-blob-slow" />
        </div>

        {/* Mobile logo (visible only on mobile, above form) */}
        <div className="lg:hidden fixed top-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          <div className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden',
            logoUrl ? 'bg-white p-1.5' : 'bg-accent/15 glow-accent',
          )}>
            {logoUrl ? <img src={logoUrl} alt={brandName} className="w-full h-full object-contain" /> : <FontAwesomeIcon icon={faTowerBroadcast} className="text-accent" style={{ fontSize: 20 }} />}
          </div>
          <h1 className="text-lg font-bold font-display">{brandName}</h1>
        </div>

        <div className="relative w-full max-w-md stagger-in mt-20 lg:mt-0" style={delayStyle(80)}>
          {children}
        </div>
      </div>
    </div>
  );
}
