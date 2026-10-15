import { type ReactNode } from 'react';
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
  { icon: faBolt, title: 'Monitoring Optik Real-time', desc: 'Status ONU, RX/TX power dBm, dan grafik trafik live' },
  { icon: faTowerBroadcast, title: 'Multi-Vendor OLT Support', desc: 'ZTE C320/C300/C600, HSGQ, Raisecom, EPON/GPON' },
  { icon: faServer, title: 'Provisioning & Template', desc: 'Registrasi ZTE, FiberHome, Huawei & Nokia VEIP via CLI/SNMP' },
  { icon: faShieldHalved, title: 'Topologi & Infrastruktur FTTH', desc: 'Pemetaan OTB, ODC, JC, ODP, serta kalkulasi redaman jalur' },
];

export function AuthLayout({ children, brandName, logoUrl }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)] text-tx1">
      {/* Left: Visual Panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 border-r border-brd bg-surface">
        {/* Subtle top-left optical radial highlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(720px 420px at 15% 12%, rgba(14, 165, 233, 0.08), transparent 70%)',
          }}
        />

        {/* Top: Logo + Brand */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className={cn(
                'relative w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden border border-brd',
                logoUrl ? 'bg-white p-1.5' : 'bg-accent/10',
              )}>
                {logoUrl ? <img src={logoUrl} alt={brandName} className="w-full h-full object-contain" /> : <FontAwesomeIcon icon={faTowerBroadcast} className="text-accent" style={{ fontSize: 20 }} />}
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold font-display tracking-tight">{brandName}</h1>
              <p className="text-xs text-tx3">FTTH & OLT Operations Console</p>
            </div>
          </div>
        </div>

        {/* Middle: Hero content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md">
          <h2 className="text-3xl font-bold font-display leading-tight mb-3 text-tx1">
            Manajemen Infrastruktur FTTH &amp; OLT Terpusat
          </h2>
          <p className="text-sm text-tx2 leading-relaxed mb-8">
            Pantau redaman optik ONU secara real-time, eksekusi provisioning GPON/EPON, dan petakan distribusi jalur fiber dari satu konsol operasi.
          </p>

          {/* Feature highlights */}
          <div className="space-y-3">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3 p-3 rounded-lg bg-glass/60 border border-brd">
                <div className="icon-badge w-9 h-9 flex-shrink-0 mt-0.5">
                  <FontAwesomeIcon icon={f.icon} style={{ fontSize: 14 }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-tx1">{f.title}</p>
                  <p className="text-xs text-tx3 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Status footer */}
        <div className="relative z-10 pt-4 border-t border-brd flex items-center justify-between text-xs text-tx3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span>SNMP &amp; Telnet Collector Ready</span>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <Wifi size={13} className="text-accent" />
            <span>GPON · EPON · TR-069</span>
          </div>
        </div>
      </div>

      {/* Right: Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-y-auto">
        {/* Mobile logo (visible only on mobile, above form) */}
        <div className="lg:hidden fixed top-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          <div className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden border border-brd',
            logoUrl ? 'bg-white p-1.5' : 'bg-accent/10',
          )}>
            {logoUrl ? <img src={logoUrl} alt={brandName} className="w-full h-full object-contain" /> : <FontAwesomeIcon icon={faTowerBroadcast} className="text-accent" style={{ fontSize: 18 }} />}
          </div>
          <h1 className="text-base font-bold font-display">{brandName}</h1>
        </div>

        <div className="relative w-full max-w-md mt-20 lg:mt-0">
          {children}
        </div>
      </div>
    </div>
  );
}
