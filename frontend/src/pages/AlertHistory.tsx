import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../lib/utils';
import {
  AlertTriangle, WifiOff, Zap, Radio, Thermometer,
  Server, Activity, Cpu, ChevronLeft, ChevronRight,
  Filter, Clock, CheckCircle2, Info
} from 'lucide-react';

interface AlertHistoryItem {
  id: number;
  alert_type: string;
  last_value: string;
  last_alert_at: string;
  olt_id: number | null;
  olt_name: string;
  onu_id: number | null;
  onu_info: string;
}

const alertTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  offline: { label: 'OFFLINE', icon: <WifiOff size={14} />, color: 'text-danger', bg: 'bg-danger/15' },
  dyinggasp: { label: 'DYINGGASP', icon: <Zap size={14} />, color: 'text-warning', bg: 'bg-warning/15' },
  los: { label: 'LOS', icon: <Radio size={14} />, color: 'text-danger', bg: 'bg-danger/15' },
  rx_power_low: { label: 'RX LOW', icon: <AlertTriangle size={14} />, color: 'text-warning', bg: 'bg-warning/15' },
  rx_power_drop: { label: 'RX DROP', icon: <AlertTriangle size={14} />, color: 'text-warning', bg: 'bg-warning/15' },
  rx_power_change: { label: 'RX TRACK', icon: <Activity size={14} />, color: 'text-tx3', bg: 'bg-glass' },
  unconfigured: { label: 'UNCONFIG', icon: <Info size={14} />, color: 'text-info', bg: 'bg-info/15' },
  unregistered: { label: 'UNREG', icon: <Info size={14} />, color: 'text-info', bg: 'bg-info/15' },
  olt_offline: { label: 'OLT OFFLINE', icon: <Server size={14} />, color: 'text-danger', bg: 'bg-danger/15' },
  olt_cpu_high: { label: 'CPU HIGH', icon: <Cpu size={14} />, color: 'text-warning', bg: 'bg-warning/15' },
  olt_mem_high: { label: 'MEM HIGH', icon: <Activity size={14} />, color: 'text-warning', bg: 'bg-warning/15' },
  olt_temp_high: { label: 'TEMP HIGH', icon: <Thermometer size={14} />, color: 'text-danger', bg: 'bg-danger/15' },
};

function getTypeConfig(type: string) {
  return alertTypeConfig[type] || { label: type.toUpperCase(), icon: <AlertTriangle size={14} />, color: 'text-tx3', bg: 'bg-glass' };
}

export function AlertHistory() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const perPage = 30;

  const { data, isLoading } = useQuery({
    queryKey: ['alert-history', page, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      if (typeFilter) params.set('type', typeFilter);
      const r = await fetch(`/api/alerts/history?${params}`, { credentials: 'include' });
      if (!r.ok) return { history: [], total: 0, pages: 0, page: 1 };
      return r.json();
    },
  });

  const history: AlertHistoryItem[] = data?.history || [];
  const total = data?.total || 0;
  const pages = data?.pages || 0;

  const allTypes = Object.entries(alertTypeConfig).map(([key, val]) => ({ key, label: val.label }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Alert History</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">Riwayat semua alert yang terdeteksi oleh sistem monitoring</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-tx3">
          <Filter size={15} />
          <span>Filter:</span>
        </div>
        <button
          onClick={() => { setTypeFilter(''); setPage(1); }}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            !typeFilter ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:text-tx1 border border-brd')}
        >
          Semua
        </button>
        {allTypes.map(t => (
          <button
            key={t.key}
            onClick={() => { setTypeFilter(t.key); setPage(1); }}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              typeFilter === t.key ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:text-tx1 border border-brd')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-tx3 mt-3">Memuat data...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 size={48} className="mx-auto text-success/30 mb-3" />
            <p className="text-sm text-tx2 font-medium">Tidak ada alert history</p>
            <p className="text-xs text-tx3 mt-1">Sistem monitoring belum mendeteksi masalah apapun</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brd">
                    <th className="text-left px-4 py-3 text-xs font-medium text-tx3">Tipe</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-tx3">OLT</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-tx3">ONU</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-tx3">Value</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-tx3">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => {
                    const cfg = getTypeConfig(item.alert_type);
                    return (
                      <tr key={item.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium', cfg.bg, cfg.color)}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-tx2">
                          {item.olt_name || <span className="text-tx3">—</span>}
                        </td>
                        <td className="px-4 py-3 text-tx2">
                          {item.onu_info || <span className="text-tx3">—</span>}
                        </td>
                        <td className="px-4 py-3 text-tx2 font-mono text-xs">
                          {item.last_value || <span className="text-tx3">—</span>}
                        </td>
                        <td className="px-4 py-3 text-tx3 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} />
                            {item.last_alert_at ? new Date(item.last_alert_at).toLocaleString('id-ID', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            }) : '—'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-brd">
                <p className="text-xs text-tx3">
                  Halaman {page} dari {pages} • Total {total} records
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg hover:bg-glass disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, pages - 4));
                    const p = start + i;
                    if (p > pages) return null;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={cn('w-8 h-8 rounded-lg text-xs font-medium transition-all',
                          p === page ? 'bg-accent text-white' : 'hover:bg-glass text-tx2')}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page >= pages}
                    className="p-1.5 rounded-lg hover:bg-glass disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
