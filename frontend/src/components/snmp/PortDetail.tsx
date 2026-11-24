import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api, type SnmpPort } from '../../lib/api';
import { fmtSpeed } from '../../lib/snmpFormat';
import { cn, timeAgo } from '../../lib/utils';

// Jenis interface umum (IANAifType) — sisanya ditampilkan sebagai angka
const IF_TYPES: Record<number, string> = {
  6: 'Ethernet', 24: 'Loopback', 53: 'Virtual', 131: 'Tunnel', 135: 'VLAN (L2)', 136: 'VLAN (L3)',
  161: 'Bonding (LAG)', 209: 'Bridge', 23: 'PPP', 108: 'PPPoE', 71: 'Wireless (802.11)', 150: 'MPLS tunnel',
};
// SFF-8024 connector
const CONNECTORS: Record<number, string> = { 1: 'SC', 7: 'LC', 12: 'MPO', 33: 'Copper pigtail', 34: 'RJ45', 35: '—' };

/** Kualitas RX SFP terhadap ambang alert redaman (default −25 dBm). */
export function rxTone(rx: number | null | undefined, low: number) {
  if (rx == null) return 'text-tx3';
  if (rx >= 0) return 'text-warning';           // terlalu kuat (risiko overload receiver)
  if (rx < low) return 'text-danger';
  if (rx < low + 4) return 'text-warning';
  return 'text-success';
}

function Row({ label, value, mono, tone }: { label: string; value: React.ReactNode; mono?: boolean; tone?: string }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1.5 text-xs border-b border-brd last:border-0">
      <span className="text-tx3 shrink-0">{label}</span>
      <span className={cn('text-right text-tx1 break-all', mono && 'font-mono', tone)}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-brd p-3">
      <div className="text-xs font-semibold text-tx2 mb-1">{title}</div>
      {children}
    </div>
  );
}

const STAT_GROUPS: { key: string; items: string[] }[] = [
  { key: 'rxErr', items: ['rx_fcs', 'rx_align', 'rx_fragment', 'rx_too_short', 'rx_too_long', 'rx_length', 'rx_code', 'rx_carrier', 'rx_jabber', 'rx_overflow'] },
  { key: 'txErr', items: ['tx_fcs', 'tx_underrun', 'tx_collision', 'tx_late_collision', 'tx_excessive_collision', 'tx_deferred', 'tx_jabber', 'tx_fragment', 'tx_too_short', 'tx_too_long'] },
  { key: 'drops', items: ['rx_drop', 'tx_drop', 'in_discards', 'out_discards', 'link_downs'] },
  { key: 'casts', items: ['rx_broadcast', 'rx_multicast', 'rx_pause', 'tx_broadcast', 'tx_multicast', 'tx_pause'] },
];
const BAD = new Set(['rx_fcs', 'rx_align', 'rx_fragment', 'rx_too_short', 'rx_too_long', 'rx_length', 'rx_code', 'rx_carrier',
  'rx_jabber', 'rx_overflow', 'tx_fcs', 'tx_underrun', 'tx_late_collision', 'tx_excessive_collision', 'tx_jabber',
  'rx_drop', 'tx_drop', 'in_discards', 'out_discards']);

/** Detail satu port ala Winbox: spesifikasi, modul SFP, redaman optik, statistik ethernet. */
export function PortDetail({ port }: { port: SnmpPort }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['snmp-port', port.id], queryFn: () => api.snmpPortDetail(port.id), refetchInterval: 60_000 });
  const { data: settings } = useQuery({ queryKey: ['snmp-settings'], queryFn: api.snmpSettings, staleTime: 300_000 });
  const low = settings?.settings.snmp_rx_low_dbm ?? -25;
  const det = data?.detail;
  if (!det) return null;
  const nf = (v: number | null | undefined, d = 2) => (v == null ? null : v.toFixed(d));
  const statEntries = STAT_GROUPS.map(g => ({ ...g, items: g.items.filter(k => det.stats[k] != null) })).filter(g => g.items.length);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Section title={t('pdet.spec')}>
        <Row label={t('pdet.type')} value={port.if_type != null ? (IF_TYPES[port.if_type] || `#${port.if_type}`) : null} />
        <Row label={t('pdet.speed')} value={port.speed_mbps ? fmtSpeed(port.speed_mbps) : null} />
        <Row label={t('pdet.duplex')} value={det.duplex ? t(`pdet.dx.${det.duplex}`) : null} />
        <Row label="MTU" value={det.mtu} />
        <Row label="MAC" value={port.mac} mono />
        <Row label={t('pdet.ip')} value={det.ip_addrs.length ? det.ip_addrs.join(', ') : null} mono />
        <Row label={t('pdet.descr')} value={port.descr !== port.name ? port.descr : null} />
        <Row label="ifIndex" value={port.if_index} />
        <Row label={t('pdet.changed')} value={port.status_changed_at ? timeAgo(port.status_changed_at) : null} />
      </Section>

      {det.sfp && (
        <Section title={t('pdet.module')}>
          <Row label={t('pdet.modType')} value={det.sfp.type || null} />
          <Row label={t('pdet.vendor')} value={det.sfp.vendor || null} />
          <Row label={t('pdet.part')} value={det.sfp.part || null} mono />
          <Row label={t('pdet.serial')} value={det.sfp.serial || null} mono />
          <Row label={t('pdet.wavelength')} value={det.sfp.wavelength_nm ? `${det.sfp.wavelength_nm} nm` : null} />
          <Row label={t('pdet.connector')} value={det.sfp.connector != null ? (CONNECTORS[det.sfp.connector] || `#${det.sfp.connector}`) : null} />
          <Row label={t('pdet.distance')} value={det.sfp.link_m ? (det.sfp.link_m >= 1000 ? `${det.sfp.link_m / 1000} km` : `${det.sfp.link_m} m`) : null} />
          <Row label={t('pdet.rates')} value={det.sfp.rates || null} />
        </Section>
      )}

      {det.optical && (
        <Section title={t('pdet.optical')}>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="rounded-md bg-glass p-2">
              <div className="text-[11px] text-tx3">{t('pdet.rx')}</div>
              <div className={cn('text-lg font-semibold tabular-nums', rxTone(det.optical.rx_dbm, low))}>
                {det.optical.rx_dbm != null ? `${det.optical.rx_dbm.toFixed(2)} dBm` : '—'}
              </div>
            </div>
            <div className="rounded-md bg-glass p-2">
              <div className="text-[11px] text-tx3">{t('pdet.tx')}</div>
              <div className="text-lg font-semibold tabular-nums text-tx1">
                {det.optical.tx_dbm != null ? `${det.optical.tx_dbm.toFixed(2)} dBm` : '—'}
              </div>
            </div>
          </div>
          {det.optical.rx_loss && <p className="text-xs text-danger mb-1">{t('pdet.rxLoss')}</p>}
          {det.optical.tx_fault && <p className="text-xs text-danger mb-1">{t('pdet.txFault')}</p>}
          <Row label={t('pdet.temp')} value={det.optical.temp_c != null ? `${det.optical.temp_c} °C` : null}
            tone={det.optical.temp_c != null && det.optical.temp_c >= 70 ? 'text-warning' : undefined} />
          <Row label={t('pdet.volt')} value={nf(det.optical.volt, 3) && `${nf(det.optical.volt, 3)} V`} />
          <Row label={t('pdet.bias')} value={det.optical.bias_ma != null ? `${det.optical.bias_ma} mA` : null} />
          <Row label={t('pdet.lowAt')} value={`${low} dBm`} />
          <p className="text-[11px] text-tx3 mt-1">{t('pdet.updated', { ago: det.optical.at ? timeAgo(det.optical.at) : '—' })}</p>
        </Section>
      )}

      {statEntries.length > 0 && (
        <Section title={t('pdet.stats')}>
          {statEntries.map(g => (
            <div key={g.key} className="mb-2 last:mb-0">
              <div className="text-[11px] text-tx3 mt-1">{t(`pdet.sg.${g.key}`)}</div>
              <div className="grid grid-cols-2 gap-x-4">
                {g.items.map(k => {
                  const v = det.stats[k] as number;
                  return (
                    <div key={k} className="flex justify-between gap-2 py-1 text-xs border-b border-brd">
                      <span className="text-tx3 truncate">{t(`pdet.st.${k}`)}</span>
                      <span className={cn('tabular-nums', v > 0 && BAD.has(k) ? 'text-warning font-semibold' : 'text-tx1')}>{v.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-tx3 mt-1">{t('pdet.statsNote')}</p>
        </Section>
      )}

    </div>
  );
}
