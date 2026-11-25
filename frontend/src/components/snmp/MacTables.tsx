import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { Button, Card, Tabs } from '../ui';
import { toast } from '../Toast';
import { api, type SnmpMacRow, type SnmpPortMac } from '../../lib/api';
import { cn, timeAgo } from '../../lib/utils';

const PAGE = 200;

/** Tanda "masih terlihat" / "terakhir terlihat X lalu". */
function Seen({ active, last }: { active: boolean; last: string | null }) {
  const { t } = useTranslation();
  return active
    ? <span className="inline-flex items-center gap-1 text-success"><span className="w-1.5 h-1.5 rounded-full bg-success" />{t('mact.active')}</span>
    : <span className="text-tx3">{last ? t('mact.lastSeen', { ago: timeAgo(last) }) : '—'}</span>;
}

function PortLabel({ port, alias }: { port: string; alias: string }) {
  if (!port) return <span className="text-tx3">—</span>;
  return <span className="min-w-0 truncate"><span className="text-tx1">{port}</span>{alias && <span className="text-tx3"> · {alias}</span>}</span>;
}

/** Satu baris: kartu di HP, kolom sejajar mulai md. */
function MacRow({ mac, ip, port, alias, vlan, active, last, device }: {
  mac: string; ip?: string; port: string; alias: string; vlan?: number | null; active: boolean; last: string | null;
  device?: { id: number; name: string };
}) {
  const { t } = useTranslation();
  return (
    <li className={cn('py-2.5 grid gap-x-4 gap-y-0.5 text-sm md:items-center',
      device ? 'grid-cols-2 md:grid-cols-[1.2fr_1fr_1.4fr_1.6fr_0.6fr_1fr]' : 'grid-cols-2 md:grid-cols-[1.2fr_1fr_1.8fr_0.6fr_1fr]',
      !active && 'opacity-70')}>
      <span className="font-mono text-tx1 truncate">{mac || '—'}</span>
      <span className="font-mono text-tx2 truncate text-right md:text-left">{ip || <span className="text-tx3">—</span>}</span>
      {device && (
        <Link to={`/dashboard/devices/${device.id}?tab=ports`} className="text-accent hover:underline truncate col-span-2 md:col-span-1">{device.name}</Link>
      )}
      <span className="flex min-w-0 col-span-2 md:col-span-1"><PortLabel port={port} alias={alias} /></span>
      <span className="text-xs text-tx3">{vlan != null ? t('mact.vlan', { v: vlan }) : ''}</span>
      <span className="text-xs text-right md:text-left"><Seen active={active} last={last} /></span>
    </li>
  );
}

function Head({ cols }: { cols: string[] }) {
  return (
    <div className={cn('hidden md:grid gap-x-4 pb-2 border-b border-brd text-[11px] text-tx3',
      cols.length === 6 ? 'grid-cols-[1.2fr_1fr_1.4fr_1.6fr_0.6fr_1fr]' : 'grid-cols-[1.2fr_1fr_1.8fr_0.6fr_1fr]')}>
      {cols.map(c => <span key={c}>{c}</span>)}
    </div>
  );
}

/** Tab ARP/MAC di detail perangkat. */
export function DeviceTables({ deviceId, canEdit }: { deviceId: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['snmp-tables', deviceId], queryFn: () => api.snmpDeviceTables(deviceId), refetchInterval: 120_000 });
  const [view, setView] = useState<'fdb' | 'arp' | null>(null);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const cur = view ?? (data && data.fdb.length === 0 && data.arp.length > 0 ? 'arp' : 'fdb');

  const rows = useMemo(() => {
    if (!data) return [];
    const list: SnmpMacRow[] = cur === 'fdb' ? data.fdb : data.arp;
    const s = q.trim().toLowerCase();
    const hex = s.replace(/[^0-9a-f]/g, '');
    return list.filter(r => (!onlyActive || r.active) && (!s ||
      (hex.length >= 2 && r.mac.replace(/:/g, '').includes(hex)) || (r.ip || '').includes(s) ||
      `${r.port} ${r.port_alias} ${r.vlan ?? ''}`.toLowerCase().includes(s)));
  }, [data, cur, q, onlyActive]);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api.snmpDeviceTablesRefresh(deviceId);
      await qc.invalidateQueries({ queryKey: ['snmp-tables', deviceId] });
      toast.success(t('mact.refreshed', { note: r.note || '' }));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  if (isLoading || !data) return <div className="glass-card h-48 skeleton-shimmer" />;
  const activeCount = (l: SnmpMacRow[]) => l.filter(r => r.active).length;

  return (
    <Card
      title={t('mact.title')}
      action={canEdit && <Button variant="secondary" icon={<RefreshCw size={14} className={cn(busy && 'animate-spin')} />} loading={busy} onClick={refresh}>{t('mact.readNow')}</Button>}
    >
      <p className="text-xs text-tx3 mb-3">
        {data.tables_at ? t('mact.readAt', { ago: timeAgo(data.tables_at).toLowerCase() }) : t('mact.notRead')}
        {data.note && <> · {data.note}</>}
      </p>
      <Tabs active={cur} onChange={k => { setView(k as 'fdb' | 'arp'); setLimit(PAGE); }} tabs={[
        { key: 'fdb', label: t('mact.fdbTab', { n: activeCount(data.fdb) }) },
        { key: 'arp', label: t('mact.arpTab', { n: activeCount(data.arp) }) },
      ]} />
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center my-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" aria-hidden="true" />
          <input className="input-field w-full pl-9" value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder={t('mact.filter')} />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-tx2 shrink-0">
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />
          {t('mact.onlyActive')}
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-tx3 py-6 text-center">{(cur === 'fdb' ? data.fdb : data.arp).length === 0 ? t(cur === 'fdb' ? 'mact.emptyFdb' : 'mact.emptyArp') : t('mact.noMatch')}</p>
      ) : (
        <>
          <Head cols={['MAC', 'IP', t('mact.port'), 'VLAN', t('mact.status')]} />
          <ul className="divide-y divide-brd">
            {rows.slice(0, limit).map(r => (
              <MacRow key={`${r.mac}-${r.ip ?? ''}-${r.vlan ?? ''}`} mac={r.mac} ip={r.ip} port={r.port} alias={r.port_alias}
                vlan={r.vlan} active={r.active} last={r.last_seen} />
            ))}
          </ul>
          {rows.length > limit && (
            <div className="text-center mt-3">
              <Button variant="secondary" onClick={() => setLimit(l => l + PAGE)}>{t('mact.more', { n: rows.length - limit })}</Button>
            </div>
          )}
        </>
      )}
      {data.truncated && <p className="text-[11px] text-tx3 mt-2">{t('mact.truncated')}</p>}
    </Card>
  );
}

/** Tab "Cari MAC/IP" di halaman Monitoring SNMP — semua perangkat sekaligus. */
export function MacSearch() {
  const { t } = useTranslation();
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [term, setTerm] = useState(q);
  useEffect(() => { const h = setTimeout(() => setTerm(q.trim()), 350); return () => clearTimeout(h); }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ['snmp-search', term], queryFn: () => api.snmpSearch(term), enabled: term.length >= 3, staleTime: 30_000,
  });
  const res = term.length >= 3 ? (data?.results || []) : [];
  return (
    <Card title={t('mact.searchTitle')}>
      <p className="text-xs text-tx3 mb-3">{t('mact.searchHint')}</p>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" aria-hidden="true" />
        <input className="input-field w-full pl-9 font-mono" value={q} autoFocus spellCheck={false}
          onChange={e => setQ(e.target.value)} placeholder="4c:5e:0c… / 10.0.0.5" />
      </div>
      <div className="mt-3 min-h-[3rem]">
        {term.length < 3 ? <p className="text-sm text-tx3">{t('mact.searchMin')}</p>
          : isFetching && !data ? <div className="h-16 skeleton-shimmer rounded-lg" />
          : res.length === 0 ? <p className="text-sm text-tx3">{data?.kind === 'text' ? t('mact.searchKind') : t('mact.searchNone')}</p>
          : (
            <>
              <p className="text-xs text-tx3 mb-1">{t('mact.found', { n: res.length })}</p>
              <Head cols={['MAC', 'IP', t('mact.device'), t('mact.port'), 'VLAN', t('mact.status')]} />
              <ul className="divide-y divide-brd">
                {res.map((r, i) => (
                  <MacRow key={`${r.type}-${r.device_id}-${r.mac}-${r.ip}-${i}`} mac={r.mac} ip={r.ip} port={r.port} alias={r.port_alias}
                    vlan={r.vlan} active={r.active} last={r.last_seen} device={{ id: r.device_id, name: r.device }} />
                ))}
              </ul>
              <p className="text-[11px] text-tx3 mt-2">{t('mact.sourceNote')}</p>
            </>
          )}
      </div>
    </Card>
  );
}

/** Bagian "MAC di port ini" di detail port. */
export function PortMacs({ macs }: { macs: SnmpPortMac[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const list = all ? macs : macs.slice(0, 8);
  return (
    <div>
      {macs.length === 0 ? <p className="text-xs text-tx3 py-1">{t('mact.portEmpty')}</p> : (
        <ul className="divide-y divide-brd">
          {list.map(m => (
            <li key={`${m.source}-${m.mac}-${m.vlan ?? ''}`} className={cn('py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs', !m.active && 'opacity-70')}>
              <span className="font-mono text-tx1">{m.mac}</span>
              {m.ip && <span className="font-mono text-tx2">{m.ip}</span>}
              {m.vlan != null && <span className="text-tx3">{t('mact.vlan', { v: m.vlan })}</span>}
              <span className="ml-auto"><Seen active={m.active} last={m.last_seen} /></span>
            </li>
          ))}
        </ul>
      )}
      {macs.length > 8 && (
        <button type="button" className="text-xs text-accent mt-1 hover:underline" onClick={() => setAll(a => !a)}>
          {all ? t('mact.less') : t('mact.more', { n: macs.length - 8 })}
        </button>
      )}
    </div>
  );
}
