import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Bell, Terminal, FileText, RefreshCw, AlertTriangle, Info } from 'lucide-react';

type LogTab = 'alarmlog' | 'cmdlog' | 'snmplog' | 'synclog';

const TAB_CONFIG: { key: LogTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'alarmlog', label: 'Alarm Log', icon: <Bell size={16} />, desc: 'OLT device alarm events (login/logout, ONU register/deregister, hardware)' },
  { key: 'cmdlog', label: 'Command Log', icon: <Terminal size={16} />, desc: 'CLI command history executed on OLT' },
  { key: 'snmplog', label: 'SNMP Log', icon: <FileText size={16} />, desc: 'SNMP MIB operation logs' },
  { key: 'synclog', label: 'NMS Sync Log', icon: <RefreshCw size={16} />, desc: 'NMS auto-sync & manual sync activity' },
];

const LINE_LIMITS = [100, 200, 500, 1000];

function getAlarmColor(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('critical') || lower.includes('major')) return 'text-red-400';
  if (lower.includes('warning') || lower.includes('minor')) return 'text-yellow-400';
  if (lower.includes('notification') || lower.includes('info')) return 'text-blue-400';
  if (lower.includes('error') || lower.includes('fail')) return 'text-red-400';
  return 'text-tx2';
}

export function OltLogs() {
  const [activeTab, setActiveTab] = useState<LogTab>('alarmlog');
  const [lineLimit, setLineLimit] = useState(200);
  const [oltId, setOltId] = useState<number | null>(null);

  // Fetch OLT list
  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard(),
  });
  const olts = dashboardData?.olts || [];
  const selectedOltId = oltId ?? olts[0]?.id ?? null;

  // Fetch logs
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['olt-logs', selectedOltId, activeTab, lineLimit],
    queryFn: async () => {
      if (!selectedOltId) return { success: true, lines: [], total_lines: 0 };
      if (activeTab === 'synclog') {
        return api.syncLogs(selectedOltId, lineLimit);
      }
      return api.oltLogs(selectedOltId, activeTab, lineLimit);
    },
    enabled: !!selectedOltId,
    refetchInterval: 0,
  });

  const currentTab = TAB_CONFIG.find(t => t.key === activeTab)!;
  const lines = data?.lines || [];
  const totalLines = data?.total_lines || 0;

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
          {/* Line limit */}
          <select
            value={lineLimit}
            onChange={(e) => setLineLimit(Number(e.target.value))}
            className="bg-bg2 border border-border rounded-lg px-3 py-1.5 text-sm text-tx1 outline-none focus:border-accent"
          >
            {LINE_LIMITS.map(n => (
              <option key={n} value={n}>{n} lines</option>
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

      {/* Log content */}
      <div className="bg-[#0a0a0a] rounded-lg border border-border overflow-hidden">
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg2/50">
          <span className="text-xs text-tx3">
            {isLoading ? 'Loading...' : `${lines.length} lines shown`}
            {totalLines > lines.length && ` (of ${totalLines} total)`}
          </span>
          <span className="text-xs text-tx3 font-mono">
            {currentTab.label}
          </span>
        </div>

        {/* Log lines */}
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
              {data?.message && <div className="text-xs mt-1">{data.message}</div>}
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
    </div>
  );
}
