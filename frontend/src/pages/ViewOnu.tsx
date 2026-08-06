import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import {
  Wifi, Clock, RefreshCw, RotateCcw, Trash2, Ban, Eraser,
  FileText, Radio, Globe, Shield, Key, Plug, Database, Layers,
  Edit3, X, ArrowDown, ArrowUp, Activity, Plus, Save, Power, WifiOff, ChevronDown, Replace
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useHasPerm } from '../hooks/useHasPerm';

interface ModalState { type: string; data?: Record<string, unknown>; }

const AUTH_TYPE_LABELS: Record<string, string> = {
  'wpa2-psk': 'WPA2-PSK',
  'wpa-psk': 'WPA-PSK',
  'wpa-wpa2-psk': 'Mixed WPA/WPA2-PSK',
  'open': 'Open',
  'open-system': 'Open',
  'no-auth': 'Open',
};
const authTypeLabel = (raw: string | undefined): string => {
  if (!raw) return '--';
  return AUTH_TYPE_LABELS[raw] || raw;
};

export function ViewOnu() {
  const { id, oltId, frame, slot, onuNum } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const hasPerm = useHasPerm();

  // Support both URL formats:
  // 1. /onus/:id (simple DB id)
  // 2. /all-onus/view-c3-r/gpon/:oltId/:frame/:slot/:onuNum (R-Config compatible)
  const [resolvedId, setResolvedId] = useState<number>(id ? Number(id) : 0);
  const rconfigMode = !id && oltId && frame && slot && onuNum;

  // If R-Config URL, look up the ONU by address
  useEffect(() => {
    if (rconfigMode) {
      fetch(`/api/onu/lookup/${oltId}/${frame}/${slot}/${onuNum}`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.success && d.id) setResolvedId(d.id); })
        .catch(() => {});
    }
  }, [rconfigMode, oltId, frame, slot, onuNum]);

  const onuId = resolvedId;
  const [modal, setModal] = useState<ModalState | null>(null);
  const [configContent, setConfigContent] = useState('');
  const [trafficHistory, setTrafficHistory] = useState<Array<{ t: string; dl: number; ul: number }>>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['onu-detail', onuId], queryFn: () => api.onuDetail(onuId), enabled: !!onuId, refetchInterval: 120000,
  });

  // Live detail from Telnet — lazy, no auto-refetch (manual refresh only)
  const { data: liveData, isFetching: liveFetching, refetch: refetchLive } = useQuery<{
    success: boolean; live_detail: Record<string, unknown> | null;
    history: Array<{ date: string; event: string }>;
    wan_services_json: string;
  }>({
    queryKey: ['onu-live-detail', onuId], queryFn: () => api.onuLiveDetail(onuId), enabled: !!onuId, refetchInterval: false,
  });

  // Invalidate DB detail when live data arrives (replaces React Query v4 onSuccess)
  // Also invalidate all-onus so All ONU page shows updated RX power after returning
  useEffect(() => {
    if (liveData) {
      qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
      qc.invalidateQueries({ queryKey: ['all-onus'] });
    }
  }, [liveData, onuId, qc]);

  // Live traffic polling every 3 seconds (matches R-Config behavior)
  const { data: trafficData } = useQuery({
    queryKey: ['onu-traffic', onuId], queryFn: () => api.onuTraffic(onuId), enabled: !!onuId, refetchInterval: 3000,
  });

  // Accumulate traffic history for the live chart (keep last 30 points)
  useEffect(() => {
    if (!trafficData?.traffic) return;
    const parseKbps = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
    const now = new Date();
    const t = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    const dl = parseKbps(trafficData.traffic.downstream_kbps);
    const ul = parseKbps(trafficData.traffic.upstream_kbps);
    setTrafficHistory(prev => [...prev.slice(-29), { t, dl, ul }]);
  }, [trafficData]);

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const actionMut = useMutation({
    mutationFn: async (action: string) => { setPendingAction(action); return api.onuAction(onuId, action); },
    onSuccess: (d, action) => {
      setPendingAction(null);
      if (d.success) {
        if (action === 'delete') {
          toast.success('ONU deleted. Auto-syncing OLT...');
          navigate('/dashboard/onus');
          return;
        }
        const labels: Record<string, string> = {
          'reset': 'Reboot', 'clear-config': 'Clear Config', 'disable': 'Disable',
          'enable': 'Enable', 'restore-factory': 'Factory Reset', 'restore-wifi': 'WiFi Reset',
        };
        const label = labels[action] || 'Action';
        const autoSync = ['clear-config', 'restore-factory', 'restore-wifi'].includes(action);
        toast.success(`${label} completed!${autoSync ? ' Auto-syncing OLT...' : ''}`);
        qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
        qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
        qc.invalidateQueries({ queryKey: ['all-onus'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['olts'] });
        // Re-fetch after auto-sync completes (sync takes ~5-10s)
        if (autoSync) {
          setTimeout(() => {
            qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['all-onus'] });
            qc.invalidateQueries({ queryKey: ['notifications'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            qc.invalidateQueries({ queryKey: ['olts'] });
          }, 8000);
          setTimeout(() => {
            qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['all-onus'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            qc.invalidateQueries({ queryKey: ['olts'] });
          }, 12000);
        }
        // For reboot/reset: ONU takes ~15-30s to come back online, re-fetch after delay
        if (action === 'reset' || action === 'reboot') {
          setTimeout(() => {
            qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['all-onus'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }, 15000);
          setTimeout(() => {
            qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
            qc.invalidateQueries({ queryKey: ['all-onus'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }, 30000);
        }
      } else toast.error(d.message || 'Action failed');
    },
    onError: (_e, action) => { setPendingAction(null); toast.error(`${action} failed`); },
  });

  const getStatusMut = useMutation({
    mutationFn: async () => { setPendingAction('get-status'); return api.onuGetStatus(onuId); },
    onSuccess: (d) => {
      setPendingAction(null);
      const status = d.status || d.data;
      if (d.success && status) { setModal({ type: 'getStatus', data: status }); qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['all-onus'] }); } else toast.error(d.message || 'Get Status failed');
    },
    onError: () => { setPendingAction(null); toast.error('Get Status failed'); },
  });

  const replaceMut = useMutation({
    mutationFn: async (newSerial: string) => { setPendingAction('replace'); return api.onuReplace(onuId, newSerial); },
    onSuccess: (d) => {
      setPendingAction(null);
      if (d.success) {
        toast.success(d.message || 'ONU replaced successfully!');
        qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
        qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
        qc.invalidateQueries({ queryKey: ['all-onus'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['olts'] });
        // Re-fetch after auto-sync (sync takes ~5-10s)
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
          qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
          qc.invalidateQueries({ queryKey: ['all-onus'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }, 8000);
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
          qc.invalidateQueries({ queryKey: ['all-onus'] });
        }, 15000);
      } else toast.error(d.message || 'Replace failed');
      setModal(null);
    },
    onError: () => { setPendingAction(null); toast.error('Replace ONU failed'); setModal(null); },
  });

  const updateFieldMut = useMutation({
    mutationFn: ({ field, value }: { field: string; value: string }) =>
      fetch(`/api/onu/${onuId}/update-field`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ field, value }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] }); setModal(null); toast.success('Updated!'); },
    onError: () => toast.error('Update failed'),
  });

  // Auto-resync config from OLT when page opens (once per ONU) — DB only, fast
  const resyncedRef = useRef<number>(0);
  useEffect(() => {
    if (!onuId || resyncedRef.current === onuId) return;
    resyncedRef.current = onuId;
    // Only refresh live data, don't trigger heavy resync on page load
    refetchLive();
  }, [onuId, refetchLive]);

  if (isLoading || (!onuId && !rconfigMode)) return <Skeleton />;
  if (error || (!data && onuId)) return (<div className="text-center py-20"><p className="text-tx3">Failed to load ONU details</p><button onClick={() => navigate('/dashboard/onus')} className="mt-4 text-accent hover:underline text-sm">&larr; Back to All ONUs</button></div>);
  if (!data) return <Skeleton />;

  const { onu } = data;
  const live_detail = liveData?.live_detail ?? null;
  const history = liveData?.history ?? [];
  const ld = live_detail || {};

  const doAction = async (action: string, label: string) => {
    const variant = action === 'delete' ? 'danger' : 'warning';
    const ok = await confirm({ title: `${label}?`, message: `${label} ONU "${onu.name}"?`, confirmLabel: label, variant });
    if (ok) actionMut.mutate(action);
  };
  const openFieldEdit = (label: string, field: string, value: string) => setModal({ type: 'editField', data: { label, field, value } });
  const openSectionEdit = (section: string, index: number, entry: Record<string, string>) => {
    const merged = { ...entry };
    if (section === 'wifi' && onu.wifi_config) {
      try {
        const wcfg = JSON.parse(onu.wifi_config);
        const dbSsids = wcfg.ssids || [];
        const wifiNum = entry.wifi_num || String(index + 1);
        const dbMatch = dbSsids.find((s: Record<string, unknown>) => String(s.ssid_num) === String(wifiNum));
        if (dbMatch) {
          if (!merged.ssid_password || merged.ssid_password === '--') {
            merged.ssid_password = dbMatch.ssid_password || '';
          }
          if (!merged.ssid_auth_type || merged.ssid_auth_type === '--') {
            merged.ssid_auth_type = dbMatch.ssid_auth_type || '';
          }
        }
      } catch { /* ignore parse error */ }
    }
    setModal({ type: 'sectionEdit', data: { section, index, entry: merged } });
  };
  const openWanEdit = (svcIdx: number) => {
    const svc = (ld.wan_services as Record<string, Record<string, string>>)?.[`service${svcIdx}`] || {};
    setModal({ type: 'wanEdit', data: { svcIdx, svc: { ...svc } } });
  };
  const showConfig = async () => {
    setPendingAction('show-config');
    try { const res = await fetch(`/api/onu/${onuId}/running-config`, { credentials: 'include' }); const d = await res.json(); setConfigContent(d.config || d.message || 'No config'); setModal({ type: 'showConfig' }); }
    catch { toast.error('Failed to get config'); }
    finally { setPendingAction(null); }
  };
  const statusColor = (s: string) => s === 'online' ? 'bg-success/15 text-success' : s === 'los' ? 'bg-danger/15 text-danger' : s === 'dyinggasp' ? 'bg-warning/15 text-warning' : 'bg-offline/15 text-tx3';
  const sigColor = (v: number | null) => v === null ? 'text-tx3' : v >= -26 ? 'text-success' : v >= -28 ? 'text-warning' : 'text-danger';

  // Guard: for non-online ONUs, optical values are stale/cached — display as N/A
  const isOnline = onu.status === 'online';
  const rxOlt = isOnline ? onu.rx_power : null;
  const rxOnu = isOnline ? onu.onu_rx_power : null;
  const txOnu = isOnline ? onu.tx_power : null;

  // Compute online duration from last_online (real-time, no Refresh Live needed)
  const onlineDuration = (() => {
    if (!isOnline || !onu.last_online) return '';
    const diff = Date.now() - new Date(onu.last_online).getTime();
    if (diff <= 0) return '';
    const totalSec = Math.floor(diff / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${d}D ${h}H ${m}M`;
  })();

  const wanServices = (ld.wan_services as Record<string, Record<string, string>>) || {};
  const tcontProfiles = (ld.tcont_profiles as string[]) || [];
  const gemports = (ld.gemports as string[]) || [];
  const services = (ld.services as string[]) || [];
  const remoteAccess = (ld.remote_access as Array<Record<string, string>>) || [];
  const veipEntries = (ld.veip_entries as Array<Record<string, string>>) || [];
  const tr069Entries = (ld.tr069_entries as Array<Record<string, string>>) || [];
  const wifiEntriesRaw = (ld.wifi_entries as Array<Record<string, string>>) || [];
  // Merge password from DB wifi_config (ZTE doesn't expose WPA keys in running-config)
  // For EPON ONUs, live_detail has no wifi_entries — show from DB wifi_config
  let wifiEntries = wifiEntriesRaw;
  if (onu.wifi_config) {
    try {
      const wcfg = JSON.parse(onu.wifi_config);
      const dbSsids = wcfg.ssids || [];
      if (wifiEntriesRaw.length > 0) {
        // Merge passwords from DB into live entries, and add DB-only SSIDs
        // (newly added SSIDs may not appear in OLT running-config immediately)
        const liveNums = new Set(wifiEntriesRaw.map(w => String(w.wifi_num || '')));
        const merged = wifiEntriesRaw.map(w => {
          const num = w.wifi_num || '';
          const dbMatch = dbSsids.find((s: Record<string, unknown>) => String(s.ssid_num) === String(num));
          if (dbMatch && (!w.ssid_password || w.ssid_password === '--')) {
            return { ...w, ssid_password: dbMatch.ssid_password || '' };
          }
          return w;
        });
        // Append DB-only SSIDs not in live read-back
        for (const s of dbSsids) {
          if (!liveNums.has(String(s.ssid_num))) {
            merged.push({
              wifi_num: String(s.ssid_num || ''),
              ssid_name: String(s.ssid_name || ''),
              ssid_auth_type: String(s.ssid_auth_type || ''),
              ssid_password: String(s.ssid_password || ''),
              status: String(s.wifi_status || 'up'),
              mode: String(s.wifi_mode || ''),
              vlan: String(s.vlan || ''),
            });
          }
        }
        wifiEntries = merged;
      } else if (dbSsids.length > 0) {
        // No live wifi entries (EPON) — show from DB
        wifiEntries = dbSsids.map((s: Record<string, unknown>) => ({
          wifi_num: String(s.ssid_num || ''),
          ssid_name: String(s.ssid_name || ''),
          ssid_auth_type: String(s.ssid_auth_type || ''),
          ssid_password: String(s.ssid_password || ''),
          status: String(s.wifi_status || 'up'),
          mode: String(s.wifi_mode || ''),
          vlan: String(s.vlan || ''),
        }));
      }
    } catch { /* ignore */ }
  }
  const ethEntries = (ld.eth_entries as Array<Record<string, string>>) || [];
  const isEpon = (onu.card || '').toLowerCase() === 'epon';

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 text-xs md:text-sm text-tx3 overflow-x-auto whitespace-nowrap pb-1">
        <button onClick={() => navigate('/dashboard')} className="hover:text-accent transition-colors">Dashboard</button>
        <span>/</span><button onClick={() => navigate('/dashboard/onus')} className="hover:text-accent transition-colors">All-ONUs</button>
        <span>/</span><span className="text-tx1">View / Onu</span>
      </div>

      {/* ONU Details Card */}
      <div className="glass-card">
        <div className="px-3 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Radio size={16} /> ONU Details</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => refetchLive()} disabled={liveFetching}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-glass border border-brd hover:border-accent/30 text-xs transition-all disabled:opacity-50">
              <RefreshCw size={13} className={liveFetching ? 'animate-spin' : ''} /> Refresh Live
            </button>
            {hasPerm('configure_onu') && <SaveConfigBtn onuId={onuId} />}
          </div>
        </div>
        <div className="p-3 md:p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            <DetailField label="OLT" value={onu.olt_name} />
            <DetailField label={(onu.card || '').toLowerCase() === 'epon' ? 'Epon Onu' : 'Gpon Onu'} value={onu.onu_id_str} mono onEdit={hasPerm('configure_onu') ? () => setModal({ type: 'moveOnu' }) : undefined} />
            <EditableField label="Actual Type" field="actual_type" value={onu.actual_type} onEdit={hasPerm('edit_onu_name') ? openFieldEdit : () => {}} />
            <DetailField label="Onu Type" value={onu.onu_type || (ld.onu_type as string) || '-'} onEdit={hasPerm('configure_onu') ? () => setModal({ type: 'onuType' }) : undefined} />
            <DetailField label="SN/MAC" value={onu.serial_number} mono />
            <div>
              <div className="label-sm">OLT / Onu RX</div>
              <div className="text-sm font-medium">
                <span className={sigColor(rxOlt)}>{rxOlt !== null ? `${rxOlt.toFixed(2)} dBm` : 'N/A'}</span>
                {' / '}
                <span className={sigColor(rxOnu)}>{rxOnu !== null ? `${rxOnu.toFixed(2)} dBm` : 'N/A'}</span>
              </div>
            </div>
            <div>
              <div className="label-sm">Status</div>
              <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', statusColor(onu.status))}>
                <span className={cn('w-1.5 h-1.5 rounded-full', onu.status === 'online' ? 'bg-success' : onu.status === 'los' ? 'bg-danger' : 'bg-offline')} />{onu.status}
              </span>
            </div>
            <DetailField label="Online Duration" value={ld.online_duration as string || (onu.status === 'online' ? 'Active' : '-')} />
            <EditableField label="Name" field="name" value={onu.name} onEdit={hasPerm('edit_onu_name') ? openFieldEdit : () => {}} />
            <EditableField label="Description" field="description" value={onu.description} onEdit={hasPerm('edit_onu_description') ? openFieldEdit : () => {}} />
          </div>

          {/* Traffic: current values */}
          <div className="flex gap-2 md:gap-4 mt-4">
            <div className="flex-1 flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg bg-glass">
              <ArrowDown size={18} className="text-success flex-shrink-0" />
              <div className="min-w-0"><div className="text-[10px] md:text-xs text-tx3 uppercase font-semibold">Download</div><div className="text-sm md:text-base font-bold text-success truncate">{trafficData?.traffic?.downstream_kbps || '0 Kbps'}</div></div>
            </div>
            <div className="flex-1 flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg bg-glass">
              <ArrowUp size={18} className="text-accent flex-shrink-0" />
              <div className="min-w-0"><div className="text-[10px] md:text-xs text-tx3 uppercase font-semibold">Upload</div><div className="text-sm md:text-base font-bold text-accent truncate">{trafficData?.traffic?.upstream_kbps || '0 Kbps'}</div></div>
            </div>
          </div>
          {/* Traffic live chart */}
          {trafficHistory.length > 1 && (
            <div className="mt-3">
              <div className="flex items-center gap-4 mb-1 text-xs text-tx3">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-success"></span> Download</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-accent"></span> Upload</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={trafficHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--color-tx3)' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--color-tx3)' }} unit=" K" />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: 'var(--text-2)' }} formatter={(v, name) => [`${v ?? 0} Kbps`, name === 'dl' ? 'Download' : 'Upload']} />
                  <Area type="monotone" dataKey="dl" stroke="var(--color-success)" fill="url(#dlGrad)" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="ul" stroke="var(--color-accent)" fill="url(#ulGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-brd">
            <div className="label-sm mb-2 flex items-center gap-1.5"><Clock size={13} /> Events History</div>
            {history && history.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(history as Array<Record<string, string>>).filter((h) => !(h.timestamp || '').startsWith('0000-00-00')).slice(0, 10).map((h, i) => {
                  const dateStr = h.timestamp || h.date || '';
                  const eventStr = h.status || h.event || '';
                  const isOnline = eventStr === '-' || eventStr.toLowerCase().includes('online');
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-glass text-xs">
                      <span className="font-semibold">{dateStr}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', isOnline ? 'bg-success/15 text-success' : eventStr?.includes('DyingGasp') ? 'bg-warning/15 text-warning' : eventStr?.includes('LOS') ? 'bg-danger/15 text-danger' : eventStr?.includes('Shutdown') ? 'bg-offline/15 text-tx3' : 'bg-offline/15 text-tx3')}>{isOnline ? 'Online' : eventStr || 'Unknown'}</span>
                    </div>
                  );
                })}
              </div>
            ) : (<div className="flex items-center gap-2 p-3 rounded-lg bg-glass text-xs text-tx3"><Clock size={14} /> No event history. Click <strong>Get Status</strong> to refresh.</div>)}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {hasPerm('reboot_onu') && <ActBtn icon={<RotateCcw size={14} />} label="Reboot" onClick={() => doAction('reset', 'Reboot')} loading={pendingAction === 'reset'} />}
        <ActBtn icon={<Activity size={14} />} label="Get Status" onClick={() => getStatusMut.mutate()} loading={pendingAction === 'get-status'} />
        <ActBtn icon={<FileText size={14} />} label="Show Config" onClick={showConfig} loading={pendingAction === 'show-config'} />
        {hasPerm('configure_onu') && <ActBtn icon={<RefreshCw size={14} />} label="Resync Config" onClick={async () => {
          const ok = await confirm({ title: 'Resync Config?', message: `Re-collect ONU config from OLT for "${onu.name}"?`, confirmLabel: 'Resync', variant: 'warning' });
          if (ok) {
            setPendingAction('resync');
            try {
              const res = await fetch(`/api/onu/${onuId}/resync-config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
              const d = await res.json();
              if (d.success) { qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] }); toast.success('Config resynced!'); } else toast.error(d.message || 'Failed');
            } catch { toast.error('Resync failed'); }
            finally { setPendingAction(null); }
          }
        }} loading={pendingAction === 'resync'} />}
        {hasPerm('clear_config_onu') && <ActBtn icon={<Eraser size={14} />} label="Clear Config" onClick={() => doAction('clear-config', 'Clear Config')} variant="danger" loading={pendingAction === 'clear-config'} />}
        {hasPerm('configure_onu') && <ActBtn icon={<WifiOff size={14} />} label="Reset WiFi" onClick={() => doAction('restore-wifi', 'Reset WiFi')} variant="warning" loading={pendingAction === 'restore-wifi'} />}
        {hasPerm('reset_onu') && <ActBtn icon={<Power size={14} />} label="Reset Factory" onClick={() => doAction('restore-factory', 'Factory Reset')} variant="danger" loading={pendingAction === 'restore-factory'} />}
        {hasPerm('disable_onu') && (onu.status === 'online' ? (
          <ActBtn icon={<Ban size={14} />} label="Disable ONU" onClick={() => doAction('disable', 'Disable')} variant="danger" loading={pendingAction === 'disable'} />
        ) : (
          <ActBtn icon={<Activity size={14} />} label="Enable ONU" onClick={() => doAction('enable', 'Enable')} variant="success" loading={pendingAction === 'enable'} />
        ))}
        {hasPerm('delete_onu') && <ActBtn icon={<Trash2 size={14} />} label="Delete" onClick={() => doAction('delete', 'Delete')} variant="danger" loading={pendingAction === 'delete'} />}
        {hasPerm('configure_onu') && <ActBtn icon={<Replace size={14} />} label="Replace ONU" onClick={() => setModal({ type: 'replaceOnu' })} variant="warning" loading={pendingAction === 'replace'} />}
      </div>

      {/* WAN */}
      <Card title="WAN" icon={<Globe size={16} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(svcIdx => {
            const svc = wanServices[`service${svcIdx}`] || {};
            const hasConfig = !!svc.vlan;
            return (
              <div key={svcIdx} className="p-3 rounded-lg bg-glass">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={hasConfig} readOnly className="cursor-pointer" />
                  <strong className="text-sm">Service {svcIdx}</strong>
                  {hasPerm('configure_onu') && <button onClick={() => openWanEdit(svcIdx)} className="ml-auto text-accent hover:text-accent-hover"><Edit3 size={13} /></button>}
                </div>
                {hasConfig ? (
                  <div className="mt-3 pl-1">
                    <div className="text-sm mb-2"><span className="text-accent font-bold">|</span> Vlan {svc.user_vlan || svc.vlan} - <strong>{svc.service_name || `service${svcIdx}`}</strong></div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-tx3">Download</span><strong>{svc.download_profile || 'DOWN-PPPOE'}</strong>
                      <span className="text-tx3">Upload</span><strong>{svc.upload_profile || 'UP-PPPOE'}</strong>
                      <span className="text-tx3">Mode</span><strong>{svc.mode || 'Bridge / ONU Webpage'}</strong>
                      <span className="text-tx3">IP</span><strong>{svc.ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(svc.ip) ? <a href={`http://${svc.ip}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" onClick={e => e.stopPropagation()}>{svc.ip}</a> : (svc.ip || '-')}</strong>
                      {(svc.mode || '').toLowerCase().includes('pppoe') && <>
                        <span className="text-tx3">PPPoE Username</span><strong>{svc.pppoe_username || '-'}</strong>
                        <span className="text-tx3">PPPoE Password</span><strong>{svc.pppoe_password || '-'}</strong>
                      </>}
                    </div>
                  </div>
                ) : (<div className="mt-2 pl-1 text-xs text-tx3"><span className="text-accent">|</span> <em>No config</em></div>)}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Remote Access */}
      <Card title="Remote Access" icon={<Shield size={16} />}
        action={hasPerm('configure_onu') ? <button onClick={() => setModal({ type: 'aclEdit', data: { entry: {}, isNew: true, newIndex: remoteAccess.length + 1 } })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover"><Plus size={13} /> Create</button> : undefined}>
        {remoteAccess.length > 0 ? (
          <DataTable headers={['ID','Mode','Ingress Type','Service List','Start IP','End IP','Action']}>
            {remoteAccess.map((acl, i) => (
              <tr key={i} className={hasPerm('configure_onu') ? 'cursor-pointer' : ''} onClick={hasPerm('configure_onu') ? () => setModal({ type: 'aclEdit', data: { entry: acl, index: parseInt(String(acl.acl_id)) || (i + 1), isNew: false } }) : undefined}>
                <td>{i+1}</td><td>{acl.mode||'-'}</td><td>{acl.ingress_type||'-'}</td><td>{acl.service_list||'-'}</td><td>{acl.start_ip||'-'}</td><td>{acl.end_ip||'-'}</td><td>{hasPerm('configure_onu') && <EditBtn />}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState icon={<Shield size={24} />} text={isEpon ? 'Remote Access not available for EPON ONUs' : 'No remote access rules'} />}
      </Card>

      {/* VEIP */}
      <Card title="VEIP" icon={<Key size={16} />}>
        {veipEntries.length > 0 ? (
          <DataTable headers={['ID','Status','Mode','Access VLAN','Trunk VLANs','Priority','IANA','Action']}>
            {veipEntries.map((v, i) => (
              <tr key={i} className={hasPerm('configure_onu') ? 'cursor-pointer' : ''} onClick={hasPerm('configure_onu') ? () => openSectionEdit('veip', i, v) : undefined}>
                <td>Veip {v.veip_id || i+1}</td><td><StatusPill online={v.status === 'UP'} label={v.status || 'UP'} /></td>
                <td>{v.mode||'N/A'}</td><td>{v.vlan||'--'}</td><td>--</td><td>{v.priority||'0'}</td><td>{v.iana||'N/A'}</td><td>{hasPerm('configure_onu') && <EditBtn />}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState icon={<Key size={24} />} text={isEpon ? 'VEIP not available for EPON ONUs' : 'No VEIP config from OLT'} />}
      </Card>

      {/* TR069 */}
      <Card title="TR069" icon={<Shield size={16} />}>
        {tr069Entries.length > 0 ? (
          <DataTable headers={['ID','ACS','Username','Password','VLAN','Priority','Action']}>
            {tr069Entries.map((tr, i) => (
              <tr key={i} className={hasPerm('configure_onu') ? 'cursor-pointer' : ''} onClick={hasPerm('configure_onu') ? () => openSectionEdit('tr069', i, tr) : undefined}>
                <td>{i+1}</td><td className="font-mono text-xs">{tr.acs_url||'N/A'}</td>
                <td>{tr.username||'N/A'}</td><td>{tr.password||'N/A'}</td><td>{tr.vlan||'untag'}</td><td>{tr.priority||'N/A'}</td><td>{hasPerm('configure_onu') && <EditBtn />}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState icon={<Shield size={24} />} text={isEpon ? 'TR069 not available for EPON ONUs' : 'No TR069 config from OLT'} />}
      </Card>

      {/* WiFi */}
      <Card title="WiFi" icon={<Wifi size={16} />}
        action={hasPerm('configure_onu') ? (
          <button onClick={() => {
            const usedNums = wifiEntries.map(w => Number(w.wifi_num || 0));
            const next = [1,2,3,4,5,6,7,8].find(n => !usedNums.includes(n)) || 3;
            openSectionEdit('wifi', -1, { wifi_num: String(next), ssid_name: `Wifi ${next}`, status: 'up', mode: 'N/A', vlan: '', priority: '0' });
          }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover"><Plus size={13} /> Add SSID</button>
        ) : undefined}>
        {wifiEntries.length > 0 ? (() => {
          // Group SSIDs by band: 2.4GHz (1-4), 5GHz (5-8)
          const band24 = wifiEntries.filter(w => { const n = Number(w.wifi_num || 0); return n >= 1 && n <= 4; });
          const band5 = wifiEntries.filter(w => Number(w.wifi_num || 0) >= 5);
          const renderGroup = (label: string, entries: typeof wifiEntries) => entries.length > 0 ? (
            <div className="mb-2 last:mb-0">
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <div className={cn('w-2 h-2 rounded-full', label.includes('5G') ? 'bg-info' : 'bg-accent')} />
                <span className="text-[11px] font-semibold text-tx2 uppercase tracking-wider">{label}</span>
                <span className="text-[10px] text-tx3">({entries.length} SSID{entries.length > 1 ? 's' : ''})</span>
              </div>
              <DataTable headers={['Port','Status','Mode','Access VLAN','Trunk VLANs','SSID','Auth','Password','Action']}>
                {entries.map((w, i) => (
                  <tr key={w.wifi_num || i} className={hasPerm('configure_onu') ? 'cursor-pointer' : ''} onClick={hasPerm('configure_onu') ? () => openSectionEdit('wifi', wifiEntries.indexOf(w), w) : undefined}>
                    <td><strong>Wifi {w.wifi_num || '?'}</strong></td>
                    <td><StatusPill online={['up','UP'].includes(w.status)} label={(w.status||'up').toUpperCase()} /></td>
                    <td>{w.mode||'DHCP From Onu'}</td><td>{w.vlan||'--'}</td><td>--</td>
                    <td className="font-medium text-tx1">{w.ssid_name||'-'}</td>
                    <td className="text-tx3 text-xs">{authTypeLabel(w.ssid_auth_type)}</td>
                    <td className="text-tx3 text-xs font-mono">{w.ssid_password || '--'}</td>
                    <td>{hasPerm('configure_onu') && <EditBtn />}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          ) : null;
          return <div>{renderGroup('2.4 GHz', band24)}{renderGroup('5 GHz', band5)}</div>;
        })() : <EmptyState icon={<Wifi size={24} />} text={isEpon ? 'No WiFi config (EPON — configured via ONU Web UI)' : 'No WiFi config from OLT'} />}
      </Card>

      {/* Ethernet */}
      <Card title="Ethernet" icon={<Plug size={16} />}>
        {ethEntries.length > 0 ? (
          <DataTable headers={['Port','Status','Mode','Access VLAN','Trunk VLANs','DHCP','Changes','Action']}>
            {ethEntries.map((e, i) => (
              <tr key={i} className={hasPerm('configure_onu') ? 'cursor-pointer' : ''} onClick={hasPerm('configure_onu') ? () => openSectionEdit('lan', i, e) : undefined}>
                <td><strong>LAN {e.gemport || i+1}</strong></td>
                <td><StatusPill online={e.status === 'up'} label={(e.status||'down').charAt(0).toUpperCase() + (e.status||'down').slice(1)} /></td>
                <td>{e.mode ? e.mode.charAt(0).toUpperCase() + e.mode.slice(1) : 'N/A'}</td><td>{e.access_vlan||'--'}</td><td>--</td>
                <td>{e.dhcp_mode||'Auto'}</td><td>{e.changes||'0'}</td><td>{hasPerm('configure_onu') && <EditBtn />}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState icon={<Plug size={24} />} text={isEpon ? 'Ethernet detail not available for EPON ONUs' : 'No Ethernet config from OLT'} />}
      </Card>

      {/* Optical Signal */}
      <Card title="Optical Signal" icon={<Activity size={16} />}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <SignalBox label="RX Power (OLT)" value={rxOlt} />
          <SignalBox label="RX Power (ONU)" value={rxOnu} />
          <SignalBox label="TX Power (ONU)" value={txOnu} />
          <div className="p-3 rounded-lg bg-glass text-center"><div className="text-xs text-tx3 mb-1">Distance</div><div className="text-lg font-bold font-mono">{String(ld.distance_m || onu.distance || '-')}</div><div className="text-xs text-tx3">m</div></div>
          <div className="p-3 rounded-lg bg-glass text-center"><div className="text-xs text-tx3 mb-1">Online Duration</div><div className="text-lg font-bold">{onlineDuration || String(ld.online_duration || '-')}</div></div>
        </div>
      </Card>

      {/* TCONT & GEM */}
      <Card title="TCONT & GEM Ports" icon={<Database size={16} />}>
        {tcontProfiles.length > 0 && (<>
          <h6 className="text-xs text-tx3 mb-2 font-semibold">TCONT Profiles</h6>
          <DataTable headers={['#','TCONT ID','Profile']}>{tcontProfiles.map((t, i) => (<tr key={i}><td>{i+1}</td><td><strong>{t.split(" ")[1] || '-'}</strong></td><td>{t.includes("profile ") ? t.split("profile ")[1] : '-'}</td></tr>))}</DataTable>
        </>)}
        {gemports.length > 0 && (<>
          <h6 className="text-xs text-tx3 mb-2 mt-4 font-semibold">GEM Ports</h6>
          <DataTable headers={['#','GEM Port','TCONT']}>{gemports.map((g, i) => (<tr key={i}><td>{i+1}</td><td><strong>{g.split(" ")[1] || '-'}</strong></td><td>{g.includes("tcont ") ? g.split("tcont ")[1].split(" ")[0] : '-'}</td></tr>))}</DataTable>
        </>)}
        {tcontProfiles.length === 0 && gemports.length === 0 && <EmptyState icon={<Database size={24} />} text={isEpon ? 'TCONT/GEM not applicable to EPON ONUs' : 'No TCONT/GEM data. Run Sync to collect.'} />}
      </Card>

      {/* VLAN Services */}
      <Card title="VLAN Services" icon={<Layers size={16} />}>
        {services.length > 0 ? (
          <DataTable headers={['#','Service Port','Vport','User VLAN','VLAN']}>
            {services.map((s, i) => { const parts = s.split(" "); const getVal = (kw: string) => { const idx = parts.indexOf(kw); return idx >= 0 && parts[idx+1] ? parts[idx+1] : '-'; }; return (<tr key={i}><td>{i+1}</td><td>{parts[1]||'-'}</td><td>{getVal('vport')}</td><td>{getVal('user-vlan')}</td><td>{getVal('vlan')}</td></tr>); })}
          </DataTable>
        ) : <EmptyState icon={<Layers size={24} />} text={isEpon ? 'No service-port data (EPON)' : 'No service-port data.'} />}
      </Card>

      {/* MODALS */}
      {modal && <ModalPortal onClose={() => setModal(null)}>
        {modal.type === 'editField' && <EditFieldModal data={modal.data!} onSave={(value) => updateFieldMut.mutate({ field: modal.data!.field as string, value })} onClose={() => setModal(null)} loading={updateFieldMut.isPending} />}
        {modal.type === 'onuType' && <OnuTypeModal onuId={onuId} oltId={onu.olt_id} currentType={onu.onu_type || (ld.onu_type as string) || ''} onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] }); setModal(null); }} />}
        {modal.type === 'moveOnu' && <MoveOnuModal onuId={onuId} onu={onu} onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] }); setModal(null); toast.success('ONU moved!'); }} />}
        {modal.type === 'sectionEdit' && <SectionEditModal data={modal.data!} onuId={onuId} oltId={onu.olt_id} onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] }); qc.invalidateQueries({ queryKey: ['all-onus'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); setModal(null); }} />}
        {modal.type === 'aclEdit' && <AclEditModal data={modal.data!} onuId={onuId} onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] }); setModal(null); }} />}
        {modal.type === 'showConfig' && (
          <div className="glass-card w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-brd flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2"><FileText size={16} /> ONU Running Config</h2>
              <button onClick={() => setModal(null)} className="text-tx3 hover:text-tx1"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-auto flex-1"><pre className="code-block !p-4 text-sm whitespace-pre-wrap break-all leading-relaxed">{configContent}</pre></div>
          </div>
        )}
        {modal.type === 'getStatus' && <GetStatusModal status={modal.data as Record<string, unknown>} onClose={() => setModal(null)} />}
        {modal.type === 'wanEdit' && <WanEditModal data={modal.data!} onuId={onuId} oltId={onu.olt_id} onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['onu-detail', onuId] }); qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] }); setModal(null); }} />}
        {modal.type === 'replaceOnu' && <ReplaceOnuModal onu={onu} onClose={() => setModal(null)} onConfirm={(newSerial) => replaceMut.mutate(newSerial)} loading={replaceMut.isPending} />}
      </ModalPortal>}
    </div>
  );
}

/* ═══ MODAL COMPONENTS ═══ */

function ModalPortal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center p-0 md:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-overlay" />
      <div className="relative w-full md:w-auto max-h-[90vh] md:max-h-none overflow-y-auto md:overflow-visible rounded-t-2xl md:rounded-none animate-slide-up md:animate-fade-in">{children}</div>
    </div>
  );
}


// ═══ Helper: fetch VLANs from OLT ═══
function useOltVlans(oltId: number) {
  const [vlans, setVlans] = useState<Array<{vlan_id: number; name: string}>>([]);
  useEffect(() => {
    fetch(`/api/olt/${oltId}/vlans`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success && d.vlans) setVlans(d.vlans); }).catch(() => {});
  }, [oltId]);
  return vlans;
}

// ═══ SearchableSelect — custom dropdown that stays open during scroll ═══
function SearchableSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find(o => o.value === value)?.label || value || '';

  return (
    <div className="relative" ref={ref}>
      {label && <label className="label-sm mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="input-field w-full text-left flex items-center justify-between gap-2 cursor-pointer"
      >
        <span className={cn('truncate text-sm', !value && 'text-tx3')}>
          {value ? selectedLabel : (placeholder || 'Select...')}
        </span>
        <ChevronDown size={14} className={cn('text-tx3 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className="absolute z-[9999] mt-1 w-full rounded-xl border border-brd shadow-2xl shadow-black/40 overflow-hidden"
          style={{ background: 'var(--bg-surface)', backdropFilter: 'blur(20px)' }}
          onMouseDown={e => e.stopPropagation()} // Prevent modal scroll from closing this
        >
          {/* Search input */}
          <div className="p-2 border-b border-brd">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full h-8 px-3 rounded-lg text-sm bg-glass border border-brd outline-none focus:border-accent/50"
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
            />
          </div>
          {/* Options list */}
          <div className="max-h-48 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-tx3">No results</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-accent/10 transition-colors',
                    o.value === value ? 'bg-accent/15 text-accent font-medium' : 'text-tx1'
                  )}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Helper: fetch speed profiles from OLT ═══
function useOltProfiles(oltId: number) {
  const [profiles, setProfiles] = useState<{tcont: string[]; traffic: string[]; wan_ip_profiles: Array<{name: string; cvlan?: string}>}>({tcont: [], traffic: [], wan_ip_profiles: []});
  useEffect(() => {
    fetch(`/api/olt/${oltId}/speed-profiles`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success) setProfiles({ tcont: d.tcont || [], traffic: d.traffic || [], wan_ip_profiles: d.wan_ip_profiles || [] }); }).catch(() => {});
  }, [oltId]);
  return profiles;
}

function EditFieldModal({ data, onSave, onClose, loading }: { data: Record<string, unknown>; onSave: (v: string) => void; onClose: () => void; loading: boolean; }) {
  const [val, setVal] = useState((data.value as string) || '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="glass-card w-full max-w-md">
      <div className="modal-header"><h2 className="text-sm font-semibold">Edit {data.label as string}</h2><button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button></div>
      <div className="p-3 md:p-5"><input ref={ref} type="text" value={val} onChange={e => setVal(e.target.value)} className="input-field" onKeyDown={e => { if (e.key === 'Enter') onSave(val); }} /></div>
      <div className="modal-footer"><button onClick={onClose} className="btn-cancel">Cancel</button><button onClick={() => onSave(val)} disabled={loading} className="btn-primary">{loading ? 'Saving...' : 'Save Changes'}</button></div>
    </div>
  );
}

function MoveOnuModal({ onuId, onu, onClose, onSuccess }: { onuId: number; onu: { olt_id: number; slot: number; port: number; onu_id: number }; onClose: () => void; onSuccess: () => void; }) {
  const [card, setCard] = useState(String(onu.slot));
  const [pon, setPon] = useState(String(onu.port));
  const [onuIdMode, setOnuIdMode] = useState<'auto' | 'manual'>('auto');
  const [onuIdValue, setOnuIdValue] = useState(String(onu.onu_id));
  const [structure, setStructure] = useState<{ card: number; ports: number[] }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/olt/${onu.olt_id}/pon-structure`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success && d.structure.length) setStructure(d.structure); });
  }, [onu.olt_id]);

  const availablePorts = structure.find(s => s.card === Number(card))?.ports || [];

  const save = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onu/${onuId}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ card: Number(card), pon: Number(pon), onu_id_mode: onuIdMode, onu_id_value: Number(onuIdValue) }),
      });
      const d = await res.json();
      if (d.success) { onSuccess(); }
      else { toast.error(d.message || 'Move failed'); }
    } catch { toast.error('Move failed'); }
    setLoading(false);
  };

  return (
    <div className="glass-card w-full max-w-md animate-fade-in">
      <div className="modal-header"><h2 className="text-sm font-semibold">Move ONU</h2><button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button></div>
      <div className="p-3 md:p-5 space-y-4 md:space-y-5">
        <div>
          <label className="label-sm mb-2">Card</label>
          <select value={card} onChange={e => { setCard(e.target.value); setPon(''); }} className="input-field">
            {structure.length === 0
              ? <option value={String(onu.slot)}>{String(onu.slot)}</option>
              : structure.map(s => <option key={s.card} value={s.card}>{s.card}</option>)}
          </select>
        </div>
        <div>
          <label className="label-sm mb-2">PON</label>
          <select value={pon} onChange={e => setPon(e.target.value)} className="input-field">
            {availablePorts.length === 0
              ? <option value={String(onu.port)}>{String(onu.port)}</option>
              : availablePorts.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label-sm mb-2">ONU ID</label>
          <div className="flex gap-5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="onuIdMode" checked={onuIdMode === 'auto'} onChange={() => setOnuIdMode('auto')} /> Automatic
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="onuIdMode" checked={onuIdMode === 'manual'} onChange={() => setOnuIdMode('manual')} /> Manually
            </label>
          </div>
          {onuIdMode === 'manual' && (
            <input type="number" min={1} max={128} value={onuIdValue} onChange={e => setOnuIdValue(e.target.value)}
              className="input-field mt-2" placeholder="ONU ID (1–128)" />
          )}
        </div>
      </div>
      <div className="modal-footer">
        <div className="flex gap-3 ml-auto">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={save} disabled={loading} className="btn-primary">{loading ? 'Moving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

function ReplaceOnuModal({ onu, onClose, onConfirm, loading }: {
  onu: { serial_number: string; name: string; actual_type: string; card: string };
  onClose: () => void; onConfirm: (newSerial: string) => void; loading: boolean;
}) {
  const [newSerial, setNewSerial] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const oldSn = onu.serial_number || '';
  const isEpon = (onu.card || '').toLowerCase() === 'epon';

  const handleConfirm = () => {
    if (!newSerial.trim()) return;
    onConfirm(newSerial.trim().toUpperCase());
  };

  const steps = [
    { label: 'Backup config from old ONU', icon: Database },
    { label: 'Delete old ONU from OLT', icon: Trash2 },
    { label: 'Register new ONU with new SN', icon: Plus },
    { label: 'Apply config to new ONU', icon: Replace },
  ];

  return (
    <div className="glass-card w-full max-w-md animate-fade-in">
      <div className="modal-header">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Replace size={16} /> Replace ONU (Swap SN)</h2>
        <button onClick={onClose} className="text-tx3 hover:text-tx1" disabled={loading}><X size={18} /></button>
      </div>
      <div className="p-4 md:p-5 space-y-4">
        {/* Current SN */}
        <div className="p-3 rounded-lg bg-glass">
          <div className="text-xs text-tx3 mb-1">Current SN / MAC</div>
          <div className="text-sm font-mono font-bold">{oldSn || '--'}</div>
          <div className="text-xs text-tx3 mt-1">Name: {onu.name || '--'} | Type: {onu.actual_type || '--'} | {isEpon ? 'EPON' : 'GPON'}</div>
        </div>

        {/* New SN input */}
        <div>
          <label className="label-sm mb-2">New SN / MAC</label>
          <input
            type="text"
            value={newSerial}
            onChange={e => setNewSerial(e.target.value)}
            placeholder={isEpon ? 'e.g. 7488.2a70.7346 or 74882A707346' : 'e.g. ZTEGC1A2B3C4 or FHTTC18705B0'}
            className="input-field font-mono"
            disabled={loading}
            autoFocus
          />
        </div>

        {/* Warning */}
        <div className="p-3 rounded-lg border border-warning/30 bg-warning/10">
          <div className="flex items-start gap-2">
            <Shield size={16} className="text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-warning leading-relaxed">
              <strong>Warning:</strong> Pergantian ONU akan menghapus ONU lama dan mengganti dengan perangkat baru menggunakan konfigurasi yang sama.
              Pastikan model ONU baru sama dengan ONU lama. Semua service, VLAN, dan profile akan dipertahankan.
            </div>
          </div>
        </div>

        {/* Confirm checkbox */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={loading} />
          Saya memahami konsekuensi dan ingin melanjutkan
        </label>

        {/* Progress steps (shown during loading) */}
        {loading && (
          <div className="space-y-2 pt-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-tx3">
                <RefreshCw size={12} className="animate-spin text-accent" />
                <step.icon size={12} />
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <div className="flex gap-3 ml-auto">
          <button onClick={onClose} className="btn-cancel" disabled={loading}>Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={loading || !newSerial.trim() || !confirmed}
            className="btn-primary bg-warning text-white border-warning hover:bg-warning/80"
          >
            {loading ? 'Replacing...' : 'Replace ONU'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnuTypeModal({ onuId, oltId, currentType, onClose, onSuccess }: { onuId: number; oltId: number; currentType: string; onClose: () => void; onSuccess: () => void; }) {
  const [types, setTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState(currentType);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Loading types from OLT...');
  useEffect(() => {
    fetch(`/api/olt/${oltId}/onu-types`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.types && d.types.length > 0) { setTypes(d.types); setStatus(`${d.types.length} types found on OLT`); }
        else setStatus('No types found.');
      }).catch(e => setStatus('Error: ' + e.message));
  }, [oltId]);
  const save = async () => { if (!selected) { toast.error('Please select a type'); return; } setLoading(true); try { const res = await fetch(`/api/onu/${onuId}/update-field`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ field: 'onu_type', value: selected }) }); const d = await res.json(); if (d.success) { onSuccess(); toast.success('Onu type updated!'); } else { toast.error(d.message || 'Failed to update ONU type'); } } catch { toast.error('Failed'); } setLoading(false); };
  return (
    <div className="glass-card w-full max-w-md">
      <div className="modal-header"><h2 className="text-sm font-semibold">Onu Type</h2><button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button></div>
      <div className="p-5">
        <p className="text-xs text-tx3 mb-3">{status}</p>
        <select value={selected} onChange={e => setSelected(e.target.value)} className="input-field">
          <option value="" disabled>Select Type</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="modal-footer"><button onClick={onClose} className="btn-cancel">Cancel</button><button onClick={save} disabled={loading} className="btn-primary">{loading ? 'Saving...' : 'Save Changes'}</button></div>
    </div>
  );
}

// ═══ WAN EDIT MODAL (matches original HTML exactly) ═══
function WanEditModal({ data, onuId, oltId, onClose, onSuccess }: { data: Record<string, unknown>; onuId: number; oltId: number; onClose: () => void; onSuccess: () => void; }) {
  const svcIdx = data.svcIdx as number;
  const svc = data.svc as Record<string, string>;
  const vlans = useOltVlans(oltId);
  const profiles = useOltProfiles(oltId);

  const isWanIp = (svc.mode || '').includes('Wan-IP');
  const isPppoe = (svc.mode || '').toLowerCase().includes('pppoe');

  const [enabled, setEnabled] = useState(!!svc.vlan);
  const [vlan, setVlan] = useState(svc.vlan || svc.user_vlan || '');
  const [cosEnabled, setCosEnabled] = useState(false);
  const [cos, setCos] = useState('');
  const [dlProfile, setDlProfile] = useState(svc.download_profile || 'default');
  const [ulProfile, setUlProfile] = useState(svc.upload_profile || 'default');
  const [mode, setMode] = useState(isPppoe ? 'PPPoE NAT' : isWanIp ? 'Wan-IP' : 'Bridge / ONU Webpage');
  const existingWanIpMode = isWanIp ? ((svc.mode || '').toLowerCase().includes('pppoe') ? 'pppoe' : (svc.mode || '').toLowerCase().includes('static') ? 'static' : 'dhcp') : 'dhcp';
  const [wanIpMode, setWanIpMode] = useState(existingWanIpMode);
  const [vlanProfile, setVlanProfile] = useState(svc.wan_ip_profile || '');
  const [staticIp, setStaticIp] = useState({ ip: '', netmask: '', gateway: '', dns1: '' });
  const [pppoe, setPppoe] = useState({ username: '', password: '' });
  const [ping, setPing] = useState(true);
  const [traceroute, setTraceroute] = useState(false);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onu/${onuId}/wan-service/${svcIdx}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          vlan, service_name: svc.service_name || `service${svcIdx}`,
          download_profile: dlProfile, upload_profile: ulProfile, mode,
          status: enabled ? 'enable' : 'disable',
          wan_ip_mode: wanIpMode, vlan_profile: vlanProfile,
          wan_ip: staticIp.ip, wan_netmask: staticIp.netmask,
          wan_gateway: staticIp.gateway, wan_dns1: staticIp.dns1,
          pppoe_username: pppoe.username, pppoe_password: pppoe.password,
          ping_response: ping, traceroute_response: traceroute,
        }),
      });
      const d = await res.json();
      if (d.success) { onSuccess(); toast.success('WAN service updated!'); } else { toast.error(d.message || 'Failed'); }
    } catch { toast.error('Failed'); }
    setLoading(false);
  };

  const SelectField = ({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: Array<{value: string; label: string}>; placeholder?: string }) => (
    <SearchableSelect label={label} value={value} onChange={onChange} options={options} placeholder={placeholder} />
  );

  return (
    <div className="glass-card w-full max-w-lg max-h-[85vh] flex flex-col">
      <div className="modal-header"><h2 className="text-sm font-semibold flex items-center gap-2"><Globe size={16} /> Service {svcIdx}</h2><button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button></div>
      <div className="p-3 md:p-5 overflow-y-auto space-y-3 md:space-y-4 flex-1">
        {/* Status */}
        <div><label className="label-sm mb-1">Status</label>
          <div className="flex gap-4"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="wanStatus" checked={enabled} onChange={() => setEnabled(true)} /> Enable</label><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="wanStatus" checked={!enabled} onChange={() => setEnabled(false)} /> Disable</label></div>
        </div>

        {/* VLAN */}
        <div className="flex items-center gap-2"><input type="checkbox" checked={!!vlan} onChange={e => { if (!e.target.checked) setVlan(''); }} className="cursor-pointer" /><label className="label-sm cursor-pointer" onClick={() => { if (!vlan) setVlan(' '); }}>Vlan</label></div>
        {!!vlan && <div className="flex gap-2 md:gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px]"><SelectField label="" value={vlan} onChange={setVlan} options={vlans.map(v => ({ value: String(v.vlan_id), label: `${v.vlan_id} - ${v.name}` }))} placeholder="Select Vlan" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={cosEnabled} onChange={e => setCosEnabled(e.target.checked)} className="cursor-pointer" /><span className="text-xs">CoS</span>
            {cosEnabled && <select value={cos} onChange={e => setCos(e.target.value)} className="input-field w-20"><option value="">CoS</option>{[0,1,2,3,4,5,6,7,8].map(c => <option key={c} value={c}>{c}</option>)}</select>}
          </div>
        </div>}

        {/* Service Limit Profile */}
        <div><label className="label-sm mb-1">Service Limit Profile</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField label="Download (Traffic)" value={dlProfile} onChange={setDlProfile}
              options={[...new Set([...profiles.traffic, dlProfile].filter(Boolean))].map(p => ({ value: p, label: p }))} placeholder="Select Traffic Profile" />
            <SelectField label="Upload (TCONT)" value={ulProfile} onChange={setUlProfile}
              options={[...new Set([...profiles.tcont, ulProfile].filter(Boolean))].map(p => ({ value: p, label: p }))} placeholder="Select TCONT Profile" />
          </div>
        </div>

        {/* Mode */}
        <div><label className="label-sm mb-1">Mode</label>
          <div className="flex flex-col gap-2">
            {[{v:'PPPoE NAT',l:'PPPoE NAT'},{v:'Wan-IP',l:'Wan-IP'},{v:'Bridge / ONU Webpage',l:'Bridge / ONU Webpage'}].map(m => (
              <label key={m.v} className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="wanMode" checked={mode === m.v} onChange={() => setMode(m.v)} /> {m.l}</label>
            ))}
          </div>
        </div>

        {/* Wan-IP sub-options */}
        {mode === 'Wan-IP' && <div className="space-y-3 pl-1 border-l-2 border-accent/30">
          <SelectField label="Mode WAN-IP" value={wanIpMode} onChange={setWanIpMode} options={[{value:'dhcp',label:'DHCP'},{value:'pppoe',label:'PPPoE'},{value:'static',label:'Static'}]} />
          <SelectField label="Vlan Profile" value={vlanProfile} onChange={setVlanProfile}
            options={profiles.wan_ip_profiles.map(wp => ({ value: wp.name, label: wp.cvlan ? `${wp.cvlan} - ${wp.name}` : wp.name }))}
            placeholder="Select Vlan Profile" />
          {wanIpMode === 'static' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label-sm mb-1">IP Address</label><input type="text" value={staticIp.ip} onChange={e => setStaticIp(p => ({...p, ip: e.target.value}))} placeholder="e.g. 192.168.1.100" className="input-field" /></div>
            <div><label className="label-sm mb-1">Netmask</label><input type="text" value={staticIp.netmask} onChange={e => setStaticIp(p => ({...p, netmask: e.target.value}))} placeholder="e.g. 255.255.255.0" className="input-field" /></div>
            <div><label className="label-sm mb-1">Gateway</label><input type="text" value={staticIp.gateway} onChange={e => setStaticIp(p => ({...p, gateway: e.target.value}))} placeholder="e.g. 192.168.1.1" className="input-field" /></div>
            <div><label className="label-sm mb-1">DNS1</label><input type="text" value={staticIp.dns1} onChange={e => setStaticIp(p => ({...p, dns1: e.target.value}))} placeholder="e.g. 8.8.8.8" className="input-field" /></div>
          </div>}
          <div className="flex gap-4"><label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={ping} onChange={e => setPing(e.target.checked)} /> Ping Response</label><label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={traceroute} onChange={e => setTraceroute(e.target.checked)} /> Traceroute Response</label></div>
        </div>}

        {/* PPPoE NAT sub-options */}
        {mode === 'PPPoE NAT' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1 border-l-2 border-accent/30">
          <div><label className="label-sm mb-1">Username</label><input type="text" value={pppoe.username} onChange={e => setPppoe(p => ({...p, username: e.target.value}))} placeholder="PPPoE Username" className="input-field" /></div>
          <div><label className="label-sm mb-1">Password</label><input type="password" value={pppoe.password} onChange={e => setPppoe(p => ({...p, password: e.target.value}))} placeholder="PPPoE Password" className="input-field" /></div>
        </div>}
      </div>
      <div className="modal-footer"><button onClick={onClose} className="btn-cancel">Cancel</button><button onClick={save} disabled={loading} className="btn-primary">{loading ? 'Saving...' : 'Save Changes'}</button></div>
    </div>
  );
}

// ═══ SECTION EDIT MODAL (WiFi/LAN/VEIP/TR069) ═══
function SectionEditModal({ data, onuId, oltId, onClose, onSuccess }: { data: Record<string, unknown>; onuId: number; oltId: number; onClose: () => void; onSuccess: () => void; }) {
  const qc = useQueryClient();
  const section = data.section as string;
  const entry = data.entry as Record<string, string>;
  const vlans = useOltVlans(oltId);
  const [loading, setLoading] = useState(false);

  // Build form state based on section type
  const [ssidNum, setSsidNum] = useState(entry.wifi_num || String((data.index as number ?? 0) + 1));
  const [status, setStatus] = useState((entry.status || 'up').toLowerCase() !== 'down' ? 'enable' : 'disable');
  const [mode, setMode] = useState(entry.mode || (section === 'wifi' ? 'N/A' : section === 'veip' ? 'Hybrid' : 'Access'));
  const [vlan, setVlan] = useState(entry.vlan || entry.access_vlan || '');
  const [priority, setPriority] = useState(entry.priority || '0');
  const [ssidNameEnabled, setSsidNameEnabled] = useState(true);
  const [ssidBroadcastName, setSsidBroadcastName] = useState(entry.ssid_name || '');
  const [ssidAuthEnabled, setSsidAuthEnabled] = useState(true);
  const [ssidAuthType, setSsidAuthType] = useState(entry.ssid_auth_type || 'open');
  const [ssidPassword, setSsidPassword] = useState(entry.ssid_password || '');
  const [ssidPwFromDb] = useState(!!entry.ssid_password && entry.ssid_password !== '--');
  const [iana, setIana] = useState(entry.iana || '');
  const [dhcpMode, setDhcpMode] = useState(entry.dhcp_mode || 'Auto');
  const [acsUrl, setAcsUrl] = useState(entry.acs_url || '');
  const [username, setUsername] = useState(entry.username || '');
  const [password, setPassword] = useState(entry.password || '');
  const [tr069Vlan, setTr069Vlan] = useState(entry.vlan || '');
  const [tr069VlanMode, setTr069VlanMode] = useState(entry.vlan && entry.vlan !== 'untag' ? 'tag' : 'untag');

  const save = async () => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { section, index: data.index };
      if (section === 'wifi') {
        payload.data = {
          ssid_num: Number(ssidNum),
          wifiMode: mode, wifiStatus: status, vlan, priority,
          ssid_name: ssidNameEnabled ? ssidBroadcastName.trim() : '',
          ssid_auth_type: ssidAuthEnabled ? ssidAuthType : '',
          ssid_password: ssidAuthEnabled && ssidAuthType !== 'open' ? ssidPassword : '',
        };
      } else if (section === 'lan') {
        payload.data = { lanMode: mode, lanStatus: status, access_vlan: vlan, dhcp_mode: dhcpMode };
      } else if (section === 'veip') {
        payload.data = { mode, vlan, priority, iana };
      } else if (section === 'tr069') {
        payload.data = { tr069Status: 'enable', acs_url: acsUrl, username, password, vlan: tr069VlanMode === 'tag' ? tr069Vlan : 'untag', priority };
      }
      const res = await fetch(`/api/onu/${onuId}/section-config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.success) {
        // Delay refetch to let OLT apply changes (especially for interface eth state)
        await new Promise(r => setTimeout(r, 1500));
        onSuccess();
        toast.success('Updated! Auto-syncing OLT...');
        // Re-invalidate after auto-sync completes (~8s)
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['onu-detail', onuId] });
          qc.invalidateQueries({ queryKey: ['onu-live-detail', onuId] });
          qc.invalidateQueries({ queryKey: ['all-onus'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }, 8000);
      } else { toast.error(d.message || 'Failed'); }
    } catch { toast.error('Failed'); }
    setLoading(false);
  };

  const deleteEntry = async () => {
    const ok = await confirm({ title: `Delete ${section}`, message: `Delete this ${section} entry?`, confirmLabel: 'Delete', variant: 'danger' });
    if (ok) {
      try {
        const deleteData = section === 'wifi' ? { ssid_num: Number(ssidNum) } : {};
        const res = await fetch(`/api/onu/${onuId}/section-config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ section, action: 'delete', index: data.index, data: deleteData }) });
        const d = await res.json();
        if (d.success) { onSuccess(); toast.success('Deleted!'); } else { toast.error(d.message || 'Failed'); }
      } catch { toast.error('Failed'); }
    }
  };

  const sectionTitle: Record<string, string> = { wifi: `Configure Wifi ${ssidNum}`, lan: 'Configure LAN', veip: 'Configure VEIP', tr069: 'Configure TR069' };
  const modeOptions: Record<string, Array<{v: string; l: string}>> = {
    wifi: [{v:'N/A',l:'N/A (DHCP From ONU)'},{v:'Access',l:'Access (Tag)'},{v:'Hybrid',l:'Hybrid'},{v:'Trunk',l:'Trunk'}],
    lan: [{v:'Access',l:'Access'},{v:'Hybrid',l:'Hybrid'},{v:'Trunk',l:'Trunk'}],
    veip: [{v:'Hybrid',l:'Hybrid'},{v:'Access',l:'Access'},{v:'Trunk',l:'Trunk'}],
  };

  const VlanSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className="input-field">
      <option value="">-- Select VLAN --</option>
      {vlans.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} - {v.name}</option>)}
    </select>
  );

  return (
    <div className="glass-card w-full max-w-lg max-h-[85vh] flex flex-col">
      <div className="modal-header"><h2 className="text-sm font-semibold">{sectionTitle[section] || `Edit ${section}`}</h2><button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button></div>
      <div className="p-3 md:p-5 overflow-y-auto space-y-3 md:space-y-4 flex-1">
        {/* TR069 fields */}
        {section === 'tr069' && <>
          <div><label className="label-sm mb-1">ACS URL</label><input type="text" value={acsUrl} onChange={e => setAcsUrl(e.target.value)} placeholder="http://192.168.54.254:7547" className="input-field" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label-sm mb-1">Username</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="acs" className="input-field" /></div>
            <div><label className="label-sm mb-1">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="acs" className="input-field" /></div>
          </div>
          <div><label className="label-sm mb-1">VLAN Mode</label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="tr069VlanMode" checked={tr069VlanMode === 'untag'} onChange={() => setTr069VlanMode('untag')} /> Untag</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="tr069VlanMode" checked={tr069VlanMode === 'tag'} onChange={() => setTr069VlanMode('tag')} /> Tag</label>
            </div>
            {tr069VlanMode === 'tag' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-1">VLAN</label>
                  <select value={tr069Vlan} onChange={e => setTr069Vlan(e.target.value)} className="input-field">
                    <option value="">-- Select VLAN --</option>
                    {vlans.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} - {v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-sm mb-1">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className="input-field">
                    {[0,1,2,3,4,5,6,7].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </>}

        {/* WiFi/LAN/VEIP common fields */}
        {section !== 'tr069' && <>
          {/* Status */}
          <div><label className="label-sm mb-1">Status</label>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="secStatus" checked={status === 'enable'} onChange={() => setStatus('enable')} /> Enable</label><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="secStatus" checked={status === 'disable'} onChange={() => setStatus('disable')} /> Disable</label></div>
          </div>

          {/* Mode */}
          {modeOptions[section] && <div><label className="label-sm mb-1">Mode</label>
            <div className="flex flex-wrap gap-3">{modeOptions[section].map(m => (
              <label key={m.v} className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="secMode" checked={mode === m.v} onChange={() => setMode(m.v)} /> {m.l}</label>
            ))}</div>
          </div>}

          {/* VLAN */}
          {section !== 'veip' && <div><label className="label-sm mb-1">Access Vlan</label><VlanSelect value={vlan} onChange={setVlan} /></div>}
          {section === 'veip' && <div><label className="label-sm mb-1">Access Vlan</label><input type="text" value={vlan} onChange={e => setVlan(e.target.value)} className="input-field" /></div>}

          {/* WiFi SSID Number selector */}
          {section === 'wifi' && (
            <div><label className="label-sm mb-1">SSID Number</label>
              <select value={ssidNum} onChange={e => setSsidNum(e.target.value)} className="input-field">
                {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>SSID {n}</option>)}
              </select>
            </div>
          )}

          {/* WiFi SSID Name (broadcast) */}
          {section === 'wifi' && (
            <div>
              <label className="label-sm mb-2">SSID</label>
              <div className="space-y-2 pl-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={ssidNameEnabled} onChange={e => setSsidNameEnabled(e.target.checked)} />
                  <span className="text-tx2">Name</span>
                </label>
                {ssidNameEnabled && (
                  <input type="text" value={ssidBroadcastName} onChange={e => setSsidBroadcastName(e.target.value)}
                    placeholder="e.g. MyWiFi" className="input-field" />
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={ssidAuthEnabled} onChange={e => setSsidAuthEnabled(e.target.checked)} />
                  <span className="text-tx2">Authentication Type</span>
                </label>
                {ssidAuthEnabled && (
                  <div className="space-y-2">
                    <select value={ssidAuthType} onChange={e => setSsidAuthType(e.target.value)} className="input-field">
                      <option value="wpa2-psk">WPA2-PSK</option>
                      <option value="wpa-psk">WPA-PSK</option>
                      <option value="wpa-wpa2-psk">Mixed WPA/WPA2-PSK</option>
                      <option value="open">Open (No Password)</option>
                    </select>
                    {ssidAuthType !== 'open' && (
                      <div className="space-y-1">
                        <input type="password" value={ssidPassword} onChange={e => setSsidPassword(e.target.value)}
                          placeholder="WiFi Password" className="input-field" />
                        {ssidPwFromDb && ssidPassword && (
                          <p className="text-xs text-tx3 italic">(dari database)</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LAN DHCP */}
          {section === 'lan' && <div><label className="label-sm mb-1">DHCP</label>
            <select value={dhcpMode} onChange={e => setDhcpMode(e.target.value)} className="input-field">
              <option value="Auto">Auto</option><option value="Manual">Manual</option><option value="None">None</option>
            </select>
          </div>}

          {/* VEIP IANA */}
          {section === 'veip' && <div><label className="label-sm mb-1">IANA</label><input type="text" value={iana} onChange={e => setIana(e.target.value)} className="input-field" /></div>}

          {/* Priority — not shown for WiFi (ZTE C320 doesn't support vlan port wifi priority) */}
          {section !== 'wifi' && <div><label className="label-sm mb-1">Priority</label><input type="text" value={priority} onChange={e => setPriority(e.target.value)} className="input-field" /></div>}
        </>}
      </div>
      <div className="modal-footer">
        {section !== 'tr069' && <button onClick={deleteEntry} className="btn-danger"><Trash2 size={14} className="inline mr-1" /> Delete</button>}
        <div className="flex gap-3 ml-auto"><button onClick={onClose} className="btn-cancel">Cancel</button><button onClick={save} disabled={loading} className="btn-primary">{loading ? 'Saving...' : 'Save Changes'}</button></div>
      </div>
    </div>
  );
}

// ═══ ACL EDIT MODAL ═══
function AclEditModal({ data, onuId, onClose, onSuccess }: { data: Record<string, unknown>; onuId: number; onClose: () => void; onSuccess: () => void; }) {
  const entry = (data.entry as Record<string, string>) || {};
  const isNew = data.isNew as boolean;
  const slWords = (entry.service_list || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const [mode, setMode] = useState(() => {
    const m = (entry.mode || 'forward').toLowerCase();
    return (m === 'allow' || m === 'permit') ? 'forward' : (m === 'block' || m === 'deny') ? 'block' : m;
  });
  const [ingressType, setIngressType] = useState(entry.ingress_type || 'WAN');
  const [services, setServices] = useState<string[]>(() => {
    const all = ['HTTP','HTTPS','SNMP','SSH','TELNET','FTP','TR069'];
    return all.filter(s => slWords.includes(s.toLowerCase()) || (s === 'HTTP' && slWords.includes('web')));
  });
  const [startIp, setStartIp] = useState(entry.start_ip || '0.0.0.0');
  const [endIp, setEndIp] = useState(entry.end_ip || '0.0.0.0');
  const [loading, setLoading] = useState(false);

  const toggleService = (s: string) => setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const save = async () => {
    setLoading(true);
    try {
      // For edit: data.index is the 1-based acl_id from OLT. For new: use newIndex (also 1-based).
      const aclIndex = typeof data.index === 'number' ? data.index : (typeof data.newIndex === 'number' ? data.newIndex : 1);
      const res = await fetch(`/api/onu/${onuId}/section-config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          section: 'acl', action: isNew ? 'create' : 'edit',
          index: aclIndex,
          data: { index: aclIndex, mode, ingress_type: ingressType, service_list: services.join(','), start_ip: startIp, end_ip: endIp },
        }),
      });
      const d = await res.json();
      if (d.success) { onSuccess(); toast.success(isNew ? 'ACL created!' : 'ACL updated!'); } else { toast.error(d.message || 'Failed'); }
    } catch { toast.error('Failed'); }
    setLoading(false);
  };

  const deleteAcl = async () => {
    const ok = await confirm({ title: 'Delete ACL', message: 'Delete this Remote Access rule?', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) {
      try {
        const res = await fetch(`/api/onu/${onuId}/section-config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ section: 'acl', action: 'delete', index: data.index, data: {} }) });
        const d = await res.json();
        if (d.success) { onSuccess(); toast.success('ACL rule deleted'); } else { toast.error(d.message || 'Failed'); }
      } catch { toast.error('Failed'); }
    }
  };

  return (
    <div className="glass-card w-full max-w-lg">
      <div className="modal-header"><h2 className="text-sm font-semibold flex items-center gap-2"><Shield size={16} /> Remote Access</h2><button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button></div>
      <div className="p-3 md:p-5 space-y-3 md:space-y-4">
        <div><label className="label-sm mb-1">Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value)} className="input-field"><option value="forward">Allow (Forward)</option><option value="block">Block (Deny)</option></select>
        </div>
        <div><label className="label-sm mb-1">Ingress Type</label>
          <select value={ingressType} onChange={e => setIngressType(e.target.value)} className="input-field"><option value="WAN">WAN</option><option value="LAN">LAN</option></select>
        </div>
        <div><label className="label-sm mb-2">Service List</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[{v:'HTTP',l:'WEB (HTTP)'},{v:'HTTPS',l:'HTTPS'},{v:'SNMP',l:'SNMP'},{v:'SSH',l:'SSH'},{v:'TELNET',l:'TELNET'},{v:'FTP',l:'FTP'},{v:'TR069',l:'TR069'}].map(s => (
            <label key={s.v} className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={services.includes(s.v)} onChange={() => toggleService(s.v)} /> {s.l}</label>
          ))}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label-sm mb-1">Start Source IP</label><input type="text" value={startIp} onChange={e => setStartIp(e.target.value)} placeholder="0.0.0.0" className="input-field" /></div>
          <div><label className="label-sm mb-1">End Source IP</label><input type="text" value={endIp} onChange={e => setEndIp(e.target.value)} placeholder="0.0.0.0" className="input-field" /></div>
        </div>
      </div>
      <div className="modal-footer">
        {!isNew && <button onClick={deleteAcl} className="btn-danger"><Trash2 size={14} className="inline mr-1" /> Delete</button>}
        <div className="flex gap-3 ml-auto"><button onClick={onClose} className="btn-cancel">Cancel</button><button onClick={save} disabled={loading} className="btn-primary">{loading ? 'Saving...' : 'Save Changes'}</button></div>
      </div>
    </div>
  );
}

// ═══ GET STATUS MODAL (matches R-Config Get Status output) ═══
function GetStatusModal({ status, onClose }: { status: Record<string, unknown> | undefined | null; onClose: () => void }) {
  const safeStatus = status || {};
  const info = (safeStatus.interface || {}) as Record<string, string>;
  const opt = (safeStatus.optical || {}) as Record<string, Record<string, string>>;
  const upOpt = opt.up || {};
  const downOpt = opt.down || {};
  const onuModule = opt.onu_module || {};
  const hist = (safeStatus.history || []) as Array<{ authpass_time: string; offline_time: string; cause: string }>;
  const macs = (safeStatus.macs || []) as Array<{ mac: string; vlan: string; type: string; port: string; vport: string }>;
  const infoFields = [
    ['ONU Interface', info['ONU interface'] || ''],
    ['Name', info['Name'] || ''],
    ['Type', info['Type'] || ''],
    ['State', info['State'] || ''],
    ['Configured channel', info['Configured channel'] || ''],
    ['Current channel', info['Current channel'] || ''],
    ['Admin state', info['Admin state'] || ''],
    ['Phase state', info['Phase state'] || ''],
    ['Config state', info['Config state'] || ''],
    ['Authentication mode', info['Authentication mode'] || ''],
    ['SN Bind', info['SN Bind'] || ''],
    ['Serial number', info['Serial number'] || ''],
    ['Password', info['Password'] || ''],
    ['Description', info['Description'] || ''],
    ['Vport mode', info['Vport mode'] || ''],
    ['DBA Mode', info['DBA Mode'] || ''],
    ['ONU Status', info['ONU Status'] || ''],
    ['OMCI BW Profile', info['OMCI BW Profile'] || ''],
    ['Line Profile', info['Line Profile'] || ''],
    ['Service Profile', info['Service Profile'] || ''],
    ['ONU Distance', info['ONU Distance'] || ''],
    ['Online Duration', info['Online Duration'] || ''],
  ];
  const hasOpticalData = Object.keys(upOpt).length > 0 || Object.keys(downOpt).length > 0;
  const hasOnuModule = Object.keys(onuModule).length > 0;
  return (
    <div className="glass-card w-full max-w-4xl max-h-[85vh] flex flex-col">
      <div className="px-5 py-4 border-b border-brd flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Activity size={16} /> Get Status — ONU Detail</h2>
        <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
      </div>
      <div className="p-3 md:p-5 overflow-y-auto flex-1 space-y-4 md:space-y-5">
        {/* Interface Info */}
        <div>
          <h6 className="text-xs text-tx3 font-semibold mb-2 uppercase">ONU Interface Info</h6>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {infoFields.map(([label, val]) => (
              val ? <div key={label} className="p-2 rounded bg-glass text-xs"><span className="text-tx3">{label}:</span> <span className="font-medium">{val}</span></div> : null
            ))}
          </div>
        </div>

        {/* Optical Status - Up/Down Power Table */}
        {hasOpticalData && (
        <div>
          <h6 className="text-xs text-tx3 font-semibold mb-2 uppercase">Optical Status — Power Levels</h6>
          <DataTable headers={['Direction', 'OLT Side', 'ONU Side', 'Attenuation']}>
            <tr>
              <td className="font-medium text-success">Up (ONU→OLT)</td>
              <td>
                <div className="flex flex-col gap-0.5">
                  <span><span className="text-tx3">Rx:</span> <strong>{upOpt.olt_rx || upOpt.rx || '-'}</strong></span>
                </div>
              </td>
              <td>
                <div className="flex flex-col gap-0.5">
                  <span><span className="text-tx3">Tx:</span> <strong>{upOpt.onu_tx || upOpt.tx || '-'}</strong></span>
                </div>
              </td>
              <td><strong>{upOpt.attenuation || '-'}</strong></td>
            </tr>
            <tr>
              <td className="font-medium text-warning">Down (OLT→ONU)</td>
              <td>
                <div className="flex flex-col gap-0.5">
                  <span><span className="text-tx3">Tx:</span> <strong>{downOpt.olt_tx || downOpt.tx || '-'}</strong></span>
                </div>
              </td>
              <td>
                <div className="flex flex-col gap-0.5">
                  <span><span className="text-tx3">Rx:</span> <strong>{downOpt.onu_rx || downOpt.rx || '-'}</strong></span>
                </div>
              </td>
              <td><strong>{downOpt.attenuation || '-'}</strong></td>
            </tr>
          </DataTable>
        </div>
        )}

        {/* ONU Optical Module Info */}
        {hasOnuModule && (
        <div>
          <h6 className="text-xs text-tx3 font-semibold mb-2 uppercase">ONU Optical Module Info</h6>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {onuModule.temperature && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">Temperature:</span> <span className="font-medium">{onuModule.temperature}</span></div>}
            {onuModule.voltage && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">Supply Voltage:</span> <span className="font-medium">{onuModule.voltage}</span></div>}
            {onuModule.bias_current && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">Bias Current:</span> <span className="font-medium">{onuModule.bias_current}</span></div>}
            {onuModule.tx_power && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">TX Power:</span> <span className="font-medium">{onuModule.tx_power}</span></div>}
            {onuModule.rx_power && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">ONU RX Power:</span> <span className="font-medium">{onuModule.rx_power}</span></div>}
            {onuModule.wavelength && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">Wavelength:</span> <span className="font-medium">{onuModule.wavelength}</span></div>}
            {onuModule.vendor && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">Vendor:</span> <span className="font-medium">{onuModule.vendor}</span></div>}
            {onuModule.module_type && <div className="p-2 rounded bg-glass text-xs"><span className="text-tx3">Module Type:</span> <span className="font-medium">{onuModule.module_type}</span></div>}
          </div>
        </div>
        )}

        {/* History */}
        <div>
          <h6 className="text-xs text-tx3 font-semibold mb-2 uppercase">History</h6>
          {hist.length > 0 ? (
            <DataTable headers={['#', 'Authpass Time', 'Offline Time', 'Cause']}>
              {hist.map((h, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="font-mono text-xs">{h.authpass_time || '-'}</td>
                  <td className="font-mono text-xs">{h.offline_time || '-'}</td>
                  <td><span className={cn('px-1.5 py-0.5 rounded text-xs font-medium',
                    h.cause.includes('DyingGasp') ? 'bg-warning/15 text-warning' :
                    h.cause.includes('LOS') ? 'bg-danger/15 text-danger' :
                    h.cause.includes('Shutdown') ? 'bg-danger/15 text-danger' :
                    !h.cause ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3'
                  )}>{h.cause || 'Online'}</span></td>
                </tr>
              ))}
            </DataTable>
          ) : <div className="text-xs text-tx3">No history available</div>}
        </div>

        {/* MAC Table */}
        {macs.length > 0 && (
          <div>
            <h6 className="text-xs text-tx3 font-semibold mb-2 uppercase">MACs on OLT from this ONU</h6>
            <DataTable headers={['MAC Address', 'VLAN', 'Type', 'Port', 'Vport']}>
              {macs.map((m, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs">{m.mac}</td>
                  <td>{m.vlan}</td>
                  <td>{m.type}</td>
                  <td>{m.port}</td>
                  <td>{m.vport}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button onClick={onClose} className="btn-cancel">Close</button>
      </div>
    </div>
  );
}

/* ═══ REUSABLE COMPONENTS ═══ */

function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (<div className="glass-card"><div className="px-3 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between"><h2 className="text-sm font-semibold flex items-center gap-2">{icon} {title}</h2>{action}</div><div className="p-3 md:p-5">{children}</div></div>);
}
function DetailField({ label, value, mono, onEdit }: { label: string; value: string; mono?: boolean; onEdit?: () => void }) {
  return (<div><div className="label-sm flex items-center gap-1">{label}{onEdit && <button onClick={onEdit} className="text-tx3 hover:text-accent"><Edit3 size={10} /></button>}</div><div className={cn('text-sm font-medium', mono && 'font-mono')}>{value || '-'}</div></div>);
}
function EditableField({ label, field, value, onEdit }: { label: string; field: string; value: string; onEdit: (l: string, f: string, v: string) => void }) {
  const canEdit = onEdit.name !== 'noop' && onEdit.name !== '';
  if (!canEdit) return <DetailField label={label} value={value} />;
  return (<div className="group cursor-pointer" onClick={() => onEdit(label, field, value)}><div className="label-sm flex items-center gap-1">{label} <Edit3 size={10} className="opacity-0 group-hover:opacity-50 transition-opacity" /></div><div className="text-sm font-medium">{value || '-'}</div></div>);
}
function StatusPill({ online, label }: { online: boolean; label: string }) {
  return (<span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', online ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}><span className={cn('w-1.5 h-1.5 rounded-full', online ? 'bg-success' : 'bg-offline')} />{label}</span>);
}
function SignalBox({ label, value }: { label: string; value: number | null }) {
  const c = value === null ? 'text-tx3' : value >= -26 ? 'text-success' : value >= -28 ? 'text-warning' : 'text-danger';
  return (<div className="p-3 rounded-lg bg-glass text-center"><div className="text-xs text-tx3 mb-1">{label}</div><div className={cn('text-lg font-bold font-mono', c)}>{value !== null ? `${value.toFixed(2)} dBm` : '-'}</div></div>);
}
function ActBtn({ icon, label, onClick, variant, loading, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; variant?: string; loading?: boolean; disabled?: boolean }) {
  const v: Record<string, string> = { warning: 'border-warning/30 text-warning hover:bg-warning/10', danger: 'border-danger/30 text-danger hover:bg-danger/10', success: 'border-success/30 text-success hover:bg-success/10' };
  return (<button onClick={onClick} disabled={disabled || loading} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed', v[variant || ''] || 'border-brd text-tx2 hover:bg-glass hover:text-tx1')}>{loading ? <RefreshCw size={14} className="animate-spin" /> : icon} {loading ? `${label}...` : label}</button>);
}
function EditBtn() { return <button className="text-accent hover:text-accent-hover"><Edit3 size={13} /></button>; }
function SaveConfigBtn({ onuId }: { onuId: number }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/onu/${onuId}/save-config`, { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (d.success) toast.success('Config saved to startup-config!');
      else toast.error(d.message || 'Save failed');
    } catch { toast.error('Save failed'); }
    setSaving(false);
  };
  return (
    <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-all disabled:opacity-60">
      <Save size={13} /> {saving ? 'Saving...' : 'Save Config'}
    </button>
  );
}
function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-brd">{headers.map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-tx3 uppercase tracking-wider">{h}</th>)}</tr></thead><tbody className="[&>tr]:border-b [&>tr]:border-brd/50 [&>tr:hover]:bg-glass/50 [&>tr]:transition-colors">{children}</tbody></table></div>);
}
function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (<div className="text-center py-6"><div className="text-tx3 mb-2">{icon}</div><p className="text-tx3 text-sm">{text}</p></div>);
}
function Skeleton() {
  return (<div className="space-y-5 animate-pulse"><div className="h-5 w-48 bg-glass rounded-lg" /><div className="glass-card h-64" /><div className="flex gap-2">{[...Array(5)].map((_, i) => <div key={i} className="h-9 w-24 bg-glass rounded-xl" />)}</div><div className="glass-card h-48" /><div className="glass-card h-48" /></div>);
}
