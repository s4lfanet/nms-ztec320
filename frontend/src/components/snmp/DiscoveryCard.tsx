import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Radar } from 'lucide-react';
import { Button, Card } from '../ui';
import { toast } from '../Toast';
import { api, type SnmpSuggestion } from '../../lib/api';

/** Penemuan otomatis: usulan dari tetangga LLDP/CDP dan pindai subnet. Admin yang memutuskan menambah. */
export function DiscoveryCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [cidr, setCidr] = useState('');
  const [busy, setBusy] = useState('');
  const { data } = useQuery({
    queryKey: ['snmp-discovery'], queryFn: api.snmpDiscovery,
    refetchInterval: q => (q.state.data?.scan.running ? 2000 : 30_000),
  });
  const scan = async () => {
    try { const r = await api.snmpDiscoveryScan(cidr.trim()); toast.info(r.message); qc.invalidateQueries({ queryKey: ['snmp-discovery'] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const add = async (s: SnmpSuggestion) => {
    setBusy(s.ip);
    try {
      await api.snmpDiscoveryAdd(s.ip, s.name);
      toast.success(t('disc.added', { name: s.name || s.ip }));
      qc.invalidateQueries({ queryKey: ['snmp-discovery'] });
      qc.invalidateQueries({ queryKey: ['snmp-devices'] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(''); }
  };
  const row = (s: SnmpSuggestion) => (
    <li key={`${s.source}-${s.ip}`} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 flex-1 text-sm text-tx1 truncate">{s.name || s.ip} <span className="font-mono text-xs text-tx3">{s.ip}</span>
        {s.platform && <span className="text-xs text-tx3"> · {s.platform}</span>}
        {s.seen_from && <span className="text-xs text-tx3"> · {t('disc.via', { name: s.seen_from })}</span>}</span>
      <Button variant="secondary" loading={busy === s.ip} onClick={() => add(s)}>{t('disc.add')}</Button>
    </li>
  );
  const sc = data?.scan;
  return (
    <Card title={t('disc.title')} icon={<Radar size={16} />}>
      <p className="text-xs text-tx3 mb-3">{t('disc.hint')}</p>
      <div className="text-sm font-medium text-tx1 mb-1">{t('disc.fromNeighbors')}</div>
      {data && data.neighbors.length > 0 ? <ul className="divide-y divide-line mb-4">{data.neighbors.map(row)}</ul>
        : <p className="text-xs text-tx3 mb-4">{t('disc.noNeighbors')}</p>}
      <div className="text-sm font-medium text-tx1 mb-1">{t('disc.scan')}</div>
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input-field !w-auto" value={cidr} onChange={e => setCidr(e.target.value)} placeholder="10.10.1.0/24" aria-label="CIDR" />
        <Button variant="primary" disabled={!cidr.trim() || !!sc?.running} onClick={scan}>{t('disc.scanBtn')}</Button>
        {sc && sc.total > 0 && <span className="text-xs text-tx2">{sc.running ? t('disc.scanning', { done: sc.done, total: sc.total }) : t('disc.scanDone', { cidr: sc.cidr, n: sc.found.length })}</span>}
      </div>
      {sc?.error && <p className="text-xs text-danger mt-2">{sc.error}</p>}
      {sc && sc.found.length > 0 && <ul className="divide-y divide-line mt-2">{sc.found.map(row)}</ul>}
    </Card>
  );
}
