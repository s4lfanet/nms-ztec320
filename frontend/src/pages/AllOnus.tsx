import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type ONUData, type AllOnusData, type TechnicianData, type RxColorRange } from '../lib/api';
import { cn, formatSn } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import {
  Search, Eye, Edit3, Trash2,
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, Wifi, WifiOff,
  Satellite, Download, Split, Radio, Wrench, MapPin
} from 'lucide-react';
import { useHasPerm } from '../hooks/useHasPerm';
import { useWebSocket } from '../hooks/useWebSocket';
import { LocationPicker } from '../components/LocationPicker';

export function AllOnus() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasPerm = useHasPerm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [oltFilter, setOltFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('filter') || 'all');
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
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Debounce search — only trigger API after 400ms idle
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['all-onus', oltFilter, statusFilter, ponFilter, slotFilter, debouncedSearch, page, pageSize, sortBy, sortDir],
    queryFn: () => api.allOnus({ olt: oltFilter, status: statusFilter, pon: ponFilter !== 'all' ? ponFilter : (slotFilter !== 'all' ? `slot/${slotFilter}` : 'all'), search: debouncedSearch, page, page_size: pageSize, sort_by: sortBy || undefined, sort_dir: sortDir }),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  // Track if we're fetching with changed filters (not just background refetch)
  const isFilterFetching = isFetching && !isLoading;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.updateOnu(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-onus'] }); setEditingOnu(null); toast.success('ONU updated!'); },
    onError: () => toast.error('Failed to update ONU'),
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
  // Flatten ODP ports from tree (guard against non-array response)
  const odpPorts: Array<{ id: number; label: string }> = [];
  const treeArr = Array.isArray(odpTreeData) ? odpTreeData : (odpTreeData?.tree || []);
  for (const otb of treeArr) {
    for (const odc of otb.odcs || []) {
      for (const odp of odc.odps || []) {
        for (const port of odp.ports || []) {
          if (port.status === 'available' || port.id === editOdpPortId) {
            odpPorts.push({ id: port.id, label: `${odp.name} — Port ${port.port_number}` });
          }
        }
      }
    }
  }

  // WebSocket listener — real-time updates: auto-refresh ONU list on alert, status change, or sync complete
  const { lastMessage: alertWsMsg } = useWebSocket('/ws/dashboard', { reconnect: true });
  useEffect(() => {
    if (alertWsMsg && (alertWsMsg.event === 'alert' || alertWsMsg.event === 'onu_change' || alertWsMsg.event === 'sync_complete')) {
      queryClient.invalidateQueries({ queryKey: ['all-onus'] });
    }
  }, [alertWsMsg, queryClient]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const onu = onus.find(o => o.id === id);
      const ok = await confirm({ title: 'Delete ONU', message: `Delete ONU "${onu?.name || id}"? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' });
      if (!ok) throw new Error('cancelled');
      return api.deleteOnu(id);
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['all-onus'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['olts'] });
      toast.success(d.message || 'ONU deleted. Auto-syncing OLT...');
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
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error('Delete failed'); },
  });

  const refreshSignalMutation = useMutation({
    mutationFn: (oltId: number) => api.refreshSignal(oltId),
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['all-onus'] }); toast.success(`Signal refreshed! ${d.updated}/${d.total} ONUs updated`); },
    onError: () => toast.error('Signal refresh failed'),
  });

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [oltFilter, statusFilter, slotFilter, ponFilter, debouncedSearch, pageSize]);

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
      toast.success('Updated!');
    }).catch(() => toast.error('Failed to update'));
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
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">All ONUs</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">{total} optical network units</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (oltFilter !== 'all') params.set('olt', oltFilter);
              if (statusFilter !== 'all') params.set('status', statusFilter);
              if (ponFilter !== 'all') params.set('pon', ponFilter);
              else if (slotFilter !== 'all') params.set('pon', `slot/${slotFilter}`);
              if (debouncedSearch) params.set('search', debouncedSearch);
              if (sortBy) { params.set('sort_by', sortBy); params.set('sort_dir', sortDir); }
              const qs = params.toString();
              window.open(`/api/all-onus/export${qs ? '?' + qs : ''}`, '_blank');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-glass border border-brd hover:border-accent/30 text-xs md:text-sm transition-all"
          >
            <Download size={15} /> <span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">Export</span>
          </button>
          <button
            onClick={() => olts.forEach(o => refreshSignalMutation.mutate(o.id))}
            disabled={refreshSignalMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-glass border border-brd hover:border-accent/30 text-xs md:text-sm transition-all disabled:opacity-50"
          >
            <Satellite size={15} className={refreshSignalMutation.isPending ? 'animate-spin' : ''} />
            {refreshSignalMutation.isPending ? 'Refreshing...' : 'Signal'}
          </button>
        </div>
      </div>

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
            />
          );
        })}
        <SignalCard icon={<HelpCircle size={18} />} label="LOS / N/A"
          count={signal_stats.los + signal_stats.na} pct={signal_stats.na_pct} color="muted" />
      </div>

      {/* Status Summary Cards */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 transition-opacity ${isFilterFetching ? 'opacity-40' : ''}`}>
        <StatusCard icon={<Wifi size={16} />} label="Total ONU" count={signal_stats.total} color="accent" />
        <StatusCard icon={<Wifi size={16} />} label="Online" count={signal_stats.online} color="success" />
        <StatusCard icon={<XCircle size={16} />} label="LOS" count={signal_stats.los} color="danger" />
        <StatusCard icon={<AlertTriangle size={16} />} label="DyingGasp" count={signal_stats.dyinggasp} color="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari: Name, OLT, SN, PPPoE, Type..."
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-glass border border-brd text-sm text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 p-1 rounded-xl bg-glass border border-brd overflow-x-auto max-w-full">
            <FilterBtn active={oltFilter === 'all'} onClick={() => { setOltFilter('all'); setPonFilter('all'); setSlotFilter('all'); }}>All</FilterBtn>
            {olts.map(o => (
              <FilterBtn key={o.id} active={oltFilter === String(o.id)} onClick={() => { setOltFilter(String(o.id)); setPonFilter('all'); setSlotFilter('all'); }}>
                {o.name}
              </FilterBtn>
            ))}
          </div>

          {oltFilter !== 'all' && pon_ports.length > 0 && (
            <>
              <select
                value={slotFilter}
                onChange={e => { setSlotFilter(e.target.value); setPonFilter('all'); setPage(1); }}
                className="h-10 px-3 rounded-xl bg-glass border border-brd text-sm text-tx1 focus:outline-none focus:border-accent/50 flex-shrink-0"
              >
                <option value="all">All Slots</option>
                {pon_ports.map(s => (
                  <option key={s.slot} value={String(s.slot)}>
                    Slot {s.slot}{s.card_type ? ` (${s.card_type})` : ''}
                  </option>
                ))}
              </select>

              {slotFilter !== 'all' && (() => {
                const slotGroup = pon_ports.find(s => String(s.slot) === slotFilter);
                if (!slotGroup) return null;
                return (
                  <select
                    value={ponFilter}
                    onChange={e => { setPonFilter(e.target.value); setPage(1); }}
                    className="h-10 px-3 rounded-xl bg-glass border border-brd text-sm text-tx1 focus:outline-none focus:border-accent/50 flex-shrink-0"
                  >
                    <option value="all">All PON</option>
                    {slotGroup.ports.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                );
              })()}
            </>
          )}

          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); const p = new URLSearchParams(searchParams); if (e.target.value === 'all') p.delete('filter'); else p.set('filter', e.target.value); setSearchParams(p, { replace: true }); }}
            className="h-10 px-3 rounded-xl bg-glass border border-brd text-sm text-tx1 focus:outline-none focus:border-accent/50 flex-shrink-0"
          >
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="los">LOS</option>
          <option value="dyinggasp">DyingGasp</option>
        </select>
        {isFilterFetching && (
          <span className="text-xs text-tx3 animate-pulse">Loading...</span>
        )}
        </div>
      </div>

      {/* Table */}
      <div className={`glass-card overflow-hidden transition-opacity ${isFilterFetching ? 'opacity-40' : ''}`}>
        <div className="overflow-x-auto">
          {/* Desktop table */}
          <table className="hidden md:table w-full">
            <thead>
              <tr className="border-b border-brd bg-glass/50">
                <SortTh col="olt" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>OLT</SortTh>
                <SortTh col="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Name</SortTh>
                <SortTh col="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Status</SortTh>
                <SortTh col="rx_onu" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>RX ONU</SortTh>
                <SortTh col="sn" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>SN/MAC</SortTh>
                <SortTh col="type" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Type</SortTh>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-tx3 uppercase tracking-wider">Distance</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-tx3 uppercase tracking-wider">Technician</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-tx3 uppercase tracking-wider">ODP</th>
                <SortTh col="onu_id" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>ID</SortTh>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-tx3 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {onus.length === 0 && (
                <tr><td colSpan={11} className="text-center py-12 text-tx3">
                  <Radio size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No ONUs found</p>
                  <p className="text-xs mt-1">{olts.length === 0 ? 'Add an OLT and sync to get started' : 'Sync your OLT or adjust filters'}</p>
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
                        <option value="">— None —</option>
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
                    ) : <span className="text-sm text-tx3 italic">+ assign</span>}
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
                        <option value="">— None —</option>
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
                    ) : <span className="text-sm text-tx3 italic">+ assign</span>}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-sm font-mono text-accent">{onu.onu_id_str}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ActionBtn icon={<Eye size={14} />} title="View" onClick={() => navigate(`/dashboard/onus/${onu.id}`)} />
                      {hasPerm('edit_onu_name') && <ActionBtn icon={<Edit3 size={14} />} title="Edit" onClick={() => openEdit(onu)} />}
                      {hasPerm('delete_onu') && <ActionBtn icon={<Trash2 size={14} />} title="Delete" danger
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
              <div className="text-center py-12 text-tx3">
                <Radio size={40} className="mx-auto mb-3 opacity-30" />
                <p>No ONUs found</p>
                <p className="text-xs mt-1">{olts.length === 0 ? 'Add an OLT and sync to get started' : 'Sync your OLT or adjust filters'}</p>
              </div>
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
                    <span className="text-tx3">RX ONU:</span>{' '}
                    {onu.status === 'online' && onu.onu_rx_power !== null ? (
                      <span className={cn('font-mono font-medium', getRxColorClass(onu.onu_rx_power, rxColorRanges))}>{onu.onu_rx_power.toFixed(2)} dBm</span>
                    ) : <span className="text-tx3">N/A</span>}
                  </div>
                  <div>
                    <span className="text-tx3">SN/MAC:</span>{' '}
                    <code className="font-mono text-tx2">{formatSn(onu.serial_number)}</code>
                  </div>
                  <div>
                    <span className="text-tx3">Type:</span>{' '}
                    <span className="text-tx2">{onu.actual_type || '-'}</span>
                  </div>
                  <div>
                    <span className="text-tx3">Distance:</span>{' '}
                    {onu.distance != null ? (
                      <span className="font-mono text-tx2">{onu.distance} m</span>
                    ) : <span className="text-tx3">-</span>}
                  </div>
                  {onu.technician_name && (
                    <div className="col-span-2">
                      <span className="text-tx3">Technician:</span>{' '}
                      <span className="text-tx2 flex items-center gap-1 inline-flex"><Wrench size={10} className="text-accent" /> {onu.technician_name}{onu.technician_phone ? ` (${onu.technician_phone})` : ''}</span>
                    </div>
                  )}
                  {onu.odp_name && (
                    <div className="col-span-2">
                      <span className="text-tx3">ODP:</span>{' '}
                      <span className="text-tx2 flex items-center gap-1 inline-flex"><Split size={10} className="text-accent" /> {onu.odp_name} (Port {onu.odp_port_number})</span>
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-brd/30">
                  <button onClick={() => navigate(`/dashboard/onus/${onu.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors">
                    <Eye size={14} /> View
                  </button>
                  {hasPerm('edit_onu_name') && <button onClick={() => openEdit(onu)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors">
                    <Edit3 size={14} /> Edit
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
            <span className="hidden sm:inline">Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, total)} of {total}</span>
            <span className="sm:hidden">{currentPage}/{totalPages}</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-7 px-2 rounded-lg bg-glass border border-brd text-xs text-tx1 focus:outline-none"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            {isFetching && <span className="text-accent">Updating...</span>}
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
      </div>

      {/* Edit Modal */}
      {editingOnu && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="modal-overlay" onClick={() => setEditingOnu(null)} />
          <div className="relative glass-card p-4 md:p-6 w-full max-w-md rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in max-h-[90vh] overflow-y-auto">
            <h3 className="text-base md:text-lg font-semibold mb-1">Edit ONU</h3>
            {editingOnu && (
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-mono font-semibold border border-accent/20">{editingOnu.onu_id_str}</span>
                <span className="text-xs text-tx3">{editingOnu.serial_number}</span>
              </div>
            )}
            <div className="space-y-4">
              <InputField label="Name" value={editName} onChange={setEditName} />
              <InputField label="Description" value={editDesc} onChange={setEditDesc} />
              <div>
                <label className="block text-sm font-medium text-tx2 mb-1.5">ONU ID <span className="text-tx3 font-normal text-xs">(1–128, updates DB only)</span></label>
                <input
                  type="number" min={1} max={128}
                  value={editOnuId}
                  onChange={e => setEditOnuId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full h-10 px-4 rounded-xl bg-glass border border-brd text-sm text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
              <InputField label="PPPoE Username" value={editPppoe} onChange={setEditPppoe} placeholder="e.g. user@isp" />
              <InputField label="Actual Type (Model)" value={editType} onChange={setEditType} placeholder="e.g. F670LV9.0" />
              {technicians.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-tx2 mb-1.5 flex items-center gap-1.5"><Wrench size={12} /> Teknisi Lapangan</label>
                  <select value={editTechnicianId ?? ''} onChange={e => setEditTechnicianId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-10 px-4 rounded-xl bg-glass border border-brd text-sm text-tx1 focus:outline-none focus:border-accent/50 transition-colors">
                    <option value="">— Tidak ada teknisi —</option>
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name}{t.phone ? ` (${t.phone})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {odpPorts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-tx2 mb-1.5 flex items-center gap-1.5"><Split size={12} /> ODP Port</label>
                  <select value={editOdpPortId ?? ''} onChange={e => setEditOdpPortId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-10 px-4 rounded-xl bg-glass border border-brd text-sm text-tx1 focus:outline-none focus:border-accent/50 transition-colors">
                    <option value="">— Tidak ada ODP —</option>
                    {odpPorts.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Location Picker */}
              <div className="border-t border-brd pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-tx2 flex items-center gap-1.5"><MapPin size={14} /> ONU Location</label>
                  <button type="button" onClick={() => setShowMap(s => !s)}
                    className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
                    <MapPin size={12} /> {showMap ? 'Hide Map' : 'Show Map'}
                  </button>
                </div>
                <LocationPicker
                  latitude={editLatitude}
                  longitude={editLongitude}
                  onChange={(lat: string, lng: string) => { setEditLatitude(lat); setEditLongitude(lng); }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingOnu(null)} className="px-4 py-2 rounded-xl text-sm hover:bg-glass transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={updateMutation.isPending}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm transition-colors disabled:opacity-50">
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function SignalCard({ icon, label, count, pct, color }: {
  icon: React.ReactNode; label: string; count: number; pct: number; color: string;
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
    <div className={cn('glass-card p-4 border', colors[color])}>
      <div className="flex items-center gap-2 mb-2">
        <span className={textColors[color]}>{icon}</span>
        <span className="text-xs text-tx3">{label}</span>
      </div>
      <div className="flex items-end justify-between mb-2">
        <span className={cn('text-2xl font-bold', textColors[color])}>{pct}%</span>
        <span className="text-sm text-tx3">{count} ONU{count !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

function StatusCard({ icon, label, count, color }: {
  icon: React.ReactNode; label: string; count: number; color: string;
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
    <div className={cn('glass-card p-3 border flex items-center gap-3', colors[color])}>
      <span className={textColors[color]}>{icon}</span>
      <div className="flex flex-col">
        <span className={cn('text-lg font-bold', textColors[color])}>{count}</span>
        <span className="text-xs text-tx3">{label}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    online: { color: 'bg-success/15 text-success border-success/20', icon: <Wifi size={13} />, label: 'Online' },
    offline: { color: 'bg-offline/15 text-tx3 border-offline/20', icon: <WifiOff size={13} />, label: 'Offline' },
    los: { color: 'bg-danger/15 text-danger border-danger/20', icon: <XCircle size={13} />, label: 'LOS' },
    dyinggasp: { color: 'bg-warning/15 text-warning border-warning/20', icon: <AlertTriangle size={13} />, label: 'DyingGasp' },
  };
  const c = config[status] || config.offline;

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', c.color)}>
      {c.icon} {c.label}
    </span>
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

function InputField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-tx2 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-4 rounded-xl bg-glass border border-brd text-sm text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/50 transition-colors"
      />
    </div>
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
