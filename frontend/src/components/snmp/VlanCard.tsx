import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Network } from 'lucide-react';
import { Card, Tabs } from '../ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

/** VLAN perangkat: daftar VLAN (port tagged/untagged) dan ringkasan VLAN per port. */
export function VlanCard({ deviceId }: { deviceId: number }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['snmp-vlans', deviceId], queryFn: () => api.snmpDeviceVlans(deviceId), refetchInterval: 300_000 });
  const [view, setView] = useState<'vlan' | 'port'>('vlan');
  if (!data || (data.vlans.length === 0 && data.ports.length === 0)) return null;
  const chip = (txt: string, tone: string) => <span key={txt} className={cn('rounded px-1.5 py-0.5 text-[11px] border', tone)}>{txt}</span>;
  return (
    <Card title={t('vlan.title')} icon={<Network size={16} />}>
      <p className="text-xs text-tx3 mb-2">{data.vlans.length ? t('vlan.hint') : t('vlan.seenOnly')}</p>
      <Tabs active={view} onChange={k => setView(k as 'vlan' | 'port')} tabs={[
        { key: 'vlan', label: t('vlan.byVlan', { n: data.vlans.length }) },
        { key: 'port', label: t('vlan.byPort', { n: data.ports.length }) },
      ]} />
      <ul className="divide-y divide-line mt-2">
        {view === 'vlan' ? data.vlans.map(v => (
          <li key={v.vlan} className="py-2 space-y-1">
            <div className="text-sm text-tx1">VLAN {v.vlan}{v.name && <span className="text-tx3"> · {v.name}</span>}</div>
            <div className="flex flex-wrap gap-1">
              {v.untagged.map(p => chip(`${p} ${t('vlan.untag')}`, 'border-line text-tx2'))}
              {v.tagged.map(p => chip(`${p} ${t('vlan.tag')}`, 'border-accent/40 text-accent'))}
            </div>
          </li>
        )) : data.ports.map(p => (
          <li key={p.port_id} className="py-2 space-y-1">
            <div className="text-sm text-tx1">{p.port}{p.alias && <span className="text-xs text-tx3"> · {p.alias}</span>}
              {p.pvid != null && <span className="text-xs text-tx2"> · PVID {p.pvid}</span>}</div>
            <div className="flex flex-wrap gap-1">
              {p.member.map(m => chip(`${m.vlan} ${m.tagged ? t('vlan.tag') : t('vlan.untag')}`, m.tagged ? 'border-accent/40 text-accent' : 'border-line text-tx2'))}
              {p.member.length === 0 && p.seen.map(v => chip(`${v} ${t('vlan.seen')}`, 'border-line text-tx3'))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
