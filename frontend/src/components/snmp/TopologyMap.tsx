import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import { Button, Card, EmptyState, LoadingOverlay, Select } from '../ui';
import { toast } from '../Toast';
import { useHasPerm } from '../../hooks/useHasPerm';
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

export function TopologyMap({ deviceId }: { deviceId?: number } = {}) {
  const { t } = useTranslation();
  const canEdit = useHasPerm()('settings_ip_olts');
  const navigate = useNavigate();
  const [showExternal, setShowExternal] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [group, setGroup] = useState<number | undefined>(undefined);
  const scope = deviceId ?? group;
  // Layar sempit: kanvas tegak supaya label tetap terbaca (bukan peta lebar yang diperkecil)
  const [narrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const W = narrow ? 520 : 1000, Hh = narrow ? 640 : 620;
  const { data, isLoading } = useQuery({ queryKey: ['snmp-topology', scope ?? 'all'], queryFn: () => api.snmpTopology(scope), refetchInterval: 60_000 });
  // daftar jalur terpisah selalu diambil dari peta lengkap (tanpa filter) supaya pemilih tidak hilang saat satu jalur dipilih
  const all = useQuery({ queryKey: ['snmp-topology', 'all'], queryFn: () => api.snmpTopology(), refetchInterval: 60_000, enabled: deviceId == null });
  const groups = all.data?.groups || [];
  const picker = deviceId == null && groups.length > 1 ? (
    <Select wrapperClassName="sm:w-72" label={t('topo.path')} value={group ? String(group) : ''} onChange={e => { setGroup(e.target.value ? Number(e.target.value) : undefined); setSel(null); }}>
      <option value="">{t('topo.pathAll', { n: groups.length })}</option>
      {groups.map(g => <option key={g.device_id} value={g.device_id}>{t('topo.pathItem', { name: g.name, n: g.nodes })}</option>)}
    </Select>
  ) : null;

  const { nodes, links, deps } = useMemo(() => {
    const ns = (data?.nodes || []).filter(n => showExternal || !n.external);
    const ids = new Set(ns.map(n => n.id));
    const ls = (data?.links || []).filter(l => ids.has(l.source) && ids.has(l.target));
    // garis dependensi hanya untuk pasangan yang belum punya link fisik (LLDP) di antaranya
    const pair = new Set(ls.flatMap(l => [`${l.source}>${l.target}`, `${l.target}>${l.source}`]));
    const ds = (data?.deps || []).filter(d => ids.has(d.source) && ids.has(d.target) && !pair.has(`${d.source}>${d.target}`));
    // perangkat terdaftar tanpa sambungan tetap ditampilkan (supaya terlihat belum terhubung)
    return { nodes: ns, links: ls, deps: ds };
  }, [data, showExternal]);
  // tata letak dihitung dari struktur saja (id node & link), bukan angka trafik yang berubah tiap poll
  const shape = nodes.map(n => n.id).join(',') + '|' + links.map(l => l.id).join(',') + '|' + deps.map(d => d.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pos = useMemo(() => layout(nodes, [...links, ...deps] as unknown as TopoLink[], W, Hh), [shape, W, Hh]);
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const selected = links.find(l => l.id === sel) || null;

  if (isLoading) return <LoadingOverlay />;
  if (!data || (data.links.length === 0 && (data.deps?.length ?? 0) === 0)) {
    return (
      <div className="space-y-3">
        {picker}
        <EmptyState icon={Network} title={t('topo.emptyTitle')} description={t('topo.emptyDesc')} />
        <OltLinks canEdit={canEdit} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {picker}
      <Card bodyClassName="p-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-2 text-xs text-tx3">
          <label className="inline-flex items-center gap-2 text-tx2">
            <input type="checkbox" checked={showExternal} onChange={e => setShowExternal(e.target.checked)} />
            {t('topo.showExternal')}
          </label>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 h-[3px] rounded" style={{ background: 'var(--color-accent)' }} />{t('topo.legendOk')}</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 h-[3px] rounded" style={{ background: 'var(--color-warning)' }} />≥60%</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 h-[3px] rounded" style={{ background: 'var(--color-danger)' }} />{t('topo.legendBad')}</span>
          {deps.length > 0 && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: 'var(--text-3)' }} />{t('topo.legendDep')}</span>}
          {nodes.some(n => n.in_maintenance || n.rules_warn || n.rules_down) && <span>{t('topo.legendBadges')}</span>}
          {nodes.some(n => n.kind === 'olt') && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3.5 h-3.5 rounded-[3px] border-2" style={{ borderColor: 'var(--color-accent)' }} />{t('topo.legendOlt')}</span>}
          <span className="ml-auto">{t('topo.tapHint')}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto rounded-lg bg-glass" role="img" aria-label={t('topo.aria', { n: nodes.length, l: links.length })}>
          {deps.map(d => {
            const a = pos[d.source], b = pos[d.target];
            if (!a || !b) return null;
            return <line key={d.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="2 6" strokeLinecap="round" opacity={0.7} />;
          })}
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
                <title>{[n.name, n.host, n.hardware, n.in_maintenance ? t('snmpdep.badgeMaint') : '', n.rules_down ? `${t('snrule.st.down')}: ${n.rules_down}` : '', n.rules_warn ? `${t('snrule.st.warning')}: ${n.rules_warn}` : ''].filter(Boolean).join(' · ')}</title>
                <circle r={r + 4} fill="var(--bg-surface)" />
                {(n.rules_down || n.rules_warn) ? (
                  <circle r={r + 6} fill="none" strokeWidth={3} stroke={n.rules_down ? 'var(--color-danger)' : 'var(--color-warning)'} />
                ) : null}
                {n.kind === 'olt' ? (
                  <g>
                    <rect x={-r - 3} y={-r + 1} width={(r + 3) * 2} height={(r - 1) * 2} rx={5} fill={NODE_COLOR[n.status] || NODE_COLOR.unknown} />
                    <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--bg-surface)">OLT</text>
                  </g>
                ) : (
                  <circle r={r} fill={n.external ? 'var(--bg-surface)' : NODE_COLOR[n.status] || NODE_COLOR.unknown}
                    stroke={NODE_COLOR[n.status] || NODE_COLOR.unknown} strokeWidth={n.external ? 2 : 0}
                    strokeDasharray={n.external ? '3 3' : undefined} />
                )}
                {n.in_maintenance && (
                  <g transform={`translate(${r + 2},${-r - 2})`}>
                    <circle r={8} fill="var(--color-warning)" stroke="var(--bg-surface)" strokeWidth={2} />
                    <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--bg-surface)">M</text>
                  </g>
                )}
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
      <OltLinks canEdit={canEdit} />
      <Card title={t('topo.links', { n: links.length })} bodyClassName="p-3">
        <ul className="divide-y divide-line">
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
    <div className="mt-2 p-3 rounded-lg border border-line bg-surface">
      <LinkLine l={l} a={a} b={b} />
      {(l.source_port.alias || l.target_port.alias) && (
        <p className="text-xs text-tx3 mt-1">{[l.source_port.alias, l.target_port.alias].filter(Boolean).join(' · ')}</p>
      )}
    </div>
  );
}

const SRC_LABEL: Record<string, string> = { manual: 'topo.srcManual', arp: 'topo.srcArp', lldp: 'topo.srcLldp' };

/** Penautan OLT ↔ port: daftar (manual + terdeteksi otomatis) dan form tambah. OLT tidak mengirim LLDP,
 *  jadi bila tidak terdeteksi lewat ARP/MAC, tunjuk portnya di sini. */
function OltLinks({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['snmp-olt-links'], queryFn: api.snmpOltLinks });
  const [olt, setOlt] = useState('');
  const [dev, setDev] = useState('');
  const [port, setPort] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['snmp-olt-links'] }); qc.invalidateQueries({ queryKey: ['snmp-topology'] }); };
  const add = useMutation({
    mutationFn: () => api.snmpOltLinkAdd({ olt_id: Number(olt), device_id: Number(dev), port_id: port ? Number(port) : null }),
    onSuccess: () => { refresh(); setPort(''); toast.success(t('topo.oltSaved')); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.snmpOltLinkDelete(id),
    onSuccess: () => { refresh(); toast.success(t('topo.oltRemoved')); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data || (data.olts.length === 0 && data.links.length === 0)) return null;
  const ports = data.devices.find(d => String(d.id) === dev)?.ports || [];
  return (
    <Card title={t('topo.oltTitle')} bodyClassName="p-3 space-y-3">
      <p className="text-xs text-tx3">{t('topo.oltHint')}</p>
      {data.links.length > 0 && (
        <ul className="divide-y divide-line">
          {data.links.map((l, i) => (
            <li key={`${l.olt_id}-${l.device_id}-${l.port_id}-${i}`} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="flex-1 min-w-0 break-words text-tx1">
                {l.olt_name} <span className="text-tx3">↔</span> {l.device_name} <span className="text-tx3">{l.port}</span>
              </span>
              <span className="text-[11px] text-tx3">{t(SRC_LABEL[l.source])}</span>
              {canEdit && l.id != null && (
                <Button variant="ghost" onClick={() => del.mutate(l.id as number)}>{t('common.delete')}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <Select label={t('topo.oltPick')} value={olt} onChange={e => setOlt(e.target.value)}>
            <option value="">—</option>
            {data.olts.map(o => <option key={o.id} value={o.id}>{o.name} ({o.ip})</option>)}
          </Select>
          <Select label={t('topo.devPick')} value={dev} onChange={e => { setDev(e.target.value); setPort(''); }}>
            <option value="">—</option>
            {data.devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label={t('topo.portPick')} value={port} onChange={e => setPort(e.target.value)} disabled={!dev}>
            <option value="">{t('topo.portAny')}</option>
            {ports.map(p => <option key={p.id} value={p.id}>{p.name}{p.alias ? ` — ${p.alias}` : ''}</option>)}
          </Select>
          <Button onClick={() => add.mutate()} disabled={!olt || !dev || add.isPending}>{t('topo.oltAdd')}</Button>
        </div>
      )}
    </Card>
  );
}
