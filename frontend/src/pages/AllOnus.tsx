import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type ONUData, type AllOnusData, type TechnicianData, type RxColorRange, type MacMatchResult } from '../lib/api';
import { collectOdpPortOptions } from '../lib/ftthTree';
import { cn, formatSn } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import {
  Eye, Edit3, Trash2,
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, Wifi,
  Satellite, Download, Split, Radio, Wrench, MapPin, RefreshCw, Fingerprint
} from 'lucide-react';
import { useHasPerm } from '../hooks/useHasPerm';
import { useTranslation } from 'react-i18next';
import { useDashboardWs } from '../hooks/useDashboardWs';
import { LocationPicker } from '../components/LocationPicker';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, Select, Input, Modal } from '../components/ui';
import { FilterBar, SearchBar, StatusBadge } from '../components/shared';

export function AllOnus() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasPerm = useHasPerm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [oltFilter, setOltFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('filter') || 'all');
  const [signalFilter, setSignalFilter] = useState(() => searchParams.get('signal') || 'all');
  const [ponFilter, setPonFilter] = useState('all');
  const [slotFilter, setSlotFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingOnu, setEditingOnu] = useState<ONUData | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState('');
  const [editPppoe, setEditPppoe] = useState('');
  const [editOnuId, setEditOnuId] = useState<number | ''>('');
  const [editTechnicianId, setEditTechnicianId] = useState<number | null>(null);
  const [editOdpPortId, setEditOdpPortId] = useState<number | null>(null);
  const [editLatitude, setEditLatitude] = useState<string>('');
  const [editLongitude, setEditLongitude] = useState<string>('');
  const [showMap, setShowMap] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ onuId: number; field: 'technician' | 'odp' } | null>(null);
  const [showMacMatch, setShowMacMatch] = useState(false);
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Debounce search — only trigger API after 400ms idle
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['all-onus', oltFilter, statusFilter, signalFilter, ponFilter, slotFilter, debouncedSearch, page, pageSize, sortBy, sortDir],
    queryFn: () => api.allOnus({ olt: oltFilter, status: statusFilter, signal: signalFilter, pon: ponFilter !== 'all' ? ponFilter : (slotFilter !== 'all' ? `slot/${slotFilter}` : 'all'), search: debouncedSearch, page, page_size: pageSize, sort_by: sortBy || undefined, sort_dir: sortDir }),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  // Track if we're fetching with changed filters (not just background refetch)
  const isFilterFetching = isFetching && !isLoading;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.updateOnu(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-onus'] }); setEditingOnu(null); toast.success(t('allOnus.updated')); },
    onError: () => toast.error(t('allOnus.updateFailed')),
  });

  const { data: techData } = useQuery({ queryKey: ['technicians'], queryFn: api.technicians });
  const technicians: TechnicianData[] = techData?.technicians || [];

  // Fetch RX color ranges
  const { data: rxColorData } = useQuery({ queryKey: ['rx-colors'], queryFn: api.getRxColors });
  const rxColorRanges: RxColorRange[] = rxColorData?.ranges || [
    { min: -25, max: 0, color: 'green', label: 'Good' },
    { min: -28, max: -25, color: 'yellow', label: 'Warning' },
    { min: -99, max: -28, color: 'red', label: 'Critical' },
  ];

  // Fetch ODP tree for dropdown
  const { data: odpTreeData } = useQuery({
    queryKey: ['ftth-tree'],
    queryFn: async () => { const r = await fetch('/api/ftth/tree', { credentials: 'include' }); return r.json(); },
  });
  // Flatten ODP ports from tree (guard against non-array response), walking
  // through any JC hops between OTB/ODC/ODP too.
  const treeArr = Array.isArray(odpTreeData) ? odpTreeData : (odpTreeData?.tree || []);
  const odpPorts = collectOdpPortOptions(treeArr, editOdpPortId);

  // WebSocket listener — real-time updates: auto-refresh ONU list on alert or
  // status change ('onu_change' also covers sync completion — see ws_bridge.py)
  const alertWsMsg = useDashboardWs();
  useEffect(() => {
    if (alertWsMsg && (alertWsMsg.event === 'alert' || alertWsMsg.event === 'onu_change')) {
      queryClient.invalidateQueries({ queryKey: ['all-onus'] });
    }
  }, [alertWsMsg, queryClient]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const onu = onus.find(o => o.id === id);
      const ok = await confirm({ title: t('allOnus.deleteTitle'), message: t('allOnus.deleteMsg', { name: onu?.name || id }), confirmLabel: t('common.delete'), variant: 'danger' });
      if (!ok) throw new Error('cancelled');
      return api.deleteOnu(id);
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['all-onus'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['olts'] });
      toast.success(d.message || t('allOnus.deleted'));
      // Re-fetch after auto-sync completes (sync takes ~5-10s)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['all-onus'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['olts'] });
      }, 5000);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['all-onus'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['olts'] });
      }, 10000);
    },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error(t('allOnus.deleteFailed')); },
  });

  const refreshSignalMutation = useMutation({
    mutationFn: (oltId: number) => api.refreshSignal(oltId),
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['all-onus'] }); toast.success(t('allOnus.signalRefreshed', { updated: d.updated, total: d.total })); },
    onError: () => toast.error(t('allOnus.signalFailed')),
  });

  const linkSyncMutation = useMutation({
    mutationFn: api.mikrotikPollNow,
    onSuccess: (d) => {
      const s = d.states || {};
      const ok = (s.ok || 0) + (s.slow || 0) + (s.down || 0);
      toast.success(t('allOnus.linkSyncDone', { ok, noSession: s.no_session || 0 }));
      queryClient.invalidateQueries({ queryKey: ['all-onus'] });
      queryClient.invalidateQueries({ queryKey: ['ftth-map'] });
    },
    onError: (e: Error) => toast.error(e.message || t('allOnus.linkSyncFailed')),
  });

  const macMatchMutation = useMutation({
    mutationFn: (pairs: { onu_id: number; name: string }[]) => api.mikrotikMacMatchApply(pairs),
    onSuccess: (d) => {
      toast.success(t('allOnus.macApplied', { count: d.updated }));
      if (d.errors?.length) toast.warning(t('allOnus.macPartial', { count: d.errors.length }));
      queryClient.invalidateQueries({ queryKey: ['all-onus'] });
      queryClient.invalidateQueries({ queryKey: ['ftth-map'] });
    },
    onError: (e: Error) => toast.error(e.message || t('allOnus.applyFailed')),
  });
  const handleMacApply = (pairs: { onu_id: number; name: string }[]) => macMatchMutation.mutate(pairs);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [oltFilter, statusFilter, signalFilter, slotFilter, ponFilter, debouncedSearch, pageSize]);

  // Shared filter handlers — used by both the Select dropdowns and the stat cards
  const applyStatusFilter = (value: string) => {
    setStatusFilter(value);
    setPage(1);
    const p = new URLSearchParams(searchParams);
    if (value === 'all') p.delete('filter');
    else p.set('filter', value);
    setSearchParams(p, { replace: true });
  };

  const applySignalFilter = (value: string) => {
    const next = signalFilter === value ? 'all' : value; // click again to clear
    setSignalFilter(next);
    setPage(1);
    const p = new URLSearchParams(searchParams);
    if (next === 'all') p.delete('signal');
    else p.set('signal', next);
    setSearchParams(p, { replace: true });
  };

  if (isLoading) return <TableSkeleton />;

  const { onus, signal_stats, olts, pon_ports, total, total_pages } = data as AllOnusData;

  const totalPages = total_pages || 1;
  const currentPage = Math.min(page, totalPages);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const saveInlineEdit = (onuId: number, field: 'technician' | 'odp', value: number | null) => {
    const data: Record<string, unknown> = {};
    if (field === 'technician') data.technician_id = value ?? '';
    if (field === 'odp') data.odp_port_id = value ?? '';
    api.updateOnu(onuId, data).then(() => {
      queryClient.invalidateQueries({ queryKey: ['all-onus'] });
      toast.success(t('allOnus.updated'));
    }).catch(() => toast.error(t('allOnus.updateFailed')));
    setInlineEdit(null);
  };

  const openEdit = (onu: ONUData) => {
    setEditingOnu(onu);
    setEditName(onu.name || '');
    setEditDesc(onu.description || '');
    setEditType(onu.actual_type || '');
    setEditPppoe(onu.pppoe || '');
    setEditOnuId(onu.onu_id ?? '');
    setEditTechnicianId(onu.technician_id ?? null);
    setEditOdpPortId(onu.odp_port_id ?? null);
    setEditLatitude(onu.latitude != null ? String(onu.latitude) : '');
    setEditLongitude(onu.longitude != null ? String(onu.longitude) : '');
  };

  const saveEdit = () => {
    if (!editingOnu) return;
    updateMutation.mutate({
      id: editingOnu.id,
      data: {
        name: editName, description: editDesc, actual_type: editType, pppoe: editPppoe,
        ...(editOnuId !== '' ? { onu_id: String(editOnuId) } : {}),
        technician_id: editTechnicianId ?? '',
        odp_port_id: editOdpPortId ?? '',
        latitude: editLatitude || null,
        longitude: editLongitude || null,
      },
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('allOnus.title')}
        description={t('allOnus.subtitle', { count: total })}
        action={
          <>
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              onClick={() => {
                const params = new URLSearchParams();
                if (oltFilter !== 'all') params.set('olt', oltFilter);
                if (statusFilter !== 'all') params.set('status', statusFilter);
                if (signalFilter !== 'all') params.set('signal', signalFilter);
                if (ponFilter !== 'all') params.set('pon', ponFilter);
                else if (slotFilter !== 'all') params.set('pon', `slot/${slotFilter}`);
                if (debouncedSearch) params.set('search', debouncedSearch);
                if (sortBy) { params.set('sort_by', sortBy); params.set('sort_dir', sortDir); }
                const qs = params.toString();
                window.open(`/api/all-onus/export${qs ? '?' + qs : ''}`, '_blank');
              }}
            >
              <span className="hidden sm:inline">{t('allOnus.exportCsv')}</span><span className="sm:hidden">{t('allOnus.export')}</span>
            </Button>
            <Button
              variant="secondary"
              icon={<Satellite size={15} className={refreshSignalMutation.isPending ? 'animate-spin' : ''} />}
              onClick={() => olts.forEach(o => refreshSignalMutation.mutate(o.id))}
              disabled={refreshSignalMutation.isPending}
            >
              {refreshSignalMutation.isPending ? t('allOnus.refreshing') : t('allOnus.signal')}
            </Button>
            {hasPerm('settings_ip_olts') && (
              <Button
                variant="secondary"
                title={t('allOnus.linkPppoeTitle')}
                icon={<RefreshCw size={15} className={linkSyncMutation.isPending ? 'animate-spin' : ''} />}
                onClick={() => linkSyncMutation.mutate()}
                disabled={linkSyncMutation.isPending}
              >
                {linkSyncMutation.isPending ? t('dashboard.syncing') : t('allOnus.linkPppoe')}
              </Button>
            )}
            {hasPerm('settings_ip_olts') && (
              <Button
                variant="secondary"
                title={t('allOnus.matchMacTitle')}
                icon={<Fingerprint size={15} />}
                onClick={() => setShowMacMatch(true)}
              >
                {t('allOnus.matchMac')}
              </Button>
            )}
          </>
        }
      />

      {/* Signal Stats Cards — dynamic from RX color ranges */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 transition-opacity ${isFilterFetching ? 'opacity-40' : ''}`}>
        {rxColorRanges.map((r, i) => {
          const colorKey = r.color || 'gray';
          const stats = (signal_stats as Record<string, { count: number; pct: number; label?: string }>)[colorKey];
          const cardColor = RX_COLOR_TO_CARD[colorKey] || 'muted';
          const icons: Record<string, React.ReactNode> = {
            green: <CheckCircle2 size={18} />, yellow: <AlertTriangle size={18} />,
            red: <XCircle size={18} />, gray: <HelpCircle size={18} />,
          };
          return (
            <SignalCard key={i}
              icon={icons[colorKey] || <HelpCircle size={18} />}
              label={`${r.label || colorKey} ${r.min}~${r.max} dBm`}
              count={stats?.count ?? 0}
              pct={stats?.pct ?? 0}
              color={cardColor}
              active={signalFilter === colorKey}
              onClick={() => applySignalFilter(colorKey)}
            />
          );
        })}
        <SignalCard icon={<HelpCircle size={18} />} label={t('allOnus.losNa')}
          count={signal_stats.los + signal_stats.na} pct={signal_stats.na_pct} color="muted"
          active={signalFilter === 'los_na'}
          onClick={() => applySignalFilter('los_na')} />
      </div>

      {/* Status Summary Cards */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 transition-opacity ${isFilterFetching ? 'opacity-40' : ''}`}>
        <StatusCard icon={<Wifi size={16} />} label={t('dashboard.statTotalOnu')} count={signal_stats.total} color="accent"
          active={statusFilter === 'all'} onClick={() => applyStatusFilter('all')} />
        <StatusCard icon={<Wifi size={16} />} label={t('common.online')} count={signal_stats.online} color="success"
          active={statusFilter === 'online'} onClick={() => applyStatusFilter(statusFilter === 'online' ? 'all' : 'online')} />
        <StatusCard icon={<XCircle size={16} />} label={t('common.los')} count={signal_stats.los} color="danger"
          active={statusFilter === 'los'} onClick={() => applyStatusFilter(statusFilter === 'los' ? 'all' : 'los')} />
        <StatusCard icon={<AlertTriangle size={16} />} label={t('common.dyinggasp')} count={signal_stats.dyinggasp} color="warning"
          active={statusFilter === 'dyinggasp'} onClick={() => applyStatusFilter(statusFilter === 'dyinggasp' ? 'all' : 'dyinggasp')} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={t('allOnus.searchPlaceholder')}
        />

        <FilterBar>
          <div className="flex gap-1 p-1 rounded-xl bg-glass border border-brd overflow-x-auto max-w-full">
            <FilterBtn active={oltFilter === 'all'} onClick={() => { setOltFilter('all'); setPonFilter('all'); setSlotFilter('all'); }}>{t('common.all')}</FilterBtn>
            {olts.map(o => (
              <FilterBtn key={o.id} active={oltFilter === String(o.id)} onClick={() => { setOltFilter(String(o.id)); setPonFilter('all'); setSlotFilter('all'); }}>
                {o.name}
              </FilterBtn>
            ))}
          </div>

          {oltFilter !== 'all' && pon_ports.length > 0 && (
            <>
              <Select
                value={slotFilter}
                onChange={e => { setSlotFilter(e.target.value); setPonFilter('all'); setPage(1); }}
                aria-label={t('allOnus.allSlots')}
                className="w-auto flex-shrink-0"
                options={[
                  { value: 'all', label: t('allOnus.allSlots') },
                  ...pon_ports.map(s => ({ value: String(s.slot), label: `Slot ${s.slot}${s.card_type ? ` (${s.card_type})` : ''}` })),
                ]}
              />

              {slotFilter !== 'all' && (() => {
                const slotGroup = pon_ports.find(s => String(s.slot) === slotFilter);
                if (!slotGroup) return null;
                return (
                  <Select
                    value={ponFilter}
                    onChange={e => { setPonFilter(e.target.value); setPage(1); }}
                    aria-label={t('allOnus.allPon')}
                    className="w-auto flex-shrink-0"
                    options={[
                      { value: 'all', label: t('allOnus.allPon') },
                      ...slotGroup.ports.map(p => ({ value: p.value, label: p.label })),
                    ]}
                  />
                );
              })()}
            </>
          )}

          <Select
            value={statusFilter}
            onChange={e => applyStatusFilter(e.target.value)}
            aria-label={t('allOnus.allStatus')}
            className="w-auto flex-shrink-0"
            options={[
              { value: 'all', label: t('allOnus.allStatus') },
              { value: 'online', label: t('common.online') },
              { value: 'offline', label: t('common.offline') },
              { value: 'los', label: t('common.los') },
              { value: 'dyinggasp', label: t('common.dyinggasp') },
            ]}
          />
          {isFilterFetching && (
            <span className="text-xs text-tx3 animate-pulse">{t('common.loading')}</span>
          )}
        </FilterBar>
      </div>

      {/* Table */}
      <Card
        bodyClassName="p-0"
        className={cn('overflow-hidden transition-opacity', isFilterFetching && 'opacity-40')}
      >
        <div className="overflow-x-auto">
          {/* Desktop table */}
          <table className="hidden md:table w-full">
            <thead>
              <tr className="border-b border-brd bg-glass/50">
                <SortTh col="olt" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{t('allOnus.colOlt')}</SortTh>
                <SortTh col="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{t('allOnus.colName')}</SortTh>
                <SortTh col="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{t('allOnus.colStatus')}</SortTh>
                <SortTh col="rx_onu" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{t('allOnus.colRxOnu')}</SortTh>
                <SortTh col="sn" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{t('allOnus.colSn')}</SortTh>
                <SortTh col="type" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{t('allOnus.colType')}</SortTh>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-tx3 uppercase tracking-wider">{t('allOnus.colDistance')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-tx3 uppercase tracking-wider">{t('allOnus.colTechnician')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-tx3 uppercase tracking-wider">{t('allOnus.colOdp')}</th>
                <SortTh col="onu_id" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{t('allOnus.colId')}</SortTh>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-tx3 uppercase tracking-wider">{t('allOnus.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {onus.length === 0 && (
                <tr><td colSpan={11}>
                  <EmptyState
                    icon={Radio}
                    title={t('allOnus.noOnus')}
                    description={olts.length === 0 ? t('allOnus.noOnusNoOlt') : t('allOnus.noOnusFilter')}
                  />
                </td></tr>
              )}
              {onus.map((onu) => (
                <tr
                  key={onu.id}
                  className="border-b border-brd/50 hover:bg-glass/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm text-tx2">{onu.olt_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-tx1">{onu.name || '-'}</div>
                    {onu.description && <div className="text-xs text-tx3 mt-0.5">{onu.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={onu.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PowerBadge value={onu.status === 'online' ? onu.onu_rx_power : null} ranges={rxColorRanges} />
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-sm font-mono text-tx2">{formatSn(onu.serial_number)}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-tx2">{onu.actual_type || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {onu.distance != null ? (
                      <span className="text-sm font-mono text-tx2">{onu.distance} m</span>
                    ) : <span className="text-sm text-tx3">-</span>}
                  </td>
                  <td className="px-4 py-3 cursor-pointer hover:bg-accent/5" onClick={() => setInlineEdit({ onuId: onu.id, field: 'technician' })}>
                    {inlineEdit?.onuId === onu.id && inlineEdit.field === 'technician' ? (
                      <select
                        value={onu.technician_id ?? ''}
                        onChange={e => { e.stopPropagation(); saveInlineEdit(onu.id, 'technician', e.target.value ? Number(e.target.value) : null); }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        className="w-full h-8 px-2 rounded-lg bg-glass border border-accent/50 text-sm text-tx1 focus:outline-none"
                      >
                        <option value="">{t('allOnus.noTechnician')}</option>
                        {technicians.map(t => (
                          <option key={t.id} value={t.id}>{t.full_name}{t.phone ? ` (${t.phone})` : ''}</option>
                        ))}
                      </select>
                    ) : onu.technician_name ? (
                      <div className="flex items-center gap-1.5">
                        <Wrench size={12} className="text-accent flex-shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-tx2">{onu.technician_name}</div>
                          {onu.technician_phone && <div className="text-xs text-tx3">{onu.technician_phone}</div>}
                        </div>
                      </div>
                    ) : <span className="text-sm text-tx3 italic">{t('allOnus.assign')}</span>}
                  </td>
                  <td className="px-4 py-3 cursor-pointer hover:bg-accent/5" onClick={() => setInlineEdit({ onuId: onu.id, field: 'odp' })}>
                    {inlineEdit?.onuId === onu.id && inlineEdit.field === 'odp' ? (
                      <select
                        value={onu.odp_port_id ?? ''}
                        onChange={e => { e.stopPropagation(); saveInlineEdit(onu.id, 'odp', e.target.value ? Number(e.target.value) : null); }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        className="w-full h-8 px-2 rounded-lg bg-glass border border-accent/50 text-sm text-tx1 focus:outline-none"
                      >
                        <option value="">{t('allOnus.noOdp')}</option>
                        {odpPorts.map(p => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    ) : onu.odp_name ? (
                      <div className="flex items-center gap-1">
                        <Split size={12} className="text-accent" />
                        <div>
                          <div className="text-sm font-medium text-tx2">{onu.odp_name}</div>
                          <div className="text-xs text-tx3">Port {onu.odp_port_number}</div>
                        </div>
                      </div>
                    ) : <span className="text-sm text-tx3 italic">{t('allOnus.assign')}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-sm font-mono text-accent">{onu.onu_id_str}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ActionBtn icon={<Eye size={14} />} title={t('common.view')} onClick={() => navigate(`/dashboard/onus/${onu.id}`)} />
                      {hasPerm('edit_onu_name') && <ActionBtn icon={<Edit3 size={14} />} title={t('common.edit')} onClick={() => openEdit(onu)} />}
                      {hasPerm('delete_onu') && <ActionBtn icon={<Trash2 size={14} />} title={t('common.delete')} danger
                        onClick={() => deleteMutation.mutate(onu.id)} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brd/50">
            {onus.length === 0 && (
              <EmptyState
                icon={Radio}
                title={t('allOnus.noOnus')}
                description={olts.length === 0 ? t('allOnus.noOnusNoOlt') : t('allOnus.noOnusFilter')}
              />
            )}
            {onus.map((onu) => (
              <div key={onu.id} className="p-4">
                {/* Top row: name + status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-tx1 truncate">{onu.name || '-'}</div>
                    <div className="text-xs text-tx3 mt-0.5 flex items-center gap-2">
                      <span>{onu.olt_name}</span>
                      <code className="font-mono text-accent">{onu.onu_id_str}</code>
                    </div>
                  </div>
                  <StatusBadge status={onu.status} />
                </div>
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-tx3">{t('allOnus.colRxOnu')}:</span>{' '}
                    {onu.status === 'online' && onu.onu_rx_power !== null ? (
                      <span className={cn('font-mono font-medium', getRxColorClass(onu.onu_rx_power, rxColorRanges))}>{onu.onu_rx_power.toFixed(2)} dBm</span>
                    ) : <span className="text-tx3">N/A</span>}
                  </div>
                  <div>
                    <span className="text-tx3">{t('allOnus.colSn')}:</span>{' '}
                    <code className="font-mono text-tx2">{formatSn(onu.serial_number)}</code>
                  </div>
                  <div>
                    <span className="text-tx3">{t('allOnus.colType')}:</span>{' '}
                    <span className="text-tx2">{onu.actual_type || '-'}</span>
                  </div>
                  <div>
                    <span className="text-tx3">{t('allOnus.colDistance')}:</span>{' '}
                    {onu.distance != null ? (
                      <span className="font-mono text-tx2">{onu.distance} m</span>
                    ) : <span className="text-tx3">-</span>}
                  </div>
                  {onu.technician_name && (
                    <div className="col-span-2">
                      <span className="text-tx3">{t('allOnus.colTechnician')}:</span>{' '}
                      <span className="text-tx2 flex items-center gap-1 inline-flex"><Wrench size={10} className="text-accent" /> {onu.technician_name}{onu.technician_phone ? ` (${onu.technician_phone})` : ''}</span>
                    </div>
                  )}
                  {onu.odp_name && (
                    <div className="col-span-2">
                      <span className="text-tx3">{t('allOnus.colOdp')}:</span>{' '}
                      <span className="text-tx2 flex items-center gap-1 inline-flex"><Split size={10} className="text-accent" /> {onu.odp_name} (Port {onu.odp_port_number})</span>
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-brd/30">
                  <button onClick={() => navigate(`/dashboard/onus/${onu.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors">
                    <Eye size={14} /> {t('common.view')}
                  </button>
                  {hasPerm('edit_onu_name') && <button onClick={() => openEdit(onu)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors">
                    <Edit3 size={14} /> {t('common.edit')}
                  </button>}
                  {hasPerm('delete_onu') && <button onClick={() => deleteMutation.mutate(onu.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-danger transition-colors ml-auto">
                    <Trash2 size={14} />
                  </button>}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Pagination */}
        <div className="px-3 py-3 md:px-4 border-t border-brd flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 md:gap-3 text-xs text-tx3">
            <span className="hidden sm:inline">{t('common.showing', { from: (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, total), total })}</span>
            <span className="sm:hidden">{currentPage}/{totalPages}</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-7 px-2 rounded-lg bg-glass border border-brd text-xs text-tx1 focus:outline-none"
            >
              <option value={10}>{t('common.perPage', { count: 10 })}</option>
              <option value={20}>{t('common.perPage', { count: 20 })}</option>
              <option value={50}>{t('common.perPage', { count: 50 })}</option>
              <option value={100}>{t('common.perPage', { count: 100 })}</option>
            </select>
            {isFetching && <span className="text-accent">{t('common.updating')}</span>}
          </div>
          <div className="flex items-center gap-1">
            <PaginationBtn
              label="<<"
              disabled={currentPage === 1}
              onClick={() => setPage(1)}
            />
            <PaginationBtn
              label="<"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            />
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => {
                if (totalPages <= 7) return true;
                if (p === 1 || p === totalPages) return true;
                if (Math.abs(p - currentPage) <= 1) return true;
                return false;
              })
              .reduce<(number | string)[]>((acc, p, i, arr) => {
                if (i > 0 && typeof arr[i - 1] === 'number' && p - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                typeof p === 'string' ? (
                  <span key={`dots-${i}`} className="px-2 text-xs text-tx3">{p}</span>
                ) : (
                  <PaginationBtn
                    key={p}
                    label={String(p)}
                    active={p === currentPage}
                    onClick={() => setPage(p)}
                  />
                )
              )}
            <PaginationBtn
              label={">"}
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            />
            <PaginationBtn
              label=">>"
              disabled={currentPage === totalPages}
              onClick={() => setPage(totalPages)}
            />
          </div>
        </div>
      </Card>

      {/* Edit Modal */}
      <Modal
        open={!!editingOnu}
        onClose={() => setEditingOnu(null)}
        title={t('allOnus.editOnu')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingOnu(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={saveEdit} loading={updateMutation.isPending}>
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        {editingOnu && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-mono font-semibold border border-accent/20">{editingOnu.onu_id_str}</span>
              <span className="text-xs text-tx3">{editingOnu.serial_number}</span>
            </div>
            <div className="space-y-4">
              <Input label={t('common.name')} value={editName} onChange={e => setEditName(e.target.value)} />
              <Input label={t('common.description')} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
              <Input
                type="number" min={1} max={128}
                label={<>ONU ID <span className="text-tx3 font-normal text-xs">{t('allOnus.onuIdNote')}</span></>}
                value={editOnuId}
                onChange={e => setEditOnuId(e.target.value === '' ? '' : Number(e.target.value))}
              />
              <Input label={t('allOnus.pppoeUser')} value={editPppoe} onChange={e => setEditPppoe(e.target.value)} placeholder="e.g. user@isp" />
              <Input label={t('allOnus.actualType')} value={editType} onChange={e => setEditType(e.target.value)} placeholder="e.g. F670LV9.0" />
              {technicians.length > 0 && (
                <Select
                  label={<><Wrench size={12} className="inline mr-1.5" />{t('allOnus.technician')}</>}
                  value={editTechnicianId ?? ''}
                  onChange={e => setEditTechnicianId(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: '', label: t('allOnus.noTechnician') },
                    ...technicians.map(t => ({ value: String(t.id), label: `${t.full_name}${t.phone ? ` (${t.phone})` : ''}` })),
                  ]}
                />
              )}
              {odpPorts.length > 0 && (
                <Select
                  label={<><Split size={12} className="inline mr-1.5" />{t('allOnus.odpPort')}</>}
                  value={editOdpPortId ?? ''}
                  onChange={e => setEditOdpPortId(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: '', label: t('allOnus.noOdp') },
                    ...odpPorts.map(p => ({ value: String(p.id), label: p.label })),
                  ]}
                />
              )}
              {/* Location Picker */}
              <div className="border-t border-brd pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-tx2 flex items-center gap-1.5"><MapPin size={14} /> {t('allOnus.onuLocation')}</label>
                  <button type="button" onClick={() => setShowMap(s => !s)}
                    className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
                    <MapPin size={12} /> {showMap ? t('allOnus.hideMap') : t('allOnus.showMap')}
                  </button>
                </div>
                <LocationPicker
                  latitude={editLatitude}
                  longitude={editLongitude}
                  onChange={(lat: string, lng: string) => { setEditLatitude(lat); setEditLongitude(lng); }}
                />
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* MAC Match Modal — cocokkan MAC ONU (non-ZTE) dengan caller-id sesi PPPoE aktif */}
      <Modal
        open={showMacMatch}
        onClose={() => setShowMacMatch(false)}
        title={t('allOnus.macMatchModal')}
        icon={<Fingerprint size={16} />}
        size="xl"
      >
        <MacMatchPanel onApply={handleMacApply} applying={macMatchMutation.isPending} />
      </Modal>
    </PageContainer>
  );
}

/* ─── Sub-components ─── */

function SignalCard({ icon, label, count, pct, color, active, onClick }: {
  icon: React.ReactNode; label: string; count: number; pct: number; color: string;
  active?: boolean; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    success: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    danger: 'border-danger/20 bg-danger/5',
    muted: 'border-offline/20 bg-offline/5',
  };
  const textColors: Record<string, string> = {
    success: 'text-success', warning: 'text-warning', danger: 'text-danger', muted: 'text-tx3',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'glass-card p-4 border text-left transition-all',
        colors[color],
        onClick && 'cursor-pointer hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        active && 'ring-2 ring-accent/70 border-accent/50',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={textColors[color]}>{icon}</span>
        <span className="text-xs text-tx3">{label}</span>
      </div>
      <div className="flex items-end justify-between mb-2">
        <span className={cn('text-2xl font-bold', textColors[color])}>{pct}%</span>
        <span className="text-sm text-tx3">{count} ONU{count !== 1 ? 's' : ''}</span>
      </div>
    </button>
  );
}

function StatusCard({ icon, label, count, color, active, onClick }: {
  icon: React.ReactNode; label: string; count: number; color: string;
  active?: boolean; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    success: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    danger: 'border-danger/20 bg-danger/5',
    accent: 'border-accent/20 bg-accent/5',
  };
  const textColors: Record<string, string> = {
    success: 'text-success', warning: 'text-warning', danger: 'text-danger', accent: 'text-accent',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'glass-card p-3 border flex items-center gap-3 text-left transition-all',
        colors[color],
        onClick && 'cursor-pointer hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        active && 'ring-2 ring-accent/70 border-accent/50',
      )}
    >
      <span className={textColors[color]}>{icon}</span>
      <div className="flex flex-col">
        <span className={cn('text-lg font-bold', textColors[color])}>{count}</span>
        <span className="text-xs text-tx3">{label}</span>
      </div>
    </button>
  );
}

const RX_COLOR_TO_CARD: Record<string, string> = {
  green: 'success', yellow: 'warning', red: 'danger',
  blue: 'info', purple: 'info', orange: 'warning', gray: 'muted',
};

const RX_COLOR_MAP: Record<string, string> = {
  green: 'bg-success/10 text-success',
  yellow: 'bg-warning/10 text-warning',
  red: 'bg-danger/10 text-danger',
  blue: 'bg-rx-blue/10 text-rx-blue',
  purple: 'bg-rx-purple/10 text-rx-purple',
  orange: 'bg-rx-orange/10 text-rx-orange',
  gray: 'bg-rx-gray/10 text-rx-gray',
};

const RX_TEXT_COLOR_MAP: Record<string, string> = {
  green: 'text-success',
  yellow: 'text-warning',
  red: 'text-danger',
  blue: 'text-rx-blue',
  purple: 'text-rx-purple',
  orange: 'text-rx-orange',
  gray: 'text-rx-gray',
};

function getRxColorClass(value: number, ranges: RxColorRange[]): string {
  for (const r of ranges) {
    if (value >= r.min && value < r.max) {
      return RX_TEXT_COLOR_MAP[r.color] || RX_TEXT_COLOR_MAP.red;
    }
  }
  // Fallback: last range
  const last = ranges[ranges.length - 1];
  return last ? (RX_TEXT_COLOR_MAP[last.color] || RX_TEXT_COLOR_MAP.red) : RX_TEXT_COLOR_MAP.red;
}

function PowerBadge({ value, ranges }: { value: number | null; ranges: RxColorRange[] }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-tx3">N/A</span>;
  }
  let colorClass = RX_COLOR_MAP.red;
  for (const r of ranges) {
    if (value >= r.min && value < r.max) {
      colorClass = RX_COLOR_MAP[r.color] || RX_COLOR_MAP.red;
      break;
    }
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-mono font-medium', colorClass)}>
      {value.toFixed(2)} dBm
    </span>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        active ? 'bg-accent text-white' : 'text-tx2 hover:text-tx1 hover:bg-glass',
      )}
    >
      {children}
    </button>
  );
}

function ActionBtn({ icon, title, onClick, danger }: {
  icon: React.ReactNode; title: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-lg transition-colors',
        danger ? 'hover:bg-danger/15 text-tx3 hover:text-danger' : 'hover:bg-glass text-tx3 hover:text-tx1',
      )}
    >
      {icon}
    </button>
  );
}

function PaginationBtn({ label, onClick, disabled, active }: {
  label: string; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium transition-all',
        active ? 'bg-accent text-white' : 'bg-glass border border-brd text-tx2 hover:text-tx1 hover:border-accent/30',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {label}
    </button>
  );
}


function TableSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-glass rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="glass-card p-4 h-24" />)}
      </div>
      <div className="glass-card h-96" />
    </div>
  );
}

function SortTh({ col, sortBy, sortDir, onSort, children }: {
  col: string; sortBy: string; sortDir: 'asc' | 'desc'; onSort: (col: string) => void; children: React.ReactNode;
}) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-4 py-3 text-left text-[11px] font-semibold text-tx3 uppercase tracking-wider cursor-pointer hover:text-tx1 select-none transition-colors"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span className="text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function MacMatchPanel({ onApply, applying }: {
  onApply: (pairs: { onu_id: number; name: string }[]) => void;
  applying: boolean;
}) {
  const { t } = useTranslation();
  // '0'..'3' = buang N oktet terakhir (awalan); 'o4' = selisih nilai MAC ±4
  const [mode, setMode] = useState('0');
  const [scanning, setScanning] = useState(false);
  const [data, setData] = useState<{
    matches: MacMatchResult[]; collisions: number; sessions: number;
    onus_scanned: number; device_errors: string[];
  } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const scan = async (m: string) => {
    setScanning(true); setData(null); setSelected(new Set());
    try {
      const d = m.startsWith('o') ? await api.mikrotikMacMatch(0, Number(m.slice(1)))
        : await api.mikrotikMacMatch(Number(m));
      setData(d);
      setSelected(new Set(d.matches.filter(m => !m.collision).map(m => m.onu_id)));
      if (!d.matches.length) toast.info(t('macMatch.noMatch'));
    } catch (e) {
      toast.error((e as Error).message || t('macMatch.scanFailed'));
    } finally { setScanning(false); }
  };

  const toggle = (id: number) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const rows = data?.matches || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select
            label={t('macMatch.stripLabel')}
            value={mode}
            onChange={e => setMode(e.target.value)}
            options={[
              { value: '0', label: t('macMatch.stripExact') },
              { value: 'o1', label: t('macMatch.offset', { n: 1 }) },
              { value: 'o2', label: t('macMatch.offset', { n: 2 }) },
              { value: 'o4', label: t('macMatch.offset', { n: 4 }) },
              { value: 'o8', label: t('macMatch.offset', { n: 8 }) },
              { value: 'o16', label: t('macMatch.offset', { n: 16 }) },
              { value: '1', label: t('macMatch.strip1') },
              { value: '2', label: t('macMatch.strip2') },
              { value: '3', label: t('macMatch.strip3') },
            ]}
          />
        </div>
        <Button variant="primary" icon={<RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />}
          onClick={() => scan(mode)} disabled={scanning || applying}>
          {scanning ? t('macMatch.scanning') : t('macMatch.scan')}
        </Button>
        {data && (
          <Button variant="primary" disabled={!selected.size || applying}
            onClick={() => onApply(rows.filter(r => selected.has(r.onu_id)).map(r => ({ onu_id: r.onu_id, name: r.session_name })))}>
            {applying ? t('macMatch.applying') : t('macMatch.applySelected', { count: selected.size })}
          </Button>
        )}
      </div>

      {data && (
        <p className="text-xs text-tx3">
          {t('macMatch.summary', { sessions: data.sessions, onus: data.onus_scanned, match: rows.length })}
          {data.collisions > 0 && <span className="text-warning">{t('macMatch.collisions', { count: data.collisions })}</span>}
        </p>
      )}
      {data?.device_errors?.length ? (
        <p className="text-xs text-danger">{data.device_errors.join(' · ')}</p>
      ) : null}

      {rows.length > 0 && (
        <div className="max-h-80 overflow-y-auto border border-line rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface2">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2 text-left">{t('macMatch.colUsername')}</th>
                <th className="px-3 py-2 text-left">Caller-ID</th>
                <th className="px-3 py-2 text-left">{t('macMatch.colOnu')}</th>
                <th className="px-3 py-2 text-left">{t('macMatch.colMac')}</th>
                <th className="px-3 py-2 text-left">{t('macMatch.colMatch')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.onu_id}-${r.session_name}`}
                  className={cn('border-t border-line/50', r.collision && 'opacity-50')}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(r.onu_id)} disabled={r.collision}
                      onChange={() => toggle(r.onu_id)} className="accent-accent" />
                  </td>
                  <td className="px-3 py-2 font-medium text-tx1">{r.session_name}
                    <span className="block text-tx3 font-normal">{r.address} · {r.device}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-tx2">{r.caller_id}</td>
                  <td className="px-3 py-2 text-tx2">{r.onu_index}
                    <span className="block text-tx3">{r.onu_name || '—'}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-tx2">{r.serial}</td>
                  <td className="px-3 py-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase',
                      r.match === 'exact' ? 'bg-success/15 text-success'
                        : r.collision ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning')}>
                      {r.collision ? t('macMatch.ambiguous') : r.match}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-tx3 leading-relaxed">
        {t('macMatch.note')}
      </p>
      <p className="text-[11px] text-tx3 leading-relaxed">
        {t('macMatch.offsetNote')}
      </p>
    </div>
  );
}
