import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type DashboardData, type OltInfo } from '../lib/api';
import { formatDate, cn } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { TutorialBanner } from '../components/TutorialBanner';
import {
  Server, Wifi, WifiOff, AlertTriangle, Thermometer,
  RefreshCw, Radio, Clock, Fan, Zap, Activity, Search,
  ArrowUpDown, ExternalLink
} from 'lucide-react';
import { useHasPerm } from '../hooks/useHasPerm';
import { useWebSocket } from '../hooks/useWebSocket';

const REFRESH_INTERVAL = 30;

type SortKey = 'status' | 'name' | 'problems' | 'offline';

function uptimeStr(seconds: number | null | undefined): string {
  if (!seconds) return 'N/A';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function tempColor(t: number | null | undefined): string {
  if (t == null) return 'text-tx3';
  if (t >= 65) return 'text-danger font-bold';
  if (t >= 50) return 'text-warning';
  return 'text-success';
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const hasPerm = useHasPerm();
  const navigate = useNavigate();
  const [syncingOlt, setSyncingOlt] = useState<number | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const countdownRef = useRef(REFRESH_INTERVAL);

  const manualRefreshRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard({ nocache: manualRefreshRef.current }),
    refetchInterval: REFRESH_INTERVAL * 1000,
  });
  const showRefreshSpinner = isFetching || refreshing;
  const olts = (data as DashboardData)?.olts ?? [];

  // WebSocket listener — real-time alert push: auto-refresh dashboard when alerts arrive
  const { lastMessage: alertWsMsg } = useWebSocket('/ws/dashboard', { reconnect: true });
  useEffect(() => {
    if (alertWsMsg && alertWsMsg.event === 'alert') {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [alertWsMsg, queryClient]);

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = REFRESH_INTERVAL;
        setCountdown(REFRESH_INTERVAL);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Reset countdown on data refresh
  useEffect(() => {
    if (!isFetching) {
      countdownRef.current = REFRESH_INTERVAL;
      setCountdown(REFRESH_INTERVAL);
    }
  }, [isFetching]);

  const syncMutation = useMutation({
    mutationFn: async (oltId: number) => {
      const ok = await confirm({
        title: 'Sync OLT',
        message: 'This will collect all data from the OLT device. Continue?',
        confirmLabel: 'Sync Now',
        variant: 'warning',
      });
      if (!ok) throw new Error('cancelled');
      return api.syncOlt(oltId);
    },
    onSuccess: (_, oltId) => {
      setSyncingOlt(oltId);
      setSyncProgress(0);
      setSyncMessage('Starting sync...');
      toast.success('Sync started! Data will update automatically.');
    },
    onError: (e: Error) => {
      if (e.message !== 'cancelled') toast.error('Sync failed: ' + e.message);
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Sync All OLTs',
        message: `This will sync all ${olts?.length || ''} OLT(s) sequentially. Continue?`,
        confirmLabel: 'Sync All',
        variant: 'warning',
      });
      if (!ok) throw new Error('cancelled');
      return api.syncAllOlts();
    },
    onSuccess: () => {
      setSyncingAll(true);
      toast.success('Sync All started! Progress will show per OLT.');
    },
    onError: (e: Error) => {
      if (e.message !== 'cancelled') toast.error('Sync All failed: ' + e.message);
    },
  });

  // Poll sync status for single OLT
  useEffect(() => {
    if (!syncingOlt) return;
    const interval = setInterval(async () => {
      try {
        const s = await api.syncStatus(syncingOlt);
        setSyncProgress(s.progress || 0);
        setSyncMessage(s.message || '');
        if (s.status === 'completed' || s.status === 'error') {
          clearInterval(interval);
          setSyncingOlt(null);
          if (s.status === 'completed') {
            toast.success('Sync completed!');
          } else {
            toast.error('Sync failed: ' + (s.message || ''));
          }
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['olts'] });
          queryClient.invalidateQueries({ queryKey: ['all-onus'] });
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [syncingOlt, queryClient]);

  // Poll all OLTs sync status when syncing all
  useEffect(() => {
    if (!syncingAll) return;
    const interval = setInterval(async () => {
      try {
        const allDone = await Promise.all(
          (olts || []).map(o => api.syncStatus(o.id))
        );
        const anyRunning = allDone.some(s => s.status === 'running');
        if (!anyRunning) {
          clearInterval(interval);
          setSyncingAll(false);
          const anyError = allDone.some(s => s.status === 'error');
          if (anyError) toast.error('Some OLTs failed to sync');
          else toast.success('All OLTs synced!');
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['olts'] });
          queryClient.invalidateQueries({ queryKey: ['all-onus'] });
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [syncingAll, olts, queryClient]);

  if (isLoading) return <DashboardSkeleton />;

  const { stats } = data as DashboardData;
  const onlineCount = olts.filter(o => o.is_online).length;
  const totalProblem = (stats.offline || 0) + (stats.dyinggasp || 0) + (stats.los || 0);

  const filteredOlts = useMemo(() => olts.filter(olt => {
    const matchSearch = !searchTerm ||
      olt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      olt.ip_address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'online' && olt.is_online) ||
      (statusFilter === 'offline' && !olt.is_online);
    return matchSearch && matchStatus;
  }), [olts, searchTerm, statusFilter]);

  const sortedOlts = useMemo(() => [...filteredOlts].sort((a, b) => {
    if (sortKey === 'problems') {
      const aP = (a.offline_onu || 0) + (a.dyinggasp_onu || 0) + (a.los_onu || 0);
      const bP = (b.offline_onu || 0) + (b.dyinggasp_onu || 0) + (b.los_onu || 0);
      return bP - aP;
    }
    if (sortKey === 'offline') return (b.offline_onu || 0) - (a.offline_onu || 0);
    if (sortKey === 'status') {
      if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
      return a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  }), [filteredOlts, sortKey]);

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Activity size={20} className="text-accent" />
            OLT Monitoring
          </h1>
          <p className="text-tx3 text-xs mt-0.5">
            {onlineCount}/{olts.length} online &mdash; refresh dalam{' '}
            <span className={countdown <= 5 ? 'text-warning font-semibold' : 'text-tx2'}>{countdown}d</span>
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <TutorialBanner
            title="Panduan Dashboard"
            steps={[
              { title: 'Statistik ONU', content: <><p>Kartu statistik menampilkan total ONU per status: <strong>Online</strong>, <strong>Offline</strong>, <strong>DyingGasp</strong>, <strong>LOS</strong> (Loss of Signal), dan <strong>Total</strong>.</p><p className="text-xs text-tx3 mt-1">Klik kartu untuk filter ONU berdasarkan status di halaman All ONUs.</p></> },
              { title: 'OLT Cards', content: <><p>Setiap OLT ditampilkan sebagai kartu dengan info: status online/offline, uptime, suhu, CPU, fan, jumlah ONU online/offline, dan progress bar.</p><p className="text-xs text-tx3 mt-1">Klik <strong>Sync</strong> pada kartu OLT untuk sync OLT tersebut. Klik <strong>Config</strong> untuk ke halaman OLT Configuration.</p><p className="text-xs text-tx3 mt-1">Klik kartu OLT untuk navigasi ke All ONUs yang difilter per OLT tersebut.</p></> },
              { title: 'Sync All', content: <><p>Tombol <strong>Sync All</strong> di header untuk sync semua OLT sekaligus. Progress sync ditampilkan real-time per OLT.</p><p className="text-xs text-tx3 mt-1">Sync mengumpulkan data ONU via SNMP (light) atau SNMP+Telnet (full). Auto-refresh setiap 30 detik.</p></> },
            ]}
            tips={
              <>
                <strong className="text-tx2">Tips:</strong>
                <ul className="mt-1 ml-4 space-y-0.5">
                  <li>Dashboard auto-refresh setiap 30 detik — tidak perlu manual refresh</li>
                  <li>WebSocket aktif: alert baru akan otomatis muncul tanpa refresh</li>
                  <li>Klik kartu ONU untuk drill-down ke All ONUs per OLT</li>
                  <li>Sort OLT cards by status/name/problems/offline count</li>
                </ul>
              </>
            }
          />
          {hasPerm('settings_ip_olts') && (
            <button onClick={() => syncAllMutation.mutate()} disabled={syncingAll || syncingOlt !== null}
              className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 text-sm font-medium transition-all disabled:opacity-50 flex-1 sm:flex-none justify-center">
              <Zap size={16} className={syncingAll ? 'animate-pulse' : ''} /> Sync All
            </button>
          )}
          <button onClick={async () => {
            setRefreshing(true);
            manualRefreshRef.current = true;
            await refetch();
            manualRefreshRef.current = false;
            setTimeout(() => setRefreshing(false), 500);
          }} disabled={showRefreshSpinner}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-glass border border-brd hover:border-accent/30 text-sm transition-all disabled:opacity-50 flex-1 sm:flex-none justify-center">
            <RefreshCw size={16} className={showRefreshSpinner ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats — 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <StatCard icon={<Server size={18} />} label="OLT" value={olts.length}
          sub={`${onlineCount} online · ${olts.length - onlineCount} offline`} color="accent" />
        <StatCard icon={<Radio size={18} />} label="Total ONU" value={stats.total_onu}
          sub={`${stats.online_pct}% online`} color="info"
          progress={stats.total_onu > 0 ? stats.online_pct : 0} />
        <StatCard icon={<Wifi size={18} />} label="ONU Online" value={stats.online}
          sub={`${stats.online_pct}%`} color="success" />
        <StatCard icon={<AlertTriangle size={18} />} label="ONU Problem" value={totalProblem}
          sub={totalProblem > 0 ? `${stats.offline} off · ${stats.dyinggasp} dyg · ${stats.los} LOS` : 'Semua normal'}
          color={totalProblem > 0 ? 'danger' : 'muted'} />
      </div>

      {/* Signal Distribution Bar */}
      <div className="glass-card p-4">
        <h3 className="text-xs font-medium text-tx3 mb-2.5 uppercase tracking-wide">Signal Quality Distribution</h3>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-glass">
          {stats.total_onu > 0 && (
            <>
              <div className="bg-success transition-all" style={{ width: `${Math.max(0, stats.online - stats.los - stats.dyinggasp) / stats.total_onu * 100}%` }} />
              <div className="bg-warning transition-all" style={{ width: `${stats.dyinggasp / stats.total_onu * 100}%` }} />
              <div className="bg-danger transition-all" style={{ width: `${stats.los / stats.total_onu * 100}%` }} />
              <div className="bg-offline transition-all" style={{ width: `${stats.offline / stats.total_onu * 100}%` }} />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-3 md:gap-6 mt-2.5 text-[11px] text-tx3">
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-success" /> Online ({stats.online})</span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-warning" /> DyingGasp ({stats.dyinggasp})</span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-danger" /> LOS ({stats.los})</span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-offline" /> Offline ({stats.offline})</span>
        </div>
      </div>

      {/* Sync Progress Bar */}
      {syncingOlt !== null && (
        <div className="glass-card p-4 border border-accent/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw size={14} className="animate-spin text-accent" />
              <span className="font-medium">Syncing OLT...</span>
              <span className="text-tx3 text-xs">{syncMessage}</span>
            </div>
            <span className="text-sm font-bold text-accent">{syncProgress}%</span>
          </div>
          <div className="h-2 rounded-full bg-glass overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${syncProgress}%` }} />
          </div>
        </div>
      )}

      {/* Filter / Sort Bar */}
      <div className="glass-card p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-tx3 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama OLT atau IP..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-glass border border-brd focus:outline-none focus:border-accent/50 text-tx1 placeholder:text-tx3"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-glass border border-brd focus:outline-none focus:border-accent/50 text-tx1"
            >
              <option value="all">Semua Status</option>
              <option value="online">Online Only</option>
              <option value="offline">Offline Only</option>
            </select>
            <div className="relative">
              <ArrowUpDown size={11} className="absolute left-2 top-2.5 text-tx3 pointer-events-none" />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="pl-7 pr-2.5 py-1.5 text-xs rounded-lg bg-glass border border-brd focus:outline-none focus:border-accent/50 text-tx1 appearance-none"
              >
                <option value="status">Sort: Status</option>
                <option value="name">Sort: Nama</option>
                <option value="problems">Sort: Problem</option>
                <option value="offline">Sort: Offline ONU</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* OLT Grid */}
      {sortedOlts.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Server size={40} className="text-tx3 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-tx2 font-medium">
            {searchTerm || statusFilter !== 'all' ? 'Tidak ada OLT yang cocok' : 'Belum ada OLT'}
          </p>
          <p className="text-xs text-tx3 mt-1">
            {searchTerm || statusFilter !== 'all' ? 'Coba ubah filter pencarian' : 'Tambah OLT di Settings → OLT Settings'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sortedOlts.map(olt => (
            <OltCard
              key={olt.id}
              olt={olt}
              onSync={hasPerm('settings_ip_olts') ? () => syncMutation.mutate(olt.id) : undefined}
              syncing={syncingOlt === olt.id}
              syncProgress={syncingOlt === olt.id ? syncProgress : undefined}
              onConfig={hasPerm('settings_ip_olts') ? () => navigate(`/dashboard/settings/olts/${olt.id}/config`) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color, progress }: {
  icon: React.ReactNode; label: string; value: number; sub?: string;
  color: string; progress?: number;
}) {
  const border: Record<string, string> = {
    accent: 'border-accent/20 bg-accent/5',
    success: 'border-success/20 bg-success/5',
    danger: 'border-danger/20 bg-danger/5',
    warning: 'border-warning/20 bg-warning/5',
    info: 'border-info/20 bg-info/5',
    muted: 'border-brd',
  };
  const tc: Record<string, string> = {
    accent: 'text-accent', success: 'text-success', danger: 'text-danger',
    warning: 'text-warning', info: 'text-info', muted: 'text-tx3',
  };
  const pc: Record<string, string> = {
    accent: 'bg-accent', success: 'bg-success', info: 'bg-success',
    danger: 'bg-danger', warning: 'bg-warning', muted: 'bg-offline',
  };
  return (
    <div className={cn('glass-card p-3 md:p-4 border', border[color] || border.accent)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">{label}</p>
        <span className={tc[color] || tc.accent}>{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {progress !== undefined && (
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-glass overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', pc[color] || 'bg-accent')} style={{ width: `${progress}%` }} />
        </div>
      )}
      {sub && <div className={cn('text-[11px] mt-1', tc[color])}>{sub}</div>}
    </div>
  );
}

function OltCard({ olt, onSync, syncing, syncProgress, onConfig }: {
  olt: OltInfo; onSync?: () => void; syncing: boolean;
  syncProgress?: number; onConfig?: () => void;
}) {
  const problemCount = (olt.offline_onu || 0) + (olt.dyinggasp_onu || 0) + (olt.los_onu || 0);
  const onlinePct = olt.total_onu > 0 ? Math.round((olt.online_onu / olt.total_onu) * 100) : 0;

  return (
    <div className={cn(
      'rounded-xl border bg-glass overflow-hidden transition-all hover:shadow-md animate-fade-in',
      !olt.is_online
        ? 'border-l-4 border-l-danger border-danger/25'
        : problemCount > 0
          ? 'border-l-4 border-l-warning border-warning/20'
          : 'border-brd'
    )}>
      {/* Header */}
      <div className={cn('px-3 pt-3 pb-2.5 flex items-start justify-between border-b',
        !olt.is_online ? 'border-danger/15' : 'border-brd/50')}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            {olt.is_online ? (
              <>
                <span className="absolute inset-0 rounded-full bg-success opacity-25 animate-ping" />
                <Wifi size={16} className="text-success relative" />
              </>
            ) : (
              <WifiOff size={16} className="text-danger" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold truncate">{olt.name}</h3>
            <p className="text-[10px] font-mono text-tx3">{olt.ip_address}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {problemCount > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] bg-warning/15 text-warning rounded font-bold">
              {problemCount}⚠
            </span>
          )}
          <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium',
            olt.is_online ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
            {olt.is_online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* ONU Progress */}
      <div className="px-3 py-2.5 border-b border-brd/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-tx3 uppercase tracking-wide">ONU</span>
          <span className="text-[10px] font-medium text-tx2">
            {olt.online_onu}/{olt.total_onu}
            <span className={cn('ml-1', onlinePct < 80 && olt.total_onu > 0 ? 'text-warning' : 'text-success')}>
              ({onlinePct}%)
            </span>
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-glass overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500',
              onlinePct >= 90 ? 'bg-success' : onlinePct >= 70 ? 'bg-warning' : 'bg-danger')}
            style={{ width: `${onlinePct}%` }}
          />
        </div>
        {problemCount > 0 && (
          <p className="text-[9px] text-danger mt-0.5">
            {olt.offline_onu > 0 && `${olt.offline_onu} offline`}
            {olt.dyinggasp_onu > 0 && ` · ${olt.dyinggasp_onu} dyinggasp`}
            {olt.los_onu > 0 && ` · ${olt.los_onu} LOS`}
          </p>
        )}
      </div>

      {/* Sync progress inline */}
      {syncing && syncProgress !== undefined && (
        <div className="px-3 py-1.5 border-b border-brd/50">
          <div className="flex items-center justify-between text-[10px] text-tx3 mb-1">
            <span className="flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Syncing...</span>
            <span className="text-accent font-medium">{syncProgress}%</span>
          </div>
          <div className="h-1 rounded-full bg-glass overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${syncProgress}%` }} />
          </div>
        </div>
      )}

      {/* Device Info — 3 col */}
      <div className="px-3 py-2 grid grid-cols-3 gap-2 border-b border-brd/50 text-center">
        <div>
          <div className="text-[9px] text-tx3 uppercase">Model</div>
          <div className="text-[10px] font-medium text-tx2 truncate" title={olt.model ?? ''}>{olt.model || '-'}</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-0.5 text-[9px] text-tx3 uppercase">
            <Thermometer size={9} />Suhu
          </div>
          <div className={cn('text-[10px] font-semibold', tempColor(olt.temperature))}>
            {olt.temperature != null ? `${olt.temperature}°C` : 'N/A'}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-0.5 text-[9px] text-tx3 uppercase">
            <Clock size={9} />Uptime
          </div>
          <div className="text-[10px] font-medium text-tx2">{uptimeStr(olt.uptime)}</div>
        </div>
      </div>

      {/* Fan Status compact */}
      {olt.fans && olt.fans.length > 0 && (
        <div className="px-3 py-2 border-b border-brd/50">
          <div className="flex items-center gap-2 flex-wrap">
            <Fan size={10} className="text-tx3" />
            {olt.fans.map(f => (
              <span key={f.number} className="flex items-center gap-1 text-[9px]">
                <span className={cn('w-1.5 h-1.5 rounded-full', f.status === 'online' ? 'bg-success' : 'bg-offline')} />
                <span className="text-tx3">F{f.number} {f.rpm}RPM</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions + Timestamp */}
      <div className="px-3 py-2 flex items-center gap-1.5">
        {onConfig && (
        <button
          onClick={onConfig}
          className="flex-1 inline-flex items-center justify-center px-2 py-1 text-[10px] bg-accent/10 border border-accent/20 hover:bg-accent/20 rounded text-accent font-medium transition-colors"
        >
          <ExternalLink size={10} className="mr-1" /> Config
        </button>
        )}
        {onSync && (
          <button
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center px-2 py-1 text-[10px] border border-brd hover:bg-glass rounded text-tx3 hover:text-tx1 disabled:opacity-50 transition-colors"
            title="Sync"
          >
            <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
          </button>
        )}
        <span className="ml-auto text-[9px] text-tx3 shrink-0 flex items-center gap-0.5">
          <Clock size={9} /> {formatDate(olt.last_sync)}
        </span>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-glass rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="glass-card p-4 h-28" />)}
      </div>
      <div className="glass-card p-5 h-20" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-card p-5 h-64" />
        <div className="glass-card p-5 h-64" />
      </div>
    </div>
  );
}
