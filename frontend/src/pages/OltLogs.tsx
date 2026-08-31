import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { OnuStatusHistoryRecord } from '../lib/api';
import { cn } from '../lib/utils';
import { Bell, Terminal, FileText, RefreshCw, AlertTriangle, Info, Activity } from 'lucide-react';

type LogTab = 'alarmlog' | 'cmdlog' | 'snmplog' | 'synclog' | 'statushistory';

const TAB_CONFIG: { key: LogTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'statushistory', label: 'ONU Status History', icon: <Activity size={16} />, desc: 'Every ONU status change (online → offline/dyinggasp/los and back) with timestamp, RX power, and source' },
  { key: 'alarmlog', label: 'Alarm Log', icon: <Bell size={16} />, desc: 'OLT device alarm events (login/logout, ONU register/deregister, hardware)' },
  { key: 'cmdlog', label: 'Command Log', icon: <Terminal size={16} />, desc: 'CLI command history executed on OLT' },
  { key: 'snmplog', label: 'SNMP Log', icon: <FileText size={16} />, desc: 'SNMP MIB operation logs' },
  { key: 'synclog', label: 'NMS Sync Log', icon: <RefreshCw size={16} />, desc: 'NMS auto-sync & manual sync activity' },
];

const LINE_LIMITS = [100, 200, 500, 1000];
const STATUS_FILTERS = ['all', 'online', 'offline', 'dyinggasp', 'los'];

function getAlarmColor(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('critical') || lower.includes('major')) return 'text-red-400';
  if (lower.includes('warning') || lower.includes('minor')) return 'text-yellow-400';
  if (lower.includes('notification') || lower.includes('info')) return 'text-blue-400';
  if (lower.includes('error') || lower.includes('fail')) return 'text-red-400';
  return 'text-tx2';
}

function getStatusBadge(status: string): string {
  switch (status) {
    case 'online': return 'bg-green-500/15 text-green-400 border-green-500/30';
    case 'offline': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    case 'dyinggasp': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'los': return 'bg-red-500/15 text-red-400 border-red-500/30';
    default: return 'bg-bg3 text-tx2 border-border';
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

export function OltLogs() {
  const [activeTab, setActiveTab] = useState<LogTab>('statushistory');
  const [lineLimit, setLineLimit] = useState(200);
  const [statusFilter, setStatusFilter] = useState('all');
  const [oltId, setOltId] = useState<number | null>(null);

  // Fetch OLT list
  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard(),
  });
  const olts = dashboardData?.olts || [];
  const selectedOltId = oltId ?? olts[0]?.id ?? null;

  const isStatusHistory = activeTab === 'statushistory';

  const { data: logData, isLoading: logLoading, isFetching: logFetching, refetch: logRefetch, error: logError } = useQuery({
    queryKey: ['olt-logs', selectedOltId, activeTab, lineLimit],
    queryFn: async () => {
      if (!selectedOltId) return { success: true, lines: [], total_lines: 0 };
      if (activeTab === 'synclog') return api.syncLogs(selectedOltId, lineLimit);
      return api.oltLogs(selectedOltId, activeTab, lineLimit);
    },
    enabled: !!selectedOltId && !isStatusHistory,
    refetchInterval: 0,
  });

  const { data: histData, isLoading: histLoading, isFetching: histFetching, refetch: histRefetch, error: histError } = useQuery({
    queryKey: ['onu-status-history', selectedOltId, lineLimit, statusFilter],
    queryFn: () => api.onuStatusHistory(selectedOltId!, lineLimit, statusFilter),
    enabled: !!selectedOltId && isStatusHistory,
    refetchInterval: 0,
  });

  const isLoading = isStatusHistory ? histLoading : logLoading;
  const isFetching = isStatusHistory ? histFetching : logFetching;
  const refetch = isStatusHistory ? histRefetch : logRefetch;
  const error = isStatusHistory ? histError : logError;

  const currentTab = TAB_CONFIG.find(t => t.key === activeTab)!;
  const lines = logData?.lines || [];
  const totalLines = logData?.total_lines || 0;
  const records = histData?.records || [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-tx1">OLT Logs</h1>
          <p className="text-sm text-tx3 mt-0.5">View OLT device logs and NMS sync activity</p>
        </div>
        <div className="flex items-center gap-2">
          {/* OLT selector */}
          {olts.length > 0 && (
            <select
              value={selectedOltId ?? ''}
              onChange={(e) => setOltId(Number(e.target.value))}
              className="bg-bg2 border border-border rounded-lg px-3 py-1.5 text-sm text-tx1 outline-none focus:border-accent"
            >
              {olts.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          {/* Status filter (only for status history) */}
          {isStatusHistory && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-bg2 border border-border rounded-lg px-3 py-1.5 text-sm text-tx1 outline-none focus:border-accent"
            >
              {STATUS_FILTERS.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Status' : s}</option>
              ))}
            </select>
          )}
          {/* Line limit */}
          <select
            value={lineLimit}
            onChange={(e) => setLineLimit(Number(e.target.value))}
            className="bg-bg2 border border-border rounded-lg px-3 py-1.5 text-sm text-tx1 outline-none focus:border-accent"
          >
            {LINE_LIMITS.map(n => (
              <option key={n} value={n}>{n} {isStatusHistory ? 'records' : 'lines'}</option>
            ))}
          </select>
          {/* Refresh */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-tx3 hover:text-tx2'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div className="flex items-center gap-2 text-xs text-tx3">
        <Info size={12} />
        {currentTab.desc}
      </div>

      {/* Content area */}
      {isStatusHistory ? (
        <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg2/50">
            <span className="text-xs text-tx3">
              {isLoading ? 'Loading...' : `${records.length} records`}
            </span>
            <span className="text-xs text-tx3 font-mono">ONU Status History</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-tx3">
                <RefreshCw size={16} className="animate-spin mr-2" />
                Loading history...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-red-400 py-4 px-4">
                <AlertTriangle size={14} />
                {(error as Error).message}
              </div>
            ) : records.length === 0 ? (
              <div className="text-tx3 py-8 text-center">
                No status changes recorded yet
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg3 z-10">
                  <tr className="text-left text-xs text-tx3 border-b border-border">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">ONU</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Change</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">RX</th>
                    <th className="px-3 py-2 font-medium">Src</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r: OnuStatusHistoryRecord) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                      <td className="px-3 py-2 text-xs text-tx3 whitespace-nowrap">{formatTime(r.created_at)}</td>
                      <td className="px-3 py-2 text-xs font-mono text-tx2 whitespace-nowrap">{r.onu_index}</td>
                      <td className="px-3 py-2 text-xs text-tx2 max-w-[180px] truncate" title={r.onu_name}>{r.onu_name || '-'}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <span className={cn('inline-block px-1.5 py-0.5 rounded border text-xs font-medium', getStatusBadge(r.old_status))}>{r.old_status}</span>
                        <span className="text-tx3 mx-1">→</span>
                        <span className={cn('inline-block px-1.5 py-0.5 rounded border text-xs font-medium', getStatusBadge(r.new_status))}>{r.new_status}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-tx3">{r.dereg_reason || '-'}</td>
                      <td className="px-3 py-2 text-xs text-tx2 whitespace-nowrap">{r.rx_power != null ? `${r.rx_power.toFixed(2)} dBm` : '-'}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={cn('px-1.5 py-0.5 rounded text-xs', r.source === 'sync' ? 'bg-blue-500/10 text-blue-400' : r.source === 'refresh' ? 'bg-purple-500/10 text-purple-400' : 'bg-bg3 text-tx3')}>{r.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#0a0a0a] rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg2/50">
            <span className="text-xs text-tx3">
              {isLoading ? 'Loading...' : `${lines.length} lines shown`}
              {totalLines > lines.length && ` (of ${totalLines} total)`}
            </span>
            <span className="text-xs text-tx3 font-mono">{currentTab.label}</span>
          </div>
          <div className="font-mono text-xs leading-relaxed max-h-[70vh] overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-tx3">
                <RefreshCw size={16} className="animate-spin mr-2" />
                Loading logs...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-red-400 py-4 px-2">
                <AlertTriangle size={14} />
                {(error as Error).message}
              </div>
            ) : lines.length === 0 ? (
              <div className="text-tx3 py-8 text-center">
                No log entries found
                {logData?.message && <div className="text-xs mt-1">{logData.message}</div>}
              </div>
            ) : (
              <div className="space-y-0">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      'py-0.5 px-2 hover:bg-white/5 transition-colors',
                      activeTab === 'alarmlog' ? getAlarmColor(line) : 'text-tx2'
                    )}
                  >
                    <span className="text-tx3/50 select-none mr-2">{String(i + 1).padStart(4, ' ')}</span>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
