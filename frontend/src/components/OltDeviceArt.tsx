import { useState } from 'react';
import { cn } from '../lib/utils';

/**
 * Ilustrasi perangkat OLT — gambar SVG orisinal (bukan foto/logo vendor) yang
 * dipilih dari kelas perangkat (sasis besar / sasis mini / box 1U) berdasarkan
 * vendor + model. Jumlah port PON & LED status mengikuti data OLT.
 * Bila admin mengunggah foto sendiri (image_url), foto itu yang ditampilkan.
 */

export type OltDeviceClass = 'chassis-large' | 'chassis-mini' | 'box';

const LARGE = [
  /\bc300\b/, /\bc600\b/, /\bc650\b/, /c300/, /c600/, /c650/,
  /ma5800-?x(7|15|17)/, /ma56(80|83)t/,
  /an5516-?0?(1|6)\b/, /an6000-?(15|17)/,
];
const MINI = [
  /c320/, /c610/, /c620/,
  /ma5608t/, /ma5800-?x2/,
  /an5516-?0?4\b/, /an6000-?(2|3)\b/,
];

export function oltDeviceClass(vendor?: string | null, model?: string | null): OltDeviceClass {
  const m = `${vendor || ''} ${model || ''}`.toLowerCase().replace(/\s+/g, ' ');
  if (LARGE.some(r => r.test(m))) return 'chassis-large';
  if (MINI.some(r => r.test(m))) return 'chassis-mini';
  // Vendor ZTE tanpa model dikenal → anggap C320 (OLT paling umum di NMS ini)
  if (!model && (vendor || 'zte').toLowerCase() === 'zte') return 'chassis-mini';
  return 'box';
}

/** Jumlah port PON untuk box 1U: dari angka model (4/8/16), lalu kartu, lalu 8. */
export function oltPonCount(model?: string | null, cards?: { total_ports?: number }[]): number {
  const groups = (model || '').match(/\d+/g);
  const last = groups?.[groups.length - 1];
  if (last) {
    for (const v of [Number(last), Number(last.slice(-2))]) if ([2, 4, 8, 16].includes(v)) return v;
  }
  const sum = (cards || []).reduce((a, c) => a + (c.total_ports || 0), 0);
  if (sum > 0) return Math.min(16, sum);
  return 8;
}

type Props = {
  vendor?: string | null;
  model?: string | null;
  cards?: { total_ports?: number; ports_up?: number }[];
  online: boolean;
  problems?: boolean;
  imageUrl?: string | null;
  className?: string;
  title?: string;
};

export function OltDeviceArt({ vendor, model, cards, online, problems, imageUrl, className, title }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const label = title || [vendor?.toUpperCase(), model].filter(Boolean).join(' ') || 'OLT';
  if (imageUrl && broken !== imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={label}
        loading="lazy"
        onError={() => setBroken(imageUrl)}
        className={cn('olt-art object-contain', className)}
      />
    );
  }
  const cls = oltDeviceClass(vendor, model);
  const led = !online ? 'var(--lp-crit)' : problems ? 'var(--lp-warn)' : 'var(--lp-ok)';
  return (
    <svg
      viewBox="0 0 120 72"
      role="img"
      aria-label={label}
      className={cn('olt-art', !online && 'is-offline', className)}
    >
      <title>{label}</title>
      {cls === 'chassis-large' && <ChassisLarge led={led} cards={cards} online={online} />}
      {cls === 'chassis-mini' && <ChassisMini led={led} cards={cards} online={online} />}
      {cls === 'box' && <Box led={led} pon={oltPonCount(model, cards)} online={online} />}
    </svg>
  );
}

const BODY = { fill: 'var(--olt-body)', stroke: 'var(--olt-edge)', strokeWidth: 1 } as const;
const SLOT = { fill: 'var(--olt-slot)', stroke: 'var(--olt-edge)', strokeWidth: 0.6 } as const;

function portFill(i: number, up: number, online: boolean) {
  if (!online) return 'var(--olt-port)';
  return i < up ? 'var(--lp-ok)' : 'var(--olt-port)';
}

/** Box 1U: panel depan dengan sangkar SFP PON + uplink. */
function Box({ led, pon, online }: { led: string; pon: number; online: boolean }) {
  const rows = pon > 8 ? 2 : 1;
  const perRow = Math.ceil(pon / rows);
  const x0 = 24, x1 = 92;
  const w = Math.min(7, (x1 - x0) / perRow - 1.2);
  const step = (x1 - x0) / perRow;
  const ports = Array.from({ length: pon }, (_, i) => {
    const r = Math.floor(i / perRow), c = i % perRow;
    const y = rows === 1 ? 32 : 28.5 + r * 7.5;
    return <rect key={i} x={x0 + c * step + (step - w) / 2} y={y} width={w} height={rows === 1 ? 8 : 6} rx={0.8}
      fill="var(--olt-port)" stroke="var(--olt-edge)" strokeWidth={0.5} />;
  });
  return (
    <g>
      {/* telinga rak */}
      <rect x={1} y={25} width={6} height={22} rx={1} {...BODY} />
      <rect x={113} y={25} width={6} height={22} rx={1} {...BODY} />
      <rect x={6} y={24} width={108} height={24} rx={2.5} {...BODY} />
      <rect x={6} y={24} width={108} height={3} rx={1.5} fill="var(--olt-sheen)" />
      {/* LED */}
      <circle cx={13} cy={32} r={1.8} fill={led} className={online ? 'olt-led' : undefined} />
      <circle cx={18} cy={32} r={1.8} fill={online ? 'var(--lp-ok)' : 'var(--olt-port)'} />
      <circle cx={13} cy={39} r={1.4} fill="var(--olt-port)" />
      <circle cx={18} cy={39} r={1.4} fill={online ? 'var(--lp-cyan)' : 'var(--olt-port)'} />
      {ports}
      {/* uplink */}
      <rect x={96} y={30} width={7} height={11} rx={0.8} fill="var(--olt-slot)" stroke="var(--lp-cyan)" strokeWidth={0.7} strokeOpacity={0.7} />
      <rect x={105} y={30} width={7} height={11} rx={0.8} fill="var(--olt-slot)" stroke="var(--lp-cyan)" strokeWidth={0.7} strokeOpacity={0.7} />
    </g>
  );
}

/** Sasis mini (mis. C320 / MA5608T): 2 slot kartu horizontal + modul kipas samping. */
function ChassisMini({ led, cards, online }: { led: string; cards?: Props['cards']; online: boolean }) {
  const slots = [0, 1];
  return (
    <g>
      <rect x={1} y={13} width={6} height={46} rx={1} {...BODY} />
      <rect x={113} y={13} width={6} height={46} rx={1} {...BODY} />
      <rect x={6} y={12} width={108} height={48} rx={3} {...BODY} />
      <rect x={6} y={12} width={108} height={3} rx={1.5} fill="var(--olt-sheen)" />
      {/* kartu kontrol / power di kiri */}
      <rect x={10} y={18} width={14} height={38} rx={1.2} {...SLOT} />
      <circle cx={17} cy={24} r={1.8} fill={led} className={online ? 'olt-led' : undefined} />
      <circle cx={17} cy={30} r={1.4} fill={online ? 'var(--lp-ok)' : 'var(--olt-port)'} />
      <rect x={13} y={40} width={8} height={5} rx={0.6} fill="var(--olt-port)" />
      <rect x={13} y={47} width={8} height={5} rx={0.6} fill="var(--olt-port)" />
      {/* slot kartu PON */}
      {slots.map(s => {
        const card = cards?.[s];
        const total = Math.min(16, card?.total_ports || (s === 0 ? 16 : 0));
        const up = card?.ports_up || 0;
        const y = 18 + s * 19.5;
        return (
          <g key={s}>
            <rect x={27} y={y} width={68} height={18} rx={1.2} {...SLOT} />
            {total === 0
              ? <rect x={31} y={y + 7} width={60} height={4} rx={1} fill="var(--olt-port)" opacity={0.5} />
              : Array.from({ length: total }, (_, i) => {
                const r = Math.floor(i / 8), c = i % 8;
                return <rect key={i} x={30.5 + c * 7.6} y={y + 3 + r * 6.5} width={5.4} height={5} rx={0.6}
                  fill={portFill(i, up, online)} fillOpacity={i < up && online ? 0.85 : 1}
                  stroke="var(--olt-edge)" strokeWidth={0.4} />;
              })}
          </g>
        );
      })}
      {/* modul kipas */}
      <rect x={98} y={18} width={12} height={38} rx={1.2} {...SLOT} />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={100.5} x2={107.5} y1={21 + i * 4} y2={21 + i * 4} stroke="var(--olt-edge)" strokeWidth={0.9} />
      ))}
    </g>
  );
}

/** Sasis besar (mis. C300/C600/MA5800-X7): kartu vertikal + baki kipas bawah. */
function ChassisLarge({ led, cards, online }: { led: string; cards?: Props['cards']; online: boolean }) {
  const n = 10;
  const x0 = 33, w = 54 / n;
  return (
    <g>
      <rect x={30} y={2} width={60} height={68} rx={3} {...BODY} />
      <rect x={30} y={2} width={60} height={3} rx={1.5} fill="var(--olt-sheen)" />
      <circle cx={36} cy={8.5} r={1.8} fill={led} className={online ? 'olt-led' : undefined} />
      <circle cx={41} cy={8.5} r={1.4} fill={online ? 'var(--lp-ok)' : 'var(--olt-port)'} />
      <rect x={60} y={7} width={26} height={3} rx={1} fill="var(--olt-slot)" />
      {Array.from({ length: n }, (_, s) => {
        const card = cards?.[s];
        const filled = !!card || s < 2;
        const up = card?.ports_up || 0;
        const x = x0 + s * w;
        return (
          <g key={s}>
            <rect x={x + 0.3} y={13} width={w - 0.6} height={40} rx={0.6} {...SLOT} opacity={filled ? 1 : 0.55} />
            {filled && Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x={x + w / 2 - 1.4} y={17 + i * 4.3} width={2.8} height={2.8} rx={0.4}
                fill={portFill(i, up, online)} />
            ))}
          </g>
        );
      })}
      {/* baki kipas */}
      <rect x={33} y={56} width={54} height={11} rx={1.2} {...SLOT} />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={36 + i * 4.2} x2={36 + i * 4.2} y1={58.5} y2={64.5} stroke="var(--olt-edge)" strokeWidth={0.9} />
      ))}
    </g>
  );
}
