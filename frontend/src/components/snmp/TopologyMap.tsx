import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import { Card, EmptyState, LoadingOverlay } from '../ui';
import { api, type TopoLink, type TopoNode } from '../../lib/api';
import { fmtBps, fmtSpeed } from '../../lib/snmpFormat';
import { cn } from '../../lib/utils';

type Pt = { x: number; y: number };

/** Tata letak gaya-pegas sederhana yang deterministik (posisi awal melingkar, tanpa acak),
 *  jadi peta tidak "melompat" tiap kali data diperbarui. */
function layout(nodes: TopoNode[], links: TopoLink[], w = 1000, h = 620): Record<string, Pt> {
  const n = nodes.length;
  const pos: Record<string, Pt> = {};
  if (n === 0) return pos;
  // Node terdaftar di lingkar dalam, perangkat luar di lingkar luar
  const inner = nodes.filter(x => !x.external), outer = nodes.filter(x => x.external);
  inner.forEach((nd, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, inner.length);
    pos[nd.id] = { x: w / 2 + Math.cos(a) * w * 0.18, y: h / 2 + Math.sin(a) * h * 0.18 };
  });
  outer.forEach((nd, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, outer.length) + 0.3;
    pos[nd.id] = { x: w / 2 + Math.cos(a) * w * 0.4, y: h / 2 + Math.sin(a) * h * 0.4 };
  });
  const k = Math.sqrt((w * h) / n) * 0.55;
  let temp = w / 8;
  for (let it = 0; it < 260; it++) {
    const disp: Record<string, Pt> = {};
    nodes.forEach(a => { disp[a.id] = { x: 0, y: 0 }; });
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos[nodes[i].id], b = pos[nodes[j].id];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = 0.1 * (i - j); dy = 0.1; d = Math.hypot(dx, dy); }
        const f = (k * k) / d;
        disp[nodes[i].id].x += (dx / d) * f; disp[nodes[i].id].y += (dy / d) * f;
        disp[nodes[j].id].x -= (dx / d) * f; disp[nodes[j].id].y -= (dy / d) * f;
      }
    }
    links.forEach(l => {
      const a = pos[l.source], b = pos[l.target];
      if (!a || !b) return;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      disp[l.source].x -= (dx / d) * f; disp[l.source].y -= (dy / d) * f;
      disp[l.target].x += (dx / d) * f; disp[l.target].y += (dy / d) * f;
    });
    nodes.forEach(nd => {
      const d = disp[nd.id];
      const len = Math.max(0.01, Math.hypot(d.x, d.y));
      const p = pos[nd.id];
      p.x += (d.x / len) * Math.min(len, temp);
      p.y += (d.y / len) * Math.min(len, temp);
      // tarikan lembut ke tengah agar komponen terpisah tidak terbang jauh
      p.x += (w / 2 - p.x) * 0.01; p.y += (h / 2 - p.y) * 0.01;
    });
    temp *= 0.97;
  }
  // Skala ulang ke kanvas dengan margin (label butuh ruang)
  const xs = nodes.map(nd => pos[nd.id].x), ys = nodes.map(nd => pos[nd.id].y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const mx = Math.min(140, w * 0.17), my = 50;
  const sx = maxX - minX > 1 ? (w - 2 * mx) / (maxX - minX) : 1;
  const sy = maxY - minY > 1 ? (h - 2 * my) / (maxY - minY) : 1;
  nodes.forEach(nd => {
    const p = pos[nd.id];
    pos[nd.id] = {
      x: maxX - minX > 1 ? mx + (p.x - minX) * sx : w / 2,
      y: maxY - minY > 1 ? my + (p.y - minY) * sy : h / 2,
    };
  });
  return pos;
}

const NODE_COLOR: Record<string, string> = {
  up: 'var(--color-success)', down: 'var(--color-danger)', warn: 'var(--color-warning)',
  unknown: 'var(--text-3)', disabled: 'var(--text-3)', external: 'var(--text-3)',
};

function linkColor(l: TopoLink) {
  if (l.oper_status && l.oper_status !== 'up') return 'var(--color-danger)';
  if (l.util_pct == null) return 'var(--text-3)';
  if (l.util_pct >= 80) return 'var(--color-danger)';
  if (l.util_pct >= 60) return 'var(--color-warning)';
  return 'var(--color-accent)';
}

function linkWidth(l: TopoLink) {
  const s = l.speed_mbps || 0;
  return s >= 10000 ? 4 : s >= 1000 ? 2.6 : 1.6;
}

export function TopologyMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showExternal, setShowExternal] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  // Layar sempit: kanvas tegak supaya label tetap terbaca (bukan peta lebar yang diperkecil)
  const [narrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const W = narrow ? 520 : 1000, Hh = narrow ? 640 : 620;
  const { data, isLoading } = useQuery({ queryKey: ['snmp-topology'], queryFn: api.snmpTopology, refetchInterval: 60_000 });

  const { nodes, links } = useMemo(() => {
    const ns = (data?.nodes || []).filter(n => showExternal || !n.external);
    const ids = new Set(ns.map(n => n.id));
    const ls = (data?.links || []).filter(l => ids.has(l.source) && ids.has(l.target));
    // perangkat terdaftar tanpa sambungan tetap ditampilkan (supaya terlihat belum terhubung)
    return { nodes: ns, links: ls };
  }, [data, showExternal]);
  // tata letak dihitung dari struktur saja (id node & link), bukan angka trafik yang berubah tiap poll
  const shape = nodes.map(n => n.id).join(',') + '|' + links.map(l => l.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pos = useMemo(() => layout(nodes, links, W, Hh), [shape, W, Hh]);
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const selected = links.find(l => l.id === sel) || null;

  if (isLoading) return <LoadingOverlay />;
  if (!data || data.links.length === 0) {
    return (
      <EmptyState icon={Network} title={t('topo.emptyTitle')} description={t('topo.emptyDesc')} />
    );
  }
  return (
    <div className="space-y-3">
      <Card bodyClassName="p-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-2 text-xs text-tx3">
          <label className="inline-flex items-center gap-2 text-tx2">
            <input type="checkbox" checked={showExternal} onChange={e => setShowExternal(e.target.checked)} />
            {t('topo.showExternal')}
          </label>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 h-[3px] rounded" style={{ background: 'var(--color-accent)' }} />{t('topo.legendOk')}</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 h-[3px] rounded" style={{ background: 'var(--color-warning)' }} />≥60%</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 h-[3px] rounded" style={{ background: 'var(--color-danger)' }} />{t('topo.legendBad')}</span>
          <span className="ml-auto">{t('topo.tapHint')}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto rounded-lg bg-glass" role="img" aria-label={t('topo.aria', { n: nodes.length, l: links.length })}>
          {links.map(l => {
            const a = pos[l.source], b = pos[l.target];
            if (!a || !b) return null;
            const down = !!l.oper_status && l.oper_status !== 'up';
            return (
              <g key={l.id} onClick={() => setSel(sel === l.id ? null : l.id)} className="cursor-pointer">
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={linkColor(l)} strokeWidth={linkWidth(l) + (sel === l.id ? 2 : 0)}
                  strokeDasharray={down ? '6 5' : undefined} strokeLinecap="round" opacity={sel && sel !== l.id ? 0.35 : 0.9} />
                {l.util_pct != null && !down && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize={13} fill="var(--text-2)"
                    stroke="var(--bg-surface)" strokeWidth={4} paintOrder="stroke">{Math.round(l.util_pct)}%</text>
                )}
              </g>
            );
          })}
          {nodes.map(n => {
            const p = pos[n.id];
            if (!p) return null;
            const r = n.external ? 9 : 14;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`}
                className={n.device_id ? 'cursor-pointer' : undefined}
                onClick={() => n.device_id && navigate(`/dashboard/devices/${n.device_id}`)}>
                <title>{[n.name, n.host, n.hardware].filter(Boolean).join(' · ')}</title>
                <circle r={r + 4} fill="var(--bg-surface)" />
                <circle r={r} fill={n.external ? 'var(--bg-surface)' : NODE_COLOR[n.status] || NODE_COLOR.unknown}
                  stroke={NODE_COLOR[n.status] || NODE_COLOR.unknown} strokeWidth={n.external ? 2 : 0}
                  strokeDasharray={n.external ? '3 3' : undefined} />
                <text y={r + 17} textAnchor="middle" fontSize={n.external ? 12 : 14} fontWeight={n.external ? 400 : 600}
                  fill={n.external ? 'var(--text-3)' : 'var(--text-1)'} stroke="var(--bg-surface)" strokeWidth={4} paintOrder="stroke">
                  {n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name}
                </text>
              </g>
            );
          })}
        </svg>
        {selected && <LinkDetail l={selected} a={byId[selected.source]} b={byId[selected.target]} />}
      </Card>
      <Card title={t('topo.links', { n: links.length })} bodyClassName="p-3">
        <ul className="divide-y divide-brd">
          {links.map(l => (
            <li key={l.id}>
              <button type="button" onClick={() => setSel(l.id)} className={cn('w-full text-left py-2 px-1 rounded-md hover:bg-glass', sel === l.id && 'bg-glass')}>
                <LinkLine l={l} a={byId[l.source]} b={byId[l.target]} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function LinkLine({ l, a, b }: { l: TopoLink; a?: TopoNode; b?: TopoNode }) {
  const { t } = useTranslation();
  const down = !!l.oper_status && l.oper_status !== 'up';
  return (
    <span className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
      <span className="min-w-0 sm:w-[55%] text-tx1 break-words">
        {a?.name} <span className="text-tx3">{l.source_port.port}</span>
        <span className="text-tx3"> ↔ </span>
        {b?.name}{b?.external && <span className="text-xs text-tx3"> ({t('topo.unregistered')})</span>} <span className="text-tx3">{l.target_port.port}</span>
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tx2">
        {l.speed_mbps ? <span>{fmtSpeed(l.speed_mbps)}</span> : null}
        {down ? <span className="text-danger">{t('topo.linkDown')}</span> : <>
          {l.in_bps != null && <span>↓ {fmtBps(l.in_bps)}</span>}
          {l.out_bps != null && <span>↑ {fmtBps(l.out_bps)}</span>}
          {l.util_pct != null && <span className={l.util_pct >= 80 ? 'text-danger' : l.util_pct >= 60 ? 'text-warning' : ''}>{l.util_pct}%</span>}
        </>}
        <span className="text-tx3 uppercase">{l.protocols.join('/')}</span>
      </span>
    </span>
  );
}

function LinkDetail({ l, a, b }: { l: TopoLink; a?: TopoNode; b?: TopoNode }) {
  return (
    <div className="mt-2 p-3 rounded-lg border border-brd bg-surface">
      <LinkLine l={l} a={a} b={b} />
      {(l.source_port.alias || l.target_port.alias) && (
        <p className="text-xs text-tx3 mt-1">{[l.source_port.alias, l.target_port.alias].filter(Boolean).join(' · ')}</p>
      )}
    </div>
  );
}
