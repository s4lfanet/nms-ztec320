import { type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTowerBroadcast } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

interface AuthLayoutProps {
  children: ReactNode;
  brandName: string;
  logoUrl?: string | null;
  onBack?: () => void;
}

/* Kode warna serat TIA-598 (biru, oranye, hijau, cokelat, abu, putih, merah,
   hitam) — warna yang dikenal teknisi dari core kabel. Tiap serat menuju form
   login; cahaya melintas pelan di dalamnya (satu-satunya animasi halaman). */
const FIBERS = ['#2f6fe0', '#f28c28', '#27a845', '#8b5a2b', '#8a97a8', '#e9eef5', '#d93636', '#3b4250'];

function FiberField({ className }: { className?: string }) {
  const n = FIBERS.length;
  return (
    <svg className={cn('fiber-field', className)} viewBox="0 0 1000 800" preserveAspectRatio="none" aria-hidden>
      {FIBERS.map((color, i) => {
        const y = 70 + (i * 660) / (n - 1);
        const d = `M -20 ${y} C 380 ${y}, 620 ${400 + (y - 400) * 0.22}, 1010 ${400 + (y - 400) * 0.04}`;
        return (
          <g key={color}>
            <path d={d} className="fiber-core" stroke={color} />
            <path d={d} className="fiber-light" style={{ animationDelay: `${(i * 0.9) % 6.3}s`, animationDuration: `${6 + (i % 3)}s` }} />
          </g>
        );
      })}
    </svg>
  );
}

function BrandMark({ brandName, logoUrl, size = 'lg' }: { brandName: string; logoUrl?: string | null; size?: 'lg' | 'sm' }) {
  return (
    <div className={cn(
      'rounded-xl flex items-center justify-center overflow-hidden border border-brd shrink-0',
      size === 'lg' ? 'w-11 h-11' : 'w-10 h-10',
      logoUrl ? 'bg-white p-1.5' : 'bg-accent/10',
    )}>
      {logoUrl
        ? <img src={logoUrl} alt={brandName} className="w-full h-full object-contain" />
        : <FontAwesomeIcon icon={faTowerBroadcast} className="text-accent" style={{ fontSize: size === 'lg' ? 20 : 18 }} />}
    </div>
  );
}

export function AuthLayout({ children, brandName, logoUrl }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="auth-shell min-h-screen relative overflow-hidden bg-[var(--bg-primary)] text-tx1">
      <FiberField className="hidden lg:block" />
      <FiberField className="lg:hidden fiber-field-mobile" />

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Kiri: merek + pesan singkat, di atas serat */}
        <div className="hidden lg:flex flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <BrandMark brandName={brandName} logoUrl={logoUrl} />
            <div>
              <div className="text-lg font-bold font-display tracking-tight">{brandName}</div>
              <div className="text-xs text-tx3">{t('login.tagline')}</div>
            </div>
          </div>
          <div className="auth-copy max-w-lg">
            <h1 className="auth-hero font-display">{t('login.hero')}</h1>
            <p className="text-base text-tx2 leading-relaxed mt-4 max-w-md">{t('login.heroSub')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-tx3">
            <span className="live-pulse-dot" aria-hidden />
            <span>{t('login.footerReady')}</span>
          </div>
        </div>

        {/* Kanan: form */}
        <div className="flex flex-col items-center justify-center p-4 sm:p-6 md:p-10">
          <div className="lg:hidden flex flex-col items-center gap-2 mb-8 mt-6">
            <BrandMark brandName={brandName} logoUrl={logoUrl} size="sm" />
            <div className="text-base font-bold font-display">{brandName}</div>
            <div className="text-xs text-tx3 text-center max-w-xs">{t('login.tagline')}</div>
          </div>
          <div className="auth-panel relative w-full max-w-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
