import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pause, Play, Radio } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtBps } from '../../lib/snmpFormat';
import { cn } from '../../lib/utils';

/** Dua seri (masuk/keluar) dengan skala bersama mulai 0 — untuk grafik mini 24 jam di daftar port. */
export function PortSpark({ inV, outV, className }: { inV?: (number | null)[]; outV?: (number | null)[]; className?: string }) {
  const n = Math.max(inV?.length || 0, outV?.length || 0);
  const all = [...(inV || []), ...(outV || [])].filter((v): v is number => v != null);
  if (n < 2 || all.length === 0) return <span className={cn('block h-7 w-28 rounded bg-glass', className)} aria-hidden="true" />;
  const max = Math.max(...all) || 1;
  const W = 112, H = 28;
  const path = (vals?: (number | null)[]) => {
    let d = '';
    let pen = false;
    (vals || []).forEach((v, i) => {
      if (v == null) { pen = false; return; }
      const x = (i / (n - 1)) * W, y = H - 1 - (v / max) * (H - 3);
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('block h-7 w-28', className)} aria-hidden="true" preserveAspectRatio="none">
      <path d={path(inV)} fill="none" stroke="var(--color-success)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      <path d={path(outV)} fill="none" stroke="var(--color-info)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Pt = { t: number; in: number; out: number; pin: number | null; pout: number | null };
type Raw = { ts: number; in: number; out: number; pin: number | null; pout: number | null; hc: boolean };

const INTERVAL_MS = 3000;
const MAX_POINTS = 60;            // 3 menit terakhir
const AUTO_STOP_MS = 10 * 60_000; // berhenti sendiri supaya tidak membebani perangkat bila tab lupa ditutup

function delta(a: number, b: number, hc: boolean) {
  const d = b - a;
  if (d >= 0) return d;
  return hc ? null : d + 2 ** 32; // counter 32-bit berputar; 64-bit mundur = reset
}

/** Trafik port waktu nyata: membaca counter langsung dari perangkat tiap 3 detik (hanya SNMP GET). */
export function PortLive({ portId, speedMbps }: { portId: number; speedMbps: number | null }) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(true);
  const [points, setPoints] = useState<Pt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [oper, setOper] = useState<string>('');
  const prev = useRef<Raw | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!running) return;
    let alive = true;
    startedAt.current = Date.now();
    const tick = async () => {
      if (document.hidden) return;
      if (Date.now() - startedAt.current > AUTO_STOP_MS) { setRunning(false); return; }
      try {
        const r = await api.snmpPortLive(portId);
        if (!alive) return;
        setError(null);
        setOper(r.oper);
        const cur: Raw = { ts: r.ts, in: r.in, out: r.out, pin: r.pin, pout: r.pout, hc: r.hc };
        const p = prev.current;
        prev.current = cur;
        if (!p) return;
        const secs = (cur.ts - p.ts) / 1000;
        if (secs <= 0) return;
        const di = delta(p.in, cur.in, cur.hc), dout = delta(p.out, cur.out, cur.hc);
        if (di == null || dout == null) return;
        const dpi = p.pin != null && cur.pin != null ? delta(p.pin, cur.pin, cur.hc) : null;
        const dpo = p.pout != null && cur.pout != null ? delta(p.pout, cur.pout, cur.hc) : null;
        const pt: Pt = {
          t: cur.ts, in: (di * 8) / secs, out: (dout * 8) / secs,
          pin: dpi != null ? dpi / secs : null, pout: dpo != null ? dpo / secs : null,
        };
        setPoints(list => [...list, pt].slice(-MAX_POINTS));
      } catch (e) {
        if (!alive) return;
        const msg = (e as Error).message || '';
        if (!/terlalu cepat|429/i.test(msg)) setError(msg);
      }
    };
    tick();
    const id = window.setInterval(tick, INTERVAL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [running, portId]);

  const last = points[points.length - 1];
  const cap = speedMbps ? speedMbps * 1e6 : 0;
  const util = last && cap ? Math.round((Math.max(last.in, last.out) / cap) * 1000) / 10 : null;
  const fmtPps = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}k pps` : `${Math.round(v)} pps`);

  return (
    <div className="rounded-lg border border-line p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-tx1">
          <Radio size={14} className={cn(running && !error ? 'text-success animate-pulse' : 'text-tx3')} />
          {t('live.title')}
        </span>
        <span className="text-xs text-tx3">{running ? t('live.every', { s: INTERVAL_MS / 1000 }) : t('live.paused')}</span>
        <button type="button" onClick={() => { prev.current = null; setRunning(r => !r); }}
          className="ml-auto inline-flex items-center gap-1 text-xs text-accent">
          {running ? <><Pause size={13} />{t('live.pause')}</> : <><Play size={13} />{t('live.resume')}</>}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-danger break-words">{t('live.error')} {error}</p>
      ) : !last ? (
        <p className="text-xs text-tx3">{running ? t('live.reading') : t('live.paused')}</p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
          <span><span className="text-success">↓</span> <b className="text-tx1">{fmtBps(last.in)}</b> <span className="text-xs text-tx3">{fmtPps(last.pin)}</span></span>
          <span><span className="text-info">↑</span> <b className="text-tx1">{fmtBps(last.out)}</b> <span className="text-xs text-tx3">{fmtPps(last.pout)}</span></span>
          {util != null && <span className={cn('text-xs self-center', util >= 80 ? 'text-danger' : util >= 60 ? 'text-warning' : 'text-tx3')}>{t('live.util', { n: util })}</span>}
          {oper && oper !== 'up' && <span className="text-xs self-center text-danger">{t(`dev.oper.${oper}`, { defaultValue: oper })}</span>}
        </div>
      )}
      <div className="h-32">
        {points.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis width={56} tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={{ stroke: 'var(--chart-grid)' }} tickFormatter={v => fmtBps(v)} allowDecimals={false} />
              <Tooltip formatter={v => fmtBps(Number(v))} labelFormatter={l => new Date(Number(l)).toLocaleTimeString()}
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', fontSize: 12 }} />
              <Area type="monotone" dataKey="in" name={t('dev.in')} stroke="var(--color-success)" fill="var(--color-success)" fillOpacity={0.15} isAnimationActive={false} />
              <Area type="monotone" dataKey="out" name={t('dev.out')} stroke="var(--color-info)" fill="var(--color-info)" fillOpacity={0.15} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
