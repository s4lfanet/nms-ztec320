import { useState } from 'react';
import { FileText, Download, Package, Signal, TimerOff, Bell, Server } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { useHasPerm } from '../hooks/useHasPerm';

const REPORTS = [
  { key: 'inventory', title: 'Inventaris ONU', icon: Package, desc: 'Semua ONU dengan status, RX/TX, distance, PPPoE' },
  { key: 'poor-rx', title: 'RX Power Buruk', icon: Signal, desc: 'ONU online dengan RX di bawah threshold', extra: { threshold: '-28' } },
  { key: 'long-offline', title: 'Offline Lama', icon: TimerOff, desc: 'ONU offline >= N hari', extra: { days: '7' } },
  { key: 'alarms', title: 'Ringkasan Alarm', icon: Bell, desc: 'History alarm dalam N hari terakhir', extra: { days: '30' } },
  { key: 'olt-sla', title: 'SLA/Uptime OLT', icon: Server, desc: 'Persentase online per OLT + jumlah ONU per status', extra: { days: '30' } },
];

export function Reports() {
  const hasPerm = useHasPerm();
  const canView = hasPerm('view_onus');
  const [oltId, setOltId] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({});

  const download = (key: string, fmt: 'csv' | 'pdf') => {
    const params = new URLSearchParams();
    if (oltId) params.set('olt_id', oltId);
    const r = REPORTS.find(x => x.key === key);
    if (r?.extra) for (const [k, v] of Object.entries(r.extra)) params.set(k, extras[`${key}_${k}`] ?? v);
    const url = `/api/reports/${key}.${fmt}?${params}`;
    window.open(url, '_blank');
  };

  if (!canView) return <PageContainer><div className="text-xs text-tx3">Anda tidak punya izin view_onus.</div></PageContainer>;

  return (
    <PageContainer>
      <div className="mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2"><FileText size={20} className="text-accent" /> Laporan</h1>
        <p className="text-xs text-tx3 mt-1">Unduh laporan dalam format CSV atau PDF.</p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs text-tx3">Filter OLT:</label>
        <input value={oltId} onChange={e => setOltId(e.target.value)} placeholder="ID OLT (kosongkan=semua)"
          className="px-2 py-1 text-xs rounded bg-surface border border-brd focus:border-accent outline-none w-40" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORTS.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.key} className="p-4 rounded-lg bg-surface border border-brd hover:border-accent transition-colors">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded bg-glass"><Icon size={18} className="text-accent" /></div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{r.title}</div>
                  <div className="text-xs text-tx3 mt-0.5">{r.desc}</div>
                </div>
              </div>
              {r.extra && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(r.extra).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1">
                      <label className="text-[10px] text-tx3 uppercase">{k}:</label>
                      <input value={extras[`${r.key}_${k}`] ?? v}
                        onChange={e => setExtras(prev => ({ ...prev, [`${r.key}_${k}`]: e.target.value }))}
                        className="w-16 px-1.5 py-0.5 text-xs rounded bg-glass border border-brd outline-none focus:border-accent" />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => download(r.key, 'csv')}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-glass hover:bg-accent/10 text-tx2 hover:text-accent font-medium transition-colors flex items-center justify-center gap-1.5">
                  <Download size={12} /> CSV
                </button>
                <button onClick={() => download(r.key, 'pdf')}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-glass hover:bg-accent/10 text-tx2 hover:text-accent font-medium transition-colors flex items-center justify-center gap-1.5">
                  <Download size={12} /> PDF
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}
