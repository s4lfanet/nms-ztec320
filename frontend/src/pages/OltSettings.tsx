import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type OltInfo } from '../lib/api';
import { useAuth } from '../stores/auth';
import { useHasPerm } from '../hooks/useHasPerm';
import { cn, formatDate } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import {
  Server, Plus, RefreshCw, Settings, Trash2, Edit3,
  Thermometer, Clock, CheckCircle, XCircle, Loader2,
  Activity, Network, Terminal, X, Save, Download, ArrowRightLeft, CheckSquare, Square, Package,
  History, ToggleLeft, ToggleRight, HardDriveDownload, Globe, Minus,
} from 'lucide-react';

export function OltSettings() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  const hasPerm = useHasPerm();
  const canManage = hasPerm('settings_ip_olts');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; olt?: OltInfo } | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [migrateOlt, setMigrateOlt] = useState<{ oltId: number; oltName: string } | null>(null);
  const [crossMigrateOlt, setCrossMigrateOlt] = useState<{ oltId: number; oltName: string } | null>(null);
  const [writingId, setWritingId] = useState<number | null>(null);
  const [discoveringId, setDiscoveringId] = useState<number | null>(null);
  const [backupOlt, setBackupOlt] = useState<{ id: number; name: string } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['olts'],
    queryFn: api.dashboard,
    refetchInterval: syncingId || syncingAll ? 3000 : 30000,
  });
  const olts = data?.olts || [];
  const subInfo = data?.subscription;

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const olt = olts.find(o => o.id === id);
      const ok = await confirm({
        title: 'Delete OLT',
        message: `Delete "${olt?.name}"? This will also delete all associated ONU data. This cannot be undone.`,
        confirmLabel: 'Delete', variant: 'danger',
      });
      if (!ok) throw new Error('cancelled');
      const res = await fetch(`/api/olt/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || `Delete failed (${res.status})`);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olts'] }); toast.success('OLT deleted'); },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error(e.message); },
  });

  const writeConfigMutation = useMutation({
    mutationFn: async (oltId: number) => {
      const olt = olts.find(o => o.id === oltId);
      const ok = await confirm({
        title: `Save Config: ${olt?.name || 'OLT'}`,
        message: 'Run "write" command to save running-config to startup-config? This persists all changes on the OLT.',
        confirmLabel: 'Save Config', variant: 'warning',
      });
      if (!ok) throw new Error('cancelled');
      setWritingId(oltId);
      const res = await fetch(`/api/olt/${oltId}/write-config`, { method: 'POST', credentials: 'include' });
      return res.json();
    },
    onSuccess: (d: { success: boolean; message?: string }) => { toast.success(d.message || 'Config saved!'); },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error('Save config failed'); },
    onSettled: () => setWritingId(null),
  });

  const discoverSlotsMutation = useMutation({
    mutationFn: async (oltId: number) => {
      setDiscoveringId(oltId);
      return api.discoverSlots(oltId);
    },
    onSuccess: (d) => {
      toast.success(d.message || 'Slots discovered!');
      qc.invalidateQueries({ queryKey: ['olts'] });
    },
    onError: (e: Error) => { toast.error(e.message || 'Discovery failed'); },
    onSettled: () => setDiscoveringId(null),
  });

  const exportConfig = async (oltId: number) => {
    try {
      const res = await fetch(`/api/olt/${oltId}/backup-config`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { const d = await res.json(); toast.error(d.message || 'Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.split('filename=')[1] || `olt_${oltId}_backup.cfg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Config exported');
    } catch { toast.error('Export failed'); }
  };

  const syncMutation = useMutation({
    mutationFn: async (oltId: number) => {
      const olt = olts.find(o => o.id === oltId);
      const ok = await confirm({
        title: `Sync ${olt?.name || 'OLT'}`,
        message: 'Start synchronization? This will collect all ONU data, signal power, VLAN config from the OLT.',
        confirmLabel: 'Start Sync', variant: 'warning',
      });
      if (!ok) throw new Error('cancelled');
      return api.syncOlt(oltId);
    },
    onSuccess: (_, oltId) => {
      setSyncingId(oltId); setSyncProgress(0); setSyncMessage('Starting sync...');
      toast.success('Sync started!');
    },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error('Sync failed'); },
  });

  // Poll sync status
  useEffect(() => {
    if (!syncingId) return;
    const interval = setInterval(async () => {
      try {
        const s = await api.syncStatus(syncingId);
        setSyncProgress(s.progress || 0);
        setSyncMessage(s.message || '');
        if (s.status === 'completed' || s.status === 'error') {
          clearInterval(interval); setSyncingId(null);
          s.status === 'completed' ? toast.success('Sync completed!') : toast.error('Sync failed: ' + (s.message || ''));
          qc.invalidateQueries({ queryKey: ['olts'] });
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [syncingId, qc]);

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Sync All OLTs',
        message: `This will sync all ${olts.length} OLT(s) sequentially. Continue?`,
        confirmLabel: 'Sync All',
        variant: 'warning',
      });
      if (!ok) throw new Error('cancelled');
      return api.syncAllOlts();
    },
    onSuccess: () => {
      setSyncingAll(true);
      toast.success('Sync All started!');
    },
    onError: (e: Error) => { if (e.message !== 'cancelled') toast.error('Sync All failed'); },
  });

  // Poll all OLTs sync status
  useEffect(() => {
    if (!syncingAll) return;
    const interval = setInterval(async () => {
      try {
        const allDone = await Promise.all(olts.map(o => api.syncStatus(o.id)));
        const anyRunning = allDone.some(s => s.status === 'running');
        if (!anyRunning) {
          clearInterval(interval);
          setSyncingAll(false);
          const anyError = allDone.some(s => s.status === 'error');
          if (anyError) toast.error('Some OLTs failed to sync');
          else toast.success('All OLTs synced!');
          qc.invalidateQueries({ queryKey: ['olts'] });
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [syncingAll, olts, qc]);

  if (isLoading) return <div className="animate-pulse glass-card h-64" />;

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isSuperAdmin ? 'OLT Overview' : 'OLT Settings'}</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">{isSuperAdmin ? 'View all tenant OLT devices' : 'Manage OLT devices and connections'}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canManage && (
            <button onClick={() => syncAllMutation.mutate()} disabled={syncingAll || syncingId !== null}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 text-sm font-medium transition-all disabled:opacity-50 flex-1 sm:flex-none justify-center">
              <RefreshCw size={16} className={syncingAll ? 'animate-spin' : ''} /> Sync All
            </button>
          )}
          {canManage && (
            <button onClick={() => setModal({ mode: 'add' })}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all flex-1 sm:flex-none justify-center">
              <Plus size={16} /> Add OLT
            </button>
          )}
        </div>
      </div>

      {/* OLT Limit Info for tenant users */}
      {canManage && subInfo && (
        <div className={cn('glass-card p-3 md:p-4 border', subInfo.remaining_olts === 0 ? 'border-danger/30' : 'border-accent/20')}>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                subInfo.remaining_olts === 0 ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent')}>
                <Package size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold">OLT Limit — {subInfo.package_name}</div>
                <div className="text-xs text-tx3">
                  {subInfo.remaining_olts > 0
                    ? `${subInfo.remaining_olts} of ${subInfo.max_olts} slots remaining`
                    : 'OLT limit reached — upgrade your package to add more'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 self-start sm:self-auto">
              <div className="text-center">
                <div className="text-[10px] text-tx3 uppercase">Used</div>
                <div className={cn('text-lg font-bold', subInfo.remaining_olts === 0 ? 'text-danger' : 'text-tx1')}>{subInfo.used_olts}</div>
              </div>
              <div className="text-tx3 text-xl">/</div>
              <div className="text-center">
                <div className="text-[10px] text-tx3 uppercase">Max</div>
                <div className="text-lg font-bold text-tx1">{subInfo.max_olts}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-tx3 uppercase">Remaining</div>
                <div className={cn('text-lg font-bold', subInfo.remaining_olts === 0 ? 'text-danger' : 'text-success')}>{subInfo.remaining_olts}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Progress Banner */}
      {syncingId && (
        <div className="glass-card p-3 md:p-4 border border-accent/30 animate-fade-in">
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
            <Loader2 size={18} className="text-accent animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Syncing OLT...</div>
              <div className="text-xs text-tx3 truncate">{syncMessage}</div>
            </div>
            <div className="text-base md:text-lg font-bold text-accent flex-shrink-0">{syncProgress}%</div>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-glass">
            <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${syncProgress}%` }} />
          </div>
        </div>
      )}

      {/* OLT Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Server size={16} /> OLT Management</h2>
        </div>
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brd">
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Device</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Information</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Synchronization</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Connection</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-tx3 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {olts.map((olt, i) => (
                <tr key={olt.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                  <td className="px-4 py-3 text-tx3">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-glass flex items-center justify-center flex-shrink-0">
                        <Server size={20} className={olt.is_online ? 'text-success' : 'text-danger'} />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{olt.name}</div>
                        <div className="text-xs text-tx3">{olt.ip_address}</div>
                        <div className="text-xs text-tx3">{olt.model}{olt.firmware_version ? ` | ${olt.firmware_version}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="flex items-center gap-1"><Thermometer size={12} className="text-warning" /> <strong>{olt.temperature ?? 'N/A'}°C</strong></span>
                      <span className="flex items-center gap-1"><Server size={12} className="text-tx3" /> <strong>{olt.total_onu}</strong> ONUs</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tx3 mt-1">
                      <span>{olt.model}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(olt.last_sync)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {syncingId === olt.id ? (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Loader2 size={12} className="text-accent animate-spin" />
                          <span className="text-xs text-accent font-medium">{syncProgress}%</span>
                        </div>
                        <div className="w-28 h-1.5 rounded-full overflow-hidden bg-glass">
                          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${syncProgress}%` }} />
                        </div>
                        <div className="text-xs text-tx3 mt-1 truncate max-w-[150px]">{syncMessage}</div>
                      </div>
                    ) : olt.last_sync ? (
                      <div>
                        <div className="flex items-center gap-1 text-xs text-success mb-1">
                          <CheckCircle size={12} /> 100% Completed
                        </div>
                        <div className="text-xs text-tx3"><Clock size={11} className="inline" /> {formatDate(olt.last_sync)}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-tx3">Never synced</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <ConnectionBadge icon={<Terminal size={11} />} label={olt.ssh_enabled ? 'SSH' : 'CLI'}
                        connected={olt.telnet_status === 'connected'} />
                      <ConnectionBadge icon={<Network size={11} />} label="SNMP"
                        connected={olt.snmp_status === 'connected'} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {canManage && <ActionBtn icon={<Edit3 size={14} />} title="Edit" onClick={() => setModal({ mode: 'edit', olt })} />}
                      {canManage && <ActionBtn icon={<RefreshCw size={14} />} title="Sync" onClick={() => syncMutation.mutate(olt.id)} />}
                      {canManage && <ActionBtn icon={<Save size={14} />} title="Save Config" onClick={() => writeConfigMutation.mutate(olt.id)} loading={writingId === olt.id} />}
                      {canManage && <ActionBtn icon={<Settings size={14} />} title="Config" onClick={() => navigate(`/dashboard/settings/olts/${olt.id}/config`)} />}
                      {canManage && <ActionBtn icon={<Download size={14} />} title="Export" onClick={() => exportConfig(olt.id)} />}
                      {canManage && <ActionBtn icon={<History size={14} />} title="Backup" onClick={() => setBackupOlt({ id: olt.id, name: olt.name })} />}
                      {canManage && <ActionBtn icon={<Server size={14} />} title="Discover" onClick={() => discoverSlotsMutation.mutate(olt.id)} loading={discoveringId === olt.id} />}
                      {canManage && <ActionBtn icon={<ArrowRightLeft size={14} />} title="Migrate PON" onClick={() => setMigrateOlt({ oltId: olt.id, oltName: olt.name })} />}
                      {canManage && <ActionBtn icon={<Globe size={14} />} title="Cross-OLT Migrate" onClick={() => setCrossMigrateOlt({ oltId: olt.id, oltName: olt.name })} />}
                      {canManage && <ActionBtn icon={<Trash2 size={14} />} title="Delete" danger onClick={() => deleteMutation.mutate(olt.id)} />}
                      {!canManage && <span className="text-xs text-tx3 px-2">View only</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {olts.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-tx3">
                  <Server size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No OLTs configured</p>
                  {canManage && <p className="text-xs mt-1">Click "Add OLT" to add your first device</p>}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-brd/50">
          {olts.map((olt, i) => (
            <div key={olt.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-tx3 text-xs flex-shrink-0">{i + 1}</span>
                <div className="w-10 h-10 rounded-lg bg-glass flex items-center justify-center flex-shrink-0">
                  <Server size={18} className={olt.is_online ? 'text-success' : 'text-danger'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{olt.name}</div>
                  <div className="text-xs text-tx3 truncate">{olt.ip_address} • {olt.model}</div>
                </div>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0', olt.is_online ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                  {olt.is_online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1"><Thermometer size={12} className="text-warning" /> <strong>{olt.temperature ?? 'N/A'}°C</strong></span>
                <span className="flex items-center gap-1"><Server size={12} className="text-tx3" /> <strong>{olt.total_onu}</strong> ONUs</span>
                <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(olt.last_sync)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <ConnectionBadge icon={<Terminal size={11} />} label={olt.ssh_enabled ? 'SSH' : 'CLI'} connected={olt.telnet_status === 'connected'} />
                <ConnectionBadge icon={<Network size={11} />} label="SNMP" connected={olt.snmp_status === 'connected'} />
              </div>
              {syncingId === olt.id && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Loader2 size={12} className="text-accent animate-spin" />
                    <span className="text-xs text-accent font-medium">{syncProgress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-glass">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${syncProgress}%` }} />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {canManage && <ActionBtn icon={<Edit3 size={16} />} title="Edit" onClick={() => setModal({ mode: 'edit', olt })} />}
                {canManage && <ActionBtn icon={<RefreshCw size={16} />} title="Sync" onClick={() => syncMutation.mutate(olt.id)} />}
                {canManage && <ActionBtn icon={<Save size={16} />} title="Save Config" onClick={() => writeConfigMutation.mutate(olt.id)} loading={writingId === olt.id} />}
                {canManage && <ActionBtn icon={<Settings size={16} />} title="Config" onClick={() => navigate(`/dashboard/settings/olts/${olt.id}/config`)} />}
                {canManage && <ActionBtn icon={<Download size={16} />} title="Export" onClick={() => exportConfig(olt.id)} />}
                {canManage && <ActionBtn icon={<History size={16} />} title="Backup" onClick={() => setBackupOlt({ id: olt.id, name: olt.name })} />}
                {canManage && <ActionBtn icon={<Server size={16} />} title="Discover" onClick={() => discoverSlotsMutation.mutate(olt.id)} loading={discoveringId === olt.id} />}
                {canManage && <ActionBtn icon={<ArrowRightLeft size={16} />} title="Migrate PON" onClick={() => setMigrateOlt({ oltId: olt.id, oltName: olt.name })} />}
                {canManage && <ActionBtn icon={<Globe size={16} />} title="Cross-OLT Migrate" onClick={() => setCrossMigrateOlt({ oltId: olt.id, oltName: olt.name })} />}
                {canManage && <ActionBtn icon={<Trash2 size={16} />} title="Delete" danger onClick={() => deleteMutation.mutate(olt.id)} />}
                {!canManage && <span className="text-xs text-tx3 px-2">View only</span>}
              </div>
            </div>
          ))}
          {olts.length === 0 && (
            <div className="text-center py-12 text-tx3">
              <Server size={40} className="mx-auto mb-3 opacity-30" />
              <p>No OLTs configured</p>
              {canManage && <p className="text-xs mt-1">Click "Add OLT" to add your first device</p>}
            </div>
          )}
        </div>
      </div>

      {/* Backup History Modal */}
      {backupOlt && <BackupHistoryModal oltId={backupOlt.id} oltName={backupOlt.name} onClose={() => setBackupOlt(null)} />}

      {/* Add/Edit Modal */}
      {modal && <OltModal mode={modal.mode} olt={modal.olt} onClose={() => setModal(null)}
        onSuccess={() => { setModal(null); qc.invalidateQueries({ queryKey: ['olts'] }); refetch(); toast.success(modal.mode === 'add' ? 'OLT added!' : 'OLT updated!'); }} />}

      {/* Migrate ONU Modal */}
      {migrateOlt && <MigrateOnuModal oltId={migrateOlt.oltId} oltName={migrateOlt.oltName} onClose={() => setMigrateOlt(null)}
        onSuccess={() => { setMigrateOlt(null); qc.invalidateQueries({ queryKey: ['olts'] }); toast.success('ONU migrated successfully!'); }} />}

      {/* Cross-OLT Migrate Modal */}
      {crossMigrateOlt && <CrossOltMigrateModal sourceOltId={crossMigrateOlt.oltId} sourceOltName={crossMigrateOlt.oltName} allOlts={olts} onClose={() => setCrossMigrateOlt(null)}
        onSuccess={() => { setCrossMigrateOlt(null); qc.invalidateQueries({ queryKey: ['olts'] }); toast.success('Cross-OLT migration completed!'); }} />}
    </div>
  );
}

/* ═══ Migrate ONU Modal ═══ */

function MigrateOnuModal({ oltId, oltName, onClose, onSuccess }: {
  oltId: number; oltName: string; onClose: () => void; onSuccess: () => void;
}) {
  const [structure, setStructure] = useState<{ card: number; ports: number[] }[]>([]);
  const [sourceCard, setSourceCard] = useState('');
  const [sourcePon, setSourcePon] = useState('');
  const [onus, setOnus] = useState<Array<{ id: number; onu_id_str: string; serial_number: string; name: string; status: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [targetCard, setTargetCard] = useState('');
  const [targetPon, setTargetPon] = useState('');
  const [onuIdMode, setOnuIdMode] = useState<'auto' | 'manual'>('auto');
  const [onuIdValue, setOnuIdValue] = useState('1');
  const [loading, setLoading] = useState(false);
  const [fetchingStruct, setFetchingStruct] = useState(true);
  const [fetchingOnus, setFetchingOnus] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; results: Array<{ id: number; onu_id_str: string; success: boolean; message: string }> } | null>(null);

  useEffect(() => {
    fetch(`/api/olt/${oltId}/pon-structure`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.structure) setStructure(d.structure); setFetchingStruct(false); })
      .catch(() => setFetchingStruct(false));
  }, [oltId]);

  // Find port_id for selected source card/pon
  const sourcePorts = structure.find(s => s.card === Number(sourceCard))?.ports || [];
  const targetPorts = structure.find(s => s.card === Number(targetCard))?.ports || [];

  // When source card+pon selected, fetch ONUs from that PON port
  const loadOnus = async (card: string, pon: string) => {
    if (!card || !pon) { setOnus([]); return; }
    setFetchingOnus(true);
    setSelectedIds(new Set());
    setOnus([]);
    try {
      // Find OLTPort id by matching card/pon in port_name
      const portsRes = await fetch(`/api/olt/${oltId}/pon-ports`, { credentials: 'include' });
      const portsData = await portsRes.json();
      const match = (portsData.ports || []).find((p: Record<string, unknown>) => {
        const name = String(p.port_name || '');
        return name.includes(`/${card}/${pon}`);
      });
      if (match) {
        const pid = Number(match.id);
        const onuRes = await fetch(`/api/olt/${oltId}/pon-port/${pid}/onus`, { credentials: 'include' });
        const onuData = await onuRes.json();
        if (onuData.onus) setOnus(onuData.onus);
      }
    } catch { /* ignore */ }
    setFetchingOnus(false);
  };

  const toggleOnu = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === onus.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(onus.map(o => o.id)));
  };

  const doMigrate = async () => {
    if (selectedIds.size === 0 || !targetCard || !targetPon) { toast.error('Select ONUs and target PON'); return; }
    const ids = Array.from(selectedIds);
    const ok = await confirm({
      title: 'Batch Migrate ONUs',
      message: `Migrate ${ids.length} ONU${ids.length > 1 ? 's' : ''} from ${sourceCard}/${sourcePon} to ${targetCard}/${targetPon}?\n\nThis will deregister each ONU from its current PON and re-register on the target PON. ONU IDs will be assigned automatically.`,
      confirmLabel: 'Migrate All', variant: 'warning',
    });
    if (!ok) return;
    setLoading(true);
    setProgress({ done: 0, total: ids.length, results: [] });
    try {
      const res = await fetch(`/api/olt/${oltId}/migrate-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ onu_ids: ids, card: Number(targetCard), pon: Number(targetPon), onu_id_mode: onuIdMode, onu_id_value: Number(onuIdValue) }),
      });
      const d = await res.json();
      if (d.details) {
        setProgress({ done: d.migrated + d.failed, total: d.total, results: d.details });
      }
      if (d.success) {
        toast.success(`${d.migrated} ONU${d.migrated !== 1 ? 's' : ''} migrated successfully${d.failed > 0 ? `, ${d.failed} failed` : ''}`);
        onSuccess();
      } else {
        toast.error(d.message || `Migration failed: ${d.failed} of ${d.total} failed`);
      }
    } catch { toast.error('Migration failed'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" onClick={onClose} />
      <div className="relative glass-card w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="modal-header">
          <h2 className="text-sm font-semibold flex items-center gap-2"><ArrowRightLeft size={16} /> Migrate ONU — {oltName}</h2>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
        </div>
        <div className="p-3 md:p-5 overflow-y-auto space-y-4 flex-1">
          {fetchingStruct ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-accent" /></div>
          ) : structure.length === 0 ? (
            <div className="text-center py-8 text-tx3 text-sm">No PON ports found. Sync first.</div>
          ) : (
            <>
              {/* Step 1: Select source PON */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-2">1. Source Card</label>
                  <select value={sourceCard} onChange={e => { setSourceCard(e.target.value); setSourcePon(''); setOnus([]); setSelectedIds(new Set()); }} className="input-field">
                    <option value="">-- Select --</option>
                    {structure.map(s => <option key={s.card} value={s.card}>Card {s.card}</option>)}
                  </select>
                </div>
                {sourceCard && (
                  <div>
                    <label className="label-sm mb-2">Source PON</label>
                    <select value={sourcePon} onChange={e => { setSourcePon(e.target.value); loadOnus(sourceCard, e.target.value); }} className="input-field">
                      <option value="">-- Select --</option>
                      {sourcePorts.map(p => <option key={p} value={p}>PON {p}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Step 2: ONU list from source PON */}
              {sourcePon && (
                <div>
                  {fetchingOnus ? (
                    <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-accent" /></div>
                  ) : onus.length === 0 ? (
                    <div className="text-center py-4 text-tx3 text-xs">No ONUs on this PON port.</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <label className="label-sm">2. ONUs on {sourceCard}/{sourcePon} ({selectedIds.size} selected)</label>
                        <button onClick={toggleAll} className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
                          {selectedIds.size === onus.length ? <CheckSquare size={13} /> : <Square size={13} />}
                          {selectedIds.size === onus.length ? 'Unselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-brd">
                        {onus.map(o => (
                          <div key={o.id} onClick={() => toggleOnu(o.id)}
                            className={cn('flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-brd/30 transition-colors',
                              selectedIds.has(o.id) ? 'bg-accent/10' : 'hover:bg-glass/50')}>
                            {selectedIds.has(o.id) ? <CheckSquare size={14} className="text-accent flex-shrink-0" /> : <Square size={14} className="text-tx3 flex-shrink-0" />}
                            <div className="flex-1 min-w-0 text-xs">
                              <span className="font-mono font-medium">{o.onu_id_str}</span>
                              <span className="text-tx3 ml-2">{o.name || 'unnamed'}</span>
                            </div>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
                              o.status === 'online' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{o.status}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 3: Select target PON */}
              {selectedIds.size > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-sm mb-2">3. Target Card</label>
                      <select value={targetCard} onChange={e => { setTargetCard(e.target.value); setTargetPon(''); }} className="input-field">
                        <option value="">-- Select --</option>
                        {structure.map(s => <option key={s.card} value={s.card}>Card {s.card}</option>)}
                      </select>
                    </div>
                    {targetCard && (
                      <div>
                        <label className="label-sm mb-2">Target PON</label>
                        <select value={targetPon} onChange={e => setTargetPon(e.target.value)} className="input-field">
                          <option value="">-- Select --</option>
                          {targetPorts.map(p => <option key={p} value={p}>PON {p}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {targetPon && (
                    <div>
                      <label className="label-sm mb-2">4. ONU ID on new PON</label>
                      <div className="flex gap-5">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="migOnuIdMode" checked={onuIdMode === 'auto'} onChange={() => setOnuIdMode('auto')} /> Automatic
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="migOnuIdMode" checked={onuIdMode === 'manual'} onChange={() => setOnuIdMode('manual')} /> Manually
                        </label>
                      </div>
                      {onuIdMode === 'manual' && (
                        <input type="number" min={1} max={128} value={onuIdValue} onChange={e => setOnuIdValue(e.target.value)} className="input-field mt-2" placeholder="ONU ID (1–128)" />
                      )}
                    </div>
                  )}

                  {targetPon && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-xs">
                      <div className="font-semibold text-warning mb-1">Migration Summary:</div>
                      <div>From: <strong>gpon-olt_1/{sourceCard}/{sourcePon}</strong></div>
                      <div>To: <strong>gpon-olt_1/{targetCard}/{targetPon}</strong></div>
                      <div>ONUs: <strong>{selectedIds.size}</strong></div>
                      <div className="text-tx3 mt-1">Each ONU will be deregistered from source PON and re-registered on target PON with auto-assigned ONU IDs.</div>
                    </div>
                  )}

                  {progress && progress.results.length > 0 && (
                    <div className="p-3 rounded-lg bg-glass border border-brd text-xs space-y-1 max-h-40 overflow-y-auto">
                      <div className="font-semibold mb-1">Results ({progress.done}/{progress.total}):</div>
                      {progress.results.map((r, i) => (
                        <div key={i} className={cn('flex items-start gap-2', r.success ? 'text-success' : 'text-danger')}>
                          <span className="flex-shrink-0">{r.success ? '✓' : '✗'}</span>
                          <span className="flex-1">{r.onu_id_str}: {r.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={doMigrate} disabled={loading || selectedIds.size === 0 || !targetPon} className="btn-primary">
            {loading ? <Loader2 size={14} className="animate-spin inline mr-1" /> : <ArrowRightLeft size={14} className="inline mr-1" />}
            {loading ? `Migrating ${progress?.done ?? 0}/${progress?.total ?? 0}...` : `Migrate ${selectedIds.size > 0 ? `(${selectedIds.size})` : 'ONUs'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Cross-OLT Migrate Modal ═══ */

function CrossOltMigrateModal({ sourceOltId, sourceOltName, allOlts, onClose, onSuccess }: {
  sourceOltId: number; sourceOltName: string; allOlts: OltInfo[]; onClose: () => void; onSuccess: () => void;
}) {
  const [sourceStructure, setSourceStructure] = useState<{ card: number; ports: number[] }[]>([]);
  const [sourceCard, setSourceCard] = useState('');
  const [sourcePon, setSourcePon] = useState('');
  const [onus, setOnus] = useState<Array<{ id: number; onu_id_str: string; serial_number: string; name: string; status: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [targetOltId, setTargetOltId] = useState('');
  const [targetStructure, setTargetStructure] = useState<{ card: number; ports: number[] }[]>([]);
  const [targetCard, setTargetCard] = useState('');
  const [targetPon, setTargetPon] = useState('');
  const [onuIdMode, setOnuIdMode] = useState<'auto' | 'manual'>('auto');
  const [onuIdValue, setOnuIdValue] = useState('1');
  const [copyConfig, setCopyConfig] = useState(true);
  const [configResult, setConfigResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingStruct, setFetchingStruct] = useState(true);
  const [fetchingOnus, setFetchingOnus] = useState(false);
  const [fetchingTargetStruct, setFetchingTargetStruct] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; results: Array<{ id: number; onu_id_str: string; success: boolean; message: string }> } | null>(null);

  useEffect(() => {
    fetch(`/api/olt/${sourceOltId}/pon-structure`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.structure) setSourceStructure(d.structure); setFetchingStruct(false); })
      .catch(() => setFetchingStruct(false));
  }, [sourceOltId]);

  const sourcePorts = sourceStructure.find(s => s.card === Number(sourceCard))?.ports || [];
  const targetPorts = targetStructure.find(s => s.card === Number(targetCard))?.ports || [];
  const targetOlt = allOlts.find(o => o.id === Number(targetOltId));

  // Fetch target OLT structure when selected
  useEffect(() => {
    if (!targetOltId) { setTargetStructure([]); setTargetCard(''); setTargetPon(''); return; }
    setFetchingTargetStruct(true);
    fetch(`/api/olt/${targetOltId}/pon-structure`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.structure) setTargetStructure(d.structure); else setTargetStructure([]); setFetchingTargetStruct(false); })
      .catch(() => { setTargetStructure([]); setFetchingTargetStruct(false); });
  }, [targetOltId]);

  const loadOnus = async (card: string, pon: string) => {
    if (!card || !pon) { setOnus([]); return; }
    setFetchingOnus(true);
    setSelectedIds(new Set());
    setOnus([]);
    try {
      const portsRes = await fetch(`/api/olt/${sourceOltId}/pon-ports`, { credentials: 'include' });
      const portsData = await portsRes.json();
      const match = (portsData.ports || []).find((p: Record<string, unknown>) => {
        const name = String(p.port_name || '');
        return name.includes(`/${card}/${pon}`);
      });
      if (match) {
        const pid = Number(match.id);
        const onuRes = await fetch(`/api/olt/${sourceOltId}/pon-port/${pid}/onus`, { credentials: 'include' });
        const onuData = await onuRes.json();
        if (onuData.onus) setOnus(onuData.onus);
      }
    } catch { /* ignore */ }
    setFetchingOnus(false);
  };

  const toggleOnu = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === onus.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(onus.map(o => o.id)));
  };

  const doMigrate = async () => {
    if (selectedIds.size === 0 || !targetOltId || !targetCard || !targetPon) {
      toast.error('Select ONUs, target OLT, and target PON'); return;
    }
    const ids = Array.from(selectedIds);
    const ok = await confirm({
      title: 'Cross-OLT Migration',
      message: `Migrate ${ids.length} ONU${ids.length > 1 ? 's' : ''} from ${sourceOltName} to ${targetOlt?.name || 'target OLT'} (${targetCard}/${targetPon})?\n\nThis will deregister each ONU from the source OLT and re-register on the target OLT. ONU data (name, description) will be preserved.`,
      confirmLabel: 'Migrate All', variant: 'warning',
    });
    if (!ok) return;
    setLoading(true);
    setProgress({ done: 0, total: ids.length, results: [] });
    setConfigResult(null);

    // Step 1: Optionally copy OLT config first
    if (copyConfig) {
      try {
        const cfgRes = await fetch('/api/olt/copy-config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ source_olt_id: sourceOltId, target_olt_id: Number(targetOltId) }),
        });
        const cfgData = await cfgRes.json();
        if (cfgData.success) {
          const c = cfgData.copied || {};
          setConfigResult(`Config copied: ${c.vlans || 0} VLANs, ${c.onu_types || 0} ONU Types, ${c.speed_profiles || 0} Speed Profiles, ${c.wan_ip_profiles || 0} WAN IP Profiles` + (cfgData.errors?.length ? ` (${cfgData.errors.length} errors)` : ''));
        } else {
          setConfigResult(`Config copy failed: ${cfgData.message || 'unknown error'}`);
        }
      } catch {
        setConfigResult('Config copy failed: network error');
      }
    }

    // Step 2: Migrate ONUs
    try {
      const res = await fetch('/api/olt/migrate-cross-olt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          source_olt_id: sourceOltId,
          target_olt_id: Number(targetOltId),
          onu_ids: ids,
          card: Number(targetCard),
          pon: Number(targetPon),
          onu_id_mode: onuIdMode,
          onu_id_value: Number(onuIdValue),
        }),
      });
      const d = await res.json();
      if (d.details) {
        setProgress({ done: d.migrated + d.failed, total: d.total, results: d.details });
      }
      if (d.success) {
        toast.success(`${d.migrated} ONU${d.migrated !== 1 ? 's' : ''} migrated to ${targetOlt?.name}${d.failed > 0 ? `, ${d.failed} failed` : ''}`);
        onSuccess();
      } else {
        toast.error(d.message || `Migration failed: ${d.failed} of ${d.total} failed`);
      }
    } catch { toast.error('Migration failed'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" onClick={onClose} />
      <div className="relative glass-card w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="modal-header">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Globe size={16} /> Cross-OLT Migration — {sourceOltName}</h2>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
        </div>
        <div className="p-3 md:p-5 overflow-y-auto space-y-4 flex-1">
          {fetchingStruct ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-accent" /></div>
          ) : sourceStructure.length === 0 ? (
            <div className="text-center py-8 text-tx3 text-sm">No PON ports found on source OLT. Sync first.</div>
          ) : (
            <>
              {/* Step 1: Select source PON */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-2">1. Source Card</label>
                  <select value={sourceCard} onChange={e => { setSourceCard(e.target.value); setSourcePon(''); setOnus([]); setSelectedIds(new Set()); }} className="input-field">
                    <option value="">-- Select --</option>
                    {sourceStructure.map(s => <option key={s.card} value={s.card}>Card {s.card}</option>)}
                  </select>
                </div>
                {sourceCard && (
                  <div>
                    <label className="label-sm mb-2">Source PON</label>
                    <select value={sourcePon} onChange={e => { setSourcePon(e.target.value); loadOnus(sourceCard, e.target.value); }} className="input-field">
                      <option value="">-- Select --</option>
                      {sourcePorts.map(p => <option key={p} value={p}>PON {p}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Step 2: ONU list from source PON */}
              {sourcePon && (
                <div>
                  {fetchingOnus ? (
                    <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-accent" /></div>
                  ) : onus.length === 0 ? (
                    <div className="text-center py-4 text-tx3 text-xs">No ONUs on this PON port.</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <label className="label-sm">2. ONUs on {sourceCard}/{sourcePon} ({selectedIds.size} selected)</label>
                        <button onClick={toggleAll} className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
                          {selectedIds.size === onus.length ? <CheckSquare size={13} /> : <Square size={13} />}
                          {selectedIds.size === onus.length ? 'Unselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-brd">
                        {onus.map(o => (
                          <div key={o.id} onClick={() => toggleOnu(o.id)}
                            className={cn('flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-brd/30 transition-colors',
                              selectedIds.has(o.id) ? 'bg-accent/10' : 'hover:bg-glass/50')}>
                            {selectedIds.has(o.id) ? <CheckSquare size={14} className="text-accent flex-shrink-0" /> : <Square size={14} className="text-tx3 flex-shrink-0" />}
                            <div className="flex-1 min-w-0 text-xs">
                              <span className="font-mono font-medium">{o.onu_id_str}</span>
                              <span className="text-tx3 ml-2">{o.name || 'unnamed'}</span>
                            </div>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
                              o.status === 'online' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{o.status}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 3: Select target OLT */}
              {selectedIds.size > 0 && (
                <>
                  <div>
                    <label className="label-sm mb-2">3. Target OLT</label>
                    <select value={targetOltId} onChange={e => { setTargetOltId(e.target.value); setTargetCard(''); setTargetPon(''); }} className="input-field">
                      <option value="">-- Select Target OLT --</option>
                      {allOlts.filter(o => o.id !== sourceOltId).map(o => (
                        <option key={o.id} value={o.id}>{o.name} ({o.ip_address})</option>
                      ))}
                    </select>
                  </div>

                  {/* Step 4: Select target PON on target OLT */}
                  {targetOltId && (
                    <>
                      {fetchingTargetStruct ? (
                        <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-accent" /></div>
                      ) : targetStructure.length === 0 ? (
                        <div className="text-center py-4 text-tx3 text-xs">No PON ports found on target OLT. Sync target OLT first.</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label-sm mb-2">4. Target Card</label>
                            <select value={targetCard} onChange={e => { setTargetCard(e.target.value); setTargetPon(''); }} className="input-field">
                              <option value="">-- Select --</option>
                              {targetStructure.map(s => <option key={s.card} value={s.card}>Card {s.card}</option>)}
                            </select>
                          </div>
                          {targetCard && (
                            <div>
                              <label className="label-sm mb-2">Target PON</label>
                              <select value={targetPon} onChange={e => setTargetPon(e.target.value)} className="input-field">
                                <option value="">-- Select --</option>
                                {targetPorts.map(p => <option key={p} value={p}>PON {p}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {targetPon && (
                        <div>
                          <label className="label-sm mb-2">5. ONU ID on target PON</label>
                          <div className="flex gap-5">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input type="radio" name="crossMigOnuIdMode" checked={onuIdMode === 'auto'} onChange={() => setOnuIdMode('auto')} /> Automatic
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input type="radio" name="crossMigOnuIdMode" checked={onuIdMode === 'manual'} onChange={() => setOnuIdMode('manual')} /> Manually
                            </label>
                          </div>
                          {onuIdMode === 'manual' && (
                            <input type="number" min={1} max={128} value={onuIdValue} onChange={e => setOnuIdValue(e.target.value)} className="input-field mt-2" placeholder="ONU ID (1–128)" />
                          )}
                        </div>
                      )}

                      {targetPon && (
                        <label className="flex items-center gap-2 text-sm cursor-pointer p-3 rounded-lg bg-accent/10 border border-accent/20">
                          <input type="checkbox" checked={copyConfig} onChange={e => setCopyConfig(e.target.checked)} className="w-4 h-4 rounded accent-accent" />
                          <div>
                            <div className="font-medium">Copy OLT Config to Target</div>
                            <div className="text-xs text-tx3">VLANs, ONU Types, Speed Profiles (TCONT/Traffic), WAN IP Profiles — applied via CLI before ONU migration</div>
                          </div>
                        </label>
                      )}

                      {configResult && (
                        <div className={cn('p-3 rounded-lg text-xs', configResult.startsWith('Config copy failed') ? 'bg-danger/10 border border-danger/20 text-danger' : 'bg-success/10 border border-success/20 text-success')}>
                          {configResult}
                        </div>
                      )}

                      {targetPon && (
                        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-xs">
                          <div className="font-semibold text-warning mb-1">Cross-OLT Migration Summary:</div>
                          <div>From: <strong>{sourceOltName}</strong> — gpon-olt_1/{sourceCard}/{sourcePon}</div>
                          <div>To: <strong>{targetOlt?.name}</strong> — gpon-olt_1/{targetCard}/{targetPon}</div>
                          <div>ONUs: <strong>{selectedIds.size}</strong></div>
                          <div>Copy Config: <strong>{copyConfig ? 'Yes' : 'No'}</strong></div>
                          <div className="text-tx3 mt-1">Each ONU will be deregistered from the source OLT and re-registered on the target OLT. Name and description will be re-applied.{copyConfig && ' OLT config (VLANs, profiles, ONU types) will be copied first.'}</div>
                        </div>
                      )}

                      {progress && progress.results.length > 0 && (
                        <div className="p-3 rounded-lg bg-glass border border-brd text-xs space-y-1 max-h-40 overflow-y-auto">
                          <div className="font-semibold mb-1">Results ({progress.done}/{progress.total}):</div>
                          {progress.results.map((r, i) => (
                            <div key={i} className={cn('flex items-start gap-2', r.success ? 'text-success' : 'text-danger')}>
                              <span className="flex-shrink-0">{r.success ? '✓' : '✗'}</span>
                              <span className="flex-1">{r.onu_id_str}: {r.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={doMigrate} disabled={loading || selectedIds.size === 0 || !targetPon} className="btn-primary">
            {loading ? <Loader2 size={14} className="animate-spin inline mr-1" /> : <Globe size={14} className="inline mr-1" />}
            {loading ? `Migrating ${progress?.done ?? 0}/${progress?.total ?? 0}...` : `Migrate ${selectedIds.size > 0 ? `(${selectedIds.size})` : 'ONUs'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ OLT Modal ═══ */

function OltModal({ mode, olt, onClose, onSuccess }: {
  mode: 'add' | 'edit'; olt?: OltInfo; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: olt?.name || '',
    ip_address: olt?.ip_address || '',
    type: olt ? `${(olt.model || 'C320').toUpperCase()}` : 'ZTE-C320',
    snmp_community: 'public',
    snmp_community_write: '',
    snmp_port: '161',
    cli_username: '',
    cli_password: '',
    telnet_port: '23',
    ssh_enabled: false,
    ssh_port: '22',
  });
  const [snmpStatus, setSnmpStatus] = useState<string>('');
  const [telnetStatus, setTelnetStatus] = useState<string>('');
  const [testResult, setTestResult] = useState<{ snmp: { ok: boolean | null; message: string }; telnet: { ok: boolean | null; message: string } } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingOlt, setLoadingOlt] = useState(false);

  // Fetch full OLT data when editing (to get credentials)
  useEffect(() => {
    if (mode === 'edit' && olt?.id) {
      setLoadingOlt(true);
      api.getOlt(olt.id).then(d => {
        if (d.success) {
          const vendorModel = `ZTE-${d.model || 'C320'}`;
          setForm({
            name: d.name || '',
            ip_address: d.ip_address || '',
            type: vendorModel,
            snmp_community: d.snmp_community || 'public',
            snmp_community_write: d.snmp_community_write || '',
            snmp_port: String(d.snmp_port || 161),
            cli_username: d.cli_username || '',
            cli_password: '',
            telnet_port: String(d.telnet_port || 23),
            ssh_enabled: d.ssh_enabled || false,
            ssh_port: String(d.ssh_port || 22),
          });
          setSnmpStatus(d.snmp_status || '');
          setTelnetStatus(d.telnet_status || '');
        }
      }).catch(() => toast.error('Failed to load OLT data'))
        .finally(() => setLoadingOlt(false));
    }
  }, [mode, olt?.id]);

  const update = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const testConnection = async () => {
    if (!form.ip_address) { toast.error('Please enter IP address'); return; }
    setTesting(true); setTestResult(null);
    try {
      const payload: Record<string, unknown> = {
        ip_address: form.ip_address, snmp_community: form.snmp_community,
        snmp_port: parseInt(form.snmp_port), cli_username: form.cli_username,
        telnet_port: parseInt(form.telnet_port),
        ssh_enabled: form.ssh_enabled, ssh_port: parseInt(form.ssh_port),
        ...(form.snmp_community_write ? { snmp_community_write: form.snmp_community_write } : {}),
      };
      // Only send password if user typed a new one; for existing OLT with empty field, backend uses stored password
      if (form.cli_password) payload.cli_password = form.cli_password;
      const d = await api.testConnection(olt?.id || null, payload);
      if (d.results) {
        setTestResult(d.results);
        if (d.results.snmp) setSnmpStatus(d.results.snmp.ok ? 'connected' : 'disconnected');
        if (d.results.telnet) setTelnetStatus(d.results.telnet.ok ? 'connected' : 'disconnected');
        const sOk = d.results.snmp?.ok;
        const tOk = d.results.telnet?.ok;
        toast[sOk ? 'success' : 'error'](`SNMP: ${sOk ? 'OK' : 'Failed'} | CLI: ${tOk === null ? 'N/A' : tOk ? 'OK' : 'Failed'}`);
      } else {
        toast.error('Test failed');
      }
    } catch { toast.error('Connection test failed'); }
    setTesting(false);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Please enter OLT Name'); return; }
    if (!form.ip_address.trim()) { toast.error('Please enter IP Address'); return; }
    setSaving(true);
    try {
      const model = form.type.replace(/^ZTE-/, '') || 'C320';
      const vendor = 'zte';
      const url = olt ? `/api/olt/${olt.id}` : '/api/olt';
      const method = olt ? 'PUT' : 'POST';
      // If no CLI username provided, disable CLI (SNMP-only mode)
      const cliEnabled = !!form.cli_username.trim();
      const savePayload: Record<string, unknown> = {
          name: form.name, ip_address: form.ip_address, model, vendor,
          snmp_community: form.snmp_community, snmp_community_write: form.snmp_community_write,
          snmp_port: parseInt(form.snmp_port),
          telnet_enabled: cliEnabled && !form.ssh_enabled, telnet_port: parseInt(form.telnet_port),
          ssh_enabled: cliEnabled && form.ssh_enabled, ssh_port: parseInt(form.ssh_port),
          cli_username: form.cli_username,
      };
      if (form.cli_password) savePayload.cli_password = form.cli_password;
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include',
        body: JSON.stringify(savePayload),
      });
      const d = await res.json();
      if (d.success) {
        toast.success('OLT saved! Testing connections...');
        // Auto-test after save
        try {
          const testPayload: Record<string, unknown> = {
            ip_address: form.ip_address, snmp_community: form.snmp_community,
            snmp_port: parseInt(form.snmp_port), cli_username: form.cli_username,
            telnet_port: parseInt(form.telnet_port),
            ssh_enabled: form.ssh_enabled, ssh_port: parseInt(form.ssh_port),
            ...(form.snmp_community_write ? { snmp_community_write: form.snmp_community_write } : {}),
          };
          if (form.cli_password) testPayload.cli_password = form.cli_password;
          const testD = await api.testConnection(d.id, testPayload);
          if (testD.results) {
            const sOk = testD.results.snmp?.ok;
            const tOk = testD.results.telnet?.ok;
            toast[sOk ? 'success' : 'warning'](
              `SNMP: ${sOk ? 'Connected' : 'Failed'} | CLI: ${tOk === null ? 'N/A (SNMP-only)' : tOk ? 'Connected' : 'Failed'}`
            );
          }
        } catch { /* ignore */ }
        onSuccess();
      } else {
        toast.error(d.message || 'Failed to save OLT');
      }
    } catch { toast.error('Network error'); }
    setSaving(false);
  };

  const OLT_TYPES = [
    'ZTE-C320', 'ZTE-C300', 'ZTE-C300-M', 'ZTE-C600', 'ZTE-C650',
  ];

  const statusBadge = (status: string) => {
    if (status === 'connected') return <span className="text-success text-xs flex items-center gap-1"><CheckCircle size={12} /> Connected</span>;
    if (status === 'disconnected') return <span className="text-tx3 text-xs flex items-center gap-1"><XCircle size={12} /> Disconnected</span>;
    if (status === 'not_configured') return <span className="text-tx3 text-xs flex items-center gap-1"><Minus size={12} /> N/A</span>;
    return null;
  };

  const testStatusBadge = (result: { ok: boolean | null; message: string } | null) => {
    if (!result) return null;
    if (result.ok === null)
      return <span className="text-tx3 text-xs flex items-center gap-1"><Minus size={12} /> {result.message}</span>;
    return result.ok
      ? <span className="text-success text-xs flex items-center gap-1"><CheckCircle size={12} /> {result.message}</span>
      : <span className="text-danger text-xs flex items-center gap-1"><XCircle size={12} /> {result.message}</span>;
  };

  if (loadingOlt) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay" onClick={onClose} />
      <div className="relative glass-card p-8 text-center"><Loader2 size={32} className="text-accent animate-spin mx-auto" /><p className="text-tx3 mt-3">Loading OLT data...</p></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" onClick={onClose} />
      <div className="relative glass-card w-full md:max-w-xl animate-slide-up md:animate-fade-in max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-2xl">
        <div className="modal-header sticky top-0">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Settings size={16} /> {mode === 'add' ? 'Add OLT Connection' : 'OLT Connection Settings'}
          </h2>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-sm mb-1.5">OLT Name</label>
              <input type="text" value={form.name} onChange={e => update('name', e.target.value)}
                placeholder="e.g. OLT-Singapore" className="input-field" />
            </div>
            <div>
              <label className="label-sm mb-1.5">IP Address</label>
              <input type="text" value={form.ip_address} onChange={e => update('ip_address', e.target.value)}
                placeholder="e.g. 172.16.1.1" className="input-field" />
            </div>
          </div>

          <div>
            <label className="label-sm mb-1.5">Type</label>
            <select value={form.type} onChange={e => update('type', e.target.value)} className="input-field">
              <option value="">Select Type</option>
              {OLT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* SNMP Section */}
          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd space-y-3">
            <div className="flex items-center gap-2">
              <Network size={16} className="text-accent" />
              <span className="text-sm font-semibold">SNMP</span>
              {testing && <Loader2 size={14} className="text-accent animate-spin ml-2" />}
              {!testing && testResult && <span className="ml-2">{testStatusBadge(testResult.snmp)}</span>}
              {!testing && !testResult && snmpStatus && <span className="ml-2">{statusBadge(snmpStatus)}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label-sm mb-1">Community (Read)</label>
                <input type="text" value={form.snmp_community} onChange={e => update('snmp_community', e.target.value)} className="input-field" placeholder="public" />
              </div>
              <div>
                <label className="label-sm mb-1">Community (Write)</label>
                <input type="text" value={form.snmp_community_write} onChange={e => update('snmp_community_write', e.target.value)} className="input-field" placeholder="optional, e.g. SNMPREAD" />
              </div>
              <div>
                <label className="label-sm mb-1">Port</label>
                <input type="number" value={form.snmp_port} onChange={e => update('snmp_port', e.target.value)} className="input-field" />
              </div>
            </div>
          </div>

          {/* CLI Access Section (Optional) */}
          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd space-y-3">
            <div className="flex items-center gap-2">
              <Terminal size={16} className={form.cli_username.trim() ? 'text-accent' : 'text-tx3'} />
              <span className="text-sm font-semibold">CLI Access <span className="text-tx3 font-normal text-xs">(optional)</span></span>
              {testing && <Loader2 size={14} className="text-accent animate-spin ml-2" />}
              {!testing && testResult && <span className="ml-2">{testStatusBadge(testResult.telnet)}</span>}
              {!testing && !testResult && telnetStatus && <span className="ml-2">{statusBadge(telnetStatus)}</span>}
            </div>
            {!form.cli_username.trim() && (
              <p className="text-xs text-tx3 italic">Leave empty for SNMP-only mode. Fill in to enable CLI access.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label-sm mb-1">Username</label>
                <input type="text" value={form.cli_username} onChange={e => update('cli_username', e.target.value)} placeholder="Optional" className="input-field" />
              </div>
              <div>
                <label className="label-sm mb-1">Password</label>
                <input type="password" value={form.cli_password} onChange={e => update('cli_password', e.target.value)} placeholder={olt ? '•••• (unchanged)' : 'Optional'} className="input-field" />
              </div>
              <div>
                <label className="label-sm mb-1">Connection Mode</label>
                <div className="flex gap-2 items-center">
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" checked={!form.ssh_enabled} onChange={() => setForm(prev => ({ ...prev, ssh_enabled: false }))} />
                    Telnet
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" checked={form.ssh_enabled} onChange={() => setForm(prev => ({ ...prev, ssh_enabled: true }))} />
                    SSH
                  </label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label-sm mb-1">{form.ssh_enabled ? 'SSH Port' : 'Telnet Port'}</label>
                <input type="number" value={form.ssh_enabled ? form.ssh_port : form.telnet_port}
                  onChange={e => form.ssh_enabled ? update('ssh_port', e.target.value) : update('telnet_port', e.target.value)}
                  className="input-field" />
              </div>
            </div>
          </div>

        </div>

        <div className="modal-footer justify-between sticky bottom-0">
          <button onClick={onClose} className="btn-cancel text-xs md:text-sm"><X size={14} className="inline mr-1" /> Close</button>
          <div className="flex gap-2">
            <button onClick={testConnection} disabled={testing || !form.ip_address} className="btn-warning">
              <Activity size={14} className={testing ? 'animate-spin inline mr-1' : 'inline mr-1'} />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {saving ? 'Saving...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Sub-components ═══ */

function ConnectionBadge({ icon, label, connected }: { icon: React.ReactNode; label: string; connected: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
      connected ? 'bg-success/15 text-success border-success/20' : 'bg-offline/15 text-tx3 border-offline/20')}>
      {icon} {label} {connected ? 'Connected' : 'Disconnected'}
    </span>
  );
}

function ActionBtn({ icon, title, onClick, danger, loading }: {
  icon: React.ReactNode; title: string; onClick: () => void; danger?: boolean; loading?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} disabled={loading}
      className={cn('p-1.5 rounded-lg transition-colors disabled:opacity-50',
        danger ? 'hover:bg-danger/15 text-tx3 hover:text-danger' : 'hover:bg-glass text-tx3 hover:text-tx1')}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
    </button>
  );
}

/* ═══ Backup History Modal ═══ */

interface BackupEntry {
  id: number;
  backup_type: string;
  status: string;
  config_size: number;
  error_message: string;
  created_at: string;
}

function BackupHistoryModal({ oltId, oltName, onClose }: {
  oltId: number; oltName: string; onClose: () => void;
}) {
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [interval, setIntervalVal] = useState(24);
  const [unit, setUnit] = useState<'hours' | 'days'>('hours');
  const [backupTime, setBackupTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [backing, setBacking] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['olt-backups', oltId],
    queryFn: async () => {
      const res = await fetch(`/api/olt/${oltId}/backups`, { credentials: 'include' });
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.success) {
      setAutoEnabled(data.auto_backup_enabled);
      setIntervalVal(data.auto_backup_interval || 24);
      setUnit(data.auto_backup_unit || 'hours');
      setBackupTime(data.auto_backup_time || '');
    }
  }, [data]);

  const backups: BackupEntry[] = data?.backups || [];

  const toggleAuto = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/olt/${oltId}/auto-backup`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ enabled: !autoEnabled, interval, unit, time: backupTime }),
      });
      const d = await res.json();
      if (d.success) {
        setAutoEnabled(d.auto_backup_enabled);
        toast.success(d.message);
      } else { toast.error(d.message || 'Failed to toggle'); }
    } catch { toast.error('Failed to toggle'); }
    setSaving(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/olt/${oltId}/auto-backup`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ interval, unit, time: backupTime }),
      });
      const d = await res.json();
      if (d.success) { toast.success('Settings saved'); }
      else { toast.error(d.message || 'Failed'); }
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const doBackup = async () => {
    setBacking(true);
    try {
      const res = await fetch(`/api/olt/${oltId}/backup-save`, { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (d.success) { toast.success(d.message); refetch(); }
      else { toast.error(d.message || 'Backup failed'); }
    } catch { toast.error('Backup failed'); }
    setBacking(false);
  };

  const downloadBackup = (backupId: number) => {
    window.location.href = `/api/olt/${oltId}/backup/${backupId}/download`;
  };

  const deleteBackup = async (backupId: number) => {
    const ok = await confirm({
      title: 'Delete Backup', message: 'Delete this config backup? This cannot be undone.',
      confirmLabel: 'Delete', variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/olt/${oltId}/backup/${backupId}`, { method: 'DELETE', credentials: 'include' });
      const d = await res.json();
      if (d.success) { toast.success('Backup deleted'); refetch(); }
      else { toast.error(d.message || 'Delete failed'); }
    } catch { toast.error('Delete failed'); }
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="modal-overlay" onClick={onClose} />
      <div className="relative glass-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="modal-header">
          <h2 className="text-sm font-semibold flex items-center gap-2"><History size={16} /> Config Backups — {oltName}</h2>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
        </div>

        <div className="p-3 md:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Auto-backup settings */}
          <div className="glass-card p-3 md:p-4 border border-brd">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {autoEnabled ? (
                  <ToggleRight size={22} className="text-accent cursor-pointer" onClick={toggleAuto} />
                ) : (
                  <ToggleLeft size={22} className="text-tx3 cursor-pointer" onClick={toggleAuto} />
                )}
                <div>
                  <div className="text-sm font-semibold">Auto-Backup</div>
                  <div className="text-xs text-tx3">
                    {autoEnabled ? `Enabled — every ${interval} ${unit === 'days' ? 'day(s)' : 'hour(s)'}${backupTime ? ` at ${backupTime}` : ''}` : 'Disabled'}
                    {data?.last_backup_at && ` • Last: ${formatDate(data.last_backup_at)}`}
                  </div>
                </div>
              </div>
              <button onClick={doBackup} disabled={backing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 text-sm font-medium transition-all disabled:opacity-50">
                {backing ? <Loader2 size={14} className="animate-spin" /> : <HardDriveDownload size={14} />}
                Backup Now
              </button>
            </div>
            {autoEnabled && (
              <div className="space-y-3 mt-3 pt-3 border-t border-brd/50">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-tx3 font-medium">Every:</label>
                  <input type="number" min={1} max={unit === 'days' ? 30 : 168} value={interval}
                    onChange={e => setIntervalVal(Number(e.target.value))}
                    className="w-16 px-2 py-1 rounded-lg bg-glass border border-brd text-sm text-center focus:border-accent/50 outline-none" />
                  <select value={unit} onChange={e => { setUnit(e.target.value as 'hours' | 'days'); setIntervalVal(e.target.value === 'days' ? 1 : 24); }}
                    className="px-2 py-1 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none">
                    <option value="hours">hour(s)</option>
                    <option value="days">day(s)</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-tx3 font-medium">At time:</label>
                  <input type="time" value={backupTime}
                    onChange={e => setBackupTime(e.target.value)}
                    className="px-2 py-1 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none" />
                  <span className="text-xs text-tx3">(empty = anytime, uses system timezone)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveSettings} disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 text-xs font-medium transition-all disabled:opacity-50">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Settings
                  </button>
                  <span className="text-xs text-tx3">Cron runs hourly, backs up when interval + time matched</span>
                </div>
              </div>
            )}
          </div>

          {/* Backup list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Backup History</h3>
              <button onClick={() => refetch()} className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-accent" /></div>
            ) : backups.length === 0 ? (
              <div className="text-center py-8 text-tx3 text-sm">
                <History size={32} className="mx-auto mb-2 opacity-30" />
                No backups yet. Click "Backup Now" to create one.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-glass border border-brd/50 hover:border-brd transition-colors">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      b.status === 'success' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                      {b.status === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatDate(b.created_at)}</span>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                          b.backup_type === 'auto' ? 'bg-accent/15 text-accent' : 'bg-glass text-tx3')}>
                          {b.backup_type === 'auto' ? 'Auto' : 'Manual'}
                        </span>
                      </div>
                      <div className="text-xs text-tx3 truncate">
                        {b.status === 'success' ? fmtSize(b.config_size) : (b.error_message || 'Failed')}
                      </div>
                    </div>
                    {b.status === 'success' && (
                      <button onClick={() => downloadBackup(b.id)} title="Download"
                        className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors">
                        <Download size={14} />
                      </button>
                    )}
                    <button onClick={() => deleteBackup(b.id)} title="Delete"
                      className="p-1.5 rounded-lg hover:bg-danger/15 text-tx3 hover:text-danger transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

