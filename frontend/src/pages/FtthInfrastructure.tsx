import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Map as MapIcon, TreePine, Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  Server, Box, Network, Split, X, MapPin, Link2, Unlink, Phone, Download, Upload, Cable,
  Activity, AlertTriangle, Wifi, WifiOff, Zap, CircleDashed, Gauge, RefreshCw,
  UserX, LayoutGrid, List, GitMerge, Scissors
} from 'lucide-react';
import { api, type FTTHItem, type FTTHOtb, type FTTHOtbPort, type FTTHOdc, type FTTHOdp, type FTTHOdpPort, type FTTHAvailableOnu, type FTTHPonPort, type FTTHStats, type FTTHFiberPath, type FTTHJc, type FTTHOdcTree, type FTTHOdpTree, type FTTHJcTree } from '../lib/api';
import { cn } from '../lib/utils';
import { coreColorInfo } from '../lib/fiberColor';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { LocationPicker } from '../components/LocationPicker';
import { LeafletMap } from '../components/LeafletMap';
import { useHasPerm } from '../hooks/useHasPerm';
import { useWebSocket } from '../hooks/useWebSocket';

type Tab = 'overview' | 'tree' | 'map' | 'otb' | 'jc' | 'odc' | 'odp' | 'pon';
type ModalType = 'otb' | 'jc' | 'odc' | 'odp' | 'port' | 'pon' | null;
type ParentKind = 'otb' | 'odc' | 'jc' | null;

const FTTH_REFRESH_INTERVAL = 10;

export function FtthInfrastructure() {
  const [searchParams] = useSearchParams();
  const hasPerm = useHasPerm();
  const canEdit = hasPerm('settings_ip_olts');
  const initialTab = (searchParams.get('tab') as Tab) || 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [countdown, setCountdown] = useState(FTTH_REFRESH_INTERVAL);
  const countdownRef = useRef(FTTH_REFRESH_INTERVAL);

  useEffect(() => {
    const urlTab = (searchParams.get('tab') as Tab) || 'overview';
    setTab(urlTab);
  }, [searchParams]);
  const [modal, setModal] = useState<ModalType>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [parentCtx, setParentCtx] = useState<any>(null);
  const [parentKind, setParentKind] = useState<ParentKind>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedOdp, setSelectedOdp] = useState<FTTHOdp | null>(null);
  const [selectedOtb, setSelectedOtb] = useState<FTTHOtb | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [autoRouteMode, setAutoRouteMode] = useState(false);
  const [autoRouteStart, setAutoRouteStart] = useState<any>(null);
  const qc = useQueryClient();

  const { data: treeData, isLoading } = useQuery({
    queryKey: ['ftth-tree'],
    queryFn: api.ftthTree,
  });

  const { data: statsData, isFetching: statsFetching } = useQuery({
    queryKey: ['ftth-stats'],
    queryFn: api.ftthStats,
    refetchInterval: tab === 'overview' ? FTTH_REFRESH_INTERVAL * 1000 : false,
  });

  const { data: mapData } = useQuery({
    queryKey: ['ftth-map'],
    queryFn: api.ftthMap,
    enabled: tab === 'map',
    refetchInterval: tab === 'map' ? 15000 : false,
  });

  // WebSocket: realtime refresh on ONU status changes
  // ('onu_change' also covers sync completion — see ws_bridge.py)
  const { lastMessage: mapWsMsg } = useWebSocket('/ws/dashboard', { reconnect: true });
  useEffect(() => {
    if (mapWsMsg && (mapWsMsg.event === 'onu_change' || mapWsMsg.event === 'alert')) {
      qc.invalidateQueries({ queryKey: ['ftth-map'] });
      qc.invalidateQueries({ queryKey: ['ftth-stats'] });
      qc.invalidateQueries({ queryKey: ['ftth-tree'] });
      qc.invalidateQueries({ queryKey: ['ftth-pon'] });
    }
  }, [mapWsMsg, qc]);

  // Countdown ticker (only when overview tab is active)
  useEffect(() => {
    if (tab !== 'overview') return;
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = FTTH_REFRESH_INTERVAL;
        setCountdown(FTTH_REFRESH_INTERVAL);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [tab]);

  // Reset countdown when data finishes fetching
  useEffect(() => {
    if (!statsFetching) {
      countdownRef.current = FTTH_REFRESH_INTERVAL;
      setCountdown(FTTH_REFRESH_INTERVAL);
    }
  }, [statsFetching]);

  const { data: otbList } = useQuery({ queryKey: ['ftth-otb'], queryFn: api.ftthOtbList });
  const { data: jcList } = useQuery({ queryKey: ['ftth-jc'], queryFn: api.ftthJcList });
  const { data: odcList } = useQuery({ queryKey: ['ftth-odc'], queryFn: () => api.ftthOdcList() });
  const { data: odpList } = useQuery({ queryKey: ['ftth-odp'], queryFn: () => api.ftthOdpList() });
  const { data: odpPorts } = useQuery({
    queryKey: ['ftth-odp-ports', selectedOdp?.id],
    queryFn: () => api.ftthOdpPorts(selectedOdp!.id),
    enabled: !!selectedOdp,
  });
  const { data: otbPorts } = useQuery({
    queryKey: ['ftth-otb-ports', selectedOtb?.id],
    queryFn: () => api.ftthOtbPorts(selectedOtb!.id),
    enabled: !!selectedOtb,
  });
  const { data: availableOnus } = useQuery({ queryKey: ['ftth-onus'], queryFn: () => api.ftthAvailableOnus() });
  const { data: ponList } = useQuery({ queryKey: ['ftth-pon'], queryFn: api.ftthPonList });
  const { data: fiberPaths } = useQuery({ queryKey: ['ftth-paths'], queryFn: api.ftthPathsList, enabled: tab === 'map' });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['ftth-tree'] });
    qc.invalidateQueries({ queryKey: ['ftth-stats'] });
    qc.invalidateQueries({ queryKey: ['ftth-map'] });
    qc.invalidateQueries({ queryKey: ['ftth-otb'] });
    qc.invalidateQueries({ queryKey: ['ftth-jc'] });
    qc.invalidateQueries({ queryKey: ['ftth-odc'] });
    qc.invalidateQueries({ queryKey: ['ftth-odp'] });
    qc.invalidateQueries({ queryKey: ['ftth-odp-ports'] });
    qc.invalidateQueries({ queryKey: ['ftth-otb-ports'] });
    qc.invalidateQueries({ queryKey: ['ftth-pon'] });
    qc.invalidateQueries({ queryKey: ['ftth-paths'] });
  }, [qc]);

  const delMut = useMutation({
    mutationFn: async ({ type, id }: { type: ModalType; id: number }) => {
      if (type === 'otb') return api.ftthOtbDelete(id);
      if (type === 'jc') return api.ftthJcDelete(id);
      if (type === 'odc') return api.ftthOdcDelete(id);
      if (type === 'odp') return api.ftthOdpDelete(id);
      if (type === 'pon') return api.ftthPonDelete(id);
    },
    onSuccess: () => { toast.success('Deleted'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleExpand = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  const openAdd = (type: ModalType, parent?: any, kind?: ParentKind) => {
    setEditItem(null);
    setParentCtx(parent || null);
    setParentKind(kind || null);
    setModal(type);
  };
  const openEdit = (type: ModalType, item: any) => {
    setEditItem(item);
    setParentCtx(null);
    setParentKind(null);
    setModal(type);
  };

  const handleDelete = async (type: ModalType, id: number, name: string) => {
    const ok = await confirm({ title: `Delete ${name}`, message: `Are you sure you want to delete "${name}"? This will also delete all child items.`, confirmLabel: 'Delete', variant: 'danger' });
    if (ok) delMut.mutate({ type, id });
  };

  const tree = treeData?.tree || [];

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2"><Network size={20} /> FTTH Infrastructure</h1>
            <p className="text-tx2 text-xs md:text-sm mt-1">Manage OTB/ODF → ODC → ODP → ONU chain with map coordinates</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-glass rounded-lg p-0.5 overflow-x-auto scrollbar-thin max-w-full">
            <button onClick={() => setTab('overview')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'overview' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Gauge size={14} /> Overview</button>
            <button onClick={() => setTab('tree')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'tree' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><TreePine size={14} /> Tree</button>
            <button onClick={() => setTab('pon')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'pon' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Cable size={14} /> PON</button>
            <button onClick={() => setTab('otb')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'otb' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Server size={14} /> OTB</button>
            <button onClick={() => setTab('jc')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'jc' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><GitMerge size={14} /> JC</button>
            <button onClick={() => setTab('odc')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'odc' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Box size={14} /> ODC</button>
            <button onClick={() => setTab('odp')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'odp' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Split size={14} /> ODP</button>
            <button onClick={() => setTab('map')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'map' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><MapIcon size={14} /> Map</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && tab === 'tree' && <button onClick={() => openAdd('otb')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add OTB</button>}
            {canEdit && tab === 'pon' && <button onClick={() => openAdd('pon')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add PON</button>}
            {canEdit && tab === 'otb' && <button onClick={() => openAdd('otb')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add OTB</button>}
            {canEdit && tab === 'jc' && <button onClick={() => openAdd('jc')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add JC</button>}
            {canEdit && tab === 'odc' && <button onClick={() => openAdd('odc')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add ODC</button>}
            {canEdit && tab === 'odp' && <button onClick={() => openAdd('odp')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add ODP</button>}
            <button onClick={() => window.open(api.ftthExport(), '_blank')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-glass text-tx2 text-xs md:text-sm hover:text-tx1 transition-colors" title="Export CSV"><Download size={13} /> Export</button>
            {canEdit && <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-glass text-tx2 text-xs md:text-sm hover:text-tx1 transition-colors cursor-pointer" title="Import CSV">
              <Upload size={13} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try { const r = await api.ftthImport(file); toast.success(`Imported: ${JSON.stringify(r.imported)}`); invalidate(); }
                catch (err: any) { toast.error(err.message); }
                e.target.value = '';
              }} />
            </label>}
            <button onClick={() => invalidate()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-glass text-tx2 text-xs md:text-sm hover:text-tx1 transition-colors" title="Refresh data">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && <OverviewTab stats={statsData} isFetching={statsFetching} countdown={countdown} onDrillDown={() => setTab('tree')} />}

      {/* Tree View */}
      {tab === 'tree' && (
        <div className="space-y-2">
          {isLoading && <div className="text-center py-8 text-tx3 text-sm">Loading...</div>}
          {!isLoading && tree.length === 0 && (
            <div className="glass-card p-8 text-center">
              <Server size={40} className="mx-auto text-tx3 mb-3" />
              <p className="text-tx3 text-sm mb-3">No OTB/ODF added yet</p>
              {canEdit && <button onClick={() => openAdd('otb')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First OTB/ODF</button>}
            </div>
          )}
          {tree.map(otb => (
            <OtbNode key={otb.id} otb={otb} expanded={expanded} toggleExpand={toggleExpand} canEdit={canEdit}
              onAddOdc={(parent, kind) => openAdd('odc', parent, kind)} onEditOtb={() => openEdit('otb', otb)}
              onDeleteOtb={() => handleDelete('otb', otb.id, otb.name)}
              onAddOdp={(parent, kind) => openAdd('odp', parent, kind)} onEditOdc={(odc) => openEdit('odc', odc)}
              onDeleteOdc={(odc) => handleDelete('odc', odc.id, odc.name)}
              onEditOdp={(odp) => { setSelectedOdp(odp); }} onDeleteOdp={(odp) => handleDelete('odp', odp.id, odp.name)}
              onAddJc={(parent, kind) => openAdd('jc', parent, kind)} onEditJc={(jc) => openEdit('jc', jc)}
              onDeleteJc={(jc) => handleDelete('jc', jc.id, jc.name)}
            />
          ))}
        </div>
      )}

      {/* PON List View */}
      {tab === 'pon' && (
        <div className="space-y-2">
          {(ponList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Cable size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No PON ports added yet</p>{canEdit && <button onClick={() => openAdd('pon')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First PON</button>}</div>
          )}
          {(ponList?.items || []).map(p => {
            const onlinePct = p.total_onu > 0 ? Math.round((p.online_onu / p.total_onu) * 100) : 0;
            return (
            <div key={p.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <Cable size={18} className="text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{p.pon_name || `PON ${p.frame}/${p.slot}/${p.port}`}</span>
                    {p.total_onu > 0 && <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0', onlinePct > 80 ? 'bg-success/15 text-success' : onlinePct > 50 ? 'bg-warning/15 text-warning' : 'bg-danger/15 text-danger')}>{p.online_onu}/{p.total_onu} ONUs</span>}
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap mt-0.5">
                    {p.olt_name && <span>• OLT: {p.olt_name}</span>}
                    <span>• Frame {p.frame} / Slot {p.slot} / Port {p.port}</span>
                    {p.otb_name && <span>• → OTB: {p.otb_name} (Core {p.otb_core_number})</span>}
                    {p.otb_name && <CoreColorTag coreNumber={p.otb_core_number} fibersPerTube={otbList?.items?.find(x => x.id === p.otb_id)?.fibers_per_tube} />}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => openEdit('pon', p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('pon', p.id, p.pon_name || 'PON')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
                </div>
              </div>
              {p.total_onu > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-tx3 mb-1">
                    <span>Online: {p.online_onu} / Offline: {p.offline_onu}</span>
                    <span className={cn('font-bold', onlinePct > 80 ? 'text-success' : onlinePct > 50 ? 'text-warning' : 'text-danger')}>{onlinePct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-glass overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', onlinePct > 80 ? 'bg-success' : onlinePct > 50 ? 'bg-warning' : 'bg-danger')} style={{ width: `${onlinePct}%` }} />
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* OTB/ODF List View */}
      {tab === 'otb' && (
        <div className="space-y-2">
          {(otbList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Server size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No OTB/ODF added yet</p>{canEdit && <button onClick={() => openAdd('otb')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First OTB/ODF</button>}</div>
          )}
          {(otbList?.items || []).map(o => {
            const util = o.total_cores > 0 ? Math.round((o.used_cores / o.total_cores) * 100) : 0;
            return (
            <div key={o.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <Server size={18} className="text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{o.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0', o.is_active ? 'bg-success/15 text-success' : 'bg-glass text-tx3')}>{o.is_active ? 'ACTIVE' : 'IDLE'}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="uppercase">{o.type}</span>
                    {o.olt_name && <span>• OLT: {o.olt_name}</span>}
                    {o.pon_port && <span>• PON: {o.pon_port}</span>}
                    {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setSelectedOtb(o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Port Diagram"><Cable size={15} /></button>
                  {canEdit && <button onClick={() => openEdit('otb', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('otb', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-tx3 mb-1"><span>Cores: {o.used_cores}/{o.total_cores}</span><span className={cn('font-bold', util > 80 ? 'text-danger' : util > 60 ? 'text-warning' : 'text-success')}>{util}%</span></div>
                <div className="h-1.5 rounded-full bg-glass overflow-hidden"><div className={cn('h-full rounded-full transition-all', util > 80 ? 'bg-danger' : util > 60 ? 'bg-warning' : 'bg-success')} style={{ width: `${util}%` }} /></div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* JC List View */}
      {tab === 'jc' && (
        <div className="space-y-2">
          {(jcList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><GitMerge size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-1">No JC (Joint Closure) added yet</p><p className="text-tx3 text-xs mb-3">Titik sambungan opsional di sepanjang jalur OTB → ODC → ODP</p>{canEdit && <button onClick={() => openAdd('jc')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First JC</button>}</div>
          )}
          {(jcList?.items || []).map(j => (
            <div key={j.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <GitMerge size={18} className="text-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{j.name}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-glass text-tx3 uppercase">{j.closure_type}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap mt-0.5">
                    {j.parent_name && <span>• From: {j.parent_name} ({j.parent_type?.toUpperCase()})</span>}
                    <span>• {j.splice_count} splice{j.splice_count === 1 ? '' : 's'}</span>
                    <span>• {j.total_cores} cores</span>
                    {j.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {j.latitude.toFixed(4)}, {j.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => openEdit('jc', j)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit / Manage Splices"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('jc', j.id, j.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ODC List View */}
      {tab === 'odc' && (
        <div className="space-y-2">
          {(odcList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Box size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No ODC added yet</p>{canEdit && <button onClick={() => openAdd('odc')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First ODC</button>}</div>
          )}
          {(odcList?.items || []).map(o => {
            const util = o.total_cores > 0 ? Math.round((o.used_cores / o.total_cores) * 100) : 0;
            return (
            <div key={o.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <Box size={18} className="text-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{o.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0', o.is_active ? 'bg-success/15 text-success' : 'bg-glass text-tx3')}>{o.is_active ? 'ACTIVE' : 'IDLE'}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap mt-0.5">
                    {o.feed_source === 'jc' && o.jc_name && <span>• From JC: {o.jc_name} (core {o.jc_core_number})</span>}
                    {o.feed_source !== 'jc' && o.otb_name && <span>• From: {o.otb_name} (Core {o.otb_core_number})</span>}
                    {o.feed_source !== 'jc' && o.otb_name && <CoreColorTag coreNumber={o.otb_core_number} fibersPerTube={otbList?.items?.find(x => x.id === o.otb_id)?.fibers_per_tube} />}
                    {o.splitter_model && <span>• Splitter: {o.splitter_model}</span>}
                    {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => openEdit('odc', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('odc', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-tx3 mb-1"><span>Cores: {o.used_cores}/{o.total_cores}</span><span className={cn('font-bold', util > 80 ? 'text-danger' : util > 60 ? 'text-warning' : 'text-success')}>{util}%</span></div>
                <div className="h-1.5 rounded-full bg-glass overflow-hidden"><div className={cn('h-full rounded-full transition-all', util > 80 ? 'bg-danger' : util > 60 ? 'bg-warning' : 'bg-success')} style={{ width: `${util}%` }} /></div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ODP List View */}
      {tab === 'odp' && (
        <div className="space-y-2">
          {(odpList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Split size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No ODP added yet</p>{canEdit && <button onClick={() => openAdd('odp')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First ODP</button>}</div>
          )}
          {(odpList?.items || []).map(o => {
            const util = o.total_ports > 0 ? Math.round((o.used_ports / o.total_ports) * 100) : 0;
            return (
            <div key={o.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <Split size={18} className="text-success flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{o.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0', o.is_active ? 'bg-success/15 text-success' : 'bg-glass text-tx3')}>{o.is_active ? 'ACTIVE' : 'IDLE'}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap mt-0.5">
                    {o.feed_source === 'jc' && o.jc_name && <span>• From JC: {o.jc_name} (core {o.jc_core_number})</span>}
                    {o.feed_source !== 'jc' && o.odc_name && <span>• From: {o.odc_name} (Core {o.odc_core_number})</span>}
                    {o.splitter_model && <span>• Splitter: {o.splitter_model}</span>}
                    {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => setSelectedOdp(o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Manage Ports"><Network size={15} /></button>}
                  {canEdit && <button onClick={() => openEdit('odp', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('odp', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-tx3 mb-1"><span>Ports: {o.used_ports}/{o.total_ports}</span><span className={cn('font-bold', util > 80 ? 'text-danger' : util > 60 ? 'text-warning' : 'text-success')}>{util}%</span></div>
                <div className="h-1.5 rounded-full bg-glass overflow-hidden"><div className={cn('h-full rounded-full transition-all', util > 80 ? 'bg-danger' : util > 60 ? 'bg-warning' : 'bg-success')} style={{ width: `${util}%` }} /></div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Map View */}
      {tab === 'map' && (
        <>
          <div className="flex items-center gap-2 mb-2">
            {canEdit && (
              <button onClick={() => { setDrawMode(!drawMode); setAutoRouteMode(false); }} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors', drawMode ? 'bg-warning text-white' : 'bg-glass text-tx2 hover:text-tx1')}>
                <Cable size={14} /> {drawMode ? 'Exit Draw Mode' : 'Draw Fiber Path'}
              </button>
            )}
            {canEdit && (
              <button onClick={() => { setAutoRouteMode(!autoRouteMode); setDrawMode(false); setAutoRouteStart(null); }} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors', autoRouteMode ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:text-tx1')}>
                <MapIcon size={14} /> {autoRouteMode ? 'Exit Auto Route' : 'Auto Route (OSRM)'}
              </button>
            )}
            {drawMode && <span className="text-xs text-tx3">Click on map to add waypoints, then Save Path</span>}
            {autoRouteMode && <span className="text-xs text-tx3">{autoRouteStart ? `Start selected: ${autoRouteStart.name}. Click end marker...` : 'Click a marker to set start point'}</span>}
          </div>
          <MapView markers={mapData?.markers || []} lines={mapData?.lines || []} fiberPaths={fiberPaths?.paths || []} drawMode={drawMode} onDrawComplete={async (coords) => {
            try {
              await api.ftthPathCreate({ from_type: 'otb', from_id: 0, to_type: 'odp', to_id: 0, coordinates: coords, path_type: 'manual' });
              toast.success('Fiber path saved');
              setDrawMode(false);
              qc.invalidateQueries({ queryKey: ['ftth-paths'] });
            } catch (e: any) { toast.error(e.message); }
          }} onMarkerClick={autoRouteMode ? async (marker) => {
            if (!autoRouteStart) {
              setAutoRouteStart(marker);
            } else {
              if (autoRouteStart.id === marker.id && autoRouteStart.type === marker.type) {
                toast.error('Start and end must be different');
                return;
              }
              try {
                await api.ftthAutoRoute({
                  from_lat: autoRouteStart.lat, from_lng: autoRouteStart.lng,
                  to_lat: marker.lat, to_lng: marker.lng,
                  from_type: autoRouteStart.type, from_id: autoRouteStart.id,
                  to_type: marker.type, to_id: marker.id,
                });
                toast.success('Auto route created');
                setAutoRouteMode(false);
                setAutoRouteStart(null);
                qc.invalidateQueries({ queryKey: ['ftth-paths'] });
              } catch (e: any) { toast.error(e.message); }
            }
          } : undefined} />
        </>
      )}

      {/* ODP Port Panel */}
      {selectedOdp && (
        <OdpPortPanel
          odp={selectedOdp}
          ports={odpPorts?.ports || []}
          availableOnus={availableOnus?.onus || []}
          onClose={() => setSelectedOdp(null)}
          onUpdated={() => { invalidate(); }}
        />
      )}

      {/* OTB/ODF Port Diagram */}
      {selectedOtb && (
        <OtbPortDiagram
          otb={selectedOtb}
          ports={otbPorts?.ports || []}
          canEdit={canEdit}
          onClose={() => setSelectedOtb(null)}
          onUpdated={() => { invalidate(); }}
        />
      )}

      {/* Modals */}
      {modal === 'otb' && <OtbModal item={editItem} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'jc' && <JcModal item={editItem} parent={parentCtx} parentKind={parentKind} otbList={otbList?.items || []} odcList={odcList?.items || []} jcList={jcList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'odc' && <OdcModal item={editItem} parent={parentCtx} parentKind={parentKind} otbList={otbList?.items || []} jcList={jcList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'odp' && <OdpModal item={editItem} parent={parentCtx} parentKind={parentKind} odcList={odcList?.items || []} jcList={jcList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'pon' && <PonModal item={editItem} otbList={otbList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
    </div>
  );
}

// ─── Overview Tab ───
function OverviewTab({ stats, isFetching, countdown, onDrillDown }: { stats: FTTHStats | undefined; isFetching: boolean; countdown: number; onDrillDown: () => void }) {
  if (!stats) return <div className="text-center py-8 text-tx3 text-sm">Loading stats...</div>;
  const s = stats.onu_stats;
  const infra = stats.infrastructure;
  const orphans = stats.orphans;

  const statCards = [
    { label: 'Total ONU', value: s.total, icon: <Activity size={18} />, color: 'text-tx1', bg: 'bg-glass' },
    { label: 'Online', value: s.online, icon: <Wifi size={18} />, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Offline', value: s.offline, icon: <WifiOff size={18} />, color: 'text-tx3', bg: 'bg-glass' },
    { label: 'LOS', value: s.los, icon: <AlertTriangle size={18} />, color: 'text-danger', bg: 'bg-danger/10' },
    { label: 'Dying Gasp', value: s.dyinggasp, icon: <Zap size={18} />, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Unregister', value: s.unregister, icon: <CircleDashed size={18} />, color: 'text-tx3', bg: 'bg-glass' },
  ];

  const portUtil = infra.total_odp_ports > 0 ? Math.round((infra.used_odp_ports / infra.total_odp_ports) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-end gap-1.5 text-[10px] text-tx3">
        {isFetching ? <><RefreshCw size={10} className="animate-spin" /> Updating...</> : <>refresh dalam <span className={countdown <= 3 ? 'text-warning font-semibold' : 'text-tx2'}>{countdown}s</span></>}
      </div>
      {/* ONU Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        {statCards.map((c, i) => (
          <div key={i} className={cn('rounded-xl p-3 md:p-4 border border-brd', c.bg)}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] md:text-xs text-tx3 font-medium uppercase tracking-wider">{c.label}</span>
              <span className={c.color}>{c.icon}</span>
            </div>
            <div className={cn('text-xl md:text-2xl font-extrabold', c.color)}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Orphan Alert */}
      {orphans.total > 0 && (
        <div className="rounded-xl p-3 md:p-4 border border-warning/30 bg-warning/10 flex items-center gap-3">
          <AlertTriangle size={20} className="text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-warning">Orphaned Nodes Detected ({orphans.total})</div>
            <div className="text-xs text-tx3 mt-0.5">
              {orphans.onus_without_odp > 0 && <span>{orphans.onus_without_odp} ONUs without ODP · </span>}
              {orphans.odps_without_odc > 0 && <span>{orphans.odps_without_odc} ODPs without ODC · </span>}
              {orphans.odcs_without_otb > 0 && <span>{orphans.odcs_without_otb} ODCs without OTB · </span>}
              {orphans.otbs_without_olt > 0 && <span>{orphans.otbs_without_olt} OTBs without OLT</span>}
            </div>
          </div>
        </div>
      )}

      {/* Data Completeness Alerts */}
      {(orphans.onus_without_technician > 0 || orphans.onus_without_coordinates > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
          {orphans.onus_without_technician > 0 && (
            <div className="rounded-xl p-3 md:p-4 border border-warning/30 bg-warning/10 flex items-center gap-3">
              <UserX size={20} className="text-warning flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-warning">Technician Not Assigned ({orphans.onus_without_technician})</div>
                <div className="text-xs text-tx3 mt-0.5">
                  {orphans.onus_without_technician} ONU{orphans.onus_without_technician > 1 ? 's' : ''} belum memiliki teknisi yang melakukan aktivasi. Set teknisi di halaman All ONU.
                </div>
              </div>
            </div>
          )}
          {orphans.onus_without_coordinates > 0 && (
            <div className="rounded-xl p-3 md:p-4 border border-warning/30 bg-warning/10 flex items-center gap-3">
              <MapPin size={20} className="text-warning flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-warning">Location Coordinates Not Set ({orphans.onus_without_coordinates})</div>
                <div className="text-xs text-tx3 mt-0.5">
                  {orphans.onus_without_coordinates} ONU{orphans.onus_without_coordinates > 1 ? 's' : ''} belum memiliki koordinat lokasi (GPS). Set koordinat di halaman All ONU.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Infrastructure Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <div className="glass-card p-3 md:p-4 flex items-center gap-3">
          <Server size={20} className="text-accent flex-shrink-0" />
          <div><div className="text-lg font-bold">{infra.total_otb}</div><div className="text-[10px] text-tx3 uppercase">OTB/ODF</div></div>
        </div>
        <div className="glass-card p-3 md:p-4 flex items-center gap-3">
          <Box size={20} className="text-warning flex-shrink-0" />
          <div><div className="text-lg font-bold">{infra.total_odc}</div><div className="text-[10px] text-tx3 uppercase">ODC</div></div>
        </div>
        <div className="glass-card p-3 md:p-4 flex items-center gap-3">
          <Split size={20} className="text-success flex-shrink-0" />
          <div><div className="text-lg font-bold">{infra.total_odp}</div><div className="text-[10px] text-tx3 uppercase">ODP</div></div>
        </div>
        <div className="glass-card p-3 md:p-4 flex items-center gap-3">
          <Network size={20} className="text-accent flex-shrink-0" />
          <div><div className="text-lg font-bold">{infra.used_odp_ports}<span className="text-tx3 text-sm font-normal">/{infra.total_odp_ports}</span></div><div className="text-[10px] text-tx3 uppercase">ODP Ports Used</div></div>
        </div>
      </div>

      {/* ODP Port Utilization Bar */}
      {infra.total_odp_ports > 0 && (
        <div className="glass-card p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-tx2">ODP Port Utilization</span>
            <span className={cn('text-xs font-bold', portUtil > 80 ? 'text-danger' : portUtil > 60 ? 'text-warning' : 'text-success')}>{portUtil}%</span>
          </div>
          <div className="h-2 rounded-full bg-glass overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', portUtil > 80 ? 'bg-danger' : portUtil > 60 ? 'bg-warning' : 'bg-success')} style={{ width: `${portUtil}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-tx3">
            <span>{infra.used_odp_ports} used</span>
            <span>{infra.available_odp_ports} available</span>
          </div>
        </div>
      )}

      {/* Per-OLT Breakdown */}
      {stats.per_olt.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Server size={16} /> Per OLT Breakdown</h3>
          <div className="space-y-2">
            {stats.per_olt.map(olt => {
              const oltUtil = olt.total > 0 ? Math.round((olt.online / olt.total) * 100) : 0;
              return (
                <div key={olt.olt_id} className="glass-card p-3 md:p-4 cursor-pointer hover:bg-glass/50 transition-colors" onClick={() => onDrillDown()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', olt.is_online ? 'bg-success' : 'bg-danger')} />
                      <span className="text-sm font-medium truncate">{olt.olt_name}</span>
                    </div>
                    <span className={cn('text-xs font-bold flex-shrink-0', oltUtil > 80 ? 'text-success' : oltUtil > 50 ? 'text-warning' : 'text-danger')}>{oltUtil}%</span>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4 text-xs">
                    <span className="text-tx3">Total: <strong className="text-tx1">{olt.total}</strong></span>
                    <span className="text-success">Online: <strong>{olt.online}</strong></span>
                    <span className="text-tx3">Offline: <strong>{olt.offline}</strong></span>
                    {olt.los > 0 && <span className="text-danger">LOS: <strong>{olt.los}</strong></span>}
                    {olt.dyinggasp > 0 && <span className="text-warning">DG: <strong>{olt.dyinggasp}</strong></span>}
                    {olt.unregister > 0 && <span className="text-tx3">Unreg: <strong>{olt.unregister}</strong></span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-glass overflow-hidden mt-2">
                    <div className={cn('h-full rounded-full', oltUtil > 80 ? 'bg-success' : oltUtil > 50 ? 'bg-warning' : 'bg-danger')} style={{ width: `${oltUtil}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-PON Port Breakdown */}
      {stats.per_pon.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Cable size={16} /> Per PON Port</h3>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brd">
                  <th className="px-3 py-2 text-left text-xs text-tx3 uppercase">PON Port</th>
                  <th className="px-3 py-2 text-left text-xs text-tx3 uppercase hidden md:table-cell">OLT</th>
                  <th className="px-3 py-2 text-center text-xs text-tx3 uppercase">Status</th>
                  <th className="px-3 py-2 text-center text-xs text-tx3 uppercase">Total</th>
                  <th className="px-3 py-2 text-center text-xs text-tx3 uppercase">Online</th>
                  <th className="px-3 py-2 text-center text-xs text-tx3 uppercase hidden sm:table-cell">Offline</th>
                </tr></thead>
                <tbody>
                  {stats.per_pon.map(pp => (
                    <tr key={pp.port_id} className="border-b border-brd/50 hover:bg-glass/30">
                      <td className="px-3 py-2 font-mono text-xs">{pp.port_name}</td>
                      <td className="px-3 py-2 text-xs text-tx3 hidden md:table-cell">{pp.olt_name}</td>
                      <td className="px-3 py-2 text-center"><span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', pp.admin_status === 'up' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>{pp.admin_status === 'up' ? 'UP' : 'DOWN'}</span></td>
                      <td className="px-3 py-2 text-center font-bold">{pp.total}</td>
                      <td className="px-3 py-2 text-center text-success font-medium">{pp.online}</td>
                      <td className="px-3 py-2 text-center text-tx3 hidden sm:table-cell">{pp.offline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared callbacks passed down the recursive tree ───
interface TreeCallbacks {
  expanded: Record<string, boolean>;
  toggleExpand: (k: string) => void;
  canEdit: boolean;
  onAddOdc: (parent: any, kind: 'otb' | 'jc') => void;
  onEditOdc: (odc: FTTHOdcTree) => void;
  onDeleteOdc: (odc: FTTHOdcTree) => void;
  onAddOdp: (parent: any, kind: 'odc' | 'jc') => void;
  onEditOdp: (odp: FTTHOdpTree) => void;
  onDeleteOdp: (odp: FTTHOdpTree) => void;
  onAddJc: (parent: any, kind: 'otb' | 'odc' | 'jc') => void;
  onEditJc: (jc: FTTHJcTree) => void;
  onDeleteJc: (jc: FTTHJcTree) => void;
}

// ─── OTB Tree Node ───
function OtbNode({ otb, expanded, toggleExpand, canEdit, onAddOdc, onEditOtb, onDeleteOtb, onAddOdp, onEditOdc, onDeleteOdc, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc }: {
  otb: FTTHItem;
  onEditOtb: () => void; onDeleteOtb: () => void;
} & TreeCallbacks) {
  const key = `otb-${otb.id}`;
  const isOpen = expanded[key] ?? false;
  const cb: TreeCallbacks = { expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc };
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 hover:bg-glass/50 transition-colors">
        <button onClick={() => toggleExpand(key)} className="p-1 rounded hover:bg-glass">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <Server size={18} className="text-accent" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{otb.name}</div>
          <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
            <span className="uppercase">{otb.type}</span>
            {otb.olt_name && <span>• OLT: {otb.olt_name}</span>}
            {otb.pon_port && <span>• PON: {otb.pon_port}</span>}
            <span>• {otb.total_cores} cores</span>
            <span>• {otb.odc_count} ODCs</span>
            {otb.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {otb.latitude.toFixed(4)}, {otb.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && <button onClick={() => onAddJc(otb, 'otb')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-purple-400" title="Add JC (Joint Closure)"><GitMerge size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdc(otb, 'otb')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Add ODC"><Plus size={15} /></button>}
          {canEdit && <button onClick={onEditOtb} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
          {canEdit && <button onClick={onDeleteOtb} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
        </div>
      </div>
      {isOpen && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {otb.odcs.length === 0 && otb.jcs.length === 0 && <div className="p-3 text-xs text-tx3">No ODCs or JCs yet. Click + to add one.</div>}
          {otb.odcs.map(odc => (
            <OdcRow key={`odc-${odc.id}`} odc={odc} fibersPerTube={otb.fibers_per_tube} sourceLabel={`Core ${odc.otb_core_number} from ${odc.otb_name}`} {...cb} />
          ))}
          {otb.jcs.map(jc => (
            <JcRow key={`jc-${jc.id}`} jc={jc} {...cb} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ODC Tree Row (recursive: can nest child JCs) ───
function OdcRow({ odc, fibersPerTube, sourceLabel, expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc }: {
  odc: FTTHOdcTree; fibersPerTube?: number; sourceLabel: string;
} & TreeCallbacks) {
  const odcKey = `odc-${odc.id}`;
  const odcOpen = expanded[odcKey] ?? false;
  const cb: TreeCallbacks = { expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc };
  return (
    <div>
      <div className="flex items-center gap-2 p-2.5 hover:bg-glass/50 transition-colors border-t border-brd/30">
        <button onClick={() => toggleExpand(odcKey)} className="p-1 rounded hover:bg-glass">
          {odcOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Box size={16} className="text-warning" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{odc.name}</div>
          <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
            <span>{sourceLabel}</span>
            {odc.feed_source !== 'jc' && <CoreColorTag coreNumber={odc.otb_core_number} fibersPerTube={fibersPerTube} />}
            {odc.splitter_model && <span>• Splitter: {odc.splitter_model}</span>}
            <span>• {odc.odp_count} ODPs</span>
            {odc.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {odc.latitude.toFixed(4)}, {odc.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && <button onClick={() => onAddJc(odc, 'odc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-purple-400" title="Add JC (Joint Closure)"><GitMerge size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdp(odc, 'odc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Add ODP"><Plus size={15} /></button>}
          {canEdit && <button onClick={() => onEditOdc(odc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
          {canEdit && <button onClick={() => onDeleteOdc(odc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
        </div>
      </div>
      {odcOpen && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {odc.odps.length === 0 && odc.jcs.length === 0 && <div className="p-2.5 text-xs text-tx3">No ODPs or JCs yet. Click + to add one.</div>}
          {odc.odps.map(odp => (
            <OdpRow key={`odp-${odp.id}`} odp={odp} sourceLabel={`Core ${odp.odc_core_number} from ${odp.odc_name}`} {...cb} />
          ))}
          {odc.jcs.map(jc => (
            <JcRow key={`jc-${jc.id}`} jc={jc} {...cb} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ODP Tree Row (leaf) ───
function OdpRow({ odp, sourceLabel, canEdit, onEditOdp, onDeleteOdp }: {
  odp: FTTHOdpTree; sourceLabel: string;
} & Pick<TreeCallbacks, 'canEdit' | 'onEditOdp' | 'onDeleteOdp'>) {
  return (
    <div className="flex items-center gap-2 p-2.5 hover:bg-glass/50 transition-colors border-t border-brd/30">
      <Split size={16} className="text-success" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{odp.name}</div>
        <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
          <span>{sourceLabel}</span>
          {odp.splitter_model && <span>• Splitter: {odp.splitter_model}</span>}
          <span>• {odp.used_ports}/{odp.total_ports} ports used</span>
          {odp.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {odp.latitude.toFixed(4)}, {odp.longitude?.toFixed(4)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {canEdit && <button onClick={() => onEditOdp(odp)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Manage Ports"><Network size={15} /></button>}
        {canEdit && <button onClick={() => onDeleteOdp(odp)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
      </div>
    </div>
  );
}

// ─── JC (Joint Closure) Tree Row — recursive: can feed ODCs, ODPs, or chain to another JC ───
function JcRow({ jc, expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc }: {
  jc: FTTHJcTree;
} & TreeCallbacks) {
  const jcKey = `jc-${jc.id}`;
  const jcOpen = expanded[jcKey] ?? false;
  const cb: TreeCallbacks = { expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc };
  const childCount = jc.odcs.length + jc.odps.length + jc.jcs.length;
  return (
    <div>
      <div className="flex items-center gap-2 p-2.5 hover:bg-glass/50 transition-colors border-t border-brd/30 bg-purple-500/[0.03]">
        <button onClick={() => toggleExpand(jcKey)} className="p-1 rounded hover:bg-glass">
          {jcOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <GitMerge size={16} className="text-purple-400" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate flex items-center gap-1.5">
            {jc.name}
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-glass text-tx3 uppercase">{jc.closure_type}</span>
          </div>
          <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
            <span>• {jc.splice_count} splice{jc.splice_count === 1 ? '' : 's'}</span>
            {jc.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {jc.latitude.toFixed(4)}, {jc.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && <button onClick={() => onAddJc(jc, 'jc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-purple-400" title="Chain another JC"><GitMerge size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdc(jc, 'jc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Add ODC fed from this JC"><Box size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdp(jc, 'jc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-success" title="Add ODP fed from this JC"><Split size={15} /></button>}
          {canEdit && <button onClick={() => onEditJc(jc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit / Manage Splices"><Edit2 size={15} /></button>}
          {canEdit && <button onClick={() => onDeleteJc(jc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
        </div>
      </div>
      {jcOpen && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {childCount === 0 && <div className="p-2.5 text-xs text-tx3">Nothing fed from this JC yet. Click an icon above to add an ODC, ODP, or chained JC.</div>}
          {jc.odcs.map(odc => (
            <OdcRow key={`odc-${odc.id}`} odc={odc} sourceLabel={`Core ${odc.jc_core_number} from JC ${jc.name}`} {...cb} />
          ))}
          {jc.odps.map(odp => (
            <OdpRow key={`odp-${odp.id}`} odp={odp} sourceLabel={`Core ${odp.jc_core_number} from JC ${jc.name}`} {...cb} />
          ))}
          {jc.jcs.map(child => (
            <JcRow key={`jc-${child.id}`} jc={child} {...cb} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Map View (Leaflet interactive map) ───
function MapView({ markers, lines, fiberPaths, drawMode, onDrawComplete, onMarkerClick }: {
  markers: any[]; lines: any[]; fiberPaths: FTTHFiberPath[]; drawMode: boolean;
  onDrawComplete: (coords: [number, number][]) => void;
  onMarkerClick?: (marker: any) => void;
}) {
  if (markers.length === 0) {
    return <div className="glass-card p-8 text-center"><MapIcon size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm">No coordinates set. Add latitude/longitude to OTB/ODF, ODC, or ODP to see them on map.</p></div>;
  }
  return (
    <LeafletMap
      markers={markers}
      lines={lines}
      fiberPaths={fiberPaths}
      height="500px"
      refreshKey={JSON.stringify({ m: markers.length, l: lines.length })}
      drawMode={drawMode}
      onDrawComplete={onDrawComplete}
      onMarkerClick={onMarkerClick}
    />
  );
}

// ─── ODP Port Panel ───
function OdpPortPanel({ odp, ports, availableOnus, onClose, onUpdated }: {
  odp: FTTHOdp; ports: FTTHOdpPort[]; availableOnus: FTTHAvailableOnu[]; onClose: () => void; onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [editingPort, setEditingPort] = useState<FTTHOdpPort | null>(null);
  const [showLink, setShowLink] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('diagram');

  const saveMut = useMutation({
    mutationFn: (data: Partial<FTTHOdpPort> & { id: number }) => api.ftthOdpPortUpdate(data.id, data),
    onSuccess: () => { toast.success('Port updated'); qc.invalidateQueries({ queryKey: ['ftth-odp-ports', odp.id] }); qc.invalidateQueries({ queryKey: ['ftth-tree'] }); setEditingPort(null); setShowLink(null); onUpdated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = (port: FTTHOdpPort) => {
    saveMut.mutate({ id: port.id, onu_id: null, customer_name: '', customer_phone: '' });
  };

  const cols = ports.length <= 6 ? ports.length : ports.length <= 12 ? 6 : ports.length <= 24 ? 8 : 12;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" />
      <div className="relative glass-card w-full max-w-3xl max-h-[90vh] md:max-h-[85vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between sticky top-0 bg-surface z-10 rounded-t-2xl md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold flex items-center gap-2 truncate"><Split size={16} /> {odp.name} — Port Management</h2>
            <p className="text-xs text-tx3 mt-0.5 truncate">{odp.splitter_model} • {odp.used_ports}/{odp.total_ports} used • Core {odp.odc_core_number} from {odp.odc_name}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="hidden md:flex items-center rounded-lg bg-glass/60 p-0.5 mr-1">
              <button onClick={() => setViewMode('diagram')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'diagram' ? 'bg-surface text-accent shadow-sm' : 'text-tx3 hover:text-tx1')} title="Diagram view"><LayoutGrid size={14} /></button>
              <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-surface text-accent shadow-sm' : 'text-tx3 hover:text-tx1')} title="List view"><List size={14} /></button>
            </div>
            <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
          </div>
        </div>
        <div className="p-3 md:p-4 overflow-y-auto flex-1">
          {/* Diagram view (desktop) — NetBox-style splitter port grid */}
          {viewMode === 'diagram' && (
            <div className="hidden md:block">
              <div className="flex items-center gap-4 mb-4 text-[11px] text-tx3">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-brd bg-glass inline-block" /> Available</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-success bg-success/15 inline-block" /> Used</span>
                <span className="ml-auto italic">Click a port to edit • use the corner icon to link/unlink</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {ports.map(p => (
                  <div
                    key={p.id}
                    title={p.customer_name ? `Port ${p.port_number} — ${p.customer_name}` : `Port ${p.port_number}`}
                    className={cn(
                      'relative aspect-square rounded-lg border-2 transition-all hover:scale-[1.06] hover:shadow-md',
                      p.status === 'used' ? 'border-success bg-success/10' : 'border-brd bg-glass/40',
                    )}
                  >
                    <button onClick={() => setEditingPort(p)} className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-1">
                      <span className="text-[10px] font-mono text-tx3 leading-none">#{p.port_number}</span>
                      <span className={cn('text-[11px] font-semibold leading-tight text-center line-clamp-2 px-0.5', p.customer_name ? 'text-tx1' : 'text-tx3 italic font-normal')}>
                        {p.customer_name || 'Available'}
                      </span>
                      {p.onu_id && <span className="text-[9px] text-success leading-none truncate w-full text-center px-0.5">{p.onu_name}</span>}
                    </button>
                    <button
                      onClick={() => p.onu_id ? unlink(p) : setShowLink(p.id)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded hover:bg-glass text-tx3 hover:text-accent"
                      title={p.onu_id ? 'Unlink ONU' : 'Link ONU'}
                    >
                      {p.onu_id ? <Unlink size={11} /> : <Link2 size={11} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Desktop table */}
          <table className={cn('w-full text-sm', viewMode === 'list' ? 'hidden md:table' : 'hidden')}>
            <thead><tr className="border-b border-brd">
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">Port</th>
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">Status</th>
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">Customer</th>
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">ONU</th>
              <th className="px-2 py-2 text-right text-xs text-tx3 uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {ports.map(p => (
                <tr key={p.id} className="border-b border-brd/50 hover:bg-glass/30">
                  <td className="px-2 py-2.5 font-medium">Port {p.port_number}</td>
                  <td className="px-2 py-2.5"><span className={cn('px-2 py-0.5 rounded text-xs font-medium', p.status === 'used' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{p.status}</span></td>
                  <td className="px-2 py-2.5">
                    {p.customer_name ? <div><div className="font-medium text-xs">{p.customer_name}</div>{p.customer_phone && <div className="text-tx3 text-xs flex items-center gap-1"><Phone size={10} /> {p.customer_phone}</div>}</div> : <span className="text-tx3 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    {p.onu_id ? <div><div className="font-medium text-xs">{p.onu_name}</div><div className="text-tx3 text-xs">{p.onu_serial} • {p.onu_id_str}</div></div> : <span className="text-tx3 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {p.onu_id ? (
                        <button onClick={() => unlink(p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-warning" title="Unlink ONU"><Unlink size={14} /></button>
                      ) : (
                        <button onClick={() => setShowLink(p.id)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Link ONU"><Link2 size={14} /></button>
                      )}
                      <button onClick={() => setEditingPort(p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brd/50">
            {ports.map(p => (
              <div key={p.id} className="py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">Port {p.port_number}</span>
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', p.status === 'used' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{p.status}</span>
                </div>
                {p.customer_name && (
                  <div className="text-xs">
                    <span className="text-tx3">Customer:</span> <span className="font-medium">{p.customer_name}</span>
                    {p.customer_phone && <span className="text-tx3 flex items-center gap-1 mt-0.5"><Phone size={10} /> {p.customer_phone}</span>}
                  </div>
                )}
                {p.onu_id && (
                  <div className="text-xs">
                    <span className="text-tx3">ONU:</span> <span className="font-medium">{p.onu_name}</span>
                    <div className="text-tx3">{p.onu_serial} • {p.onu_id_str}</div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {p.onu_id ? (
                    <button onClick={() => unlink(p)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-warning transition-colors"><Unlink size={12} /> Unlink</button>
                  ) : (
                    <button onClick={() => setShowLink(p.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-accent transition-colors"><Link2 size={12} /> Link</button>
                  )}
                  <button onClick={() => setEditingPort(p)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors ml-auto"><Edit2 size={12} /> Edit</button>
                </div>
              </div>
            ))}
          </div>

          {/* Edit port modal */}
          {editingPort && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="modal-overlay" onClick={() => setEditingPort(null)} />
              <div className="relative glass-card w-full max-w-md p-4 md:p-5 space-y-3 rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold">Edit Port {editingPort.port_number}</h3>
                <FormField label="Customer Name"><input className="input-field" defaultValue={editingPort.customer_name} onChange={e => editingPort.customer_name = e.target.value} /></FormField>
                <FormField label="Customer Phone"><input className="input-field" defaultValue={editingPort.customer_phone} onChange={e => editingPort.customer_phone = e.target.value} /></FormField>
                <FormField label="Description"><input className="input-field" defaultValue={editingPort.description} onChange={e => editingPort.description = e.target.value} /></FormField>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setEditingPort(null)} className="btn-cancel text-sm">Cancel</button>
                  <button onClick={() => saveMut.mutate({ id: editingPort.id, customer_name: editingPort.customer_name, customer_phone: editingPort.customer_phone, description: editingPort.description })} className="btn-primary text-sm">Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Link ONU modal */}
          {showLink !== null && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="modal-overlay" onClick={() => setShowLink(null)} />
              <div className="relative glass-card w-full max-w-md p-4 md:p-5 space-y-3 rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold">Link ONU to Port</h3>
                {availableOnus.length === 0 ? (
                  <p className="text-tx3 text-sm">No available ONUs. All ONUs are already linked to ODP ports.</p>
                ) : (
                  <select className="input-field" id="onu-select" defaultValue="">
                    <option value="" disabled>Select an ONU...</option>
                    {availableOnus.map(o => <option key={o.id} value={o.id}>{o.name} — {o.serial} ({o.onu_id_str})</option>)}
                  </select>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowLink(null)} className="btn-cancel text-sm">Cancel</button>
                  <button onClick={() => { const sel = document.getElementById('onu-select') as HTMLSelectElement; const val = sel?.value; if (val) saveMut.mutate({ id: showLink, onu_id: parseInt(val) }); }} className="btn-primary text-sm" disabled={availableOnus.length === 0}>Link</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── OTB/ODF Port Diagram — NetBox-style rear-port grid, each core nameable ───
function OtbPortDiagram({ otb, ports, canEdit, onClose, onUpdated }: {
  otb: FTTHOtb; ports: FTTHOtbPort[]; canEdit: boolean; onClose: () => void; onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [editingPort, setEditingPort] = useState<FTTHOtbPort | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  const saveMut = useMutation({
    mutationFn: (data: Partial<FTTHOtbPort> & { id: number }) => api.ftthOtbPortUpdate(data.id, data),
    onSuccess: () => {
      toast.success('Port updated');
      qc.invalidateQueries({ queryKey: ['ftth-otb-ports', otb.id] });
      setEditingPort(null);
      onUpdated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPort = (p: FTTHOtbPort) => {
    if (!canEdit) return;
    setEditingPort(p);
    setLabelDraft(p.label);
    setDescDraft(p.description);
  };

  const usedCount = ports.filter(p => p.status === 'used').length;
  // Roughly square-ish grid — NetBox-style patch panels are usually wide
  // and shallow, so favor more columns over more rows.
  const cols = ports.length <= 6 ? ports.length : ports.length <= 12 ? 6 : ports.length <= 24 ? 8 : 12;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" onClick={onClose} />
      <div className="relative glass-card w-full max-w-4xl max-h-[90vh] md:max-h-[85vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between sticky top-0 bg-surface z-10 rounded-t-2xl md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold flex items-center gap-2 truncate"><Cable size={16} /> {otb.name} — Port Diagram</h2>
            <p className="text-xs text-tx3 mt-0.5 truncate">{otb.type.toUpperCase()}{otb.model && ` • ${otb.model}`} • {usedCount}/{ports.length} cores used</p>
          </div>
          <button onClick={onClose} className="text-tx3 hover:text-tx1 flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto flex-1">
          {ports.length === 0 ? (
            <p className="text-tx3 text-sm text-center py-8">No cores configured.</p>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4 text-[11px] text-tx3 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-brd bg-glass inline-block" /> Available</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-success bg-success/15 inline-block" /> Connected</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-tx3 inline-block" /> Warna tube/core (TIA-598, {otb.fibers_per_tube}/tube)</span>
                {canEdit && <span className="ml-auto italic">Click a core to name it</span>}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {ports.map(p => {
                  const cc = coreColorInfo(p.port_number, otb.fibers_per_tube);
                  return (
                  <button
                    key={p.id}
                    onClick={() => openPort(p)}
                    disabled={!canEdit}
                    title={`${p.status === 'used' ? `Core ${p.port_number} → ${p.odc_name}` : `Core ${p.port_number}${p.label ? ` — ${p.label}` : ''}`} • Tube ${cc.tubeNumber} (${cc.tubeColor}) • Core ${cc.positionInTube} (${cc.coreColor})`}
                    className={cn(
                      'relative aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 p-1 transition-all',
                      canEdit && 'hover:scale-[1.06] hover:shadow-md cursor-pointer',
                      !canEdit && 'cursor-default',
                      p.status === 'used' ? 'border-success bg-success/10' : 'border-brd bg-glass/40',
                    )}
                  >
                    <span className="absolute top-1 right-1 flex gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full border border-black/10" style={{ backgroundColor: cc.tubeColorHex }} />
                      <span className="w-1.5 h-1.5 rounded-full border border-black/10" style={{ backgroundColor: cc.coreColorHex }} />
                    </span>
                    <span className="text-[10px] font-mono text-tx3 leading-none">#{p.port_number}</span>
                    <span className={cn('text-[11px] font-semibold leading-tight text-center line-clamp-2 px-0.5', p.label ? 'text-tx1' : 'text-tx3 italic font-normal')}>
                      {p.label || (canEdit ? 'Unnamed' : '—')}
                    </span>
                    {p.status === 'used' && (
                      <span className="text-[9px] text-success leading-none truncate w-full text-center px-0.5">{p.odc_name}</span>
                    )}
                  </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Edit port modal */}
        {editingPort && (
          <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="modal-overlay" onClick={() => setEditingPort(null)} />
            <div className="relative glass-card w-full max-w-md p-4 md:p-5 space-y-3 rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold">Name Core #{editingPort.port_number}</h3>
              <p className="text-xs"><CoreColorTag coreNumber={editingPort.port_number} fibersPerTube={otb.fibers_per_tube} /></p>
              {editingPort.status === 'used' && (
                <p className="text-xs text-tx3">Connected to ODC: <span className="font-medium text-tx1">{editingPort.odc_name}</span></p>
              )}
              <FormField label="Label"><input className="input-field" placeholder="e.g. Ruko Blok A" value={labelDraft} onChange={e => setLabelDraft(e.target.value)} autoFocus /></FormField>
              <FormField label="Description"><input className="input-field" value={descDraft} onChange={e => setDescDraft(e.target.value)} /></FormField>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingPort(null)} className="btn-cancel text-sm">Cancel</button>
                <button onClick={() => saveMut.mutate({ id: editingPort.id, label: labelDraft, description: descDraft })} className="btn-primary text-sm" disabled={saveMut.isPending}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Form Field helper ───
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-tx3 font-medium block mb-1">{label}</label>{children}</div>;
}

// ─── Core color tag — TIA-598 tube + core color for a given core number ───
function CoreColorTag({ coreNumber, fibersPerTube }: { coreNumber: number; fibersPerTube?: number }) {
  const c = coreColorInfo(coreNumber, fibersPerTube || 12);
  return (
    <span className="inline-flex items-center gap-1" title={`Tube ${c.tubeNumber} (${c.tubeColor}) • Core ${c.positionInTube} (${c.coreColor})`}>
      <span className="w-2 h-2 rounded-full border border-brd/50 flex-shrink-0" style={{ backgroundColor: c.tubeColorHex }} />
      <span className="w-2 h-2 rounded-full border border-brd/50 flex-shrink-0" style={{ backgroundColor: c.coreColorHex }} />
      <span className="text-tx3">Tube {c.tubeNumber} {c.tubeColor} • {c.coreColor}</span>
    </span>
  );
}

// ─── PON Modal ───
function PonModal({ item, otbList, onClose, onSaved }: { item: FTTHPonPort | null; otbList: FTTHOtb[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    olt_name: item?.olt_name || '', frame: item?.frame || 1, slot: item?.slot || 1,
    port: item?.port || 1, pon_name: item?.pon_name || '',
    otb_id: item?.otb_id || '', otb_core_number: item?.otb_core_number || 1,
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthPonUpdate(item.id, data) : api.ftthPonCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.otb_id = form.otb_id === '' ? null : parseInt(String(form.otb_id));
    d.frame = parseInt(String(form.frame));
    d.slot = parseInt(String(form.slot));
    d.port = parseInt(String(form.port));
    d.otb_core_number = parseInt(String(form.otb_core_number));
    mut.mutate(d);
  };
  const selectedOtb = otbList.find(o => o.id === Number(form.otb_id));
  return (
    <Modal title={item ? 'Edit PON Port' : 'Add PON Port'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="PON Name"><input className="input-field" value={form.pon_name} onChange={e => setForm({ ...form, pon_name: e.target.value })} placeholder="gpon-olt_1/1/1" /></FormField>
      <FormField label="OLT Name"><input className="input-field" value={form.olt_name} onChange={e => setForm({ ...form, olt_name: e.target.value })} placeholder="OLT-01" /></FormField>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <FormField label="Frame"><input className="input-field" type="number" value={form.frame} onChange={e => setForm({ ...form, frame: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Slot"><input className="input-field" type="number" value={form.slot} onChange={e => setForm({ ...form, slot: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Port"><input className="input-field" type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 1 })} /></FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="OTB/ODF (connected core)"><select className="input-field" value={form.otb_id} onChange={e => setForm({ ...form, otb_id: e.target.value })}><option value="">— None —</option>{otbList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
        <FormField label="Core Number in OTB"><input className="input-field" type="number" value={form.otb_core_number} onChange={e => setForm({ ...form, otb_core_number: parseInt(e.target.value) || 1 })} /></FormField>
      </div>
      {selectedOtb && <p className="text-xs -mt-1"><CoreColorTag coreNumber={form.otb_core_number} fibersPerTube={selectedOtb.fibers_per_tube} /></p>}
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── OTB Modal ───
function OtbModal({ item, onClose, onSaved }: { item: FTTHOtb | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || '', type: item?.type || 'otb', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    total_cores: item?.total_cores || 12,
    fibers_per_tube: item?.fibers_per_tube || 12,
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthOtbUpdate(item.id, data) : api.ftthOtbCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.latitude = form.latitude === '' ? null : parseFloat(String(form.latitude));
    d.longitude = form.longitude === '' ? null : parseFloat(String(form.longitude));
    d.total_cores = parseInt(String(form.total_cores));
    d.fibers_per_tube = parseInt(String(form.fibers_per_tube));
    mut.mutate(d);
  };
  return (
    <Modal title={item ? 'Edit OTB/ODF' : 'Add OTB/ODF'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="OTB-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Type"><select className="input-field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="otb">OTB</option><option value="odf">ODF</option></select></FormField>
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="e.g. 12 port" /></FormField>
      </div>
      <FormField label="Location"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Server room, rack 1" /></FormField>
      <FormField label="Coordinates (GPS / Map)">
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Total Cores"><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
        <FormField label="Fibers per Tube"><input className="input-field" type="number" min={1} value={form.fibers_per_tube} onChange={e => setForm({ ...form, fibers_per_tube: parseInt(e.target.value) || 12 })} /></FormField>
      </div>
      <p className="text-[11px] text-tx3 -mt-1">Warna tube/core mengikuti standar TIA-598 (12 warna), dihitung otomatis dari nomor core — biasanya 12 per tube.</p>
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── Fed-from toggle (OTB/ODC vs JC), shared by ODC + ODP modals ───
function FeedSourceToggle({ value, directValue, onChange, directLabel, directIcon }: {
  value: 'otb' | 'odc' | 'jc'; directValue: 'otb' | 'odc'; onChange: (v: 'otb' | 'odc' | 'jc') => void;
  directLabel: string; directIcon: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onChange(directValue)}
        className={cn('flex items-center gap-2 p-2 rounded-lg border text-left transition text-xs',
          value !== 'jc' ? 'border-accent bg-accent/10' : 'border-brd hover:border-tx3')}>
        {directIcon} {directLabel}
      </button>
      <button type="button" onClick={() => onChange('jc')}
        className={cn('flex items-center gap-2 p-2 rounded-lg border text-left transition text-xs',
          value === 'jc' ? 'border-accent bg-accent/10' : 'border-brd hover:border-tx3')}>
        <GitMerge size={14} className={value === 'jc' ? 'text-accent' : 'text-tx3'} /> JC (Joint Closure)
      </button>
    </div>
  );
}

// ─── ODC Modal ───
function OdcModal({ item, parent, parentKind, otbList, jcList, onClose, onSaved }: {
  item: FTTHOdc | null; parent: any; parentKind?: ParentKind; otbList: FTTHOtb[]; jcList: FTTHJc[]; onClose: () => void; onSaved: () => void;
}) {
  const initialFeedSource: 'otb' | 'jc' = item?.feed_source || (parentKind === 'jc' ? 'jc' : 'otb');
  const [form, setForm] = useState({
    name: item?.name || '', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    feed_source: initialFeedSource,
    otb_id: item?.otb_id || (parentKind === 'otb' ? parent?.id : '') || '', otb_core_number: item?.otb_core_number || 1,
    jc_id: item?.jc_id || (parentKind === 'jc' ? parent?.id : '') || '', jc_core_number: item?.jc_core_number || '',
    total_cores: item?.total_cores || 8, fibers_per_tube: item?.fibers_per_tube || 12,
    splitter_model: item?.splitter_model || '',
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthOdcUpdate(item.id, data) : api.ftthOdcCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.latitude = form.latitude === '' ? null : parseFloat(String(form.latitude));
    d.longitude = form.longitude === '' ? null : parseFloat(String(form.longitude));
    d.otb_id = form.otb_id === '' ? null : parseInt(String(form.otb_id));
    d.otb_core_number = parseInt(String(form.otb_core_number)) || 1;
    d.jc_id = form.jc_id === '' ? null : parseInt(String(form.jc_id));
    d.jc_core_number = form.jc_core_number === '' ? null : parseInt(String(form.jc_core_number));
    d.total_cores = parseInt(String(form.total_cores));
    d.fibers_per_tube = parseInt(String(form.fibers_per_tube));
    mut.mutate(d);
  };
  const selectedOtb = otbList.find(x => x.id === Number(form.otb_id));
  const selectedJc = jcList.find(x => x.id === Number(form.jc_id));
  return (
    <Modal title={item ? 'Edit ODC' : 'Add ODC'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ODC-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></FormField>
        <FormField label="Splitter Model"><input className="input-field" value={form.splitter_model} onChange={e => setForm({ ...form, splitter_model: e.target.value })} placeholder="1:8, 1:16" /></FormField>
      </div>
      <FormField label="Location"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Street address or landmark" /></FormField>
      <FormField label="Coordinates (GPS / Map)">
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <FormField label="Fed From">
        <FeedSourceToggle value={form.feed_source} directValue="otb" onChange={v => setForm({ ...form, feed_source: v as 'otb' | 'jc' })} directLabel="OTB/ODF" directIcon={<Server size={14} className={form.feed_source !== 'jc' ? 'text-accent' : 'text-tx3'} />} />
      </FormField>
      {form.feed_source === 'jc' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="JC (Joint Closure)"><select className="input-field" value={form.jc_id} onChange={e => setForm({ ...form, jc_id: e.target.value, jc_core_number: '' })}><option value="">— Select JC —</option>{jcList.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></FormField>
          <FormField label="Core from JC">
            <select className="input-field" value={form.jc_core_number} onChange={e => setForm({ ...form, jc_core_number: e.target.value })}>
              <option value="">— Select splice —</option>
              {(selectedJc?.splices || []).map(s => <option key={s.id} value={s.core_out}>Core {s.core_out} (in: {s.core_in}{s.label ? ` — ${s.label}` : ''})</option>)}
            </select>
          </FormField>
          <FormField label="Total Cores"><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
          {selectedJc && selectedJc.splices.length === 0 && <p className="text-xs text-warning -mt-1 col-span-full">This JC has no splices yet — add one first (Edit JC → Splices) so there's a core to feed from.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="OTB/ODF"><select className="input-field" value={form.otb_id} onChange={e => setForm({ ...form, otb_id: e.target.value })}><option value="">— None —</option>{otbList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
          <FormField label="Core from OTB"><input className="input-field" type="number" value={form.otb_core_number} onChange={e => setForm({ ...form, otb_core_number: parseInt(e.target.value) || 1 })} /></FormField>
          <FormField label="Total Cores"><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
        </div>
      )}
      {form.feed_source === 'jc' && selectedJc && form.jc_core_number !== '' && <p className="text-xs -mt-1"><CoreColorTag coreNumber={Number(form.jc_core_number)} fibersPerTube={selectedJc.fibers_per_tube} /></p>}
      {form.feed_source !== 'jc' && selectedOtb && <p className="text-xs -mt-1"><CoreColorTag coreNumber={form.otb_core_number} fibersPerTube={selectedOtb.fibers_per_tube} /></p>}
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── ODP Modal ───
function OdpModal({ item, parent, parentKind, odcList, jcList, onClose, onSaved }: {
  item: FTTHOdp | null; parent: any; parentKind?: ParentKind; odcList: FTTHOdc[]; jcList: FTTHJc[]; onClose: () => void; onSaved: () => void;
}) {
  const initialFeedSource: 'odc' | 'jc' = item?.feed_source || (parentKind === 'jc' ? 'jc' : 'odc');
  const [form, setForm] = useState({
    name: item?.name || '', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    feed_source: initialFeedSource,
    odc_id: item?.odc_id || (parentKind === 'odc' ? parent?.id : '') || '', odc_core_number: item?.odc_core_number || 1,
    jc_id: item?.jc_id || (parentKind === 'jc' ? parent?.id : '') || '', jc_core_number: item?.jc_core_number || '',
    total_ports: item?.total_ports || 8, splitter_model: item?.splitter_model || '',
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthOdpUpdate(item.id, data) : api.ftthOdpCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.latitude = form.latitude === '' ? null : parseFloat(String(form.latitude));
    d.longitude = form.longitude === '' ? null : parseFloat(String(form.longitude));
    d.odc_id = form.odc_id === '' ? null : parseInt(String(form.odc_id));
    d.odc_core_number = parseInt(String(form.odc_core_number)) || 1;
    d.jc_id = form.jc_id === '' ? null : parseInt(String(form.jc_id));
    d.jc_core_number = form.jc_core_number === '' ? null : parseInt(String(form.jc_core_number));
    d.total_ports = parseInt(String(form.total_ports));
    mut.mutate(d);
  };
  const selectedJc = jcList.find(x => x.id === Number(form.jc_id));
  return (
    <Modal title={item ? 'Edit ODP' : 'Add ODP'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ODP-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></FormField>
        <FormField label="Splitter Model"><input className="input-field" value={form.splitter_model} onChange={e => setForm({ ...form, splitter_model: e.target.value })} placeholder="1:4, 1:8, 1:16, 1:32" /></FormField>
      </div>
      <FormField label="Location"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Pole number, address" /></FormField>
      <FormField label="Coordinates (GPS / Map)">
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <FormField label="Fed From">
        <FeedSourceToggle value={form.feed_source} directValue="odc" onChange={v => setForm({ ...form, feed_source: v as 'odc' | 'jc' })} directLabel="ODC" directIcon={<Box size={14} className={form.feed_source !== 'jc' ? 'text-accent' : 'text-tx3'} />} />
      </FormField>
      {form.feed_source === 'jc' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="JC (Joint Closure)"><select className="input-field" value={form.jc_id} onChange={e => setForm({ ...form, jc_id: e.target.value, jc_core_number: '' })}><option value="">— Select JC —</option>{jcList.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></FormField>
          <FormField label="Core from JC">
            <select className="input-field" value={form.jc_core_number} onChange={e => setForm({ ...form, jc_core_number: e.target.value })}>
              <option value="">— Select splice —</option>
              {(selectedJc?.splices || []).map(s => <option key={s.id} value={s.core_out}>Core {s.core_out} (in: {s.core_in}{s.label ? ` — ${s.label}` : ''})</option>)}
            </select>
          </FormField>
          <FormField label="Total Ports"><input className="input-field" type="number" value={form.total_ports} onChange={e => setForm({ ...form, total_ports: parseInt(e.target.value) || 0 })} /></FormField>
          {selectedJc && selectedJc.splices.length === 0 && <p className="text-xs text-warning -mt-1 col-span-full">This JC has no splices yet — add one first (Edit JC → Splices) so there's a core to feed from.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="ODC"><select className="input-field" value={form.odc_id} onChange={e => setForm({ ...form, odc_id: e.target.value })}><option value="">— None —</option>{odcList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
          <FormField label="Core from ODC"><input className="input-field" type="number" value={form.odc_core_number} onChange={e => setForm({ ...form, odc_core_number: parseInt(e.target.value) || 1 })} /></FormField>
          <FormField label="Total Ports"><input className="input-field" type="number" value={form.total_ports} onChange={e => setForm({ ...form, total_ports: parseInt(e.target.value) || 0 })} /></FormField>
        </div>
      )}
      {form.feed_source === 'jc' && selectedJc && form.jc_core_number !== '' && <p className="text-xs -mt-1"><CoreColorTag coreNumber={Number(form.jc_core_number)} fibersPerTube={selectedJc.fibers_per_tube} /></p>}
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── JC (Joint Closure) Modal — includes inline splice management once saved ───
function JcModal({ item, parent, parentKind, otbList, odcList, jcList, onClose, onSaved }: {
  item: FTTHJc | null; parent: any; parentKind?: ParentKind; otbList: FTTHOtb[]; odcList: FTTHOdc[]; jcList: FTTHJc[]; onClose: () => void; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: item?.name || '', closure_type: item?.closure_type || 'inline',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    total_cores: item?.total_cores || 12,
    fibers_per_tube: item?.fibers_per_tube || 12,
    parent_type: item?.parent_type || parentKind || '',
    parent_id: item?.parent_id || parent?.id || '',
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthJcUpdate(item.id, data) : api.ftthJcCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.latitude = form.latitude === '' ? null : parseFloat(String(form.latitude));
    d.longitude = form.longitude === '' ? null : parseFloat(String(form.longitude));
    d.total_cores = parseInt(String(form.total_cores));
    d.fibers_per_tube = parseInt(String(form.fibers_per_tube)) || 12;
    d.parent_type = form.parent_type || null;
    d.parent_id = form.parent_id === '' ? null : parseInt(String(form.parent_id));
    mut.mutate(d);
  };

  // Splice management — only meaningful once the JC exists (has an id)
  const parentOptions = form.parent_type === 'otb' ? otbList : form.parent_type === 'odc' ? odcList : jcList.filter(j => j.id !== item?.id);
  const parentNode: any = form.parent_type ? parentOptions.find((p: any) => p.id === Number(form.parent_id)) : null;
  const parentFibersPerTube = parentNode?.fibers_per_tube || 12;
  const ownFibersPerTube = form.fibers_per_tube || 12;

  const [spliceForm, setSpliceForm] = useState({ tubeIn: 1, posIn: 1, tubeOut: 1, posOut: 1, label: '' });
  const spliceCoreIn = (spliceForm.tubeIn - 1) * parentFibersPerTube + spliceForm.posIn;
  const spliceCoreOut = (spliceForm.tubeOut - 1) * ownFibersPerTube + spliceForm.posOut;
  const currentSplices = item ? (jcList.find(j => j.id === item.id)?.splices || item.splices || []) : [];
  const spliceMut = useMutation({
    mutationFn: () => api.ftthJcSpliceCreate(item!.id, {
      core_in: spliceCoreIn, core_out: spliceCoreOut, label: spliceForm.label,
    }),
    onSuccess: () => { toast.success('Splice added'); setSpliceForm({ tubeIn: 1, posIn: 1, tubeOut: 1, posOut: 1, label: '' }); qc.invalidateQueries({ queryKey: ['ftth-jc'] }); qc.invalidateQueries({ queryKey: ['ftth-tree'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteSpliceMut = useMutation({
    mutationFn: (spliceId: number) => api.ftthJcSpliceDelete(item!.id, spliceId),
    onSuccess: () => { toast.success('Splice removed'); qc.invalidateQueries({ queryKey: ['ftth-jc'] }); qc.invalidateQueries({ queryKey: ['ftth-tree'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal title={item ? 'Edit JC (Joint Closure)' : 'Add JC (Joint Closure)'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="JC-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Closure Type">
          <select className="input-field" value={form.closure_type} onChange={e => setForm({ ...form, closure_type: e.target.value })}>
            <option value="inline">Inline</option>
            <option value="dome">Dome</option>
            <option value="dead-end">Dead-end</option>
          </select>
        </FormField>
        <FormField label="Total Cores"><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
      </div>
      <FormField label="Fibers per Tube (optional)"><input className="input-field" type="number" min={1} value={form.fibers_per_tube} onChange={e => setForm({ ...form, fibers_per_tube: parseInt(e.target.value) || 12 })} /></FormField>
      <p className="text-[11px] text-tx3 -mt-1">Kalau closure ini terdiri dari beberapa tube (mis. 2 tube × 12 core), isi jumlah core per tube di sini — warna tube/core pada splice di bawah dihitung otomatis dari ini (standar TIA-598).</p>
      <FormField label="Location"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Pole number, manhole, address" /></FormField>
      <FormField label="Coordinates (GPS / Map)">
        <LocationPicker latitude={form.latitude} longitude={form.longitude} onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })} />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Fed From (parent)">
          <select className="input-field" value={form.parent_type} onChange={e => setForm({ ...form, parent_type: e.target.value, parent_id: '' })}>
            <option value="">— None —</option>
            <option value="otb">OTB/ODF</option>
            <option value="odc">ODC</option>
            <option value="jc">Another JC</option>
          </select>
        </FormField>
        <FormField label="Parent">
          <select className="input-field" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })} disabled={!form.parent_type}>
            <option value="">— Select —</option>
            {parentOptions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>

      {item && (
        <div className="pt-3 border-t border-brd">
          <div className="flex items-center gap-1.5 text-sm font-medium mb-2"><Scissors size={14} className="text-purple-400" /> Splices ({currentSplices.length})</div>
          <p className="text-[11px] text-tx3 mb-2">Core masuk (dari {form.parent_type || 'parent'}) disambung ke core keluar — ODC/ODP downstream memilih core keluar ini sebagai sumbernya. Tube dihitung otomatis dari nomor core absolut.</p>
          {currentSplices.length > 0 && (
            <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
              {currentSplices.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-1.5 rounded bg-glass text-xs flex-wrap">
                  <span className="text-tx3 flex-shrink-0">In:</span>
                  <CoreColorTag coreNumber={s.core_in} fibersPerTube={parentFibersPerTube} />
                  <span className="text-tx3 flex-shrink-0">→ Out:</span>
                  <CoreColorTag coreNumber={s.core_out} fibersPerTube={ownFibersPerTube} />
                  {s.label && <span className="text-tx3 truncate flex-1">{s.label}</span>}
                  <button onClick={() => deleteSpliceMut.mutate(s.id)} className="p-1 rounded hover:bg-danger/15 text-tx3 hover:text-danger flex-shrink-0 ml-auto" title="Remove splice"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5 p-2 rounded-lg bg-glass/50">
            <div>
              <span className="text-[10px] text-tx3 font-medium block mb-1">Core In — dari {form.parent_type ? `${form.parent_type.toUpperCase()}${parentNode ? ` (${parentNode.name})` : ''}` : 'parent'}</span>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                <input className="input-field !text-xs" type="number" min={1} placeholder="Tube" title="Nomor tube — isi bebas, mis. untuk drop core / kabel non-tube bisa dibiarkan 1" value={spliceForm.tubeIn} onChange={e => setSpliceForm({ ...spliceForm, tubeIn: parseInt(e.target.value) || 1 })} />
                <input className="input-field !text-xs" type="number" min={1} placeholder="Core in tube" value={spliceForm.posIn} onChange={e => setSpliceForm({ ...spliceForm, posIn: parseInt(e.target.value) || 1 })} />
                <CoreColorTag coreNumber={spliceCoreIn} fibersPerTube={parentFibersPerTube} />
              </div>
            </div>
            <div>
              <span className="text-[10px] text-tx3 font-medium block mb-1">Core Out — ke downstream (JC ini)</span>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                <input className="input-field !text-xs" type="number" min={1} placeholder="Tube" title="Nomor tube — isi bebas, mis. untuk drop core / kabel non-tube bisa dibiarkan 1" value={spliceForm.tubeOut} onChange={e => setSpliceForm({ ...spliceForm, tubeOut: parseInt(e.target.value) || 1 })} />
                <input className="input-field !text-xs" type="number" min={1} placeholder="Core in tube" value={spliceForm.posOut} onChange={e => setSpliceForm({ ...spliceForm, posOut: parseInt(e.target.value) || 1 })} />
                <CoreColorTag coreNumber={spliceCoreOut} fibersPerTube={ownFibersPerTube} />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <input className="input-field !text-xs" placeholder="Label (optional)" value={spliceForm.label} onChange={e => setSpliceForm({ ...spliceForm, label: e.target.value })} />
              <button type="button" onClick={() => spliceMut.mutate()} disabled={spliceMut.isPending}
                className="btn-primary text-xs disabled:opacity-50">+ Add Splice</button>
            </div>
          </div>
        </div>
      )}
      {!item && <p className="text-[11px] text-tx3">Save this JC first, then reopen it to add splices (core in → core out).</p>}
    </Modal>
  );
}

// ─── Generic Modal wrapper ───
function Modal({ title, onClose, onSubmit, loading, children }: { title: string; onClose: () => void; onSubmit: () => void; loading: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" />
      <div className="relative glass-card w-full max-w-lg max-h-[90vh] md:max-h-[85vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between sticky top-0 bg-surface z-10 rounded-t-2xl md:rounded-t-2xl">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
        </div>
        <div className="p-4 md:p-5 overflow-y-auto flex-1 space-y-3">{children}</div>
        <div className="px-4 md:px-5 py-3 border-t border-brd flex justify-end gap-2 sticky bottom-0 bg-surface rounded-b-2xl md:rounded-b-2xl">
          <button onClick={onClose} className="btn-cancel text-sm">Cancel</button>
          <button onClick={onSubmit} disabled={loading} className="btn-primary text-sm flex items-center gap-1.5">{loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>} Save</button>
        </div>
      </div>
    </div>
  );
}
