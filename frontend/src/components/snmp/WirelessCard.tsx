import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Wifi } from 'lucide-react';
import { Card } from '../ui';
import { api } from '../../lib/api';
import { fmtBps } from '../../lib/snmpFormat';
import { cn } from '../../lib/utils';

const sigTone = (v: number | null) => v == null ? 'text-tx3' : v >= -65 ? 'text-success' : v >= -75 ? 'text-warning' : 'text-danger';

function dur(s: number | null) {
  if (s == null) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** Wireless MikroTik: radio (SSID, frekuensi, klien) dan klien terhubung, sinyal terlemah di atas. */
export function WirelessCard({ deviceId }: { deviceId: number }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['snmp-wireless', deviceId], queryFn: () => api.snmpDeviceWireless(deviceId), refetchInterval: 300_000 });
  if (!data || (data.radios.length === 0 && data.clients.length === 0)) return null;
  return (
    <Card title={t('wifi.title')} icon={<Wifi size={16} />}>
      {data.radios.length > 0 && (
        <ul className="divide-y divide-line mb-3">
          {data.radios.map(r => (
            <li key={r.if_index} className="py-2 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
              <span className="text-tx1">{r.name}{r.ssid && <span className="text-tx3"> · {r.ssid}</span>}</span>
              <span className="text-xs text-tx2">
                {r.freq ? `${r.freq} MHz · ` : ''}{t('wifi.clients', { n: r.clients ?? 0 })}
                {r.noise != null && ` · ${t('wifi.noise')} ${r.noise} dBm`}{r.ccq != null && ` · CCQ ${r.ccq}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="text-xs text-tx3 mb-1">{t('wifi.weakFirst')}</div>
      <ul className="divide-y divide-line">
        {data.clients.slice(0, 200).map(c => (
          <li key={`${c.iface}-${c.mac}`} className="py-2 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
            <span className="font-mono text-tx1">{c.mac}</span>
            {c.customer && <span className="text-tx1">{c.customer}</span>}
            <span className="text-tx3">{c.iface}</span>
            <span className={cn('tabular-nums font-medium', sigTone(c.signal))}>{c.signal} dBm</span>
            {c.snr != null && <span className="text-tx2 tabular-nums">SNR {c.snr} dB</span>}
            <span className="text-tx2 tabular-nums">↓ {fmtBps(c.rx_bps)} · ↑ {fmtBps(c.tx_bps)}</span>
            <span className="text-tx3">{dur(c.uptime_s)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
