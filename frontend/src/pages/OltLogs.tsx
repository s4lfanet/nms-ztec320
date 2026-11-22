import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { OnuStatusHistoryRecord } from '../lib/api';
import { Tabs } from '../components/ui/Tabs';
import { cn } from '../lib/utils';
import { Bell, Terminal, FileText, RefreshCw, AlertTriangle, Info, Activity } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, LoadingOverlay, Select } from '../components/ui';

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
  const { t } = useTranslation();
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
    <PageContainer className="p-4 md:p-6">
      <PageHeader
        title={t('pg_oltlogs.oltLogs')}
        description={t('pg_oltlogs.oltDeviceLogsAnd')}
        action={
          <>
            {olts.length > 0 && (
              <Select
                value={selectedOltId ?? ''}
                onChange={(e) => setOltId(Number(e.target.value))}
                className="w-auto"
                aria-label={t('pg_oltlogs.selectOlt')}
                options={olts.map(o => ({ value: String(o.id), label: o.name }))}
              />
            )}
            {isStatusHistory && (
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-auto"
                aria-label={t('pg_oltlogs.filterStatus')}
                options={STATUS_FILTERS.map(s => ({ value: s, label: s === 'all' ? 'All Status' : s }))}
              />
            )}
            <Select
              value={lineLimit}
              onChange={(e) => setLineLimit(Number(e.target.value))}
              className="w-auto"
              aria-label={t('pg_oltlogs.lineLimit')}
              options={LINE_LIMITS.map(n => ({ value: String(n), label: `${n} ${isStatusHistory ? 'records' : 'lines'}` }))}
            />
            <Button
              variant="secondary"
              icon={<RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              Refresh
            </Button>
          </>
        }
      />

      {/* Tabs — grid 3 kolom di HP supaya semua terlihat tanpa geser */}
      <Tabs
        mobileGrid={3}
        tabs={TAB_CONFIG.map(tab => ({ key: tab.key, label: t(`pg_oltlogs.tab_${tab.key}`), icon: tab.icon }))}
        active={activeTab}
        onChange={(k) => setActiveTab(k as LogTab)}
      />

      {/* Tab description */}
      <div className="flex items-center gap-2 text-xs text-tx3">
        <Info size={12} />
        {t(`pg_oltlogs.tab_${currentTab.key}_desc`)}
      </div>

      {/* Content area */}
      {isStatusHistory ? (
        <Card bodyClassName="p-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-brd bg-glass/50">
            <span className="text-xs text-tx3">
              {isLoading ? 'Loading...' : `${records.length} records`}
            </span>
            <span className="text-xs text-tx3 font-mono">{t('pg_oltlogs.onuStatusHistory')}</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <LoadingOverlay label={t('pg_oltlogs.loadingHistory')} />
            ) : error ? (
              <div className="flex items-center gap-2 text-danger py-4 px-4">
                <AlertTriangle size={14} />
                {(error as Error).message}
              </div>
            ) : records.length === 0 ? (
              <EmptyState icon={Activity} title={t('pg_oltlogs.noStatusChangesRecorded')} />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg3 z-10">
                  <tr className="text-left text-xs text-tx3 border-b border-border">
                    <th className="px-3 py-2 font-medium">{t('pg_oltlogs.time')}</th>
                    <th className="px-3 py-2 font-medium">ONU</th>
                    <th className="px-3 py-2 font-medium">{t('pg_oltlogs.name')}</th>
                    <th className="px-3 py-2 font-medium">{t('pg_oltlogs.change')}</th>
                    <th className="px-3 py-2 font-medium">{t('pg_oltlogs.reason')}</th>
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
        </Card>
      ) : (
        <div className="bg-[#0a0a0a] rounded-lg border border-brd overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-brd bg-black/30">
            <span className="text-xs text-tx3">
              {isLoading ? 'Loading...' : `${lines.length} lines shown`}
              {totalLines > lines.length && ` (of ${totalLines} total)`}
            </span>
            <span className="text-xs text-tx3 font-mono">{currentTab.label}</span>
          </div>
          <div className="font-mono text-xs leading-relaxed max-h-[70vh] overflow-y-auto p-3">
            {isLoading ? (
              <LoadingOverlay label={t('pg_oltlogs.loadingLogs')} />
            ) : error ? (
              <div className="flex items-center gap-2 text-danger py-4 px-2">
                <AlertTriangle size={14} />
                {(error as Error).message}
              </div>
            ) : lines.length === 0 ? (
              <EmptyState icon={FileText} title={t('pg_oltlogs.noLogEntriesFound')} description={logData?.message} />
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
    </PageContainer>
  );
}
