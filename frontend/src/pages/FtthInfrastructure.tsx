import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Map as MapIcon, ListTree, Search, Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  Server, Box, Network, Split, X, MapPin, Link2, Unlink, Phone, Download, Upload, Cable,
  AlertTriangle, Gauge, RefreshCw,
  UserX, LayoutGrid, List, GitMerge, Scissors, Users, Cpu, Home
} from 'lucide-react';
import { api, type FTTHItem, type FTTHOtb, type FTTHOtbPort, type FTTHOdc, type FTTHOdp, type FTTHOdpPort, type FTTHAvailableOnu, type FTTHPonPort, type FTTHStats, type FTTHFiberPath, type FTTHJc, type FTTHJcSplice, type FTTHOdcTree, type FTTHOdpTree, type FTTHJcTree } from '../lib/api';
import { cn } from '../lib/utils';
import { coreColorInfo } from '../lib/fiberColor';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { LocationPicker } from '../components/LocationPicker';
import { LeafletMap } from '../components/LeafletMap';
import { useHasPerm } from '../hooks/useHasPerm';
import { useDashboardWs } from '../hooks/useDashboardWs';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, EmptyState, Modal as SharedModal, Tabs, Notice, ActionMenu, StatusStrip } from '../components/ui';

type Tab = 'overview' | 'tree' | 'map' | 'otb' | 'jc' | 'odc' | 'odp' | 'pon';
type ModalType = 'otb' | 'jc' | 'odc' | 'odp' | 'port' | 'pon' | null;
type ParentKind = 'otb' | 'odc' | 'jc' | 'odp' | null;

const FTTH_REFRESH_INTERVAL = 10;

export function FtthInfrastructure() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const hasPerm = useHasPerm();
  const canEdit = hasPerm('settings_ip_olts');
  const initialTab = (searchParams.get('tab') as Tab) || 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [listQuery, setListQuery] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const matchQ = (...xs: Array<string | null | undefined>) => {
    const q = listQuery.trim().toLowerCase();
    return !q || xs.some(x => (x || '').toLowerCase().includes(q));
  };
  const [, setCountdown] = useState(FTTH_REFRESH_INTERVAL);
  const countdownRef = useRef(FTTH_REFRESH_INTERVAL);

  useEffect(() => {
    const urlTab = (searchParams.get('tab') as Tab) || 'overview';
    setTab(urlTab);
  }, [searchParams]);
  // Deep link from an outage alert (?tab=odc&odc=3): open the impact list for that node.
  useEffect(() => {
    for (const type of ['odp', 'odc', 'jc', 'otb'] as const) {
      const id = Number(searchParams.get(type));
      if (id > 0) { setImpactTarget({ type, id, name: `${type.toUpperCase()} #${id}` }); break; }
    }
  }, [searchParams]);
  const [modal, setModal] = useState<ModalType>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [parentCtx, setParentCtx] = useState<any>(null);
  const [parentKind, setParentKind] = useState<ParentKind>(null);
  const [impactTarget, setImpactTarget] = useState<{ type: 'otb' | 'jc' | 'odc' | 'odp'; id: number; name: string } | null>(null);
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
    refetchInterval: tab === 'map' ? 45000 : false,
  });

  // WebSocket: realtime refresh on ONU status changes
  // ('onu_change' also covers sync completion — see ws_bridge.py)
  const mapWsMsg = useDashboardWs();
  useEffect(() => {
    if (mapWsMsg && (mapWsMsg.event === 'onu_change' || mapWsMsg.event === 'alert'
        || mapWsMsg.event === 'onu_link_state')) {
      qc.invalidateQueries({ queryKey: ['ftth-map'] });
      qc.invalidateQueries({ queryKey: ['ftth-stats'] });
      qc.invalidateQueries({ queryKey: ['ftth-tree'] });
      qc.invalidateQueries({ queryKey: ['ftth-pon'] });
    }
  }, [mapWsMsg, qc]);

  // Instant refresh after an on-demand "Ping client" from a map popup
  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: ['ftth-map'] });
    window.addEventListener('onu-link-refresh', handler);
    return () => window.removeEventListener('onu-link-refresh', handler);
  }, [qc]);

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
  const { data: activeIncidents } = useQuery({
    queryKey: ['incidents', 'active'], queryFn: () => api.incidents('active'),
    enabled: tab === 'map', refetchInterval: tab === 'map' ? 30000 : false,
  });
  const outages = (activeIncidents?.incidents || [])
    .filter(i => i.lat != null && i.lng != null)
    .map(i => ({ id: i.id, lat: i.lat as number, lng: i.lng as number, cause: i.cause,
      affected: i.affected_count, label: `${i.node_type.toUpperCase()} ${i.node_name}` }));

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
    onSuccess: () => { toast.success(t('pg_ftth.deleted')); invalidate(); },
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
    const ok = await confirm({ title: t('pg_ftth.deleteTitle', { name }), message: t('pg_ftth.deleteMsg', { name }), confirmLabel: t('pg_ftth.delete'), variant: 'danger' });
    if (ok) delMut.mutate({ type, id });
  };

  const tree = treeData?.tree || [];

  const TAB_ADD: Partial<Record<Tab, { label: string; type: ModalType }>> = {
    tree: { label: t('pg_ftth.addOtb'), type: 'otb' },
    pon: { label: t('pg_ftth.addPon'), type: 'pon' },
    otb: { label: t('pg_ftth.addOtb'), type: 'otb' },
    jc: { label: t('pg_ftth.addJc'), type: 'jc' },
    odc: { label: t('pg_ftth.addOdc'), type: 'odc' },
    odp: { label: t('pg_ftth.addOdp'), type: 'odp' },
  };
  const tabAdd = TAB_ADD[tab];

  return (
    <PageContainer className="space-y-3 md:space-y-4">
      <PageHeader
        icon={<Network size={20} />}
        title={t('pg_ftth.ftthInfrastructure')}
        description={t('pg_ftth.manageTheOtbOdf')}
        action={
          <div className="flex items-center gap-2">
            {canEdit && tabAdd && (
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => openAdd(tabAdd.type)}>
                {tabAdd.label}
              </Button>
            )}
            <Button variant="secondary" icon={<RefreshCw size={15} className={statsFetching ? 'animate-spin' : ''} />}
              title={t('pg_ftth.refreshData')} aria-label={t('pg_ftth.refreshData')} onClick={() => invalidate()}>
              <span className="hidden sm:inline">{t('pg_ftth.refresh')}</span>
            </Button>
            <ActionMenu
              iconOnly
              title={t('pg_ftth.dataMenu')}
              actions={[
                { key: 'export', label: t('pg_ftth.exportCsv'), icon: <Download size={16} />, onClick: () => window.open(api.ftthExport(), '_blank') },
                ...(canEdit ? [{ key: 'import', label: t('pg_ftth.importCsv'), icon: <Upload size={16} />, onClick: () => importRef.current?.click() }] : []),
              ]}
            />
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try { const r = await api.ftthImport(file); toast.success(t('pg_ftth.imported', { detail: JSON.stringify(r.imported) })); invalidate(); }
              catch (err: any) { toast.error(err.message); }
              e.target.value = '';
            }} />
          </div>
        }
      />
      <Tabs
        mobileGrid
        tabs={[
          { key: 'overview', label: t('pg_ftth.overview'), icon: <Gauge size={14} /> },
          { key: 'map', label: t('pg_ftth.map'), icon: <MapIcon size={14} /> },
          { key: 'tree', label: t('pg_ftth.tree'), icon: <ListTree size={14} /> },
          { key: 'pon', label: 'PON', icon: <Cable size={14} /> },
          { key: 'otb', label: 'OTB/ODF', icon: <Server size={14} /> },
          { key: 'jc', label: 'JC', icon: <GitMerge size={14} /> },
          { key: 'odc', label: 'ODC', icon: <Box size={14} /> },
          { key: 'odp', label: 'ODP', icon: <Split size={14} /> },
        ]}
        active={tab}
        onChange={(key) => setTab(key as Tab)}
      />
      {['pon', 'otb', 'jc', 'odc', 'odp'].includes(tab) && (
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none" aria-hidden="true" />
          <input className="input-field w-full pl-9" value={listQuery} onChange={e => setListQuery(e.target.value)}
            placeholder={t('pg_ftth.searchList')} aria-label={t('pg_ftth.searchList')} />
        </div>
      )}

      {/* Overview Tab */}
      {tab === 'overview' && <OverviewTab stats={statsData} onTab={(k) => setTab(k)} />}

      {/* Tree View */}
      {tab === 'tree' && (
        <div className="space-y-2">
          {isLoading && <div className="text-center py-8 text-tx3 text-sm">{t('pg_ftth.loading')}</div>}
          {!isLoading && tree.length === 0 && (
            <EmptyState icon={Server} title={t('pg_ftth.noOtbOdfAdded')}
              action={canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd('otb')}>{t('pg_ftth.addFirstOtbOdf')}</Button>} />
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
              onShowImpact={(type, id, name) => setImpactTarget({ type, id, name })}
            />
          ))}
        </div>
      )}

      {/* PON List View */}
      {tab === 'pon' && (
        <div className="space-y-2">
          {(ponList?.items || []).length === 0 && (
            <EmptyState icon={Cable} title={t('pg_ftth.noPonPortsAdded')}
              action={canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd('pon')}>{t('pg_ftth.addFirstPon')}</Button>} />
          )}
          {(ponList?.items || []).filter(p => matchQ(p.pon_name, p.olt_name, p.description)).map(p => {
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
                  <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5">
                    {p.olt_name && <span>OLT: {p.olt_name}</span>}
                    <span>Frame {p.frame} / Slot {p.slot} / Port {p.port}</span>
                    {p.otb_name && <span>→ OTB: {p.otb_name} (Core {p.otb_core_number})</span>}
                    {p.otb_name && <CoreColorTag coreNumber={p.otb_core_number} fibersPerTube={otbList?.items?.find(x => x.id === p.otb_id)?.fibers_per_tube} />}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => openEdit('pon', p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('pon', p.id, p.pon_name || 'PON')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
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
            <EmptyState icon={Server} title={t('pg_ftth.noOtbOdfAdded')}
              action={canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd('otb')}>{t('pg_ftth.addFirstOtbOdf')}</Button>} />
          )}
          {(otbList?.items || []).filter(o => matchQ(o.name, o.olt_name, o.pon_port, o.location)).map(o => {
            const util = o.total_cores > 0 ? Math.round((o.used_cores / o.total_cores) * 100) : 0;
            return (
            <div key={o.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <Server size={18} className="text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{o.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0', o.is_active ? 'bg-success/15 text-success' : 'bg-glass text-tx3')}>{o.is_active ? t('pg_ftth.stActive') : t('pg_ftth.stIdle')}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5">
                    <span className="uppercase">{o.type}</span>
                    {o.olt_name && <span>OLT: {o.olt_name}</span>}
                    {o.pon_port && <span>PON: {o.pon_port}</span>}
                    {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setSelectedOtb(o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.portDiagram')}><Cable size={15} /></button>
                  {canEdit && <button onClick={() => openEdit('otb', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('otb', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-tx3 mb-1"><span>{t('pg_ftth.coresUsed', { used: o.used_cores, total: o.total_cores })}</span><span className={cn('font-bold', util > 80 ? 'text-danger' : util > 60 ? 'text-warning' : 'text-success')}>{util}%</span></div>
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
            <EmptyState icon={GitMerge} title={t('pg_ftth.noJcJointClosure')}
              description={t('pg_ftth.optionalSplicePointsAlong')}
              action={canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd('jc')}>{t('pg_ftth.addFirstJc')}</Button>} />
          )}
          {(jcList?.items || []).filter(j => matchQ(j.name, j.parent_name, j.location)).map(j => (
            <div key={j.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <GitMerge size={18} className="text-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{j.name}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 bg-glass text-tx3 uppercase">{j.closure_type}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5">
                    {j.parent_name && <span>{t('pg_ftth.fromNode', { name: `${j.parent_name} (${j.parent_type?.toUpperCase()})` })}</span>}
                    <span>{t('pg_ftth.spliceCount', { n: j.splice_count })}</span>
                    <span>{t('pg_ftth.coreCount', { n: j.total_cores })}</span>
                    {j.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {j.latitude.toFixed(4)}, {j.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => openEdit('jc', j)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title={t('pg_ftth.editManageSplices')}><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('jc', j.id, j.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
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
            <EmptyState icon={Box} title={t('pg_ftth.noOdcAddedYet')}
              action={canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd('odc')}>{t('pg_ftth.addFirstOdc')}</Button>} />
          )}
          {(odcList?.items || []).filter(o => matchQ(o.name, o.otb_name, o.jc_name, o.location)).map(o => {
            const util = o.total_cores > 0 ? Math.round((o.used_cores / o.total_cores) * 100) : 0;
            return (
            <div key={o.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <Box size={18} className="text-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{o.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0', o.is_active ? 'bg-success/15 text-success' : 'bg-glass text-tx3')}>{o.is_active ? t('pg_ftth.stActive') : t('pg_ftth.stIdle')}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5">
                    {o.feed_source === 'jc' && o.jc_name && <span>{t('pg_ftth.fromNode', { name: `JC ${o.jc_name} (core ${o.jc_core_number})` })}</span>}
                    {o.feed_source !== 'jc' && o.otb_name && <span>{t('pg_ftth.fromNode', { name: `${o.otb_name} (core ${o.otb_core_number})` })}</span>}
                    {o.feed_source !== 'jc' && o.otb_name && <CoreColorTag coreNumber={o.otb_core_number} fibersPerTube={otbList?.items?.find(x => x.id === o.otb_id)?.fibers_per_tube} />}
                    {o.splitter_model && <span>Splitter: {o.splitter_model}</span>}
                    {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => openEdit('odc', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('odc', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-tx3 mb-1"><span>{t('pg_ftth.coresUsed', { used: o.used_cores, total: o.total_cores })}</span><span className={cn('font-bold', util > 80 ? 'text-danger' : util > 60 ? 'text-warning' : 'text-success')}>{util}%</span></div>
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
            <EmptyState icon={Split} title={t('pg_ftth.noOdpAddedYet')}
              action={canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd('odp')}>{t('pg_ftth.addFirstOdp')}</Button>} />
          )}
          {(odpList?.items || []).filter(o => matchQ(o.name, o.odc_name, o.jc_name, o.parent_odp_name, o.location)).map(o => {
            const util = o.total_ports > 0 ? Math.round((o.used_ports / o.total_ports) * 100) : 0;
            return (
            <div key={o.id} className="glass-card p-3 hover:bg-glass/50 transition-colors">
              <div className="flex items-center gap-3">
                <Split size={18} className="text-success flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{o.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0', o.is_active ? 'bg-success/15 text-success' : 'bg-glass text-tx3')}>{o.is_active ? t('pg_ftth.stActive') : t('pg_ftth.stIdle')}</span>
                  </div>
                  <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5">
                    {o.feed_source === 'jc' && o.jc_name && <span>{t('pg_ftth.fromNode', { name: `JC ${o.jc_name} (core ${o.jc_core_number})` })}</span>}
                    {o.feed_source === 'odp' && o.parent_odp_name && <span>{t('pg_ftth.fromNode', { name: `ODP ${o.parent_odp_name} (port ${o.parent_odp_port_number})` })}</span>}
                    {o.feed_source === 'odc' && o.odc_name && <span>{t('pg_ftth.fromNode', { name: `${o.odc_name} (core ${o.odc_core_number})` })}</span>}
                    {o.splitter_model && <span>Splitter: {o.splitter_model}</span>}
                    {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && <button onClick={() => setSelectedOdp(o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.managePorts')}><Network size={15} /></button>}
                  {canEdit && <button onClick={() => openEdit('odp', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                  {canEdit && <button onClick={() => handleDelete('odp', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-tx3 mb-1"><span>{t('pg_ftth.portsUsedOf', { used: o.used_ports, total: o.total_ports })}</span><span className={cn('font-bold', util > 80 ? 'text-danger' : util > 60 ? 'text-warning' : 'text-success')}>{util}%</span></div>
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
                <Cable size={14} /> {drawMode ? t('pg_ftth.exitDraw') : t('pg_ftth.drawPath')}
              </button>
            )}
            {canEdit && (
              <button onClick={() => { setAutoRouteMode(!autoRouteMode); setDrawMode(false); setAutoRouteStart(null); }} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors', autoRouteMode ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:text-tx1')}>
                <MapIcon size={14} /> {autoRouteMode ? t('pg_ftth.exitAutoRoute') : t('pg_ftth.autoRoute')}
              </button>
            )}
            {drawMode && <span className="text-xs text-tx3">{t('pg_ftth.clickTheMapTo')}</span>}
            {(activeIncidents?.active_count ?? 0) > 0 && (
              <Link to="/dashboard/incidents" className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-semibold">
                {t('pg_ftth.activeOutages', { n: activeIncidents?.active_count })}
              </Link>
            )}
            {autoRouteMode && <span className="text-xs text-tx3">{autoRouteStart ? `Start selected: ${autoRouteStart.name}. Click end marker...` : 'Click a marker to set start point'}</span>}
          </div>
          <MapView markers={mapData?.markers || []} lines={mapData?.lines || []} fiberPaths={fiberPaths?.paths || []} outages={outages} drawMode={drawMode} onDrawComplete={async (coords) => {
            try {
              await api.ftthPathCreate({ from_type: 'otb', from_id: 0, to_type: 'odp', to_id: 0, coordinates: coords, path_type: 'manual' });
              toast.success(t('pg_ftth.fiberPathSaved'));
              setDrawMode(false);
              qc.invalidateQueries({ queryKey: ['ftth-paths'] });
            } catch (e: any) { toast.error(e.message); }
          }} onMarkerClick={autoRouteMode ? async (marker) => {
            if (!autoRouteStart) {
              setAutoRouteStart(marker);
            } else {
              if (autoRouteStart.id === marker.id && autoRouteStart.type === marker.type) {
                toast.error(t('pg_ftth.startAndEndMust'));
                return;
              }
              try {
                await api.ftthAutoRoute({
                  from_lat: autoRouteStart.lat, from_lng: autoRouteStart.lng,
                  to_lat: marker.lat, to_lng: marker.lng,
                  from_type: autoRouteStart.type, from_id: autoRouteStart.id,
                  to_type: marker.type, to_id: marker.id,
                });
                toast.success(t('pg_ftth.autoRouteCreated'));
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
          jcList={jcList?.items || []}
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
      {modal === 'otb' && <OtbModal item={editItem} jcList={jcList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'jc' && <JcModal item={editItem} parent={parentCtx} parentKind={parentKind} otbList={otbList?.items || []} odcList={odcList?.items || []} jcList={jcList?.items || []} ponList={ponList?.items || []} odpList={odpList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'odc' && <OdcModal item={editItem} parent={parentCtx} parentKind={parentKind} otbList={otbList?.items || []} jcList={jcList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'odp' && <OdpModal item={editItem} parent={parentCtx} parentKind={parentKind} odcList={odcList?.items || []} jcList={jcList?.items || []} odpList={odpList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'pon' && <PonModal item={editItem} otbList={otbList?.items || []} olts={statsData?.per_olt || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {impactTarget && <ImpactModal target={impactTarget} onClose={() => setImpactTarget(null)} />}
    </PageContainer>
  );
}

// ─── Overview Tab ───
function OverviewTab({ stats, onTab }: { stats: FTTHStats | undefined; onTab: (tab: Tab) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onDrillDown = () => onTab('tree');
  if (!stats) return <div className="text-center py-8 text-tx3 text-sm">{t('pg_ftth.loadingStats')}</div>;
  const s = stats.onu_stats;
  const infra = stats.infrastructure;
  const orphans = stats.orphans;

  const portUtil = infra.total_odp_ports > 0 ? Math.round((infra.used_odp_ports / infra.total_odp_ports) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Status ONU: satu baris chip (sama seperti Dashboard), klik = buka Semua ONU terfilter */}
      <StatusStrip
        aria-label={t('pg_ftth.onuStatus')}
        onSelect={(k) => navigate(k === 'total' ? '/dashboard/onus' : k === 'unregister' ? '/dashboard/onus/unconfigured' : `/dashboard/onus?filter=${k}`)}
        items={[
          { key: 'total', label: t('pg_ftth.totalOnu'), count: s.total, tone: 'idle' },
          { key: 'online', label: 'Online', count: s.online, tone: 'ok' },
          { key: 'offline', label: 'Offline', count: s.offline, tone: 'idle' },
          { key: 'los', label: 'LOS', count: s.los, tone: 'crit' },
          { key: 'dyinggasp', label: 'Dying Gasp', count: s.dyinggasp, tone: 'warn' },
          { key: 'unregister', label: t('pg_ftth.unregistered'), count: s.unregister, tone: 'info' },
        ]}
      />

      {/* Kelengkapan data (redesign Fase 3): satu pemberitahuan, bukan 3 banner
          bertumpuk. Bisa ditutup; muncul lagi bila jumlahnya berubah. */}
      {(orphans.total > 0 || orphans.onus_without_technician > 0 || orphans.onus_without_coordinates > 0) && (
        <Notice
          tone="warn"
          title={t('pg_ftth.infrastructureDataIncomplete')}
          dismissKey={`ftth-completeness:${orphans.total}:${orphans.onus_without_technician}:${orphans.onus_without_coordinates}`}
        >
          <ul className="mt-1 space-y-1 text-xs">
            {orphans.total > 0 && (
              <li className="flex items-start gap-1.5">
                <AlertTriangle size={13} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  <strong className="text-tx1">{t('pg_ftth.orphanNodes', { n: orphans.total })}</strong>
                  {' — '}
                  {[
                    orphans.onus_without_odp > 0 && t('pg_ftth.onuNoOdp', { n: orphans.onus_without_odp }),
                    orphans.odps_without_odc > 0 && t('pg_ftth.odpNoOdc', { n: orphans.odps_without_odc }),
                    orphans.odcs_without_otb > 0 && t('pg_ftth.odcNoOtb', { n: orphans.odcs_without_otb }),
                    orphans.otbs_without_olt > 0 && t('pg_ftth.otbNoOlt', { n: orphans.otbs_without_olt }),
                  ].filter(Boolean).join(' · ')}
                </span>
              </li>
            )}
            {orphans.onus_without_technician > 0 && (
              <li className="flex items-start gap-1.5">
                <UserX size={13} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong className="text-tx1">{t('pg_ftth.onuNoTech', { n: orphans.onus_without_technician })}</strong> {t('pg_ftth.setItOnThe')}</span>
              </li>
            )}
            {orphans.onus_without_coordinates > 0 && (
              <li className="flex items-start gap-1.5">
                <MapPin size={13} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong className="text-tx1">{t('pg_ftth.onuNoGps', { n: orphans.onus_without_coordinates })}</strong> {t('pg_ftth.setItOnThe')}</span>
              </li>
            )}
          </ul>
        </Notice>
      )}

      {/* Infrastructure Summary — klik untuk membuka tab-nya */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {([
          { key: 'otb', value: infra.total_otb, label: 'OTB/ODF', icon: <Server size={20} className="text-accent" /> },
          { key: 'odc', value: infra.total_odc, label: 'ODC', icon: <Box size={20} className="text-warning" /> },
          { key: 'odp', value: infra.total_odp, label: 'ODP', icon: <Split size={20} className="text-success" /> },
        ] as const).map(c => (
          <button key={c.key} type="button" onClick={() => onTab(c.key)}
            className="glass-card p-3 md:p-4 flex items-center gap-3 text-left hover:border-accent/40 transition-colors">
            <span className="flex-shrink-0">{c.icon}</span>
            <span><span className="block text-lg font-bold text-tx1">{c.value}</span><span className="block text-xs text-tx3">{c.label}</span></span>
          </button>
        ))}
        <button type="button" onClick={() => onTab('odp')}
          className="glass-card p-3 md:p-4 flex items-center gap-3 text-left hover:border-accent/40 transition-colors">
          <Network size={20} className="text-accent flex-shrink-0" />
          <span><span className="block text-lg font-bold text-tx1">{infra.used_odp_ports}<span className="text-tx3 text-sm font-normal">/{infra.total_odp_ports}</span></span>
            <span className="block text-xs text-tx3">{t('pg_ftth.odpPortsUsed')}</span></span>
        </button>
      </div>

      {/* ODP Port Utilization Bar */}
      {infra.total_odp_ports > 0 && (
        <div className="glass-card p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-tx2">{t('pg_ftth.odpPortUtilization')}</span>
            <span className={cn('text-xs font-bold', portUtil > 80 ? 'text-danger' : portUtil > 60 ? 'text-warning' : 'text-success')}>{portUtil}%</span>
          </div>
          <div className="h-2 rounded-full bg-glass overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', portUtil > 80 ? 'bg-danger' : portUtil > 60 ? 'bg-warning' : 'bg-success')} style={{ width: `${portUtil}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-tx3">
            <span>{t('pg_ftth.portsUsed', { n: infra.used_odp_ports })}</span>
            <span>{t('pg_ftth.portsFree', { n: infra.available_odp_ports })}</span>
          </div>
        </div>
      )}

      {/* Per-OLT Breakdown */}
      {stats.per_olt.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Server size={16} /> {t('pg_ftth.perOltBreakdown')}</h3>
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
                    <span className="text-tx3">{t('pg_ftth.lblTotal')} <strong className="text-tx1">{olt.total}</strong></span>
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
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Cable size={16} /> {t('pg_ftth.perPonPort')}</h3>
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
  onAddOdp: (parent: any, kind: 'odc' | 'jc' | 'odp') => void;
  onEditOdp: (odp: FTTHOdpTree) => void;
  onDeleteOdp: (odp: FTTHOdpTree) => void;
  onAddJc: (parent: any, kind: 'otb' | 'odc' | 'jc') => void;
  onEditJc: (jc: FTTHJcTree) => void;
  onDeleteJc: (jc: FTTHJcTree) => void;
  onShowImpact: (type: 'otb' | 'jc' | 'odc' | 'odp', id: number, name: string) => void;
}

// ─── OTB Tree Node ───
function OtbNode({ otb, expanded, toggleExpand, canEdit, onAddOdc, onEditOtb, onDeleteOtb, onAddOdp, onEditOdc, onDeleteOdc, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc, onShowImpact }: {
  otb: FTTHItem;
  onEditOtb: () => void; onDeleteOtb: () => void;
} & TreeCallbacks) {
  const { t } = useTranslation();
  const key = `otb-${otb.id}`;
  const isOpen = expanded[key] ?? false;
  const cb: TreeCallbacks = { expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc, onShowImpact };
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 hover:bg-glass/50 transition-colors">
        <button onClick={() => toggleExpand(key)} className="p-1 rounded hover:bg-glass">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <Server size={18} className="text-accent" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{otb.name}</div>
          <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span className="uppercase">{otb.type}</span>
            {otb.feed_source === 'jc' ? (
              <span className="flex items-center gap-1 text-purple-400"><GitMerge size={10} /> {t('pg_ftth.fedByJc')} {otb.jc_name || '—'}{otb.jc_core_number ? ` (Core ${otb.jc_core_number})` : ''}</span>
            ) : (
              <>
                {otb.olt_name && <span>OLT: {otb.olt_name}</span>}
                {otb.pon_port && <span>PON: {otb.pon_port}</span>}
              </>
            )}
            <span>{t('pg_ftth.coreCount', { n: otb.total_cores })}</span>
            <span>{otb.odc_count} ODC</span>
            {otb.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {otb.latitude.toFixed(4)}, {otb.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onShowImpact('otb', otb.id, otb.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.seeImpactDownstreamCustomers')}><Users size={15} /></button>
          {canEdit && <button onClick={() => onAddJc(otb, 'otb')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-purple-400" title={t('pg_ftth.addJcJointClosure')}><GitMerge size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdc(otb, 'otb')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.addOdc')}><Plus size={15} /></button>}
          {canEdit && <button onClick={onEditOtb} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
          {canEdit && <button onClick={onDeleteOtb} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
        </div>
      </div>
      {isOpen && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {otb.odcs.length === 0 && otb.jcs.length === 0 && <div className="p-3 text-xs text-tx3">{t('pg_ftth.noOdcsOrJcs')}</div>}
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
function OdcRow({ odc, fibersPerTube, sourceLabel, expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc, onShowImpact }: {
  odc: FTTHOdcTree; fibersPerTube?: number; sourceLabel: string;
} & TreeCallbacks) {
  const { t } = useTranslation();
  const odcKey = `odc-${odc.id}`;
  const odcOpen = expanded[odcKey] ?? false;
  const cb: TreeCallbacks = { expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc, onShowImpact };
  return (
    <div>
      <div className="flex items-center gap-2 p-2.5 hover:bg-glass/50 transition-colors border-t border-brd/30">
        <button onClick={() => toggleExpand(odcKey)} className="p-1 rounded hover:bg-glass">
          {odcOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Box size={16} className="text-warning" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{odc.name}</div>
          <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span>{sourceLabel}</span>
            {odc.feed_source !== 'jc' && <CoreColorTag coreNumber={odc.otb_core_number} fibersPerTube={fibersPerTube} />}
            {odc.splitter_model && <span>Splitter: {odc.splitter_model}</span>}
            <span>{odc.odp_count} ODPs</span>
            {odc.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {odc.latitude.toFixed(4)}, {odc.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onShowImpact('odc', odc.id, odc.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.seeImpactDownstreamCustomers')}><Users size={15} /></button>
          {canEdit && <button onClick={() => onAddJc(odc, 'odc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-purple-400" title={t('pg_ftth.addJcJointClosure')}><GitMerge size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdp(odc, 'odc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.addOdp')}><Plus size={15} /></button>}
          {canEdit && <button onClick={() => onEditOdc(odc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
          {canEdit && <button onClick={() => onDeleteOdc(odc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
        </div>
      </div>
      {odcOpen && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {odc.odps.length === 0 && odc.jcs.length === 0 && <div className="p-2.5 text-xs text-tx3">{t('pg_ftth.noOdpsOrJcs')}</div>}
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

// ─── ODP Tree Row (recursive: can cascade to child ODPs via a port) ───
function OdpRow({ odp, sourceLabel, expanded, toggleExpand, canEdit, onAddOdp, onEditOdp, onDeleteOdp, onShowImpact }: {
  odp: FTTHOdpTree; sourceLabel: string;
} & Pick<TreeCallbacks, 'expanded' | 'toggleExpand' | 'canEdit' | 'onAddOdp' | 'onEditOdp' | 'onDeleteOdp' | 'onShowImpact'>) {
  const { t } = useTranslation();
  const hasChildren = odp.odps.length > 0;
  const odpKey = `odp-${odp.id}`;
  const odpOpen = expanded[odpKey] ?? false;
  return (
    <div>
      <div className="flex items-center gap-2 p-2.5 hover:bg-glass/50 transition-colors border-t border-brd/30">
        {hasChildren ? (
          <button onClick={() => toggleExpand(odpKey)} className="p-1 rounded hover:bg-glass">
            {odpOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span className="w-6" />}
        <Split size={16} className="text-success" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{odp.name}</div>
          <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span>{sourceLabel}</span>
            {odp.splitter_model && <span>Splitter: {odp.splitter_model}</span>}
            <span>{odp.used_ports}/{odp.total_ports} ports used</span>
            {hasChildren && <span>{odp.odps.length} ODP cascade</span>}
            {odp.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {odp.latitude.toFixed(4)}, {odp.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onShowImpact('odp', odp.id, odp.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.seeCustomersOnThis')}><Users size={15} /></button>
          {canEdit && <button onClick={() => onAddOdp(odp, 'odp')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-success" title={t('pg_ftth.addACascadedOdp')}><Split size={15} /></button>}
          {canEdit && <button onClick={() => onEditOdp(odp)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.managePorts')}><Network size={15} /></button>}
          {canEdit && <button onClick={() => onDeleteOdp(odp)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
        </div>
      </div>
      {odpOpen && hasChildren && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {odp.odps.map(child => (
            <OdpRow key={`odp-${child.id}`} odp={child} sourceLabel={`Port ${child.parent_odp_port_number} from ${child.parent_odp_name}`}
              expanded={expanded} toggleExpand={toggleExpand} canEdit={canEdit} onAddOdp={onAddOdp} onEditOdp={onEditOdp} onDeleteOdp={onDeleteOdp} onShowImpact={onShowImpact} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── JC (Joint Closure) Tree Row — recursive: can feed ODCs, ODPs, or chain to another JC ───
function JcRow({ jc, expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc, onShowImpact }: {
  jc: FTTHJcTree;
} & TreeCallbacks) {
  const { t } = useTranslation();
  const jcKey = `jc-${jc.id}`;
  const jcOpen = expanded[jcKey] ?? false;
  const cb: TreeCallbacks = { expanded, toggleExpand, canEdit, onAddOdc, onEditOdc, onDeleteOdc, onAddOdp, onEditOdp, onDeleteOdp, onAddJc, onEditJc, onDeleteJc, onShowImpact };
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
          <div className="text-xs text-tx3 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span>{jc.splice_count} splice{jc.splice_count === 1 ? '' : 's'}</span>
            {jc.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {jc.latitude.toFixed(4)}, {jc.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onShowImpact('jc', jc.id, jc.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.seeImpactDownstreamCustomers')}><Users size={15} /></button>
          {canEdit && <button onClick={() => onAddJc(jc, 'jc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-purple-400" title={t('pg_ftth.chainAnotherJc')}><GitMerge size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdc(jc, 'jc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.addOdcFedFrom')}><Box size={15} /></button>}
          {canEdit && <button onClick={() => onAddOdp(jc, 'jc')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-success" title={t('pg_ftth.addOdpFedFrom')}><Split size={15} /></button>}
          {canEdit && <button onClick={() => onEditJc(jc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title={t('pg_ftth.editManageSplices')}><Edit2 size={15} /></button>}
          {canEdit && <button onClick={() => onDeleteJc(jc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title={t('pg_ftth.delete')}><Trash2 size={15} /></button>}
        </div>
      </div>
      {jcOpen && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {childCount === 0 && <div className="p-2.5 text-xs text-tx3">{t('pg_ftth.nothingFedFromThis')}</div>}
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
function MapView({ markers, lines, fiberPaths, outages, drawMode, onDrawComplete, onMarkerClick }: {
  markers: any[]; lines: any[]; fiberPaths: FTTHFiberPath[]; drawMode: boolean;
  outages?: Array<{ id: number; lat: number; lng: number; label: string; cause: string; affected: number }>;
  onDrawComplete: (coords: [number, number][]) => void;
  onMarkerClick?: (marker: any) => void;
}) {
  const { t } = useTranslation();
  if (markers.length === 0) {
    return <EmptyState icon={MapIcon} title={t('pg_ftth.noCoordinatesSet')} description={t('pg_ftth.addLatitudeLongitudeTo')} />;
  }
  return (
    <LeafletMap
      markers={markers}
      lines={lines}
      fiberPaths={fiberPaths}
      outages={outages}
      height="500px"
      refreshKey={JSON.stringify({ m: markers.length, l: lines.length })}
      drawMode={drawMode}
      onDrawComplete={onDrawComplete}
      onMarkerClick={onMarkerClick}
    />
  );
}

// ─── ODP Port Panel ───
function OdpPortPanel({ odp, ports, availableOnus, jcList, onClose, onUpdated }: {
  odp: FTTHOdp; ports: FTTHOdpPort[]; availableOnus: FTTHAvailableOnu[]; jcList: FTTHJc[]; onClose: () => void; onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editingPort, setEditingPort] = useState<FTTHOdpPort | null>(null);
  const [portFeed, setPortFeed] = useState({
    feed_source: 'direct' as 'direct' | 'jc', jc_id: '' as string | number, jc_core_number: '' as string | number,
    cable_length_meters: '' as string | number, cable_attenuation_per_km: 0.35 as string | number,
  });
  const [portCoords, setPortCoords] = useState({ latitude: '', longitude: '' });
  const [showLink, setShowLink] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('diagram');

  const openEditPort = (p: FTTHOdpPort) => {
    setEditingPort(p);
    setPortFeed({
      feed_source: p.feed_source || 'direct', jc_id: p.jc_id || '', jc_core_number: p.jc_core_number || '',
      cable_length_meters: p.cable_length_meters ?? '', cable_attenuation_per_km: p.cable_attenuation_per_km ?? 0.35,
    });
    setPortCoords({
      latitude: p.onu_latitude != null ? String(p.onu_latitude) : '',
      longitude: p.onu_longitude != null ? String(p.onu_longitude) : '',
    });
  };
  const selectedPortJc = jcList.find(j => j.id === Number(portFeed.jc_id));

  const saveMut = useMutation({
    mutationFn: (data: Partial<FTTHOdpPort> & { id: number; latitude?: number | null; longitude?: number | null }) => api.ftthOdpPortUpdate(data.id, data),
    onSuccess: () => { toast.success(t('pg_ftth.portUpdated')); qc.invalidateQueries({ queryKey: ['ftth-odp-ports', odp.id] }); qc.invalidateQueries({ queryKey: ['ftth-tree'] }); setEditingPort(null); setShowLink(null); onUpdated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = (port: FTTHOdpPort) => {
    saveMut.mutate({ id: port.id, onu_id: null, customer_name: '', customer_phone: '' });
  };

  const seedCoordsMut = useMutation({
    mutationFn: () => api.ftthOdpSeedOnuCoords(odp.id),
    onSuccess: (d) => {
      if (d.updated > 0) toast.success(d.message);
      else toast.success(t('pg_ftth.everyCustomerAlreadyHas'));
      qc.invalidateQueries({ queryKey: ['ftth-odp-ports', odp.id] });
      qc.invalidateQueries({ queryKey: ['ftth-map'] });
      onUpdated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
            {odp.latitude && odp.longitude && (
              <button
                onClick={() => seedCoordsMut.mutate()}
                disabled={seedCoordsMut.isPending}
                title={t('pg_ftth.fillCustomerLocationsFrom')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                <MapPin size={12} /> {seedCoordsMut.isPending ? 'Mengisi…' : 'Lokasi dari ODP'}
              </button>
            )}
            <div className="hidden md:flex items-center rounded-lg bg-glass/60 p-0.5 mr-1">
              <button onClick={() => setViewMode('diagram')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'diagram' ? 'bg-surface text-accent shadow-sm' : 'text-tx3 hover:text-tx1')} title={t('pg_ftth.diagramView')}><LayoutGrid size={14} /></button>
              <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-surface text-accent shadow-sm' : 'text-tx3 hover:text-tx1')} title={t('pg_ftth.listView')}><List size={14} /></button>
            </div>
            <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
          </div>
        </div>
        <div className="p-3 md:p-4 overflow-y-auto flex-1">
          {/* Diagram view (desktop) — NetBox-style splitter port grid */}
          {viewMode === 'diagram' && (
            <div className="hidden md:block">
              <div className="flex items-center gap-4 mb-4 text-[11px] text-tx3">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-brd bg-glass inline-block" /> {t('pg_ftth.available')}</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-success bg-success/15 inline-block" /> {t('pg_ftth.used')}</span>
                <span className="ml-auto italic">{t('pg_ftth.clickAPortTo')}</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {ports.map(p => (
                  <div
                    key={p.id}
                    title={(p.customer_name ? `Port ${p.port_number} — ${p.customer_name}` : `Port ${p.port_number}`) + (p.feed_source === 'jc' ? ` (via JC ${p.jc_name})` : '')}
                    className={cn(
                      'relative aspect-square rounded-lg border-2 transition-all hover:scale-[1.06] hover:shadow-md',
                      p.status === 'used' ? 'border-success bg-success/10' : 'border-brd bg-glass/40',
                    )}
                  >
                    {p.feed_source === 'jc' && <GitMerge size={10} className="absolute top-0.5 left-0.5 text-purple-400" />}
                    <button onClick={() => openEditPort(p)} className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-1">
                      <span className="text-[10px] font-mono text-tx3 leading-none">#{p.port_number}</span>
                      <span className={cn('text-[11px] font-semibold leading-tight text-center line-clamp-2 px-0.5', p.customer_name ? 'text-tx1' : 'text-tx3 italic font-normal')}>
                        {p.customer_name || t('pg_ftth.available')}
                      </span>
                      {p.onu_id && <span className="text-[9px] text-success leading-none truncate w-full text-center px-0.5">{p.onu_name}</span>}
                    </button>
                    <button
                      onClick={() => p.onu_id ? unlink(p) : setShowLink(p.id)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded hover:bg-glass text-tx3 hover:text-accent"
                      title={p.onu_id ? t('pg_ftth.unlinkOnu') : t('pg_ftth.linkOnu')}
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
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">{t('pg_ftth.customer')}</th>
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">ONU</th>
              <th className="px-2 py-2 text-right text-xs text-tx3 uppercase">{t('pg_ftth.actions')}</th>
            </tr></thead>
            <tbody>
              {ports.map(p => (
                <tr key={p.id} className="border-b border-brd/50 hover:bg-glass/30">
                  <td className="px-2 py-2.5 font-medium">
                    Port {p.port_number}
                    {p.feed_source === 'jc' && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-purple-400" title={`via JC ${p.jc_name}`}><GitMerge size={10} /> JC</span>}
                  </td>
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
                        <button onClick={() => unlink(p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-warning" title={t('pg_ftth.unlinkOnu')}><Unlink size={14} /></button>
                      ) : (
                        <button onClick={() => setShowLink(p.id)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title={t('pg_ftth.linkOnu')}><Link2 size={14} /></button>
                      )}
                      <button onClick={() => openEditPort(p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={14} /></button>
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
                  <span className="font-medium text-sm flex items-center gap-1.5">
                    Port {p.port_number}
                    {p.feed_source === 'jc' && <span className="inline-flex items-center gap-0.5 text-[10px] text-purple-400"><GitMerge size={10} /> JC</span>}
                  </span>
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', p.status === 'used' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{p.status}</span>
                </div>
                {p.customer_name && (
                  <div className="text-xs">
                    <span className="text-tx3">{t('pg_ftth.customer2')}</span> <span className="font-medium">{p.customer_name}</span>
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
                    <button onClick={() => unlink(p)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-warning transition-colors"><Unlink size={12} /> {t('pg_ftth.unlink')}</button>
                  ) : (
                    <button onClick={() => setShowLink(p.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-accent transition-colors"><Link2 size={12} /> {t('pg_ftth.link')}</button>
                  )}
                  <button onClick={() => openEditPort(p)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors ml-auto"><Edit2 size={12} /> Edit</button>
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
                <FormField label={t('pg_ftth.customerName')}><input className="input-field" defaultValue={editingPort.customer_name} onChange={e => editingPort.customer_name = e.target.value} /></FormField>
                <FormField label={t('pg_ftth.customerPhone')}><input className="input-field" defaultValue={editingPort.customer_phone} onChange={e => editingPort.customer_phone = e.target.value} /></FormField>
                <FormField label={t('pg_ftth.description')}><input className="input-field" defaultValue={editingPort.description} onChange={e => editingPort.description = e.target.value} /></FormField>
                <FormField label={t('pg_ftth.dropCable')}>
                  <FeedSourceToggle value={portFeed.feed_source} directValue="direct" onChange={v => setPortFeed({ ...portFeed, feed_source: v as 'direct' | 'jc' })} directLabel="Langsung" directIcon={<Home size={14} className={portFeed.feed_source !== 'jc' ? 'text-accent' : 'text-tx3'} />} />
                </FormField>
                {portFeed.feed_source === 'jc' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="JC (Joint Closure)"><select className="input-field" value={portFeed.jc_id} onChange={e => setPortFeed({ ...portFeed, jc_id: e.target.value, jc_core_number: '' })}><option value="">{t('pg_ftth.selectJc')}</option>{jcList.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></FormField>
                    <FormField label={t('pg_ftth.coreFromJc')}>
                      <select className="input-field" value={portFeed.jc_core_number} onChange={e => setPortFeed({ ...portFeed, jc_core_number: e.target.value })}>
                        <option value="">{t('pg_ftth.selectSplice')}</option>
                        {(selectedPortJc?.splices || []).map(s => <option key={s.id} value={s.core_out}>Core {s.core_out} (in: {s.core_in}{s.label ? ` — ${s.label}` : ''})</option>)}
                      </select>
                    </FormField>
                    {selectedPortJc && selectedPortJc.splices.length === 0 && <p className="text-xs text-warning -mt-1 col-span-full">{t('pg_ftth.thisJcHasNo')}</p>}
                    {selectedPortJc && portFeed.jc_core_number !== '' && <p className="text-xs col-span-full"><CoreColorTag coreNumber={Number(portFeed.jc_core_number)} fibersPerTube={selectedPortJc.fibers_per_tube} /></p>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t('pg_ftth.dropCableLengthM')}><input className="input-field" type="number" step="1" value={portFeed.cable_length_meters} onChange={e => setPortFeed({ ...portFeed, cable_length_meters: e.target.value })} placeholder={t('pg_ftth.eG50')} /></FormField>
                  <FormField label={t('pg_ftth.attenuationDbKm')}><input className="input-field" type="number" step="0.01" value={portFeed.cable_attenuation_per_km} onChange={e => setPortFeed({ ...portFeed, cable_attenuation_per_km: e.target.value })} /></FormField>
                </div>
                {editingPort.onu_id && (
                  <div className="pt-3 border-t border-brd">
                    <div className="flex items-center gap-1.5 text-sm font-medium mb-2"><MapPin size={14} className="text-accent" /> {t('pg_ftth.customerOnuCoordinatesShown')}</div>
                    <LocationPicker
                      latitude={portCoords.latitude}
                      longitude={portCoords.longitude}
                      onChange={(lat, lng) => setPortCoords({ latitude: lat, longitude: lng })}
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setEditingPort(null)} className="btn-cancel text-sm">{t('pg_ftth.cancel')}</button>
                  <button onClick={() => saveMut.mutate({
                    id: editingPort.id, customer_name: editingPort.customer_name, customer_phone: editingPort.customer_phone, description: editingPort.description,
                    feed_source: portFeed.feed_source,
                    jc_id: portFeed.jc_id === '' ? null : Number(portFeed.jc_id),
                    jc_core_number: portFeed.jc_core_number === '' ? null : Number(portFeed.jc_core_number),
                    cable_length_meters: portFeed.cable_length_meters === '' ? null : Number(portFeed.cable_length_meters),
                    cable_attenuation_per_km: Number(portFeed.cable_attenuation_per_km) || 0.35,
                    ...(editingPort.onu_id ? {
                      latitude: portCoords.latitude === '' ? null : Number(portCoords.latitude),
                      longitude: portCoords.longitude === '' ? null : Number(portCoords.longitude),
                    } : {}),
                  })} className="btn-primary text-sm">{t('pg_ftth.save')}</button>
                </div>
              </div>
            </div>
          )}

          {/* Link ONU modal */}
          {showLink !== null && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="modal-overlay" onClick={() => setShowLink(null)} />
              <div className="relative glass-card w-full max-w-md p-4 md:p-5 space-y-3 rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold">{t('pg_ftth.linkOnuToPort')}</h3>
                {availableOnus.length === 0 ? (
                  <p className="text-tx3 text-sm">{t('pg_ftth.noAvailableOnusAll')}</p>
                ) : (
                  <select className="input-field" id="onu-select" defaultValue="">
                    <option value="" disabled>{t('pg_ftth.selectAnOnu')}</option>
                    {availableOnus.map(o => <option key={o.id} value={o.id}>{o.name} — {o.serial} ({o.onu_id_str})</option>)}
                  </select>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowLink(null)} className="btn-cancel text-sm">{t('pg_ftth.cancel')}</button>
                  <button onClick={() => { const sel = document.getElementById('onu-select') as HTMLSelectElement; const val = sel?.value; if (val) saveMut.mutate({ id: showLink, onu_id: parseInt(val) }); }} className="btn-primary text-sm" disabled={availableOnus.length === 0}>{t('pg_ftth.link')}</button>
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editingPort, setEditingPort] = useState<FTTHOtbPort | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  const saveMut = useMutation({
    mutationFn: (data: Partial<FTTHOtbPort> & { id: number }) => api.ftthOtbPortUpdate(data.id, data),
    onSuccess: () => {
      toast.success(t('pg_ftth.portUpdated'));
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
            <p className="text-tx3 text-sm text-center py-8">{t('pg_ftth.noCoresConfigured')}</p>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4 text-[11px] text-tx3 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-brd bg-glass inline-block" /> {t('pg_ftth.available')}</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-success bg-success/15 inline-block" /> {t('pg_ftth.connected')}</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-tx3 inline-block" /> Warna tube/core (TIA-598, {otb.fibers_per_tube}/tube)</span>
                {canEdit && <span className="ml-auto italic">{t('pg_ftth.clickACoreTo')}</span>}
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
                <p className="text-xs text-tx3">{t('pg_ftth.connectedToOdc')} <span className="font-medium text-tx1">{editingPort.odc_name}</span></p>
              )}
              <FormField label="Label"><input className="input-field" placeholder={t('pg_ftth.eGShophouseBlock')} value={labelDraft} onChange={e => setLabelDraft(e.target.value)} autoFocus /></FormField>
              <FormField label={t('pg_ftth.description')}><input className="input-field" value={descDraft} onChange={e => setDescDraft(e.target.value)} /></FormField>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingPort(null)} className="btn-cancel text-sm">{t('pg_ftth.cancel')}</button>
                <button onClick={() => saveMut.mutate({ id: editingPort.id, label: labelDraft, description: descDraft })} className="btn-primary text-sm" disabled={saveMut.isPending}>{t('pg_ftth.save')}</button>
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
function CoreColorTag({ coreNumber, fibersPerTube, tubeLabel }: { coreNumber: number; fibersPerTube?: number; tubeLabel?: string }) {
  const c = coreColorInfo(coreNumber, fibersPerTube || 12);
  const tubeName = tubeLabel?.trim() || c.tubeColor;
  return (
    <span className="inline-flex items-center gap-1" title={`Tube ${c.tubeNumber} (${tubeName}${tubeLabel?.trim() ? ` — auto: ${c.tubeColor}` : ''}) • Core ${c.positionInTube} (${c.coreColor})`}>
      <span className="w-2 h-2 rounded-full border border-brd/50 flex-shrink-0" style={{ backgroundColor: c.tubeColorHex }} />
      <span className="w-2 h-2 rounded-full border border-brd/50 flex-shrink-0" style={{ backgroundColor: c.coreColorHex }} />
      <span className="text-tx3">Tube {c.tubeNumber} {tubeName} • {c.coreColor}</span>
    </span>
  );
}

// ─── Core status panel (Status Core) — shown in Edit OTB/ODC/JC once the
// node exists. Purely a status/history view: the actual core assignment
// still comes from feed_source/*_core_number on children, this just shows
// what the backend has lazily tracked from those. ───
const CORE_STATUS_STYLE: Record<string, string> = {
  available: 'bg-glass text-tx3 border-brd',
  used: 'bg-accent/15 text-accent border-accent/30',
  reserved: 'bg-warning/15 text-warning border-warning/30',
  damaged: 'bg-danger/15 text-danger border-danger/30',
};

function CoreStatusPanel({ ownerType, ownerId, totalCores }: { ownerType: 'otb' | 'odc' | 'jc'; ownerId: number; totalCores: number }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['ftth-cores', ownerType, ownerId],
    queryFn: () => api.ftthCores(ownerType, ownerId),
  });
  const [historyForId, setHistoryForId] = useState<number | null>(null);
  const cores = data?.cores || [];
  const coreByNumber = new Map(cores.map(c => [c.core_number, c] as const));
  const selectedCore = historyForId !== null ? cores.find(c => c.id === historyForId) : null;
  const { data: historyData } = useQuery({
    queryKey: ['ftth-core-history', historyForId],
    queryFn: () => api.ftthCoreHistory(historyForId as number),
    enabled: historyForId !== null,
  });

  if (!totalCores || totalCores <= 0) return null;

  return (
    <div>
      <p className="label-sm mb-1.5">{t('pg_ftth.coreStatusFromRecorded')}</p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: totalCores }, (_, i) => i + 1).map(n => {
          const core = coreByNumber.get(n);
          const status = core?.status || 'available';
          return (
            <button
              key={n} type="button"
              disabled={!core}
              onClick={() => core && setHistoryForId(core.id === historyForId ? null : core.id)}
              className={cn('w-7 h-7 rounded text-[10px] font-medium border flex items-center justify-center transition-colors', CORE_STATUS_STYLE[status], core && 'cursor-pointer hover:opacity-80')}
              title={`Core ${n}: ${status}${core?.assigned_to_type ? ` — ${core.assigned_to_type} #${core.assigned_to_id}` : ''}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {selectedCore && (
        <div className="mt-2 p-2.5 rounded-lg bg-glass border border-brd text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-medium text-tx1">Riwayat Core {selectedCore.core_number}</span>
            <button type="button" onClick={() => setHistoryForId(null)} className="text-tx3 hover:text-tx1"><X size={12} /></button>
          </div>
          {(historyData?.history || []).length === 0 ? (
            <p className="text-tx3">{t('pg_ftth.noStatusChangeHistory')}</p>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {(historyData?.history || []).map(h => (
                <div key={h.id} className="text-tx3 leading-tight">
                  <span className="text-tx2 font-medium">{h.action}</span>{' '}
                  ({h.previous_status || '-'} → {h.new_status || '-'})
                  {h.performed_by && <span> oleh {h.performed_by}</span>}
                  {h.reason && <span className="italic"> — {h.reason}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PON Modal ───
function PonModal({ item, otbList, olts, onClose, onSaved }: { item: FTTHPonPort | null; otbList: FTTHOtb[]; olts: { olt_id: number; olt_name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    olt_id: item?.olt_id || '', olt_name: item?.olt_name || '', frame: item?.frame || 1, slot: item?.slot || 1,
    port: item?.port || 1, pon_name: item?.pon_name || '',
    otb_id: item?.otb_id || '', otb_core_number: item?.otb_core_number || 1,
    description: item?.description || '',
  });
  const { data: realPortsData, isFetching: realPortsLoading } = useQuery({
    queryKey: ['ftth-pon-real', form.olt_id],
    queryFn: () => api.ftthPonRealPorts(Number(form.olt_id)),
    enabled: !!form.olt_id,
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthPonUpdate(item.id, data) : api.ftthPonCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.olt_id = form.olt_id === '' ? null : parseInt(String(form.olt_id));
    d.otb_id = form.otb_id === '' ? null : parseInt(String(form.otb_id));
    d.frame = parseInt(String(form.frame));
    d.slot = parseInt(String(form.slot));
    d.port = parseInt(String(form.port));
    d.otb_core_number = parseInt(String(form.otb_core_number));
    mut.mutate(d);
  };
  const selectedOtb = otbList.find(o => o.id === Number(form.otb_id));
  const pickRealPort = (portName: string) => {
    const p = realPortsData?.ports.find(rp => rp.port_name === portName);
    if (!p) return;
    setForm({ ...form, pon_name: p.port_name, frame: p.frame, slot: p.slot, port: p.port });
  };
  return (
    <Modal title={item ? 'Edit PON Port' : 'Add PON Port'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="OLT">
        <select className="input-field" value={form.olt_id} onChange={e => {
          const olt = olts.find(o => o.olt_id === Number(e.target.value));
          setForm({ ...form, olt_id: e.target.value, olt_name: olt?.olt_name || '' });
        }}>
          <option value="">{t('pg_ftth.selectOltOptionalManual')}</option>
          {olts.map(o => <option key={o.olt_id} value={o.olt_id}>{o.olt_name}</option>)}
        </select>
      </FormField>
      {form.olt_id !== '' && (
        <FormField label={t('pg_ftth.ponPortFromThe')}>
          <select className="input-field" value="" onChange={e => pickRealPort(e.target.value)} disabled={realPortsLoading}>
            <option value="">{realPortsLoading ? 'Memuat port...' : (realPortsData?.ports.length ? '— Pilih port —' : 'Tidak ada port terdeteksi dari sync OLT ini')}</option>
            {(realPortsData?.ports || []).map(p => (
              <option key={p.port_name} value={p.port_name}>
                {p.port_name} — {p.onu_count} ONU{p.already_mapped ? ' (sudah dipetakan)' : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-tx3 mt-1">{t('pg_ftth.pickOneToAuto')}</p>
        </FormField>
      )}
      <FormField label="PON Name"><input className="input-field" value={form.pon_name} onChange={e => setForm({ ...form, pon_name: e.target.value })} placeholder="gpon-olt_1/1/1" /></FormField>
      {form.olt_id === '' && <FormField label={t('pg_ftth.oltNameManual')}><input className="input-field" value={form.olt_name} onChange={e => setForm({ ...form, olt_name: e.target.value })} placeholder="OLT-01" /></FormField>}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <FormField label="Frame"><input className="input-field" type="number" value={form.frame} onChange={e => setForm({ ...form, frame: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Slot"><input className="input-field" type="number" value={form.slot} onChange={e => setForm({ ...form, slot: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Port"><input className="input-field" type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 1 })} /></FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.otbOdfConnectedCore')}><select className="input-field" value={form.otb_id} onChange={e => setForm({ ...form, otb_id: e.target.value })}><option value="">{t('pg_ftth.none')}</option>{otbList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
        <FormField label={t('pg_ftth.coreNumberInOtb')}><input className="input-field" type="number" value={form.otb_core_number} onChange={e => setForm({ ...form, otb_core_number: parseInt(e.target.value) || 1 })} /></FormField>
      </div>
      {selectedOtb && <p className="text-xs -mt-1"><CoreColorTag coreNumber={form.otb_core_number} fibersPerTube={selectedOtb.fibers_per_tube} /></p>}
      <FormField label={t('pg_ftth.description')}><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── OTB Modal ───
function OtbModal({ item, jcList, onClose, onSaved }: { item: FTTHOtb | null; jcList: FTTHJc[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const initialFeedSource: 'pon' | 'jc' = item?.feed_source || 'pon';
  const [form, setForm] = useState({
    name: item?.name || '', type: item?.type || 'otb', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    total_cores: item?.total_cores || 12,
    fibers_per_tube: item?.fibers_per_tube || 12,
    feed_source: initialFeedSource,
    jc_id: item?.jc_id || '', jc_core_number: item?.jc_core_number || '',
    cable_length_meters: item?.cable_length_meters ?? '',
    cable_attenuation_per_km: item?.cable_attenuation_per_km ?? (0.35 as string | number),
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
    d.jc_id = form.jc_id === '' ? null : parseInt(String(form.jc_id));
    d.jc_core_number = form.jc_core_number === '' ? null : parseInt(String(form.jc_core_number));
    d.cable_length_meters = form.cable_length_meters === '' ? null : parseFloat(String(form.cable_length_meters));
    d.cable_attenuation_per_km = parseFloat(String(form.cable_attenuation_per_km)) || 0.35;
    mut.mutate(d);
  };
  const selectedJc = jcList.find(x => x.id === Number(form.jc_id));
  return (
    <Modal title={item ? 'Edit OTB/ODF' : 'Add OTB/ODF'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label={t('pg_ftth.name')}><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="OTB-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.type')}><select className="input-field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="otb">OTB</option><option value="odf">ODF</option></select></FormField>
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder={t('pg_ftth.eG12Port')} /></FormField>
      </div>
      <FormField label={t('pg_ftth.location')}><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t('pg_ftth.serverRoomRack1')} /></FormField>
      <FormField label={t('pg_ftth.coordinatesGpsMap')}>
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <FormField label={t('pg_ftth.fedFrom')}>
        <FeedSourceToggle value={form.feed_source} directValue="pon" onChange={v => setForm({ ...form, feed_source: v as 'pon' | 'jc' })} directLabel="PON Langsung" directIcon={<Cpu size={14} className={form.feed_source !== 'jc' ? 'text-accent' : 'text-tx3'} />} />
      </FormField>
      {form.feed_source === 'jc' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="JC (Joint Closure)"><select className="input-field" value={form.jc_id} onChange={e => setForm({ ...form, jc_id: e.target.value, jc_core_number: '' })}><option value="">{t('pg_ftth.selectJc')}</option>{jcList.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></FormField>
          <FormField label={t('pg_ftth.coreFromJc')}>
            <select className="input-field" value={form.jc_core_number} onChange={e => setForm({ ...form, jc_core_number: e.target.value })}>
              <option value="">{t('pg_ftth.selectSplice')}</option>
              {(selectedJc?.splices || []).map(s => <option key={s.id} value={s.core_out}>Core {s.core_out} (in: {s.core_in}{s.label ? ` — ${s.label}` : ''})</option>)}
            </select>
          </FormField>
          {selectedJc && selectedJc.splices.length === 0 && <p className="text-xs text-warning -mt-1 col-span-full">{t('pg_ftth.thisJcHasNo')}</p>}
        </div>
      ) : (
        <p className="text-[11px] text-tx3 -mt-1">{t('pg_ftth.directConnectionsToA')}</p>
      )}
      {form.feed_source === 'jc' && selectedJc && form.jc_core_number !== '' && <p className="text-xs -mt-1"><CoreColorTag coreNumber={Number(form.jc_core_number)} fibersPerTube={selectedJc.fibers_per_tube} /></p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.totalCores')}><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
        <FormField label={t('pg_ftth.fibersPerTube')}><input className="input-field" type="number" min={1} value={form.fibers_per_tube} onChange={e => setForm({ ...form, fibers_per_tube: parseInt(e.target.value) || 12 })} /></FormField>
      </div>
      <p className="text-[11px] text-tx3 -mt-1">{t('pg_ftth.tubeCoreColoursFollow')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.incomingCableLengthM')}><input className="input-field" type="number" step="1" value={form.cable_length_meters} onChange={e => setForm({ ...form, cable_length_meters: e.target.value })} placeholder={t('pg_ftth.eG850')} /></FormField>
        <FormField label={t('pg_ftth.attenuationDbKm')}><input className="input-field" type="number" step="0.01" value={form.cable_attenuation_per_km} onChange={e => setForm({ ...form, cable_attenuation_per_km: e.target.value })} /></FormField>
      </div>
      {item && <CoreStatusPanel ownerType="otb" ownerId={item.id} totalCores={parseInt(String(form.total_cores)) || 0} />}
      <FormField label={t('pg_ftth.description')}><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── Fed-from toggle (direct parent vs JC), shared by OTB/ODC/ODP/ODP-port modals ───
function FeedSourceToggle({ value, directValue, onChange, directLabel, directIcon, extraOptions }: {
  value: string; directValue: string; onChange: (v: string) => void;
  directLabel: string; directIcon: React.ReactNode;
  extraOptions?: { value: string; label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className={cn('grid gap-2', extraOptions?.length ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
      <button type="button" onClick={() => onChange(directValue)}
        className={cn('flex items-center gap-2 p-2 rounded-lg border text-left transition text-xs',
          value === directValue ? 'border-accent bg-accent/10' : 'border-brd hover:border-tx3')}>
        {directIcon} {directLabel}
      </button>
      <button type="button" onClick={() => onChange('jc')}
        className={cn('flex items-center gap-2 p-2 rounded-lg border text-left transition text-xs',
          value === 'jc' ? 'border-accent bg-accent/10' : 'border-brd hover:border-tx3')}>
        <GitMerge size={14} className={value === 'jc' ? 'text-accent' : 'text-tx3'} /> JC (Joint Closure)
      </button>
      {(extraOptions || []).map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={cn('flex items-center gap-2 p-2 rounded-lg border text-left transition text-xs',
            value === opt.value ? 'border-accent bg-accent/10' : 'border-brd hover:border-tx3')}>
          {opt.icon} {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── ODC Modal ───
function OdcModal({ item, parent, parentKind, otbList, jcList, onClose, onSaved }: {
  item: FTTHOdc | null; parent: any; parentKind?: ParentKind; otbList: FTTHOtb[]; jcList: FTTHJc[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const initialFeedSource: 'otb' | 'jc' = item?.feed_source || (parentKind === 'jc' ? 'jc' : 'otb');
  const [form, setForm] = useState({
    name: item?.name || '', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    feed_source: initialFeedSource,
    otb_id: item?.otb_id || (parentKind === 'otb' ? parent?.id : '') || '', otb_core_number: item?.otb_core_number || 1,
    jc_id: item?.jc_id || (parentKind === 'jc' ? parent?.id : '') || '', jc_core_number: item?.jc_core_number || '',
    total_cores: item?.total_cores || 8, fibers_per_tube: item?.fibers_per_tube || 12,
    splitter_model: item?.splitter_model || '',
    splitter_ratio_type: (item?.splitter_ratio_type || 'even') as 'even' | 'uneven',
    splitter_tap_loss_db: item?.splitter_tap_loss_db ?? '',
    splitter_through_loss_db: item?.splitter_through_loss_db ?? '',
    cable_length_meters: item?.cable_length_meters ?? '',
    cable_attenuation_per_km: item?.cable_attenuation_per_km ?? (0.35 as string | number),
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
    d.splitter_tap_loss_db = form.splitter_tap_loss_db === '' ? null : parseFloat(String(form.splitter_tap_loss_db));
    d.splitter_through_loss_db = form.splitter_through_loss_db === '' ? null : parseFloat(String(form.splitter_through_loss_db));
    d.cable_length_meters = form.cable_length_meters === '' ? null : parseFloat(String(form.cable_length_meters));
    d.cable_attenuation_per_km = parseFloat(String(form.cable_attenuation_per_km)) || 0.35;
    mut.mutate(d);
  };
  const selectedOtb = otbList.find(x => x.id === Number(form.otb_id));
  const selectedJc = jcList.find(x => x.id === Number(form.jc_id));
  return (
    <Modal title={item ? 'Edit ODC' : t('pg_ftth.addOdc')} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label={t('pg_ftth.name')}><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ODC-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></FormField>
        <FormField label="Splitter Model"><input className="input-field" value={form.splitter_model} onChange={e => setForm({ ...form, splitter_model: e.target.value })} placeholder="1:8, 1:16" /></FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label={t('pg_ftth.splitterRatio')}>
          <select className="input-field" value={form.splitter_ratio_type} onChange={e => setForm({ ...form, splitter_ratio_type: e.target.value as 'even' | 'uneven' })}>
            <option value="even">{t('pg_ftth.even')}</option>
            <option value="uneven">{t('pg_ftth.uneven')}</option>
          </select>
        </FormField>
        <FormField label={t('pg_ftth.tapLossDbOptional')}><input className="input-field" type="number" step="0.1" value={form.splitter_tap_loss_db} onChange={e => setForm({ ...form, splitter_tap_loss_db: e.target.value })} placeholder={t('pg_ftth.eG105')} /></FormField>
        <FormField label={t('pg_ftth.throughLossDbOptional')}><input className="input-field" type="number" step="0.1" value={form.splitter_through_loss_db} onChange={e => setForm({ ...form, splitter_through_loss_db: e.target.value })} placeholder={t('pg_ftth.eG12')} /></FormField>
      </div>
      <FormField label={t('pg_ftth.location')}><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t('pg_ftth.streetAddressOrLandmark')} /></FormField>
      <FormField label={t('pg_ftth.coordinatesGpsMap')}>
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <FormField label={t('pg_ftth.fedFrom')}>
        <FeedSourceToggle value={form.feed_source} directValue="otb" onChange={v => setForm({ ...form, feed_source: v as 'otb' | 'jc' })} directLabel="OTB/ODF" directIcon={<Server size={14} className={form.feed_source !== 'jc' ? 'text-accent' : 'text-tx3'} />} />
      </FormField>
      {form.feed_source === 'jc' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="JC (Joint Closure)"><select className="input-field" value={form.jc_id} onChange={e => setForm({ ...form, jc_id: e.target.value, jc_core_number: '' })}><option value="">{t('pg_ftth.selectJc')}</option>{jcList.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></FormField>
          <FormField label={t('pg_ftth.coreFromJc')}>
            <select className="input-field" value={form.jc_core_number} onChange={e => setForm({ ...form, jc_core_number: e.target.value })}>
              <option value="">{t('pg_ftth.selectSplice')}</option>
              {(selectedJc?.splices || []).map(s => <option key={s.id} value={s.core_out}>Core {s.core_out} (in: {s.core_in}{s.label ? ` — ${s.label}` : ''})</option>)}
            </select>
          </FormField>
          <FormField label={t('pg_ftth.totalCores')}><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
          {selectedJc && selectedJc.splices.length === 0 && <p className="text-xs text-warning -mt-1 col-span-full">{t('pg_ftth.thisJcHasNo')}</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="OTB/ODF"><select className="input-field" value={form.otb_id} onChange={e => setForm({ ...form, otb_id: e.target.value })}><option value="">{t('pg_ftth.none')}</option>{otbList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
          <FormField label={t('pg_ftth.coreFromOtb')}><input className="input-field" type="number" value={form.otb_core_number} onChange={e => setForm({ ...form, otb_core_number: parseInt(e.target.value) || 1 })} /></FormField>
          <FormField label={t('pg_ftth.totalCores')}><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
        </div>
      )}
      {form.feed_source === 'jc' && selectedJc && form.jc_core_number !== '' && <p className="text-xs -mt-1"><CoreColorTag coreNumber={Number(form.jc_core_number)} fibersPerTube={selectedJc.fibers_per_tube} /></p>}
      {form.feed_source !== 'jc' && selectedOtb && <p className="text-xs -mt-1"><CoreColorTag coreNumber={form.otb_core_number} fibersPerTube={selectedOtb.fibers_per_tube} /></p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.incomingCableLengthM')}><input className="input-field" type="number" step="1" value={form.cable_length_meters} onChange={e => setForm({ ...form, cable_length_meters: e.target.value })} placeholder={t('pg_ftth.eG300')} /></FormField>
        <FormField label={t('pg_ftth.attenuationDbKm')}><input className="input-field" type="number" step="0.01" value={form.cable_attenuation_per_km} onChange={e => setForm({ ...form, cable_attenuation_per_km: e.target.value })} /></FormField>
      </div>
      {item && <CoreStatusPanel ownerType="odc" ownerId={item.id} totalCores={parseInt(String(form.total_cores)) || 0} />}
      <FormField label={t('pg_ftth.description')}><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── ODP Modal ───
function OdpModal({ item, parent, parentKind, odcList, jcList, odpList, onClose, onSaved }: {
  item: FTTHOdp | null; parent: any; parentKind?: ParentKind; odcList: FTTHOdc[]; jcList: FTTHJc[]; odpList: FTTHOdp[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const initialFeedSource: 'odc' | 'jc' | 'odp' = item?.feed_source || (parentKind === 'jc' ? 'jc' : parentKind === 'odp' ? 'odp' : 'odc');
  const [selectedParentOdp, setSelectedParentOdp] = useState(
    String(item?.parent_odp_id || (parentKind === 'odp' ? parent?.id : '') || '')
  );
  const { data: parentOdpPorts } = useQuery({
    queryKey: ['ftth-odp-ports-picker', selectedParentOdp],
    queryFn: () => api.ftthOdpPorts(Number(selectedParentOdp)),
    enabled: !!selectedParentOdp,
  });
  const [form, setForm] = useState({
    name: item?.name || '', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    feed_source: initialFeedSource,
    odc_id: item?.odc_id || (parentKind === 'odc' ? parent?.id : '') || '', odc_core_number: item?.odc_core_number || 1,
    jc_id: item?.jc_id || (parentKind === 'jc' ? parent?.id : '') || '', jc_core_number: item?.jc_core_number || '',
    parent_odp_port_id: item?.parent_odp_port_id || '',
    total_ports: item?.total_ports || 8, splitter_model: item?.splitter_model || '',
    splitter_ratio_type: (item?.splitter_ratio_type || 'even') as 'even' | 'uneven',
    splitter_tap_loss_db: item?.splitter_tap_loss_db ?? '',
    splitter_through_loss_db: item?.splitter_through_loss_db ?? '',
    cable_length_meters: item?.cable_length_meters ?? '',
    cable_attenuation_per_km: item?.cable_attenuation_per_km ?? (0.35 as string | number),
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthOdpUpdate(item.id, data) : api.ftthOdpCreate(data),
    onSuccess: () => {
      toast.success(item ? 'Updated' : 'Created');
      if (selectedParentOdp) qc.invalidateQueries({ queryKey: ['ftth-odp-ports-picker', selectedParentOdp] });
      onSaved();
    },
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
    d.parent_odp_port_id = form.parent_odp_port_id === '' ? null : parseInt(String(form.parent_odp_port_id));
    d.total_ports = parseInt(String(form.total_ports));
    d.splitter_tap_loss_db = form.splitter_tap_loss_db === '' ? null : parseFloat(String(form.splitter_tap_loss_db));
    d.splitter_through_loss_db = form.splitter_through_loss_db === '' ? null : parseFloat(String(form.splitter_through_loss_db));
    d.cable_length_meters = form.cable_length_meters === '' ? null : parseFloat(String(form.cable_length_meters));
    d.cable_attenuation_per_km = parseFloat(String(form.cable_attenuation_per_km)) || 0.35;
    mut.mutate(d);
  };
  const selectedJc = jcList.find(x => x.id === Number(form.jc_id));
  const parentOdpOptions = odpList.filter(o => o.id !== item?.id);
  const availableParentPorts = (parentOdpPorts?.ports || []).filter(p => !p.onu_id && p.status !== 'used' && (!p.fed_odp_id || p.fed_odp_id === item?.id));
  return (
    <Modal title={item ? 'Edit ODP' : t('pg_ftth.addOdp')} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label={t('pg_ftth.name')}><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ODP-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></FormField>
        <FormField label="Splitter Model"><input className="input-field" value={form.splitter_model} onChange={e => setForm({ ...form, splitter_model: e.target.value })} placeholder="1:4, 1:8, 1:16, 1:32" /></FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label={t('pg_ftth.splitterRatio')}>
          <select className="input-field" value={form.splitter_ratio_type} onChange={e => setForm({ ...form, splitter_ratio_type: e.target.value as 'even' | 'uneven' })}>
            <option value="even">{t('pg_ftth.even')}</option>
            <option value="uneven">{t('pg_ftth.uneven')}</option>
          </select>
        </FormField>
        <FormField label={t('pg_ftth.tapLossDbOptional')}><input className="input-field" type="number" step="0.1" value={form.splitter_tap_loss_db} onChange={e => setForm({ ...form, splitter_tap_loss_db: e.target.value })} placeholder={t('pg_ftth.eG105')} /></FormField>
        <FormField label={t('pg_ftth.throughLossDbOptional')}><input className="input-field" type="number" step="0.1" value={form.splitter_through_loss_db} onChange={e => setForm({ ...form, splitter_through_loss_db: e.target.value })} placeholder={t('pg_ftth.eG12')} /></FormField>
      </div>
      <FormField label={t('pg_ftth.location')}><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t('pg_ftth.poleNumberAddress')} /></FormField>
      <FormField label={t('pg_ftth.coordinatesGpsMap')}>
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <FormField label={t('pg_ftth.fedFrom')}>
        <FeedSourceToggle value={form.feed_source} directValue="odc" onChange={v => setForm({ ...form, feed_source: v as 'odc' | 'jc' | 'odp' })} directLabel="ODC" directIcon={<Box size={14} className={form.feed_source === 'odc' ? 'text-accent' : 'text-tx3'} />}
          extraOptions={[{ value: 'odp', label: t('pg_ftth.anotherOdpCascade'), icon: <Split size={14} className={form.feed_source === 'odp' ? 'text-accent' : 'text-tx3'} /> }]} />
      </FormField>
      {form.feed_source === 'jc' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="JC (Joint Closure)"><select className="input-field" value={form.jc_id} onChange={e => setForm({ ...form, jc_id: e.target.value, jc_core_number: '' })}><option value="">{t('pg_ftth.selectJc')}</option>{jcList.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></FormField>
          <FormField label={t('pg_ftth.coreFromJc')}>
            <select className="input-field" value={form.jc_core_number} onChange={e => setForm({ ...form, jc_core_number: e.target.value })}>
              <option value="">{t('pg_ftth.selectSplice')}</option>
              {(selectedJc?.splices || []).map(s => <option key={s.id} value={s.core_out}>Core {s.core_out} (in: {s.core_in}{s.label ? ` — ${s.label}` : ''})</option>)}
            </select>
          </FormField>
          <FormField label={t('pg_ftth.totalPorts')}><input className="input-field" type="number" value={form.total_ports} onChange={e => setForm({ ...form, total_ports: parseInt(e.target.value) || 0 })} /></FormField>
          {selectedJc && selectedJc.splices.length === 0 && <p className="text-xs text-warning -mt-1 col-span-full">{t('pg_ftth.thisJcHasNo')}</p>}
        </div>
      ) : form.feed_source === 'odp' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="ODP Parent">
            <select className="input-field" value={selectedParentOdp} onChange={e => { setSelectedParentOdp(e.target.value); setForm({ ...form, parent_odp_port_id: '' }); }}>
              <option value="">{t('pg_ftth.selectOdp')}</option>
              {parentOdpOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </FormField>
          <FormField label={t('pg_ftth.portOnParentOdp')}>
            <select className="input-field" value={form.parent_odp_port_id} onChange={e => setForm({ ...form, parent_odp_port_id: e.target.value })} disabled={!selectedParentOdp}>
              <option value="">{t('pg_ftth.selectPort')}</option>
              {availableParentPorts.map(p => <option key={p.id} value={p.id}>Port {p.port_number}</option>)}
            </select>
          </FormField>
          <FormField label={t('pg_ftth.totalPorts')}><input className="input-field" type="number" value={form.total_ports} onChange={e => setForm({ ...form, total_ports: parseInt(e.target.value) || 0 })} /></FormField>
          {selectedParentOdp && availableParentPorts.length === 0 && <p className="text-xs text-warning -mt-1 col-span-full">{t('pg_ftth.thisOdpHasNo')}</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="ODC"><select className="input-field" value={form.odc_id} onChange={e => setForm({ ...form, odc_id: e.target.value })}><option value="">{t('pg_ftth.none')}</option>{odcList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
          <FormField label={t('pg_ftth.coreFromOdc')}><input className="input-field" type="number" value={form.odc_core_number} onChange={e => setForm({ ...form, odc_core_number: parseInt(e.target.value) || 1 })} /></FormField>
          <FormField label={t('pg_ftth.totalPorts')}><input className="input-field" type="number" value={form.total_ports} onChange={e => setForm({ ...form, total_ports: parseInt(e.target.value) || 0 })} /></FormField>
        </div>
      )}
      {form.feed_source === 'jc' && selectedJc && form.jc_core_number !== '' && <p className="text-xs -mt-1"><CoreColorTag coreNumber={Number(form.jc_core_number)} fibersPerTube={selectedJc.fibers_per_tube} /></p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.incomingCableLengthM')}><input className="input-field" type="number" step="1" value={form.cable_length_meters} onChange={e => setForm({ ...form, cable_length_meters: e.target.value })} placeholder={t('pg_ftth.eG100')} /></FormField>
        <FormField label={t('pg_ftth.attenuationDbKm')}><input className="input-field" type="number" step="0.01" value={form.cable_attenuation_per_km} onChange={e => setForm({ ...form, cable_attenuation_per_km: e.target.value })} /></FormField>
      </div>
      <FormField label={t('pg_ftth.description')}><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── JC (Joint Closure) Modal — includes inline splice management once saved ───
function JcModal({ item, parent, parentKind, otbList, odcList, jcList, ponList, odpList, onClose, onSaved }: {
  item: FTTHJc | null; parent: any; parentKind?: ParentKind; otbList: FTTHOtb[]; odcList: FTTHOdc[]; jcList: FTTHJc[]; ponList: FTTHPonPort[]; odpList: FTTHOdp[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedOdpForPort, setSelectedOdpForPort] = useState('');
  const { data: odpPortsForPicker } = useQuery({
    queryKey: ['ftth-odp-ports-picker', selectedOdpForPort],
    queryFn: () => api.ftthOdpPorts(Number(selectedOdpForPort)),
    enabled: !!selectedOdpForPort,
  });
  const [form, setForm] = useState({
    name: item?.name || '', closure_type: item?.closure_type || 'inline',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    total_cores: item?.total_cores || 12,
    fibers_per_tube: item?.fibers_per_tube || 12,
    parent_type: item?.parent_type || parentKind || '',
    parent_id: item?.parent_id || parent?.id || '',
    cable_length_meters: item?.cable_length_meters ?? '',
    cable_attenuation_per_km: item?.cable_attenuation_per_km ?? (0.35 as string | number),
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
    d.cable_length_meters = form.cable_length_meters === '' ? null : parseFloat(String(form.cable_length_meters));
    d.cable_attenuation_per_km = parseFloat(String(form.cable_attenuation_per_km)) || 0.35;
    mut.mutate(d);
  };

  // Splice management — only meaningful once the JC exists (has an id)
  const odpPortOptions = (odpPortsForPicker?.ports || []).map(p => ({ id: p.id, name: `Port ${p.port_number}${p.customer_name ? ' — ' + p.customer_name : ''}` }));
  const parentOptions: any[] = form.parent_type === 'otb' ? otbList
    : form.parent_type === 'odc' ? odcList
    : form.parent_type === 'jc' ? jcList.filter(j => j.id !== item?.id)
    : form.parent_type === 'pon' ? ponList.map(p => ({ id: p.id, name: p.pon_name || `${p.frame}/${p.slot}/${p.port}` }))
    : form.parent_type === 'odp_port' ? odpPortOptions
    : [];
  const parentNode: any = form.parent_type ? parentOptions.find((p: any) => p.id === Number(form.parent_id)) : null;
  const parentFibersPerTube = parentNode?.fibers_per_tube || 12;
  const ownFibersPerTube = form.fibers_per_tube || 12;

  const emptySpliceForm = { tubeIn: 1, posIn: 1, tubeOut: 1, posOut: 1, tubeInLabel: '', tubeOutLabel: '', label: '' };
  const [spliceForm, setSpliceForm] = useState(emptySpliceForm);
  const [editingSpliceId, setEditingSpliceId] = useState<number | null>(null);
  const spliceCoreIn = (spliceForm.tubeIn - 1) * parentFibersPerTube + spliceForm.posIn;
  const spliceCoreOut = (spliceForm.tubeOut - 1) * ownFibersPerTube + spliceForm.posOut;
  const currentSplices = item ? (jcList.find(j => j.id === item.id)?.splices || item.splices || []) : [];
  const startEditSplice = (s: FTTHJcSplice) => {
    const inInfo = coreColorInfo(s.core_in, parentFibersPerTube);
    const outInfo = coreColorInfo(s.core_out, ownFibersPerTube);
    setSpliceForm({ tubeIn: inInfo.tubeNumber, posIn: inInfo.positionInTube, tubeOut: outInfo.tubeNumber, posOut: outInfo.positionInTube, tubeInLabel: s.tube_in_label || '', tubeOutLabel: s.tube_out_label || '', label: s.label || '' });
    setEditingSpliceId(s.id);
  };
  const cancelEditSplice = () => { setSpliceForm(emptySpliceForm); setEditingSpliceId(null); };
  const spliceMut = useMutation({
    mutationFn: () => editingSpliceId
      ? api.ftthJcSpliceUpdate(item!.id, editingSpliceId, { core_in: spliceCoreIn, core_out: spliceCoreOut, label: spliceForm.label, tube_in_label: spliceForm.tubeInLabel, tube_out_label: spliceForm.tubeOutLabel })
      : api.ftthJcSpliceCreate(item!.id, { core_in: spliceCoreIn, core_out: spliceCoreOut, label: spliceForm.label, tube_in_label: spliceForm.tubeInLabel, tube_out_label: spliceForm.tubeOutLabel }),
    onSuccess: () => { toast.success(editingSpliceId ? 'Splice updated' : 'Splice added'); setSpliceForm(emptySpliceForm); setEditingSpliceId(null); qc.invalidateQueries({ queryKey: ['ftth-jc'] }); qc.invalidateQueries({ queryKey: ['ftth-tree'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteSpliceMut = useMutation({
    mutationFn: (spliceId: number) => api.ftthJcSpliceDelete(item!.id, spliceId),
    onSuccess: () => { toast.success(t('pg_ftth.spliceRemoved')); if (editingSpliceId) cancelEditSplice(); qc.invalidateQueries({ queryKey: ['ftth-jc'] }); qc.invalidateQueries({ queryKey: ['ftth-tree'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal title={item ? 'Edit JC (Joint Closure)' : t('pg_ftth.addJcJointClosure')} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label={t('pg_ftth.name')}><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="JC-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.closureType')}>
          <select className="input-field" value={form.closure_type} onChange={e => setForm({ ...form, closure_type: e.target.value })}>
            <option value="inline">Inline</option>
            <option value="dome">Dome</option>
            <option value="dead-end">Dead-end</option>
          </select>
        </FormField>
        <FormField label={t('pg_ftth.totalCores')}><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
      </div>
      <FormField label={t('pg_ftth.fibersPerTubeOptional')}><input className="input-field" type="number" min={1} value={form.fibers_per_tube} onChange={e => setForm({ ...form, fibers_per_tube: parseInt(e.target.value) || 12 })} /></FormField>
      <p className="text-[11px] text-tx3 -mt-1">{t('pg_ftth.ifThisClosureHas')}</p>
      <FormField label={t('pg_ftth.location')}><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t('pg_ftth.poleNumberManholeAddress')} /></FormField>
      <FormField label={t('pg_ftth.coordinatesGpsMap')}>
        <LocationPicker latitude={form.latitude} longitude={form.longitude} onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })} />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.fedFromParent')}>
          <select className="input-field" value={form.parent_type} onChange={e => { setForm({ ...form, parent_type: e.target.value, parent_id: '' }); setSelectedOdpForPort(''); }}>
            <option value="">{t('pg_ftth.none')}</option>
            <option value="pon">PON Port (OLT)</option>
            <option value="otb">OTB/ODF</option>
            <option value="odc">ODC</option>
            <option value="odp_port">{t('pg_ftth.odpPortDropCable')}</option>
            <option value="jc">{t('pg_ftth.anotherJc')}</option>
          </select>
        </FormField>
        {form.parent_type === 'odp_port' ? (
          <FormField label="ODP">
            <select className="input-field" value={selectedOdpForPort} onChange={e => { setSelectedOdpForPort(e.target.value); setForm({ ...form, parent_id: '' }); }}>
              <option value="">{t('pg_ftth.selectOdp')}</option>
              {odpList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </FormField>
        ) : (
          <FormField label="Parent">
            <select className="input-field" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })} disabled={!form.parent_type}>
              <option value="">{t('pg_ftth.select')}</option>
              {parentOptions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
        )}
      </div>
      {form.parent_type === 'odp_port' && (
        <FormField label="Port">
          <select className="input-field" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })} disabled={!selectedOdpForPort}>
            <option value="">{t('pg_ftth.selectPort2')}</option>
            {odpPortOptions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!selectedOdpForPort && item?.parent_type === 'odp_port' && item.parent_name && (
            <p className="text-[11px] text-tx3 mt-1">Saat ini: {item.parent_name} — pilih ODP di atas untuk mengganti.</p>
          )}
        </FormField>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('pg_ftth.incomingCableLengthM')}><input className="input-field" type="number" step="1" value={form.cable_length_meters} onChange={e => setForm({ ...form, cable_length_meters: e.target.value })} placeholder={t('pg_ftth.eG150')} /></FormField>
        <FormField label={t('pg_ftth.attenuationDbKm')}><input className="input-field" type="number" step="0.01" value={form.cable_attenuation_per_km} onChange={e => setForm({ ...form, cable_attenuation_per_km: e.target.value })} /></FormField>
      </div>
      {item && <CoreStatusPanel ownerType="jc" ownerId={item.id} totalCores={parseInt(String(form.total_cores)) || 0} />}
      <FormField label={t('pg_ftth.description')}><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>

      {item && (
        <div className="pt-3 border-t border-brd">
          <div className="flex items-center gap-1.5 text-sm font-medium mb-2"><Scissors size={14} className="text-purple-400" /> Splices ({currentSplices.length})</div>
          <p className="text-[11px] text-tx3 mb-2">Core masuk (dari {form.parent_type || 'parent'}) disambung ke core keluar — ODC/ODP downstream memilih core keluar ini sebagai sumbernya. Tube dihitung otomatis dari nomor core absolut, atau isi nama/warna tube sendiri kalau bukan kabel bertube standar (mis. drop core).</p>
          {currentSplices.length > 0 && (
            <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
              {currentSplices.map(s => (
                <div key={s.id} className={cn('flex items-center gap-2 p-1.5 rounded bg-glass text-xs flex-wrap', editingSpliceId === s.id && 'ring-1 ring-accent')}>
                  <span className="text-tx3 flex-shrink-0">In:</span>
                  <CoreColorTag coreNumber={s.core_in} fibersPerTube={parentFibersPerTube} tubeLabel={s.tube_in_label} />
                  <span className="text-tx3 flex-shrink-0">→ Out:</span>
                  <CoreColorTag coreNumber={s.core_out} fibersPerTube={ownFibersPerTube} tubeLabel={s.tube_out_label} />
                  {s.label && <span className="text-tx3 truncate flex-1">{s.label}</span>}
                  <button onClick={() => startEditSplice(s)} className="p-1 rounded hover:bg-glass text-tx3 hover:text-accent flex-shrink-0 ml-auto" title={t('pg_ftth.editSplice')}><Edit2 size={12} /></button>
                  <button onClick={() => deleteSpliceMut.mutate(s.id)} className="p-1 rounded hover:bg-danger/15 text-tx3 hover:text-danger flex-shrink-0" title={t('pg_ftth.removeSplice')}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5 p-2 rounded-lg bg-glass/50">
            <div>
              <span className="text-[10px] text-tx3 font-medium block mb-1">Core In — dari {form.parent_type ? `${form.parent_type.toUpperCase()}${parentNode ? ` (${parentNode.name})` : ''}` : 'parent'}</span>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                <input className="input-field !text-xs" type="number" min={1} placeholder="Tube" title={t('pg_ftth.tubeNumberFreeForm')} value={spliceForm.tubeIn} onChange={e => setSpliceForm({ ...spliceForm, tubeIn: parseInt(e.target.value) || 1 })} />
                <input className="input-field !text-xs" type="number" min={1} placeholder={t('pg_ftth.coreInTube')} value={spliceForm.posIn} onChange={e => setSpliceForm({ ...spliceForm, posIn: parseInt(e.target.value) || 1 })} />
                <CoreColorTag coreNumber={spliceCoreIn} fibersPerTube={parentFibersPerTube} tubeLabel={spliceForm.tubeInLabel} />
              </div>
              <input className="input-field !text-xs mt-1.5" placeholder={t('pg_ftth.manualTubeNameColour')} value={spliceForm.tubeInLabel} onChange={e => setSpliceForm({ ...spliceForm, tubeInLabel: e.target.value })} />
            </div>
            <div>
              <span className="text-[10px] text-tx3 font-medium block mb-1">{t('pg_ftth.coreOutDownstreamThis')}</span>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                <input className="input-field !text-xs" type="number" min={1} placeholder="Tube" title={t('pg_ftth.tubeNumberFreeForm')} value={spliceForm.tubeOut} onChange={e => setSpliceForm({ ...spliceForm, tubeOut: parseInt(e.target.value) || 1 })} />
                <input className="input-field !text-xs" type="number" min={1} placeholder={t('pg_ftth.coreInTube')} value={spliceForm.posOut} onChange={e => setSpliceForm({ ...spliceForm, posOut: parseInt(e.target.value) || 1 })} />
                <CoreColorTag coreNumber={spliceCoreOut} fibersPerTube={ownFibersPerTube} tubeLabel={spliceForm.tubeOutLabel} />
              </div>
              <input className="input-field !text-xs mt-1.5" placeholder={t('pg_ftth.manualTubeNameColour')} value={spliceForm.tubeOutLabel} onChange={e => setSpliceForm({ ...spliceForm, tubeOutLabel: e.target.value })} />
            </div>
            {editingSpliceId && <p className="text-[11px] text-accent">{t('pg_ftth.editingSpliceChangeTube')}</p>}
            <div className={cn('grid gap-1.5', editingSpliceId ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]')}>
              <input className="input-field !text-xs" placeholder={t('pg_ftth.labelOptional')} value={spliceForm.label} onChange={e => setSpliceForm({ ...spliceForm, label: e.target.value })} />
              {editingSpliceId && <button type="button" onClick={cancelEditSplice} className="btn-cancel text-xs">{t('pg_ftth.cancel')}</button>}
              <button type="button" onClick={() => spliceMut.mutate()} disabled={spliceMut.isPending}
                className="btn-primary text-xs disabled:opacity-50">{editingSpliceId ? 'Save Changes' : '+ Add Splice'}</button>
            </div>
          </div>
        </div>
      )}
      {!item && <p className="text-[11px] text-tx3">{t('pg_ftth.saveThisJcFirst')}</p>}
    </Modal>
  );
}

// ─── Impact Modal — "if this breaks, who's affected" downstream customer list ───
function ImpactModal({ target, onClose }: { target: { type: 'otb' | 'jc' | 'odc' | 'odp'; id: number; name: string }; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['ftth-impact', target.type, target.id],
    queryFn: () => api.ftthImpact(target.type, target.id),
  });
  return (
    <SharedModal open onClose={onClose} icon={<Users size={16} />} title={t('pg_ftth.impactTitle', { name: data?.name || target.name })} size="sm">
      {isLoading && <div className="text-center py-8 text-tx3 text-sm">{t('pg_ftth.calculating')}</div>}
      {data && (
        <>
          <p className="text-xs text-tx3">{t('pg_ftth.ifThisPointBreaks')}</p>
          <div className="grid grid-cols-3 gap-2 text-center mt-3">
            <div className="p-2.5 rounded-lg bg-glass"><div className="text-lg font-bold">{data.total}</div><div className="text-[10px] text-tx3 uppercase">Total</div></div>
            <div className="p-2.5 rounded-lg bg-success/10"><div className="text-lg font-bold text-success">{data.online}</div><div className="text-[10px] text-tx3 uppercase">Online</div></div>
            <div className="p-2.5 rounded-lg bg-danger/10"><div className="text-lg font-bold text-danger">{data.offline}</div><div className="text-[10px] text-tx3 uppercase">Offline</div></div>
          </div>
          {data.total === 0 ? (
            <p className="text-xs text-tx3 text-center py-4">{t('pg_ftth.noDownstreamCustomersFrom')}</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto mt-3">
              {data.customers.map(c => (
                <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-glass text-xs">
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', c.status?.toLowerCase() === 'online' ? 'bg-success' : 'bg-tx3')} />
                  <span className="font-medium truncate flex-1">{c.name}</span>
                  <span className="text-tx3 font-mono">{c.serial}</span>
                </div>
              ))}
              {data.truncated && <p className="text-[11px] text-tx3 text-center pt-1">...dan {data.total - 200} lainnya (dipotong untuk performa)</p>}
            </div>
          )}
        </>
      )}
    </SharedModal>
  );
}

// ─── Generic Modal wrapper ───
function Modal({ title, onClose, onSubmit, loading, children }: { title: string; onClose: () => void; onSubmit: () => void; loading: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <SharedModal open onClose={onClose} title={title} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>{t('pg_ftth.cancel')}</Button><Button variant="primary" loading={loading} onClick={onSubmit}>{t('pg_ftth.save')}</Button></>}
    >
      <div className="space-y-3">{children}</div>
    </SharedModal>
  );
}
