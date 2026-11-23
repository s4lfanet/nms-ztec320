import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api, type DashboardData, type OltInfo, type NotificationsResponse, type PulseOlt } from '../lib/api';
import { timeAgo, cn } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import {
  Server, Thermometer, RefreshCw, Zap, ExternalLink,
  TrendingUp, Bell, ArrowRight,
} from 'lucide-react';
import { useHasPerm } from '../hooks/useHasPerm';
import { useTranslation } from 'react-i18next';
import { useDashboardWs } from '../hooks/useDashboardWs';
import { useCountUp } from '../hooks/useCountUp';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { OltDeviceArt } from '../components/OltDeviceArt';
import { Button, Card, EmptyState, Select, Notice, LivePulse, Sparkline, Heartbeat, type HeartbeatBeat } from '../components/ui';
import { FilterBar, SearchBar } from '../components/shared';
import { useStatusFlash, flashClass } from '../hooks/useStatusFlash';

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
  const { t } = useTranslation();
  const { data: incidentData } = useQuery({
    queryKey: ['incidents', 'active'], queryFn: () => api.incidents('active'), refetchInterval: 30000,
  });
  const activeIncidentCount = incidentData?.active_count ?? 0;
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

  const manualRefreshRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard({ nocache: manualRefreshRef.current }),
    refetchInterval: REFRESH_INTERVAL * 1000,
  });

  // Fetch problem ONUs — all non-online statuses (los, dyinggasp, offline)
  const { data: problemOnus } = useQuery({
    queryKey: ['dashboard-problem-onus'],
    queryFn: async () => {
      const [los, dg, off] = await Promise.all([
        api.allOnus({ status: 'los', page_size: 5, sort_by: 'rx_onu', sort_dir: 'asc' }),
        api.allOnus({ status: 'dyinggasp', page_size: 5, sort_by: 'rx_onu', sort_dir: 'asc' }),
        api.allOnus({ status: 'offline', page_size: 5, sort_by: 'rx_onu', sort_dir: 'asc' }),
      ]);
      return [...los.onus, ...dg.onus, ...off.onus];
    },
    refetchInterval: REFRESH_INTERVAL * 1000,
    enabled: !!data,
  });

  // Denyut 24 jam (sparkline online + strip putus per OLT) — dari riwayat status di DB
  const { data: pulse } = useQuery({
    queryKey: ['dashboard-pulse'], queryFn: () => api.dashboardPulse(24),
    refetchInterval: 120_000, enabled: !!data,
  });

  // Fetch recent alarm notifications
  const { data: notifData } = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: () => api.notifications({ limit: 5, type: 'alarm' }),
    refetchInterval: REFRESH_INTERVAL * 1000,
  });

  const showRefreshSpinner = isFetching || refreshing;
  const olts = (data as DashboardData)?.olts ?? [];

  // WebSocket listener — real-time updates: refresh dashboard on alert or
  // ONU status change ('onu_change' also covers sync completion — see ws_bridge.py)
  const alertWsMsg = useDashboardWs();
  useEffect(() => {
    if (alertWsMsg && (alertWsMsg.event === 'alert' || alertWsMsg.event === 'onu_change')) {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [alertWsMsg, queryClient]);

  const syncMutation = useMutation({
    mutationFn: async (oltId: number) => {
      const ok = await confirm({
        title: t('dashboard.syncConfirmTitle'),
        message: t('dashboard.syncConfirmMsg'),
        confirmLabel: t('dashboard.syncNow'),
        variant: 'warning',
      });
      if (!ok) throw new Error('cancelled');
      return api.syncOlt(oltId);
    },
    onSuccess: (d, oltId) => {
      setSyncingOlt(oltId);
      setSyncProgress(0);
      setSyncMessage(d?.message || t('dashboard.startingSync'));
      toast.success(d?.message || t('dashboard.syncStarted'));
    },
    onError: (e: Error) => {
      if (e.message !== 'cancelled') toast.error(t('dashboard.syncFailed', { msg: e.message }));
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: t('dashboard.syncAllTitle'),
        message: t('dashboard.syncAllMsg', { count: olts?.length || 0 }),
        confirmLabel: t('dashboard.syncAll'),
        variant: 'warning',
      });
      if (!ok) throw new Error('cancelled');
      return api.syncAllOlts();
    },
    onSuccess: () => {
      setSyncingAll(true);
      toast.success(t('dashboard.syncAllStarted'));
    },
    onError: (e: Error) => {
      if (e.message !== 'cancelled') toast.error(t('dashboard.syncAllFailed', { msg: e.message }));
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
        if (s.status === 'completed' || s.status === 'error' || s.status === 'skipped' || s.status === 'interrupted') {
          clearInterval(interval);
          setSyncingOlt(null);
          if (s.status === 'completed') {
            toast.success(t('dashboard.syncCompleted'));
          } else if (s.status === 'error') {
            toast.error(t('dashboard.syncFailed', { msg: s.message || '' }));
          } else {
            toast.info(s.message || t('dashboard.syncSkipped'));
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
          if (anyError) toast.error(t('dashboard.someSyncFailed'));
          else toast.success(t('dashboard.allSynced'));
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['olts'] });
          queryClient.invalidateQueries({ queryKey: ['all-onus'] });
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [syncingAll, olts, queryClient]);

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

  // Kartu berkedip saat kondisi OLT berubah (down/naik, ada/hilang gangguan).
  const oltFlash = useStatusFlash(
    olts,
    o => o.id,
    o => (!o.is_online ? 'down' : (o.offline_onu || 0) + (o.dyinggasp_onu || 0) + (o.los_onu || 0) > 0
      ? `warning:${(o.offline_onu || 0) + (o.dyinggasp_onu || 0) + (o.los_onu || 0)}` : 'up'),
  );

  // Network Health Score — weighted composite of infrastructure health.
  // 40% OLT availability + 40% ONU online rate + 20% ONU signal quality
  // (penalized by LOS/DyingGasp). Capped 0–100.
  const stats = (data as DashboardData | undefined)?.stats;
  const onlineCount = useMemo(() => olts.filter(o => o.is_online).length, [olts]);
  const healthScore = useMemo(() => {
    if (olts.length === 0 || !stats) return 0;
    const oltPct = (onlineCount / olts.length) * 40;
    const onuPct = stats.total_onu > 0 ? (stats.online / stats.total_onu) * 40 : 0;
    const problemPenalty = stats.total_onu > 0
      ? Math.min(20, ((stats.los + stats.dyinggasp) / stats.total_onu) * 40)
      : 0;
    return Math.max(0, Math.min(100, Math.round(oltPct + onuPct + (20 - problemPenalty))));
  }, [olts, stats, onlineCount]);

  const healthColor = healthScore >= 80 ? 'text-success' : healthScore >= 50 ? 'text-warning' : 'text-danger';
  const healthLabel = healthScore >= 80 ? t('dashboard.healthy') : healthScore >= 50 ? t('dashboard.warning') : t('dashboard.critical');

  const recentAlerts = useMemo(() => (notifData as NotificationsResponse | undefined)?.notifications || [], [notifData]);
  const problemList = useMemo(() => (problemOnus || []).slice(0, 5), [problemOnus]);

  const onlineDisplay = useCountUp(stats?.online ?? 0);
  if (isLoading) return <DashboardSkeleton />;
  if (!stats) return null;

  const totalProblem = (stats.offline || 0) + (stats.dyinggasp || 0) + (stats.los || 0);

  const pulseSeries = pulse ? [...pulse.online, stats.online] : [];
  const dayAgo = pulse?.online?.[0];
  const delta = dayAgo != null ? stats.online - dayAgo : null;
  const drops24 = pulse ? pulse.drops.reduce((a, b) => a + b, 0) : null;
  const goodSignal = Math.max(0, stats.online - stats.los - stats.dyinggasp);
  const pct = (n: number) => (stats.total_onu > 0 ? (n / stats.total_onu) * 100 : 0);

  return (
    <PageContainer>
      <PageHeader
        title={t('dashboard.title')}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <LivePulse updatedAt={dataUpdatedAt} fetching={isFetching} />
            <span>{t('dashboard.oltOnline', { online: onlineCount, total: olts.length })}</span>
          </span>
        }
        action={
          <>
            {hasPerm('settings_ip_olts') && (
              <Button
                variant="accent"
                icon={<Zap size={16} className={syncingAll ? 'animate-pulse' : ''} />}
                onClick={() => syncAllMutation.mutate()}
                disabled={syncingAll || syncingOlt !== null}
                className="flex-1 sm:flex-none"
              >
                {t('dashboard.syncAll')}
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<RefreshCw size={16} className={showRefreshSpinner ? 'animate-spin' : ''} />}
              disabled={showRefreshSpinner}
              className="flex-1 sm:flex-none"
              onClick={async () => {
                setRefreshing(true);
                manualRefreshRef.current = true;
                await refetch();
                manualRefreshRef.current = false;
                setTimeout(() => setRefreshing(false), 500);
              }}
            >
              {t('common.refresh')}
            </Button>
          </>
        }
      />
      {/* Satu momen cahaya: melintas tiap kali data dashboard diperbarui */}
      <div key={dataUpdatedAt} className="lightpath-rule run" aria-hidden />

      {activeIncidentCount > 0 && (
        <Notice tone="crit" title={t('dashboard.activeIncidents', { n: activeIncidentCount })}
          action={<Link to="/dashboard/incidents" className="text-xs font-semibold underline">{t('dashboard.openIncidents')}</Link>}>
          {t('dashboard.activeIncidentsHint')}
        </Notice>
      )}

      {/* ── Denyut jaringan: online + tren 24 jam | yang perlu perhatian ── */}
      <section className="pulse-panel" aria-label={t('dashboard.pulseTitle')}>
        <div className="min-w-0 flex flex-col gap-3">
          <div className="text-sm text-tx2">{t('dashboard.onuOnlineNow')}</div>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="pulse-figure text-tx1">{onlineDisplay}</span>
            <span className="pulse-unit pb-1">{t('dashboard.ofTotalOnu', { total: stats.total_onu, pct: stats.online_pct })}</span>
          </div>
          <Sparkline values={pulseSeries} height={56} tone={stats.online_pct >= 90 ? 'success' : stats.online_pct >= 70 ? 'warning' : 'danger'}
            label={t('dashboard.trend24h')} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tx3">
            <span>{t('dashboard.trend24h')}</span>
            {delta != null && (
              <span className={cn('pulse-delta', delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat')}>
                {delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '±0'} {t('dashboard.vs24h')}
              </span>
            )}
            {drops24 != null && <span>{t('dashboard.drops24h', { n: drops24 })}</span>}
          </div>
        </div>

        <div className="min-w-0 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-tx2">{t('dashboard.needsAttention')}</span>
            <span className={cn('text-xs font-semibold', healthColor)}>{t('dashboard.healthLine', { score: healthScore, label: healthLabel })}</span>
          </div>
          <div className="trouble-grid">
            {([
              ['los', stats.los, 'var(--color-danger)', t('common.los')],
              ['dyinggasp', stats.dyinggasp, 'var(--color-warning)', t('common.dyinggasp')],
              ['offline', stats.offline, 'var(--text-2)', t('common.offline')],
            ] as const).map(([key, n, color, label]) => (
              <button key={key} type="button" className="trouble-seg" data-zero={n === 0}
                style={{ '--seg': color } as React.CSSProperties}
                onClick={() => navigate(`/dashboard/onus?filter=${key}`)}>
                <span className="n">{n}</span>
                <span className="l">{label}</span>
              </button>
            ))}
          </div>
          <div>
            <div className="mix-bar" role="img" aria-label={t('dashboard.signalDist')}>
              <span className="bg-success" style={{ width: `${pct(goodSignal)}%` }} />
              <span className="bg-warning" style={{ width: `${pct(stats.dyinggasp)}%` }} />
              <span className="bg-danger" style={{ width: `${pct(stats.los)}%` }} />
              <span className="bg-offline" style={{ width: `${pct(stats.offline)}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-tx3">
              {totalProblem > 0 ? t('dashboard.problemLine', { n: totalProblem }) : t('dashboard.allNormal')}
            </div>
          </div>
        </div>
      </section>

      {syncingOlt !== null && (
        <Card className="border-accent/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw size={14} className="animate-spin text-accent" />
              <span className="font-medium">{t('dashboard.syncing')}</span>
              <span className="text-tx3 text-xs">{syncMessage}</span>
            </div>
            <span className="text-sm font-bold text-accent">{syncProgress}%</span>
          </div>
          <div className="h-2 rounded-full bg-glass overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${syncProgress}%` }} />
          </div>
        </Card>
      )}

      {/* ── OLT: satu baris per perangkat, dengan strip riwayat 24 jam ── */}
      <section className="flex flex-col gap-3" aria-label="OLT">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <h2 className="text-base font-semibold font-display text-tx1 sm:mr-auto">
            {t('dashboard.oltSection', { n: olts.length })}
          </h2>
          <FilterBar className="flex-nowrap flex-col sm:flex-row items-stretch sm:items-center">
            <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('dashboard.searchOlt')} className="sm:w-56" />
            <div className="flex gap-2">
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label={t('common.status')}
                options={[
                  { value: 'all', label: t('dashboard.allStatus') },
                  { value: 'online', label: t('dashboard.onlineOnly') },
                  { value: 'offline', label: t('dashboard.offlineOnly') },
                ]} />
              <Select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} aria-label={t('dashboard.sortName')}
                options={[
                  { value: 'status', label: t('dashboard.sortStatus') },
                  { value: 'name', label: t('dashboard.sortName') },
                  { value: 'problems', label: t('dashboard.sortProblems') },
                  { value: 'offline', label: t('dashboard.sortOffline') },
                ]} />
            </div>
          </FilterBar>
        </div>
        {sortedOlts.length === 0 ? (
          <EmptyState
            icon={Server}
            title={searchTerm || statusFilter !== 'all' ? t('dashboard.noOltMatch') : t('dashboard.noOlt')}
            description={searchTerm || statusFilter !== 'all' ? t('dashboard.adjustFilter') : t('dashboard.noOltHint')}
          />
        ) : (
          <div className="olt-rows">
            {sortedOlts.map(olt => (
              <OltRow
                key={olt.id}
                olt={olt}
                pulse={pulse?.olts?.[olt.id]}
                buckets={pulse?.buckets}
                flash={oltFlash.get(olt.id)}
                onSync={hasPerm('settings_ip_olts') ? () => syncMutation.mutate(olt.id) : undefined}
                syncing={syncingOlt === olt.id}
                syncProgress={syncingOlt === olt.id ? syncProgress : undefined}
                onConfig={hasPerm('settings_ip_olts') ? () => navigate(`/dashboard/settings/olts/${olt.id}/config`) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── ONU bermasalah + alert terbaru ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title={t('dashboard.problemOnus')} bodyClassName="p-3">
          {problemList.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-tx3 text-sm">
              <TrendingUp size={16} className="text-success" />
              <span>{t('dashboard.noProblems')}</span>
            </div>
          ) : (
            <div className="space-y-1">
              {problemList.map(o => (
                <button key={o.id} onClick={() => navigate(`/dashboard/onus/${o.id}`)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-glass transition-colors text-left group">
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0',
                    o.status === 'los' ? 'bg-danger' : o.status === 'dyinggasp' ? 'bg-warning' : 'bg-offline')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate group-hover:text-accent transition-colors">{o.name || o.serial_number}</div>
                    <div className="text-xs text-tx3 truncate">{o.olt_name}</div>
                  </div>
                  <span className={cn('text-xs font-medium',
                    o.status === 'los' ? 'text-danger' : o.status === 'dyinggasp' ? 'text-warning' : 'text-tx3')}>
                    {o.status === 'los' ? t('common.los') : o.status === 'dyinggasp' ? t('common.dyinggasp') : t('common.offline')}
                  </span>
                </button>
              ))}
            </div>
          )}
          {totalProblem > 5 && (
            <button onClick={() => navigate('/dashboard/onus?filter=problem')} className="mt-2 w-full text-center text-xs text-accent hover:underline flex items-center justify-center gap-1">
              {t('dashboard.viewAllProblems', { count: totalProblem })} <ArrowRight size={12} />
            </button>
          )}
        </Card>

        <Card title={t('dashboard.recentAlerts')} bodyClassName="p-3">
          {recentAlerts.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-tx3 text-sm">
              <Bell size={16} />
              <span>{t('dashboard.noAlarms')}</span>
            </div>
          ) : (
            <div className="space-y-1">
              {recentAlerts.map(n => (
                <div key={n.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-glass/50 transition-colors">
                  <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    n.severity === 'critical' ? 'bg-danger' : n.severity === 'warning' ? 'bg-warning' : 'bg-info')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    <div className="text-xs text-tx3 truncate">{n.message}</div>
                  </div>
                  <span className="text-xs text-tx3 shrink-0">{timeAgo(n.created_at)}</span>
                </div>
              ))}
            </div>
          )}
          {(notifData?.unread_count || 0) > 0 && (
            <div className="mt-2 text-center text-xs text-tx3">{t('dashboard.unreadAlerts', { count: notifData?.unread_count || 0 })}</div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}

function OltRow({ olt, pulse, buckets, onSync, syncing, syncProgress, onConfig, flash }: {
  olt: OltInfo; pulse?: PulseOlt; buckets?: string[];
  onSync?: () => void; syncing: boolean; syncProgress?: number; onConfig?: () => void; flash?: string;
}) {
  const { t } = useTranslation();
  const problemCount = (olt.offline_onu || 0) + (olt.dyinggasp_onu || 0) + (olt.los_onu || 0);
  const onlinePct = olt.total_onu > 0 ? Math.round((olt.online_onu / olt.total_onu) * 100) : 0;
  const tone = !olt.is_online ? 'danger' : problemCount > 0 && onlinePct < 90 ? 'warning' : 'success';
  const cpu = Math.max(0, ...(olt.cards || []).map(x => x.cpu_usage || 0));
  const mem = Math.max(0, ...(olt.cards || []).map(x => x.memory_usage || 0));
  const fanDown = (olt.fans || []).filter(f => f.status !== 'online');
  const drops = pulse ? pulse.drops.reduce((a, b) => a + b, 0) : null;
  const beats: HeartbeatBeat[] = pulse
    ? pulse.level.map((lv, i) => ({
      level: lv,
      title: `${buckets?.[i] ? new Date(buckets[i]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} · ${t('dashboard.beatTitle', { n: pulse.drops[i] })}`,
    }))
    : Array.from({ length: 24 }, () => ({ level: -1 }));

  return (
    <div className={cn('olt-row', flash && flashClass(flash.split(':')[0]))} data-tone={tone}>
      <div className="min-w-0 flex items-center gap-2.5">
        <OltDeviceArt vendor={olt.vendor} model={olt.model} cards={olt.cards} online={olt.is_online}
          problems={problemCount > 0} imageUrl={olt.image_url} className="w-[64px] h-[38px]" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-tx1 truncate">{olt.name}</div>
          <div className="text-xs text-tx3 truncate">
            <span className="font-mono">{olt.ip_address}</span>{olt.model ? ` · ${olt.model}` : ''}
            {!olt.is_online && <span className="text-danger font-medium"> · {t('common.offline')}</span>}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <Heartbeat beats={beats} label={t('dashboard.trend24h')} />
        <div className="mt-1 flex justify-between text-[11px] text-tx3">
          <span>{t('dashboard.h24')}</span>
          <span>{drops == null ? '—' : drops === 0 ? t('dashboard.noDrops') : t('dashboard.drops24h', { n: drops })}</span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-tx2 num">{olt.online_onu}/{olt.total_onu} ONU</span>
          <span className={cn('font-semibold num', onlinePct >= 90 ? 'text-success' : onlinePct >= 70 ? 'text-warning' : 'text-danger')}>{onlinePct}%</span>
        </div>
        <div className="meter mt-1.5">
          <span className={onlinePct >= 90 ? 'bg-success' : onlinePct >= 70 ? 'bg-warning' : 'bg-danger'} style={{ width: `${onlinePct}%` }} />
        </div>
        {problemCount > 0 && (
          <div className="mt-1 text-[11px] text-tx3 truncate">
            {[olt.los_onu && `${olt.los_onu} LOS`, olt.dyinggasp_onu && `${olt.dyinggasp_onu} dying gasp`, olt.offline_onu && `${olt.offline_onu} offline`].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 justify-between">
        <div className="text-xs text-tx3 leading-snug">
          <div className="flex items-center gap-1">
            <Thermometer size={12} />
            <span className={tempColor(olt.temperature)}>{olt.temperature != null ? `${olt.temperature}°C` : '—'}</span>
            {cpu > 0 && <span> · CPU {cpu}%</span>}
            {mem > 0 && <span> · RAM {mem}%</span>}
          </div>
          <div className={fanDown.length ? 'text-warning' : ''}>
            {fanDown.length ? t('dashboard.fanDown', { list: fanDown.map(f => `F${f.number}`).join(', ') }) : `${t('dashboard.uptime')} ${uptimeStr(olt.uptime)}`}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onConfig && (
            <Button variant="secondary" icon={<ExternalLink size={14} />} onClick={onConfig} className="!py-1.5 !px-2.5 text-xs">{t('dashboard.config')}</Button>
          )}
          {onSync && (
            <button onClick={onSync} disabled={syncing} title={t('dashboard.syncNow')} aria-label={t('dashboard.syncNow')}
              className="touch-target inline-flex items-center justify-center w-8 h-8 rounded-lg border border-brd hover:bg-glass text-tx3 hover:text-tx1 disabled:opacity-50 transition-colors">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {syncing && syncProgress !== undefined && (
        <div className="md:col-span-4">
          <div className="h-1 rounded-full bg-glass overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${syncProgress}%` }} />
          </div>
        </div>
      )}
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
