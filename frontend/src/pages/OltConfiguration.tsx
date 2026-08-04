import { useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn, formatDate } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { TutorialBanner } from '../components/TutorialBanner';
import {
  Server, Activity, HardDrive, Network, Globe, Gauge, Settings,
  CheckCircle, XCircle, ChevronDown, ChevronRight, RefreshCw,
  Edit3, Trash2, Pause, Play, Wifi, Plus, ArrowUp, ArrowDown, Filter
} from 'lucide-react';
import { RackDiagramRouter } from '../components/rack/RackDiagramRouter';
import { useHasPerm } from '../hooks/useHasPerm';

const TABS = [
  { id: 'uplinks', label: 'Uplinks', icon: <Network size={15} /> },
  { id: 'pon-cards', label: 'PON Cards', icon: <HardDrive size={15} /> },
  { id: 'vlans', label: 'VLANs', icon: <Globe size={15} /> },
  { id: 'onu-types', label: 'ONU Types', icon: <Settings size={15} /> },
  { id: 'wan-ip', label: 'WAN-IP Profiles', icon: <Globe size={15} /> },
  { id: 'speed', label: 'Speed Profiles', icon: <Gauge size={15} /> },
  { id: 'system', label: 'System', icon: <Settings size={15} /> },
];

export function OltConfiguration() {
  const { oltId } = useParams();
  const navigate = useNavigate();
  const id = Number(oltId);
  const [activeTab, setActiveTab] = useState('uplinks');
  const hasPerm = useHasPerm();
  const canManage = hasPerm('settings_ip_olts');
  const { data: oltData } = useQuery({ queryKey: ['dashboard'], queryFn: () => fetch('/api/dashboard', { credentials: 'include' }).then(r => r.json()) });
  const olt = oltData?.olts?.find((o: {id:number}) => o.id === id);
  if (!olt) return <div className="text-center py-20 text-tx3">OLT not found</div>;
  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 text-xs md:text-sm text-tx3 overflow-x-auto whitespace-nowrap">
        <button onClick={() => navigate('/dashboard')} className="hover:text-accent">Home</button><span>/</span>
        <button onClick={() => navigate('/dashboard/settings/olts')} className="hover:text-accent">Settings</button><span>/</span>
        <span className="text-tx1">Configurations</span>
        <div className="ml-auto">
          <TutorialBanner
            title="Panduan OLT Configuration"
            steps={[
              { title: 'Uplinks', content: <><p>Konfigurasi port uplink OLT (ge_0/1, ge_0/2, dll). Menampilkan speed, duplex, VLAN mode (trunk/access/hybrid), dan trunk VLANs.</p><p className="text-xs text-tx3 mt-1">Klik <strong>Sync Data</strong> untuk fetch uplink info dari OLT via Telnet. Edit untuk ubah VLAN mode dan trunk VLANs.</p></> },
              { title: 'PON Cards', content: <><p>Menampilkan kartu GPON yang terpasang di slot OLT (show card). Termasuk card type, status, hardware version, dan port count.</p><p className="text-xs text-tx3 mt-1">Klik <strong>Refresh</strong> untuk re-fetch card info. Rack diagram menampilkan visual chassis dengan slot dan port.</p></> },
              { title: 'VLANs', content: <><p>Daftar semua VLAN di OLT (show vlan summary). Tambah/edit/hapus VLAN (vlan database context).</p><p className="text-xs text-tx3 mt-1">VLAN wajib dibuat di sini sebelum digunakan di service-port ONU atau uplink trunk.</p></> },
              { title: 'ONU Types', content: <><p>Daftar ONU type terdaftar di OLT (show onu-type). Tambah/hapus type untuk provisioning ONU baru.</p><p className="text-xs text-tx3 mt-1">ONU type wajib ada sebelum register/provision ONU baru. Contoh: <code>ZTE-F660</code>, <code>ZTE-F670L</code>.</p></> },
              { title: 'WAN-IP Profiles', content: <><p>Profile WAN IP untuk DHCP/PPPoE mode ONU. Berisi IP address, netmask, dan gateway.</p><p className="text-xs text-tx3 mt-1">Dibutuhkan jika ONU menggunakan WAN mode DHCP (bukan bridge). Buat profile sebelum provisioning.</p></> },
              { title: 'Speed Profiles', content: <><p>TCONT profile (upload bandwidth) dan Traffic profile (download limit). TCONT wajib untuk provisioning.</p><p className="text-xs text-tx3 mt-1"><strong>TCONT</strong>: type 1-5, maximum bandwidth. <strong>Traffic</strong>: SIR (committed) + PIR (peak) rate.</p></> },
              { title: 'System', content: <><p>Info sistem OLT: hostname, uptime, CPU, memory, temperature, fan status, dan power supply.</p><p className="text-xs text-tx3 mt-1">Data diambil via Telnet <code>show processor</code>, <code>show fan</code>, <code>show power</code>.</p></> },
            ]}
            tips={
              <>
                <strong className="text-tx2">Tips:</strong>
                <ul className="mt-1 ml-4 space-y-0.5">
                  <li>Urutan setup: VLANs → ONU Types → Speed Profiles → baru provision ONU</li>
                  <li>Sync Data di tab Uplinks untuk fetch running-config dari OLT</li>
                  <li>Rack diagram visual menampilkan chassis, slot, fan, dan PSU real-time</li>
                </ul>
              </>
            }
          />
        </div>
      </div>

      {/* OLT Header */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-glass flex items-center justify-center border-2 border-brd flex-shrink-0">
              <Server size={24} className={cn(olt.is_online ? 'text-success' : 'text-danger', 'md:hidden')} />
              <Server size={32} className={cn(olt.is_online ? 'text-success' : 'text-danger', 'hidden md:block')} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 md:gap-3">
                <h2 className="text-lg md:text-xl font-bold truncate">{olt.name}</h2>
                <span className={cn('px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-[10px] md:text-xs font-medium flex-shrink-0', olt.is_online ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                  {olt.is_online ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-3 md:gap-6 text-xs md:text-sm">
            <div><div className="text-[10px] text-tx3 uppercase">Model</div><strong className="truncate block">{olt.model}</strong></div>
            {olt.firmware_version && <div><div className="text-[10px] text-tx3 uppercase">Firmware</div><strong className="text-[11px] truncate block">{String(olt.firmware_version).substring(0, 30)}</strong></div>}
            <div><div className="text-[10px] text-tx3 uppercase">IP Address</div><strong>{olt.ip_address}</strong></div>
            <div><div className="text-[10px] text-tx3 uppercase">Last Sync</div><strong className="text-xs">{formatDate(olt.last_sync)}</strong></div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {(() => {
        const cards = (olt as Record<string, unknown>).cards as Array<Record<string, unknown>> || [];
        const gponCount = cards.filter(c => String(c.card_type || '').toUpperCase().startsWith('GTG')).length;
        const eponCount = cards.filter(c => String(c.card_type || '').toUpperCase().startsWith('ETG')).length;
        const fans = (olt as Record<string, unknown>).fans as Array<Record<string, unknown>> || [];
        const uplinkCount = Number((olt as Record<string, unknown>).uplink_count || 0);
        return (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 md:gap-3">
            <MiniStat label="Uplink" value={uplinkCount} />
            <MiniStat label="GPON" value={gponCount} />
            <MiniStat label="EPON" value={eponCount} />
            <MiniStat label="Fan" value={fans.length} />
            <MiniStat label="Total" value={olt.total_onu} />
            <MiniStat label="Online" value={olt.online_onu} color="text-success" />
            <MiniStat label="LOS" value={olt.los_onu} color="text-danger" />
            <MiniStat label="Gasp" value={olt.dyinggasp_onu} color="text-warning" />
            <MiniStat label="Offline" value={olt.offline_onu} color="text-tx3" />
          </div>
        );
      })()}

      {/* Port Map — standalone section above tabs */}
      <RackDiagramRouter oltId={String(id)} oltVendor={olt.vendor} oltModel={olt.model} oltName={olt.name} oltIp={olt.ip_address} isOnline={olt.is_online} lastSync={olt.last_sync} />

      {/* Configuration Tabs */}
      <div className="glass-card">
        <div className="flex gap-2 p-3 md:p-4 border-b border-brd overflow-x-auto scrollbar-thin">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn('flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-[11px] md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0',
                activeTab === tab.id ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:text-tx1 border border-brd')}>
              {tab.icon} <span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        <div className="p-3 md:p-5">
          {activeTab === 'uplinks' && <UplinksTab oltId={id} canManage={canManage} />}
          {activeTab === 'pon-cards' && <PonCardsTab oltId={id} canManage={canManage} />}
          {activeTab === 'vlans' && <VlansTab oltId={id} canManage={canManage} />}
          {activeTab === 'onu-types' && <OnuTypesTab oltId={id} canManage={canManage} />}
          {activeTab === 'wan-ip' && <WanIpTab oltId={id} canManage={canManage} />}
          {activeTab === 'speed' && <SpeedProfilesTab oltId={id} canManage={canManage} />}
          {activeTab === 'system' && <SystemTab olt={olt} />}
        </div>
      </div>
    </div>
  );
}

// ═══ HELPERS ═══

function toBitsPerSec(val: number, unit: string): number {
  switch (unit) {
    case 'Gbps': return val * 1_000_000_000;
    case 'Mbps': return val * 1_000_000;
    case 'Kbps': return val * 1_000;
    case 'bps':  return val;
    // Bytes-per-second variants — multiply by 8
    case 'GBps': return val * 1_000_000_000 * 8;
    case 'MBps': return val * 1_000_000 * 8;
    case 'KBps': return val * 1_000 * 8;
    case 'Bps':  return val * 8;
    default:     return val;
  }
}

function parseBps(rate: unknown): number {
  if (!rate) return 0;
  const s = String(rate);
  const m = s.match(/^([\d.]+)\s*(Gbps|Mbps|Kbps|bps|GBps|MBps|KBps|Bps)/);
  if (!m) return 0;
  return toBitsPerSec(parseFloat(m[1]), m[2]); // always bits/sec
}

function formatRate(rate: unknown): string {
  if (!rate || rate === '-' || rate === '0 Bps' || rate === '0 bps') return '0 bps';
  const s = String(rate);
  // Case-sensitive match to distinguish Mbps (bits) from MBps (bytes)
  const match = s.match(/^([\d.]+)\s*(Gbps|Mbps|Kbps|bps|GBps|MBps|KBps|Bps)/);
  if (match) {
    const bits = toBitsPerSec(parseFloat(match[1]), match[2]);
    if (bits >= 1_000_000_000) return `${(bits / 1_000_000_000).toFixed(2)} Gbps`;
    if (bits >= 1_000_000)     return `${(bits / 1_000_000).toFixed(2)} Mbps`;
    if (bits >= 1_000)         return `${(bits / 1_000).toFixed(1)} Kbps`;
    return `${bits.toFixed(0)} bps`;
  }
  return s;
}

function formatBytes(bytes: unknown): string {
  if (!bytes || bytes === '-' || bytes === '0') return '0 B';
  const val = Number(bytes);
  if (isNaN(val)) return String(bytes);
  if (val >= 1073741824) return `${(val / 1073741824).toFixed(2)} GB`;
  if (val >= 1048576) return `${(val / 1048576).toFixed(2)} MB`;
  if (val >= 1024) return `${(val / 1024).toFixed(1)} KB`;
  return `${val} B`;
}

// ═══ UPLINKS TAB ═══

function UplinksTab({ oltId, canManage }: { oltId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const [slotFilter, setSlotFilter] = useState<string>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['olt-uplinks', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/uplinks`, { credentials: 'include' }); return r.json(); },
  });
  // Live traffic polling via SNMP (separate query, merges into uplinks data)
  const { data: liveData } = useQuery({
    queryKey: ['olt-uplinks-live', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/uplinks/live-traffic`, { credentials: 'include' }); return r.json(); },
    refetchInterval: 3000,
    enabled: !isLoading,
  });
  const refreshMut = useMutation({
    mutationFn: async () => { await fetch(`/api/olt/${oltId}/uplink/refresh`, { method: 'POST', credentials: 'include' }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-uplinks', oltId] }); toast.success('Uplinks refreshed'); },
  });
  const toggleMut = useMutation({
    mutationFn: async ({ uplinkId, action }: { uplinkId: number; action: string }) => {
      await fetch(`/api/olt/${oltId}/uplink/${uplinkId}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-uplinks', oltId] }); toast.success('Port toggled'); },
  });
  const descMut = useMutation({
    mutationFn: async ({ uplinkId, description }: { uplinkId: number; description: string }) => {
      await fetch(`/api/olt/${oltId}/uplink/${uplinkId}/description`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ description }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-uplinks', oltId] }); toast.success('Description updated'); },
  });
  const vlanMut = useMutation({
    mutationFn: async ({ uplinkId, vlans, mode }: { uplinkId: number; vlans: string; mode: string }) => {
      const vlanList = vlans.split(',').map(v => v.trim()).filter(Boolean);
      await fetch(`/api/olt/${oltId}/uplink/${uplinkId}/vlan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ vlan_ids: vlanList, mode: mode || 'trunk' }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-uplinks', oltId] }); toast.success('VLANs updated'); },
  });
  const configMut = useMutation({
    mutationFn: async ({ uplinkId, ...data }: { uplinkId: number; speed?: string; duplex?: string; negotiation?: string; flowcontrol?: string; description?: string; admin?: string }) => {
      const { admin, ...payload } = data;
      // Toggle admin first if changed
      if (admin) {
        await fetch(`/api/olt/${oltId}/uplink/${uplinkId}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: admin === 'up' ? 'enable' : 'disable' }) });
      }
      await fetch(`/api/olt/${oltId}/uplink/${uplinkId}/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-uplinks', oltId] }); toast.success('Port configured'); },
  });
  const vlanRemoveMut = useMutation({
    mutationFn: async ({ uplinkId, vlanId }: { uplinkId: number; vlanId: string }) => {
      const r = await fetch(`/api/olt/${oltId}/uplink/${uplinkId}/vlan/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ vlan_ids: [vlanId] }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-uplinks', oltId] }); toast.success('VLAN removed'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove VLAN'),
  });
  const ipMut = useMutation({
    mutationFn: async ({ uplinkId, ip_vlan_id, ip_address, ip_mask, ip_gateway }: { uplinkId: number; ip_vlan_id: number; ip_address: string; ip_mask: string; ip_gateway: string }) => {
      const r = await fetch(`/api/olt/${oltId}/uplink/${uplinkId}/ip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ip_vlan_id, ip_address, ip_mask, ip_gateway }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-uplinks', oltId] }); toast.success('IP configuration applied'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to set IP'),
  });

  // Merge live traffic data into uplinks
  const uplinks = (data?.uplinks || []).map((u: Record<string, unknown>) => {
    const live = (liveData?.uplinks || []).find((l: Record<string, unknown>) => l.id === u.id);
    if (live) {
      return {
        ...u,
        input_rate: live.in_rate_str || u.input_rate,
        output_rate: live.out_rate_str || u.output_rate,
        input_utilization: live.in_util || u.input_utilization,
        output_utilization: live.out_util || u.output_utilization,
        total_in_bytes: live.total_in,
        total_out_bytes: live.total_out,
      };
    }
    return u;
  });
  const liveTs = liveData?.ts;

  // Extract unique slots from uplink port names (e.g. gei_1/10/1 -> slot 10)
  const slotOptions = Array.from(new Set(
    (data?.uplinks || [])
      .map((u: Record<string, unknown>) => {
        const name = String(u.port_name || '');
        const m = name.match(/\d+\/(\d+)\/\d+/);
        return m ? { slot: m[1], name } : null;
      })
      .filter(Boolean)
  )) as Array<{ slot: string; name: string }>;
  const uniqueSlots = Array.from(new Map(slotOptions.map(s => [s.slot, s])).values());

  // Apply slot filter
  const filteredUplinks = slotFilter === 'all'
    ? uplinks
    : uplinks.filter((u: Record<string, unknown>) => {
        const name = String(u.port_name || '');
        const m = name.match(/\d+\/(\d+)\/\d+/);
        return m && m[1] === slotFilter;
      });

  if (uplinks.length === 0) return <EmptyTab message="No uplink ports found. Run Sync to collect." />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h6 className="text-sm font-semibold flex items-center gap-2"><Network size={16} /> Uplink Ports</h6>
        <div className="flex items-center gap-3">
          {uniqueSlots.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-tx3" />
              <select
                value={slotFilter}
                onChange={e => setSlotFilter(e.target.value)}
                className="text-xs bg-glass border border-brd rounded-lg px-2 py-1.5 text-tx2 focus:outline-none focus:border-accent"
              >
                <option value="all">All Slots ({uplinks.length})</option>
                {uniqueSlots.map(s => {
                  const count = uplinks.filter((u: Record<string, unknown>) => {
                    const m = String(u.port_name || '').match(/\d+\/(\d+)\/\d+/);
                    return m && m[1] === s.slot;
                  }).length;
                  return <option key={s.slot} value={s.slot}>Slot {s.slot} ({count})</option>;
                })}
              </select>
            </div>
          )}
          {liveTs && <span className="text-xs text-tx3">Live {new Date(liveTs * 1000).toLocaleTimeString()}</span>}
          <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-glass border border-brd hover:border-accent/30 transition-all disabled:opacity-50">
            <RefreshCw size={14} className={refreshMut.isPending ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync Data</span>
          </button>
        </div>
      </div>
      {filteredUplinks.map((up: Record<string, unknown>) => (
        <UplinkCard key={String(up.id)} uplink={up} canManage={canManage} onToggle={toggleMut} onDesc={descMut} onVlan={vlanMut} onVlanRemove={vlanRemoveMut} onConfig={configMut} onIp={ipMut} />
      ))}
    </div>
  );
}

function UplinkCard({ uplink, canManage, onToggle, onDesc, onVlan, onVlanRemove, onConfig, onIp }: {
  uplink: Record<string, unknown>;
  canManage: boolean;
  onToggle: { mutate: (v: { uplinkId: number; action: string }) => void };
  onDesc: { mutate: (v: { uplinkId: number; description: string }) => void };
  onVlan: { mutate: (v: { uplinkId: number; vlans: string; mode: string }) => void };
  onVlanRemove: { mutate: (v: { uplinkId: number; vlanId: string }) => void };
  onConfig: { mutate: (v: { uplinkId: number; speed?: string; duplex?: string; negotiation?: string; flowcontrol?: string; description?: string; admin?: string }) => void };
  onIp: { mutate: (v: { uplinkId: number; ip_vlan_id: number; ip_address: string; ip_mask: string; ip_gateway: string }) => void };
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(String(uplink.description || ''));
  const [editingVlan, setEditingVlan] = useState(false);
  const [vlanVal, setVlanVal] = useState(String(uplink.vlans_tagged || ''));
  const [vlanMode, setVlanMode] = useState(String(uplink.switchport_mode || 'trunk'));
  const [showPortConfig, setShowPortConfig] = useState(false);
  const [editingIp, setEditingIp] = useState(false);
  const [ipForm, setIpForm] = useState({
    ip_vlan_id: Number(uplink.ip_vlan_id || 0),
    ip_address: String(uplink.ip_address || ''),
    ip_mask: String(uplink.ip_mask || ''),
    ip_gateway: String(uplink.ip_gateway || ''),
  });
  const [cfgForm, setCfgForm] = useState({
    speed: '', duplex: String(uplink.duplex || 'full'), negotiation: String(uplink.negotiation || 'disable'),
    flowcontrol: String(uplink.flowcontrol || 'disable'), description: String(uplink.description || ''),
    admin: String(uplink.admin_status || 'up'),
  });
  const [trafficHistory, setTrafficHistory] = useState<Array<{t: number; inn: number; out: number}>>([]);
  useEffect(() => {
    const inn = parseBps(uplink.input_rate);
    const out = parseBps(uplink.output_rate);
    setTrafficHistory(prev => [...prev, { t: Date.now(), inn, out }].slice(-30));
  }, [uplink.input_rate, uplink.output_rate]);
  const isUp = String(uplink.oper_status).toLowerCase() === 'up';
  const isAdminUp = String(uplink.admin_status).toLowerCase() === 'up';
  const vlans = String(uplink.vlans_tagged || '').split(',').filter((v: string) => v.trim());

  return (
    <div className={cn('rounded-xl border-l-4 p-3 md:p-4 transition-all', isUp ? 'border-l-success bg-glass' : 'border-l-danger bg-glass')}>
      <div className="flex items-center justify-between cursor-pointer gap-2" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0', isUp ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {String(uplink.medium || '').includes('fiber') ? <Wifi size={16} /> : <Network size={16} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <strong className="text-sm truncate">{String(uplink.port_name)}</strong>
              {editingDesc ? (
                <div className="flex items-center gap-1">
                  <input type="text" value={descVal} onChange={e => setDescVal(e.target.value)} autoFocus
                    className="h-6 px-2 rounded bg-glass border border-brd text-xs w-24 md:w-32"
                    onKeyDown={e => { if (e.key === 'Enter') { onDesc.mutate({ uplinkId: Number(uplink.id), description: descVal }); setEditingDesc(false); } if (e.key === 'Escape') setEditingDesc(false); }} />
                  <button onClick={() => { onDesc.mutate({ uplinkId: Number(uplink.id), description: descVal }); setEditingDesc(false); }} className="text-success"><CheckCircle size={12} /></button>
                </div>
              ) : (
                uplink.description ? <span className="text-xs text-tx3 cursor-pointer hover:text-accent hidden sm:inline" onClick={e => { e.stopPropagation(); if (canManage) setEditingDesc(true); }}>({String(uplink.description)})</span> : null
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium', isUp ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
                {String(uplink.oper_status || '-').toUpperCase()}
              </span>
              <span className="text-[10px] md:text-xs text-tx3 truncate">{String(uplink.speed || 'N/A')} <span className="hidden sm:inline">{String(uplink.duplex || '').toUpperCase()} {String(uplink.medium || '')}</span></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          <div className="text-right text-[9px] md:text-xs">
            <div className="text-tx3 hidden sm:block">DL / UL</div>
            <div className="font-bold">
              <span className="hidden sm:inline">{formatRate(uplink.input_rate)} / {formatRate(uplink.output_rate)}</span>
              <span className="sm:hidden text-[9px]">
                <span className="text-accent">↓{formatRate(uplink.input_rate).replace(' ', '')}</span>{' '}
                <span className="text-success">↑{formatRate(uplink.output_rate).replace(' ', '')}</span>
              </span>
            </div>
          </div>
          <div className="flex gap-1">
            {canManage && <button onClick={e => { e.stopPropagation(); onToggle.mutate({ uplinkId: Number(uplink.id), action: isAdminUp ? 'disable' : 'enable' }); }}
              className={cn('p-1.5 rounded-lg transition-colors', isAdminUp ? 'hover:bg-warning/15 text-tx3 hover:text-warning' : 'hover:bg-success/15 text-tx3 hover:text-success')}>
              {isAdminUp ? <Pause size={14} /> : <Play size={14} />}
            </button>}
            {canManage && <button onClick={e => { e.stopPropagation(); setShowPortConfig(true); }} className="p-1.5 rounded-lg hover:bg-accent/15 text-tx3 hover:text-accent hidden sm:flex"><Settings size={14} /></button>}
          </div>
          {expanded ? <ChevronDown size={16} className="text-tx3" /> : <ChevronRight size={16} className="text-tx3" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-brd grid grid-cols-1 gap-3 animate-fade-in">
          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <h6 className="text-xs font-semibold text-tx3 uppercase mb-3 flex items-center gap-1"><Settings size={12} /> Interface Configuration</h6>
            <div className="grid grid-cols-2 gap-2 text-xs md:text-sm">
              {([['Admin', uplink.admin_status], ['Oper', uplink.oper_status], ['Line Proto', uplink.line_protocol], ['Speed', uplink.speed || 'N/A'], ['Duplex', uplink.duplex], ['Medium', uplink.medium || 'N/A'], ['Negotiation', uplink.negotiation], ['Flow Control', uplink.flowcontrol]] as [string, unknown][]).map(([k, v]) => (
                <div key={k}><span className="text-tx3">{k}:</span> <strong>{String(v || '-').toUpperCase()}</strong></div>
              ))}
            </div>
          </div>

          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <h6 className="text-xs font-semibold text-tx3 uppercase mb-3 flex items-center gap-1"><Wifi size={12} /> Optical Module Info</h6>
            <div className="grid grid-cols-2 gap-2 text-xs md:text-sm">
              {(() => {
                const portName = String(uplink.port_name || '');
                const medium = String(uplink.medium || '').toLowerCase();
                const portType = String(uplink.port_type || '').toLowerCase();
                const isFiber = medium.includes('fiber') || portType === 'optical' || portName.startsWith('xgei') || portName.startsWith('gei');
                const sfpType = portName.startsWith('xgei') ? '10G SFP+' : portName.startsWith('gei') ? '1G SFP' : 'RJ45';
                const connector = portName.startsWith('xgei') ? 'LC' : isFiber ? 'LC Duplex' : 'RJ45';
                const transType = portName.startsWith('xgei') ? '10GBASE-LR' : '1000BASE-LX';
                const items: [string, unknown][] = [
                  ['Port', portName],
                  ['Module Type', sfpType],
                  ['Trans Type', transType],
                  ['Connector', connector],
                  ['Medium', isFiber ? 'Fiber' : 'Copper'],
                  ['Port Mode', String(uplink.phy_attribute || 'LAN').toUpperCase()],
                  ['Link Trap', String(uplink.linktrap || 'enable').toUpperCase()],
                ];
                // Add SFP DOM data if available
                const vendor = String(uplink.sfp_vendor || '');
                const serial = String(uplink.sfp_serial || '');
                const wavelength = String(uplink.sfp_wavelength || '');
                const distance = String(uplink.sfp_distance || '');
                const rxPower = String(uplink.sfp_rx_power || '');
                const txPower = String(uplink.sfp_tx_power || '');
                const temp = String(uplink.sfp_temperature || '');
                const voltage = String(uplink.sfp_voltage || '');
                const bias = String(uplink.sfp_bias_current || '');
                if (vendor) items.push(['Vendor', vendor]);
                if (serial) items.push(['SN', serial]);
                if (temp) items.push(['Temperature', temp + ' °C']);
                if (voltage) items.push(['Voltage', voltage + ' V']);
                if (txPower) items.push(['TX Power', txPower + ' dBm']);
                if (rxPower) items.push(['RX Power', rxPower + ' dBm']);
                if (bias) items.push(['TX Bias', bias + ' mA']);
                if (wavelength) items.push(['Wavelength', wavelength + ' nm']);
                if (distance) items.push(['Distance', distance]);
                // Show hint if no DOM data
                if (!vendor && !temp && !txPower) {
                  items.push(['DOM Data', 'Not available on this firmware']);
                }
                return items.map(([k, v]) => {
                  const val = String(v || 'N/A');
                  const isPower = k === 'RX Power' || k === 'TX Power';
                  let color = '';
                  if (isPower && val !== 'N/A') {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                      if (num >= -20) color = 'text-success';
                      else if (num >= -27) color = 'text-warning';
                      else color = 'text-danger';
                    }
                  }
                  return (
                    <div key={k}><span className="text-tx3">{k}:</span> <strong className={color}>{val}</strong></div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <div className="flex items-center justify-between mb-3">
              <h6 className="text-xs font-semibold text-tx3 uppercase flex items-center gap-1"><Globe size={12} /> VLAN Configuration</h6>
              {canManage && <button onClick={() => setEditingVlan(!editingVlan)} className="text-accent hover:text-accent-hover"><Edit3 size={12} /></button>}
            </div>
            <div className="text-sm mb-2"><span className="text-tx3">Mode:</span> <strong>{String(uplink.switchport_mode || 'trunk').toUpperCase()}</strong></div>
            <div className="text-xs text-tx3 mb-1">Tagged VLANs:</div>
            {editingVlan ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-tx3">Mode:</label>
                  <select value={vlanMode} onChange={e => setVlanMode(e.target.value)} className="h-7 px-2 rounded bg-glass border border-brd text-xs">
                    <option value="trunk">Trunk</option>
                    <option value="access">Access</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <textarea value={vlanVal} onChange={e => setVlanVal(e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-glass border border-brd text-xs font-mono" placeholder="e.g. 30,100,151" />
                <div className="flex gap-2">
                  <button onClick={() => { onVlan.mutate({ uplinkId: Number(uplink.id), vlans: vlanVal, mode: vlanMode }); setEditingVlan(false); }} className="px-3 py-1 rounded-lg bg-accent text-white text-xs">Save</button>
                  <button onClick={() => setEditingVlan(false)} className="px-3 py-1 rounded-lg bg-glass text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              vlans.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {vlans.map((vid: string, i: number) => (
                    <span key={i} className="group inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-accent/15 text-accent border border-accent/20">
                      {vid.trim()}
                      <button onClick={(e) => { e.stopPropagation(); onVlanRemove.mutate({ uplinkId: Number(uplink.id), vlanId: vid.trim() }); }} className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity">
                        <XCircle size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : <span className="text-xs text-tx3">None</span>
            )}
          </div>

          {/* IP Network Configuration */}
          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <div className="flex items-center justify-between mb-3">
              <h6 className="text-xs font-semibold text-tx3 uppercase flex items-center gap-1"><Globe size={12} /> IP Network</h6>
              {canManage && <button onClick={() => setEditingIp(!editingIp)} className="text-accent hover:text-accent-hover"><Edit3 size={12} /></button>}
            </div>
            {editingIp ? (
              <div className="space-y-2">
                <div><label className="text-xs text-tx3 block mb-1">VLAN ID</label>
                  <input type="number" value={ipForm.ip_vlan_id || ''} onChange={e => setIpForm({ ...ipForm, ip_vlan_id: Number(e.target.value) || 0 })}
                    className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm font-mono" placeholder="e.g. 88" /></div>
                <div><label className="text-xs text-tx3 block mb-1">IP Address</label>
                  <input value={ipForm.ip_address} onChange={e => setIpForm({ ...ipForm, ip_address: e.target.value })}
                    className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm font-mono" placeholder="e.g. 172.16.88.2" /></div>
                <div><label className="text-xs text-tx3 block mb-1">Subnet Mask</label>
                  <input value={ipForm.ip_mask} onChange={e => setIpForm({ ...ipForm, ip_mask: e.target.value })}
                    className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm font-mono" placeholder="e.g. 255.255.255.252" /></div>
                <div><label className="text-xs text-tx3 block mb-1">Gateway (optional)</label>
                  <input value={ipForm.ip_gateway} onChange={e => setIpForm({ ...ipForm, ip_gateway: e.target.value })}
                    className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm font-mono" placeholder="e.g. 172.16.88.1" /></div>
                <div className="text-[10px] text-tx3">IP will be set on VLAN interface and tagged to this uplink port.</div>
                <div className="flex gap-2">
                  <button onClick={() => { onIp.mutate({ uplinkId: Number(uplink.id), ...ipForm }); setEditingIp(false); }} className="px-3 py-1 rounded-lg bg-accent text-white text-xs">Save</button>
                  <button onClick={() => setEditingIp(false)} className="px-3 py-1 rounded-lg bg-glass text-xs">Cancel</button>
                  {String(uplink.ip_address || '') && <button onClick={() => { setIpForm({ ip_vlan_id: 0, ip_address: '', ip_mask: '', ip_gateway: '' }); onIp.mutate({ uplinkId: Number(uplink.id), ip_vlan_id: Number(uplink.ip_vlan_id || 0), ip_address: '', ip_mask: '', ip_gateway: '' }); setEditingIp(false); }} className="px-3 py-1 rounded-lg bg-danger/15 text-danger text-xs">Remove IP</button>}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1 text-xs md:text-sm">
                {String(uplink.ip_address || '') ? (
                  <>
                    <div><span className="text-tx3">VLAN:</span> <strong className="font-mono">{String(uplink.ip_vlan_id || '-')}</strong></div>
                    <div><span className="text-tx3">IP Address:</span> <strong className="font-mono">{String(uplink.ip_address)}</strong></div>
                    <div><span className="text-tx3">Subnet Mask:</span> <strong className="font-mono">{String(uplink.ip_mask || '-')}</strong></div>
                    {String(uplink.ip_gateway || '') && <div><span className="text-tx3">Gateway:</span> <strong className="font-mono">{String(uplink.ip_gateway)}</strong></div>}
                  </>
                ) : (
                  <div className="text-tx3"><em>No IP configured (L2 switchport)</em></div>
                )}
              </div>
            )}
          </div>

          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <h6 className="text-xs font-semibold text-tx3 uppercase mb-3 flex items-center gap-1"><Activity size={12} /> Traffic Statistics</h6>
            <div className="grid grid-cols-2 gap-2 md:gap-4 mb-3">
              {/* IN */}
              <div className="text-center">
                <div className="text-[10px] md:text-xs text-tx3 mb-1">▼ Download (IN)</div>
                <div className="text-base md:text-lg font-extrabold text-accent">{formatRate(uplink.input_rate)}</div>
                <div className="text-xs text-tx3 mt-0.5">Util: {String(uplink.input_utilization || '0%')}</div>
                <div className="h-2 rounded-full bg-glass overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(parseFloat(String(uplink.input_utilization || '0').replace('%', '')) * 10, 100)}%` }} />
                </div>
              </div>
              {/* OUT */}
              <div className="text-center">
                <div className="text-[10px] md:text-xs text-tx3 mb-1">▲ Upload (OUT)</div>
                <div className="text-base md:text-lg font-extrabold text-success">{formatRate(uplink.output_rate)}</div>
                <div className="text-xs text-tx3 mt-0.5">Util: {String(uplink.output_utilization || '0%')}</div>
                <div className="h-2 rounded-full bg-glass overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.min(parseFloat(String(uplink.output_utilization || '0').replace('%', '')) * 10, 100)}%` }} />
                </div>
              </div>
            </div>
            {/* Realtime sparkline */}
            {trafficHistory.length > 2 && (
              <div className="h-20 mb-3">
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart data={trafficHistory} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.4}/><stop offset="95%" stopColor="var(--color-info)" stopOpacity={0}/></linearGradient>
                      <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.4}/><stop offset="95%" stopColor="var(--color-success)" stopOpacity={0}/></linearGradient>
                    </defs>
                    <Tooltip formatter={(v: unknown, name: unknown) => [formatRate(String(v ?? 0) + ' bps'), name === 'inn' ? '▼ DL' : '▲ UL']} contentStyle={{ fontSize: '11px', padding: '4px 8px' }} />
                    <Area type="monotone" dataKey="inn" stroke="var(--color-info)" fill="url(#gIn)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="out" stroke="var(--color-success)" fill="url(#gOut)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border-t border-brd pt-3">
              <div><span className="text-tx3">In Total:</span> <strong>{formatBytes(uplink.total_in_bytes || uplink.input_bytes)}</strong></div>
              <div><span className="text-tx3">Out Total:</span> <strong>{formatBytes(uplink.total_out_bytes || uplink.output_bytes)}</strong></div>
              <div><span className="text-tx3">In Packets:</span> <strong>{formatBytes(uplink.input_packets)}</strong></div>
              <div><span className="text-tx3">Out Packets:</span> <strong>{formatBytes(uplink.output_packets)}</strong></div>
            </div>
          </div>

          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <h6 className="text-xs font-semibold text-tx3 uppercase mb-3 flex items-center gap-1"><XCircle size={12} /> Error Counters</h6>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-2 rounded-lg bg-glass/50">
                <div className="text-xs text-tx3">CRC Errors</div>
                <div className={cn('text-xl font-extrabold', Number(uplink.crc_errors) > 0 ? 'text-danger' : 'text-tx1')}>{String(uplink.crc_errors || '0')}</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-glass/50">
                <div className="text-xs text-tx3">Dropped</div>
                <div className={cn('text-xl font-extrabold', Number(uplink.dropped) > 0 ? 'text-warning' : 'text-tx1')}>{String(uplink.dropped || '0')}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Port Configuration Modal */}
      {showPortConfig && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="modal-overlay" onClick={() => setShowPortConfig(false)} />
          <div className="relative glass-card w-full md:max-w-lg md:mx-4 animate-slide-up md:animate-fade-in rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-brd sticky top-0 bg-surface">
              <h5 className="font-semibold flex items-center gap-2 text-sm md:text-base"><Settings size={16} /> Port Config: {String(uplink.port_name)}</h5>
              <button onClick={() => setShowPortConfig(false)} className="text-tx3 hover:text-tx1">✕</button>
            </div>
            <div className="p-4 space-y-4">
              {/* Admin Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-glass border border-brd">
                <div>
                  <div className="text-sm font-bold">Port Admin Status</div>
                  <div className="text-xs text-tx3">Enable or disable (shutdown / no shutdown)</div>
                </div>
                <button onClick={() => setCfgForm({ ...cfgForm, admin: cfgForm.admin === 'up' ? 'down' : 'up' })}
                  className={cn('w-12 h-6 rounded-full relative transition-colors', cfgForm.admin === 'up' ? 'bg-success' : 'bg-danger')}>
                  <div className={cn('w-4 h-4 rounded-full bg-white absolute top-1 transition-all', cfgForm.admin === 'up' ? 'left-7' : 'left-1')} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-tx3 block mb-1">Speed</label>
                  <select value={cfgForm.speed} onChange={e => setCfgForm({ ...cfgForm, speed: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm">
                    <option value="">— No Change —</option><option value="100">100 Mbps</option><option value="1000">1 Gbps</option><option value="10000">10 Gbps</option>
                  </select></div>
                <div><label className="text-xs text-tx3 block mb-1">Duplex</label>
                  <select value={cfgForm.duplex} onChange={e => setCfgForm({ ...cfgForm, duplex: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm">
                    <option value="full">Full</option><option value="half">Half</option>
                  </select></div>
                <div><label className="text-xs text-tx3 block mb-1">Negotiation</label>
                  <select value={cfgForm.negotiation} onChange={e => setCfgForm({ ...cfgForm, negotiation: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm">
                    <option value="auto">Auto</option><option value="disable">Disable</option>
                  </select></div>
                <div><label className="text-xs text-tx3 block mb-1">Flow Control</label>
                  <select value={cfgForm.flowcontrol} onChange={e => setCfgForm({ ...cfgForm, flowcontrol: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm">
                    <option value="enable">Enable</option><option value="disable">Disable</option>
                  </select></div>
              </div>
              <div><label className="text-xs text-tx3 block mb-1">Description</label>
                <input value={cfgForm.description} onChange={e => setCfgForm({ ...cfgForm, description: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="Leave empty to keep current" /></div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-brd sticky bottom-0 bg-surface">
              <button onClick={() => setShowPortConfig(false)} className="px-4 py-1.5 rounded-lg bg-glass text-xs">Cancel</button>
              <button onClick={() => { onConfig.mutate({ uplinkId: Number(uplink.id), speed: cfgForm.speed, duplex: cfgForm.duplex, negotiation: cfgForm.negotiation, flowcontrol: cfgForm.flowcontrol, description: cfgForm.description, admin: cfgForm.admin }); setShowPortConfig(false); }} className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PonCardsTab({ oltId, canManage }: { oltId: number; canManage: boolean }) {
  const { data: ponData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['olt-pon-ports', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/pon-ports`, { credentials: 'include' }); return r.json(); },
  });
  const qc = useQueryClient();
  const toggleMut = useMutation({
    mutationFn: async ({ portId, action }: { portId: number; action: string }) => {
      await fetch(`/api/olt/${oltId}/pon-port/${portId}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-pon-ports', oltId] }); toast.success('PON port toggled'); },
  });
  const editMut = useMutation({
    mutationFn: async ({ portId, name, description }: { portId: number; name: string; description: string }) => {
      await fetch(`/api/olt/${oltId}/pon-port/${portId}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name, description }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-pon-ports', oltId] }); toast.success('PON port updated'); },
  });

  if (isLoading) return <TabSkeleton />;
  const ports: Array<Record<string, unknown>> = ponData?.ports || [];
  if (ports.length === 0) return <EmptyTab message="No PON ports found. Run Sync to collect." />;

  const totalOnu = ports.reduce((s: number, p: Record<string, unknown>) => s + Number(p.onu_count || 0), 0);
  const totalOnline = ports.reduce((s: number, p: Record<string, unknown>) => s + Number(p.onu_online || 0), 0);
  const gponCount = ports.filter(p => !String(p.port_name || '').startsWith('epon-olt')).length;
  const eponCount = ports.filter(p => String(p.port_name || '').startsWith('epon-olt')).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h6 className="text-sm font-semibold flex items-center gap-2"><HardDrive size={16} /> PON Cards & Ports</h6>
        <div className="flex items-center gap-2">
          <span className="text-xs text-tx3">{ports.length} Ports</span>
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-glass border border-brd hover:border-accent/30 transition-all disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 md:gap-6 p-3 md:p-4 rounded-xl bg-accent/5 border border-accent/20 mb-3">
        <div className="flex items-center gap-2"><HardDrive size={18} className="text-accent" /><strong className="text-xs md:text-sm">PON</strong></div>
        {gponCount > 0 && <span className="text-[10px] text-success font-mono">GPON: {gponCount}</span>}
        {eponCount > 0 && <span className="text-[10px] text-info font-mono">EPON: {eponCount}</span>}
        <div className="flex-1" />
        <div className="text-center"><div className="text-base md:text-lg font-extrabold">{totalOnu}</div><div className="text-[10px] md:text-xs text-tx3">Total</div></div>
        <div className="text-center"><div className="text-base md:text-lg font-extrabold text-success">{totalOnline}</div><div className="text-[10px] md:text-xs text-tx3">Online</div></div>
        <div className="text-center"><div className="text-base md:text-lg font-extrabold text-danger">{totalOnu - totalOnline}</div><div className="text-[10px] md:text-xs text-tx3">Offline</div></div>
      </div>
      {ports.map((pp: Record<string, unknown>, i: number) => (
        <PonPortCard key={String(pp.id ?? `ph-${i}`)} port={pp} canManage={canManage} onToggle={toggleMut} onEdit={editMut} oltId={oltId} />
      ))}
    </div>
  );
}

function PonPortCard({ port, canManage, onToggle, onEdit, oltId }: {
  port: Record<string, unknown>;
  canManage: boolean;
  onToggle: { mutate: (v: { portId: number; action: string }) => void };
  onEdit: { mutate: (v: { portId: number; name: string; description: string }) => void };
  oltId: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(String(port.name || ''));
  const [descVal, setDescVal] = useState(String(port.description || ''));
  const isUp = String(port.admin_status).toLowerCase() === 'up';
  const onuCount = Number(port.onu_count || 0);
  const onuOnline = Number(port.onu_online || 0);
  const util = onuCount > 0 ? Math.round((onuOnline / onuCount) * 100) : 0;
  const isPlaceholder = port.is_placeholder === true;
  const portName = String(port.port_name || '');
  const isEpon = portName.startsWith('epon-olt') || String(port.card_type || '').toUpperCase().startsWith('ETG');
  const hasId = port.id != null;

  const { data: onuList } = useQuery({
    queryKey: ['pon-onu-list', oltId, port.id, portName],
    queryFn: async () => {
      if (hasId) {
        const r = await fetch(`/api/olt/${oltId}/pon-port/${port.id}/onus`, { credentials: 'include' });
        return r.json();
      } else {
        const r = await fetch(`/api/olt/${oltId}/pon-port-by-name/${portName}/onus`, { credentials: 'include' });
        return r.json();
      }
    },
    enabled: expanded,
  });

  return (
    <div className={cn('rounded-xl border-l-4 p-3 md:p-4 transition-all', isPlaceholder ? 'border-l-info/40 bg-glass' : isUp ? 'border-l-success bg-glass' : 'border-l-danger bg-glass')}>
      <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center border-2 flex-shrink-0', isPlaceholder ? 'bg-glass-hover border-info/30 text-info' : isUp ? 'bg-glass-hover border-success/30 text-success' : 'bg-glass-hover border-brd text-tx3')}>
            <HardDrive size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <strong className="text-sm">Port {String(port.port_number)}</strong>
              {isEpon ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium bg-info/15 text-info">EPON</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium bg-success/15 text-success">GPON</span>
              )}
              {!isPlaceholder && (
                <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium', isUp ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{isUp ? 'UP' : 'DOWN'}</span>
              )}
              {isPlaceholder && (
                <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium', isUp ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{isUp ? 'UP' : 'DOWN'}</span>
              )}
              {String(port.name || '') && <span className="text-xs md:text-sm font-semibold text-accent truncate">{String(port.name)}</span>}
            </div>
            <div className="text-[10px] md:text-xs text-tx3 mt-0.5 truncate font-mono">{portName}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-4 flex-shrink-0">
          <div className="flex gap-1.5 md:gap-4 text-center">
            <div><div className="text-sm md:text-base font-extrabold">{onuCount}</div><div className="text-[10px] md:text-xs text-tx3">ONU</div></div>
            <div className="hidden sm:block"><div className="text-sm md:text-base font-extrabold text-success">{onuOnline}</div><div className="text-[10px] md:text-xs text-tx3">Online</div></div>
            <div className="hidden sm:block"><div className="text-sm md:text-base font-extrabold text-danger">{onuCount - onuOnline}</div><div className="text-[10px] md:text-xs text-tx3">Off</div></div>
          </div>
          <div className="w-10 md:w-20 hidden md:block">
            <div className="h-1.5 rounded-full bg-glass overflow-hidden">
              <div className={cn('h-full rounded-full', util > 80 ? 'bg-success' : util > 50 ? 'bg-warning' : 'bg-danger')} style={{ width: `${util}%` }} />
            </div>
            <div className="text-[10px] md:text-xs text-tx3 text-center mt-0.5">{util}%</div>
          </div>
          <div className="flex gap-1">
            {canManage && hasId && <button onClick={e => { e.stopPropagation(); onToggle.mutate({ portId: Number(port.id), action: isUp ? 'disable' : 'enable' }); }}
              className={cn('p-1.5 rounded-lg transition-colors', isUp ? 'hover:bg-warning/15 text-tx3 hover:text-warning' : 'hover:bg-success/15 text-tx3 hover:text-success')}>
              {isUp ? <Pause size={14} /> : <Play size={14} />}
            </button>}
            {canManage && hasId && <button onClick={e => { e.stopPropagation(); setEditing(true); }} className="p-1.5 rounded-lg hover:bg-accent/15 text-tx3 hover:text-accent hidden sm:flex"><Edit3 size={14} /></button>}
          </div>
          {expanded ? <ChevronDown size={16} className="text-tx3" /> : <ChevronRight size={16} className="text-tx3" />}
        </div>
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-brd space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs text-tx3">Name</label><input value={nameVal} onChange={e => setNameVal(e.target.value)} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
            <div><label className="text-xs text-tx3">Description</label><input value={descVal} onChange={e => setDescVal(e.target.value)} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { onEdit.mutate({ portId: Number(port.id), name: nameVal, description: descVal }); setEditing(false); }} className="px-3 py-1 rounded-lg bg-accent text-white text-xs">Save</button>
            <button onClick={() => setEditing(false)} className="px-3 py-1 rounded-lg bg-glass text-xs">Cancel</button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-brd animate-fade-in">
          <div className="p-3 rounded-lg bg-glass border border-brd mb-3">
            <h6 className="text-xs font-semibold text-tx3 uppercase mb-2 flex items-center gap-1">
              <Wifi size={12} /> Optical Module Info
            </h6>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs md:text-sm">
              {(() => {
                const sfpVendor = String(port.vendor || '');
                const sfpPN = String(port.type || 'GPON SFP');
                const sfpSN = String(port.serial || '');
                const sfpWL = String(port.wavelength || '');
                const sfpConnector = String(port.connector || 'SC');
                const sfpDist = String(port.distance || '');
                const sfpTxPower = String(port.tx_power || '');
                const sfpTemp = String(port.temperature || '');
                const sfpVolt = String(port.voltage || '');
                const sfpBias = String(port.bias_current || '');
                const sfpRxPower = String(port.rx_power || '');
                const items: [string, string][] = [
                  ['Port', String(port.port_name)],
                  ['Type', sfpPN],
                ];
                if (sfpVendor) items.push(['Vendor', sfpVendor]);
                if (sfpSN) items.push(['SN', sfpSN]);
                items.push(['Connector', sfpConnector || 'SC']);
                items.push(['Medium', 'Fiber']);
                if (sfpWL) items.push(['Wavelength', sfpWL + ' nm']);
                if (sfpDist) items.push(['Distance', sfpDist + ' km']);
                items.push(['Port Status', isUp ? 'Active' : 'Inactive']);
                items.push(['Link Trap', String(port.linktrap || 'disable')]);
                if (sfpTemp) items.push(['Temperature', sfpTemp + ' °C']);
                if (sfpVolt) items.push(['Supply Voltage', sfpVolt + ' V']);
                if (sfpTxPower) items.push(['TX Power', sfpTxPower + ' dBm']);
                if (sfpRxPower) items.push(['RX Power', sfpRxPower + ' dBm']);
                if (sfpBias) items.push(['TX Bias', sfpBias + ' mA']);
                return items.map(([k, v]) => (
                  <div key={k}><span className="text-tx3">{k}:</span> <strong>{v}</strong></div>
                ));
              })()}
            </div>
          </div>
          {hasId ? (
            <>
            <h6 className="text-xs font-semibold text-tx3 mb-2">ONU List for {String(port.port_name || port.port_number)}</h6>
            {onuList?.onus && onuList.onus.length > 0 ? (
            <div className="overflow-x-auto -mx-3 px-3">
              <table className="w-full text-xs">
                <thead><tr className="text-tx3"><th className="text-left py-1 px-2">#</th><th className="text-left py-1 px-2">ONU</th><th className="text-left py-1 px-2">Name</th><th className="text-left py-1 px-2">Status</th><th className="text-left py-1 px-2">RX Power</th></tr></thead>
                <tbody>
                  {onuList.onus.map((onu: Record<string, unknown>, i: number) => (
                    <tr key={String(onu.id)} className="border-t border-brd/50">
                      <td className="py-1 px-2">{i + 1}</td>
                      <td className="py-1 px-2 font-mono">{String(onu.onu_id)}</td>
                      <td className="py-1 px-2">{String(onu.name || onu.serial_number || '-')}</td>
                      <td className="py-1 px-2"><span className={cn('px-1.5 py-0.5 rounded text-xs', onu.status === 'online' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{String(onu.status)}</span></td>
                      <td className="py-1 px-2">{onu.onu_rx_power != null ? `${Number(onu.onu_rx_power).toFixed(2)} dBm` : (onu.rx_power != null ? `${Number(onu.rx_power).toFixed(2)} dBm` : '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="text-xs text-tx3">No ONU data for this port.</div>}
            </>
          ) : (
            <>
            <h6 className="text-xs font-semibold text-tx3 mb-2">ONU List for {portName}</h6>
            {onuList?.onus && onuList.onus.length > 0 ? (
            <div className="overflow-x-auto -mx-3 px-3">
              <table className="w-full text-xs">
                <thead><tr className="text-tx3"><th className="text-left py-1 px-2">#</th><th className="text-left py-1 px-2">ONU</th><th className="text-left py-1 px-2">Name</th><th className="text-left py-1 px-2">Status</th><th className="text-left py-1 px-2">RX Power</th></tr></thead>
                <tbody>
                  {onuList.onus.map((onu: Record<string, unknown>, i: number) => (
                    <tr key={String(onu.id)} className="border-t border-brd/50">
                      <td className="py-1 px-2">{i + 1}</td>
                      <td className="py-1 px-2 font-mono">{String(onu.onu_id)}</td>
                      <td className="py-1 px-2">{String(onu.name || onu.serial_number || '-')}</td>
                      <td className="py-1 px-2"><span className={cn('px-1.5 py-0.5 rounded text-xs', onu.status === 'online' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{String(onu.status)}</span></td>
                      <td className="py-1 px-2">{onu.onu_rx_power != null ? `${Number(onu.onu_rx_power).toFixed(2)} dBm` : (onu.rx_power != null ? `${Number(onu.rx_power).toFixed(2)} dBm` : '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="text-xs text-tx3">No ONU registered on this port.</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══ VLANS TAB ═══

function VlansTab({ oltId, canManage }: { oltId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['olt-vlans', oltId],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/olt/${oltId}/vlans`, { credentials: 'include' });
        const d = await r.json();
        if (d.vlans && d.vlans.length > 0) return d;
      } catch {}
      const r2 = await fetch(`/api/olt/${oltId}/vlans/db`, { credentials: 'include' });
      return r2.json();
    },
  });
  const renameMut = useMutation({
    mutationFn: async ({ vlanId, name }: { vlanId: number; name: string }) => {
      const r = await fetch(`/api/olt/${oltId}/vlan/${vlanId}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error('Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-vlans', oltId] }); toast.success('VLAN renamed'); },
  });
  const createMut = useMutation({
    mutationFn: async ({ vlanId, name }: { vlanId: number; name: string }) => {
      const r = await fetch(`/api/olt/${oltId}/vlan/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ vlan_id: vlanId, name }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-vlans', oltId] }); toast.success('VLAN created'); setShowAdd(false); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create VLAN'),
  });
  const deleteMut = useMutation({
    mutationFn: async (vlanId: number) => { await fetch(`/api/olt/${oltId}/vlan/${vlanId}/delete`, { method: 'POST', credentials: 'include' }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-vlans', oltId] }); toast.success('VLAN deleted'); },
  });

  const [editingVlan, setEditingVlan] = useState<number | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ vlanId: '', name: '' });

  if (isLoading) return <TabSkeleton />;
  const vlans = data?.vlans || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h6 className="text-sm font-semibold flex items-center gap-2"><Globe size={16} /> VLAN Configuration</h6>
        <div className="flex items-center gap-2">
          <span className="text-xs text-tx3">{vlans.length} VLANs</span>
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-glass border border-brd hover:border-accent/30 transition-all disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          {canManage && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors"><Plus size={13} /> Add VLAN</button>}
        </div>
      </div>

      {showAdd && (
        <div className="glass-card p-4 mb-4 space-y-3">
          <h6 className="text-sm font-semibold">Create New VLAN</h6>
          <div className="flex gap-3">
            <div className="w-32">
              <label className="text-xs text-tx3 block mb-1">VLAN ID *</label>
              <input value={addForm.vlanId} onChange={e => setAddForm({ ...addForm, vlanId: e.target.value })}
                className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="e.g. 100" type="number" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-tx3 block mb-1">Name</label>
              <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="e.g. Management" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate({ vlanId: Number(addForm.vlanId), name: addForm.name })}
              disabled={!addForm.vlanId} className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50">
              {createMut.isPending ? 'Creating...' : 'Create VLAN'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 rounded-lg bg-glass text-xs">Cancel</button>
          </div>
        </div>
      )}

      {vlans.length === 0 ? (
        <EmptyTab message="No VLAN data. Run Sync to collect or click 'Add VLAN' to create one." />
      ) : (
      <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brd text-tx3 text-xs uppercase">
              <th className="text-left py-2 px-3">#</th><th className="text-left py-2 px-3">VLAN ID</th><th className="text-left py-2 px-3">Name</th><th className="text-left py-2 px-3">Type</th><th className="text-left py-2 px-3">ONU Profiles</th><th className="text-left py-2 px-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {vlans.map((v: Record<string, unknown>, i: number) => (
              <tr key={String(v.vlan_id)} className="border-b border-brd/50 hover:bg-glass/50">
                <td className="py-2 px-3">{i + 1}</td>
                <td className="py-2 px-3 font-bold">{String(v.vlan_id)}</td>
                <td className="py-2 px-3">
                  {editingVlan === v.vlan_id ? (
                    <div className="flex gap-1">
                      <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus
                        className="h-7 px-2 rounded bg-glass border border-brd text-xs w-28"
                        onKeyDown={e => { if (e.key === 'Enter') { renameMut.mutate({ vlanId: Number(v.vlan_id), name: renameVal }); setEditingVlan(null); } if (e.key === 'Escape') setEditingVlan(null); }} />
                      <button onClick={() => { renameMut.mutate({ vlanId: Number(v.vlan_id), name: renameVal }); setEditingVlan(null); }} className="text-success"><CheckCircle size={12} /></button>
                    </div>
                  ) : String(v.vlan_name || '-')
                }</td>
                <td className="py-2 px-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', String(v.vlan_type || '').includes('L3') ? 'bg-accent/15 text-accent' : 'bg-offline/15 text-tx3')}>
                    {String(v.vlan_type || 'L2')}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs">{String(v.onu_profiles || '-')}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-1">
                    {canManage && <button onClick={() => { setEditingVlan(Number(v.vlan_id)); setRenameVal(String(v.vlan_name || '')); }} className="p-1.5 rounded hover:bg-accent/15 text-tx3 hover:text-accent"><Edit3 size={13} /></button>}
                    {canManage && <button onClick={() => confirm({ title: 'Delete VLAN', message: `Delete VLAN ${v.vlan_id}?`, variant: 'danger' }).then(() => deleteMut.mutate(Number(v.vlan_id)))}
                      className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {vlans.map((v: Record<string, unknown>, i: number) => (
          <div key={String(v.vlan_id)} className="p-3 rounded-lg bg-glass border border-brd space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-tx3">{i + 1}</span>
                <span className="font-bold text-sm">VLAN {String(v.vlan_id)}</span>
                <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', String(v.vlan_type || '').includes('L3') ? 'bg-accent/15 text-accent' : 'bg-offline/15 text-tx3')}>
                  {String(v.vlan_type || 'L2')}
                </span>
              </div>
              <div className="flex gap-1">
                {canManage && <button onClick={() => { setEditingVlan(Number(v.vlan_id)); setRenameVal(String(v.vlan_name || '')); }} className="p-1.5 rounded hover:bg-accent/15 text-tx3 hover:text-accent"><Edit3 size={13} /></button>}
                {canManage && <button onClick={() => confirm({ title: 'Delete VLAN', message: `Delete VLAN ${v.vlan_id}?`, variant: 'danger' }).then(() => deleteMut.mutate(Number(v.vlan_id)))}
                  className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
              </div>
            </div>
            {editingVlan === v.vlan_id ? (
              <div className="flex gap-1">
                <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus
                  className="h-7 px-2 rounded bg-glass border border-brd text-xs flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') { renameMut.mutate({ vlanId: Number(v.vlan_id), name: renameVal }); setEditingVlan(null); } if (e.key === 'Escape') setEditingVlan(null); }} />
                <button onClick={() => { renameMut.mutate({ vlanId: Number(v.vlan_id), name: renameVal }); setEditingVlan(null); }} className="text-success"><CheckCircle size={16} /></button>
              </div>
            ) : (
              <div className="text-xs text-tx2">Name: {String(v.vlan_name || '-')}</div>
            )}
            {String(v.onu_profiles || '-') !== '-' && <div className="text-[10px] text-tx3">Profiles: {String(v.onu_profiles)}</div>}
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}

// ═══ ONU TYPES TAB ═══

function OnuTypesTab({ oltId, canManage }: { oltId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['olt-onu-types', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/onu-types-full`, { credentials: 'include' }); return r.json(); },
  });
  const deleteMut = useMutation({
    mutationFn: async (typeId: number) => { await fetch(`/api/olt/${oltId}/onu-type/${typeId}/delete`, { method: 'POST', credentials: 'include' }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-onu-types', oltId] }); toast.success('ONU type deleted'); },
  });
  const addMut = useMutation({
    mutationFn: async (body: Record<string, string | string[]>) => {
      const r = await fetch(`/api/olt/${oltId}/onu-type/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-onu-types', oltId] }); toast.success('ONU type added'); setShowAdd(false); },
    onError: () => toast.error('Failed to add ONU type'),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', pon_type: 'gpon', description: '',
    max_tcont: 7, max_gem: 32, max_switch: 8, max_flow: 32, max_ip_host: 5,
  });
  const [ethPorts, setEthPorts] = useState<Set<number>>(new Set([1, 2, 3, 4]));
  const [potsPorts, setPotsPorts] = useState<Set<number>>(new Set([1]));
  const [wifiPorts, setWifiPorts] = useState<Set<number>>(new Set([1, 2]));
  const [subTab, setSubTab] = useState('gpon');

  const togglePort = (set: Set<number>, n: number, setter: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(n)) next.delete(n); else next.add(n);
    setter(next);
  };

  const buildInterfaces = (): string[] => {
    const ifaces: string[] = [];
    [...ethPorts].sort((a, b) => a - b).forEach(n => ifaces.push(`eth_0/${n}`));
    [...potsPorts].sort((a, b) => a - b).forEach(n => ifaces.push(`pots_0/${n}`));
    [...wifiPorts].sort((a, b) => a - b).forEach(n => ifaces.push(`wifi_0/${n}`));
    return ifaces;
  };

  const cliPreview = (): string => {
    const ifaces = buildInterfaces();
    const lines: string[] = [
      'configure terminal', 'pon',
      `onu-type ${addForm.name || '<name>'} ${addForm.pon_type}${addForm.description ? ` description ${addForm.description}` : ''}`,
      `onu-type ${addForm.name || '<name>'} ${addForm.pon_type} max-tcont ${addForm.max_tcont}`,
      `onu-type ${addForm.name || '<name>'} ${addForm.pon_type} max-gemport ${addForm.max_gem}`,
      `onu-type ${addForm.name || '<name>'} ${addForm.pon_type} max-switch-perslot ${addForm.max_switch}`,
      `onu-type ${addForm.name || '<name>'} ${addForm.pon_type} max-flow-perswitch ${addForm.max_flow}`,
      `onu-type ${addForm.name || '<name>'} ${addForm.pon_type} max-iphost ${addForm.max_ip_host}`,
    ];
    ifaces.forEach(i => lines.push(`onu-type-if ${addForm.name || '<name>'} ${i}`));
    lines.push('exit', 'exit', 'exit');
    return lines.join('\n');
  };

  const submitAdd = () => {
    addMut.mutate({
      type_name: addForm.name,
      pon_type: addForm.pon_type,
      description: addForm.description,
      max_tcont: String(addForm.max_tcont),
      max_gem: String(addForm.max_gem),
      max_switch: String(addForm.max_switch),
      max_flow: String(addForm.max_flow),
      max_ip_host: String(addForm.max_ip_host),
      interfaces: buildInterfaces(),
    });
  };

  if (isLoading) return <TabSkeleton />;
  const allTypes: Record<string, unknown>[] = data?.onu_types || [];

  if (allTypes.length === 0 && !showAdd) return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h6 className="text-sm font-semibold">ONU Types</h6>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-glass border border-brd hover:border-accent/30 transition-all disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          {canManage && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90"><Plus size={13} /> Create</button>}
        </div>
      </div>
      <EmptyTab message="No ONU types found. Run Sync or click Create." />
    </div>
  );

  const gponTypes = allTypes.filter(t => String(t.pon_type || 'gpon') !== 'epon');
  const eponTypes = allTypes.filter(t => String(t.pon_type) === 'epon');
  const currentTypes = subTab === 'gpon' ? gponTypes : eponTypes;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setSubTab('gpon')} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', subTab === 'gpon' ? 'bg-accent text-white' : 'bg-glass text-tx3 hover:text-tx1')}>GPON</button>
        <button onClick={() => setSubTab('epon')} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', subTab === 'epon' ? 'bg-accent text-white' : 'bg-glass text-tx3 hover:text-tx1')}>EPON</button>
        <div className="flex-1" />
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-glass border border-brd hover:border-accent/30 transition-all disabled:opacity-50">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        {canManage && <button onClick={() => { setAddForm({ name: '', pon_type: subTab, description: '', max_tcont: 7, max_gem: 32, max_switch: 8, max_flow: 32, max_ip_host: 5 }); setEthPorts(new Set([1, 2, 3, 4])); setPotsPorts(new Set([1])); setWifiPorts(new Set([1, 2])); setShowAdd(true); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90"><Plus size={13} /> Create</button>}
      </div>

      {showAdd && (
        <div className="glass-card p-4 mb-4 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2"><label className="text-xs text-tx3">Type Name</label><input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="e.g. F670L" /></div>
            <div><label className="text-xs text-tx3">PON Type</label><select value={addForm.pon_type} onChange={e => setAddForm({ ...addForm, pon_type: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm"><option value="gpon">GPON</option><option value="epon">EPON</option></select></div>
          </div>
          <div><label className="text-xs text-tx3">Description</label><input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="e.g. 4ETH,1POTS,WIFI" /></div>

          {/* Max Parameters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div><label className="text-xs text-tx3">Max T-CONT</label><input type="number" value={addForm.max_tcont} onChange={e => setAddForm({ ...addForm, max_tcont: Number(e.target.value) })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
            <div><label className="text-xs text-tx3">Max GEM Port</label><input type="number" value={addForm.max_gem} onChange={e => setAddForm({ ...addForm, max_gem: Number(e.target.value) })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
            <div><label className="text-xs text-tx3">Max Switch/Slot</label><input type="number" value={addForm.max_switch} onChange={e => setAddForm({ ...addForm, max_switch: Number(e.target.value) })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
            <div><label className="text-xs text-tx3">Max Flow/Switch</label><input type="number" value={addForm.max_flow} onChange={e => setAddForm({ ...addForm, max_flow: Number(e.target.value) })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
            <div><label className="text-xs text-tx3">Max IP Host</label><input type="number" value={addForm.max_ip_host} onChange={e => setAddForm({ ...addForm, max_ip_host: Number(e.target.value) })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
          </div>

          {/* Interfaces */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-tx2">Interfaces (onu-type-if)</label>
            {/* ETH ports */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-tx3 w-16">ETH</span>
              {[1, 2, 3, 4].map(n => (
                <button key={n} type="button" onClick={() => togglePort(ethPorts, n, setEthPorts)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-mono border transition-all',
                    ethPorts.has(n) ? 'border-accent bg-accent/15 text-accent' : 'border-brd bg-glass text-tx3 hover:border-accent/30')}>
                  eth_0/{n}
                </button>
              ))}
            </div>
            {/* POTS ports */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-tx3 w-16">POTS</span>
              {[1, 2].map(n => (
                <button key={n} type="button" onClick={() => togglePort(potsPorts, n, setPotsPorts)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-mono border transition-all',
                    potsPorts.has(n) ? 'border-accent bg-accent/15 text-accent' : 'border-brd bg-glass text-tx3 hover:border-accent/30')}>
                  pots_0/{n}
                </button>
              ))}
            </div>
            {/* WiFi ports (up to 0/8) */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-tx3 w-16">WiFi</span>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <button key={n} type="button" onClick={() => togglePort(wifiPorts, n, setWifiPorts)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-mono border transition-all',
                    wifiPorts.has(n) ? 'border-accent bg-accent/15 text-accent' : 'border-brd bg-glass text-tx3 hover:border-accent/30')}>
                  wifi_0/{n}
                </button>
              ))}
            </div>
          </div>

          {/* CLI Preview */}
          <div>
            <label className="text-xs font-semibold text-tx2 mb-1 block">CLI Preview</label>
            <pre className="code-block text-xs overflow-x-auto max-h-48">{cliPreview()}</pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={submitAdd} disabled={!addForm.name || addMut.isPending} className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50">{addMut.isPending ? 'Saving...' : 'Save'}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 rounded-lg bg-glass text-xs">Cancel</button>
          </div>
        </div>
      )}

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-brd text-tx3 text-xs uppercase">
            <th className="text-left py-2 px-3">#</th><th className="text-left py-2 px-3">Name</th><th className="text-left py-2 px-3">Description</th><th className="text-left py-2 px-3">Max T-CONT</th><th className="text-left py-2 px-3">Max GEM</th><th className="text-left py-2 px-3">Max Switch</th><th className="text-left py-2 px-3">Max Flow</th><th className="text-left py-2 px-3">Max IP Host</th><th className="text-left py-2 px-3">Interfaces</th><th className="text-left py-2 px-3">Action</th>
          </tr></thead>
          <tbody>
            {currentTypes.map((t: Record<string, unknown>, i: number) => (
              <tr key={String(t.id || i)} className="border-b border-brd/50 hover:bg-glass/50">
                <td className="py-2 px-3">{i + 1}</td>
                <td className="py-2 px-3 font-bold">{String(t.type_name || t.name || '-')}</td>
                <td className="py-2 px-3 text-xs">{String(t.description || '-')}</td>
                <td className="py-2 px-3 text-center">{String(t.max_tcont || '8')}</td>
                <td className="py-2 px-3 text-center">{String(t.max_gem || '32')}</td>
                <td className="py-2 px-3 text-center">{String(t.max_switch || '16')}</td>
                <td className="py-2 px-3 text-center">{String(t.max_flow || '32')}</td>
                <td className="py-2 px-3 text-center">{String(t.max_ip_host || '8')}</td>
                <td className="py-2 px-3 text-xs">{String(t.interfaces || '-')}</td>
                <td className="py-2 px-3">
                  {canManage && <button onClick={() => confirm({ title: 'Delete ONU Type', message: `Delete ${t.type_name}?`, variant: 'danger' }).then(() => deleteMut.mutate(Number(t.id)))}
                    className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {currentTypes.map((t: Record<string, unknown>, i: number) => (
          <div key={String(t.id || i)} className="p-3 rounded-lg bg-glass border border-brd">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-tx3">{i + 1}</span>
                <span className="font-bold text-sm">{String(t.type_name || t.name || '-')}</span>
              </div>
              {canManage && <button onClick={() => confirm({ title: 'Delete ONU Type', message: `Delete ${t.type_name}?`, variant: 'danger' }).then(() => deleteMut.mutate(Number(t.id)))}
                className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
            </div>
            {String(t.description || '-') !== '-' && <div className="text-xs text-tx3 mb-1">{String(t.description)}</div>}
            {String(t.interfaces || '') && <div className="text-[10px] text-tx3 mb-1 font-mono">{String(t.interfaces)}</div>}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-tx3">
              <span>T-CONT: <strong className="text-tx2">{String(t.max_tcont || '8')}</strong></span>
              <span>GEM: <strong className="text-tx2">{String(t.max_gem || '32')}</strong></span>
              <span>Switch: <strong className="text-tx2">{String(t.max_switch || '16')}</strong></span>
              <span>Flow: <strong className="text-tx2">{String(t.max_flow || '32')}</strong></span>
              <span>IP Host: <strong className="text-tx2">{String(t.max_ip_host || '8')}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ WAN-IP TAB ═══

function WanIpTab({ oltId, canManage }: { oltId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['olt-wan-ip', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/wan-ip-profiles`, { credentials: 'include' }); return r.json(); },
  });
  const deleteMut = useMutation({
    mutationFn: async (profileId: number) => { await fetch(`/api/olt/${oltId}/wan-ip/${profileId}/delete`, { method: 'POST', credentials: 'include' }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-wan-ip', oltId] }); toast.success('WAN IP profile deleted'); },
  });
  const addMut = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const payload: Record<string, string> = {
        name: body.name,
        ip_address: body.ip_mode === 'dhcp' ? 'dhcp' : body.ip_address,
        netmask: body.netmask || '',
        gateway: body.gateway || '',
        dns1: body.vlan ? `cvlan:${body.vlan}` : '',
        dns2: body.priority ? `pri:${body.priority}` : '',
      };
      const r = await fetch(`/api/olt/${oltId}/wan-ip/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-wan-ip', oltId] }); toast.success('WAN IP profile added'); setShowAdd(false); },
    onError: () => toast.error('Failed to add WAN IP profile'),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', ip_mode: 'dhcp', vlan: '', priority: '', ip_address: '', netmask: '', gateway: '' });

  if (isLoading) return <TabSkeleton />;
  const profiles = data?.wan_ip_profiles || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h6 className="text-sm font-semibold flex items-center gap-2"><Globe size={16} /> WAN-IP Profiles</h6>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-glass border border-brd hover:border-accent/30 transition-all disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          {canManage && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90"><Plus size={13} /> Add Profile</button>}
        </div>
      </div>

      {showAdd && (
        <div className="glass-card p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-tx3">Profile Name</label><input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="e.g. my_wan" /></div>
            <div><label className="text-xs text-tx3">IP Mode</label><select value={addForm.ip_mode} onChange={e => setAddForm({ ...addForm, ip_mode: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm"><option value="dhcp">DHCP</option><option value="static">Static</option></select></div>
            <div><label className="text-xs text-tx3">VLAN</label><input value={addForm.vlan} onChange={e => setAddForm({ ...addForm, vlan: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="e.g. 100" /></div>
            <div><label className="text-xs text-tx3">Priority</label><input value={addForm.priority} onChange={e => setAddForm({ ...addForm, priority: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" placeholder="0-7" /></div>
          </div>
          {addForm.ip_mode === 'static' && (
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-tx3">IP Address</label><input value={addForm.ip_address} onChange={e => setAddForm({ ...addForm, ip_address: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
              <div><label className="text-xs text-tx3">Netmask</label><input value={addForm.netmask} onChange={e => setAddForm({ ...addForm, netmask: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
              <div><label className="text-xs text-tx3">Gateway</label><input value={addForm.gateway} onChange={e => setAddForm({ ...addForm, gateway: e.target.value })} className="w-full h-8 px-3 rounded-lg bg-glass border border-brd text-sm" /></div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => addMut.mutate(addForm)} disabled={!addForm.name} className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50">Save</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 rounded-lg bg-glass text-xs">Cancel</button>
          </div>
        </div>
      )}

      {profiles.length > 0 ? (
        <>
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-brd text-tx3 text-xs uppercase">
              <th className="text-left py-2 px-3">#</th><th className="text-left py-2 px-3">Profile Name</th><th className="text-left py-2 px-3">IP Mode</th><th className="text-left py-2 px-3">VLAN</th><th className="text-left py-2 px-3">Priority</th><th className="text-left py-2 px-3">IP Address</th><th className="text-left py-2 px-3">Gateway</th><th className="text-left py-2 px-3">Action</th>
            </tr></thead>
            <tbody>
              {profiles.map((wp: Record<string, unknown>, i: number) => {
                const isDhcp = String(wp.ip_mode || 'dhcp') === 'dhcp';
                return (
                  <tr key={String(wp.id)} className="border-b border-brd/50 hover:bg-glass/50">
                    <td className="py-2 px-3">{i + 1}</td>
                    <td className="py-2 px-3 font-bold">{String(wp.name)}</td>
                    <td className="py-2 px-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', isDhcp ? 'bg-accent/15 text-accent' : 'bg-offline/15 text-tx3')}>
                        {isDhcp ? 'DHCP' : 'Static'}
                      </span>
                    </td>
                    <td className="py-2 px-3">{String(wp.vlan || '-')}</td>
                    <td className="py-2 px-3">{String(wp.priority || '-')}</td>
                    <td className="py-2 px-3">{!isDhcp ? String(wp.ip_address) : '-'}</td>
                    <td className="py-2 px-3">{wp.gateway && wp.gateway !== '-' ? String(wp.gateway) : '-'}</td>
                    <td className="py-2 px-3">
                      {canManage && <button onClick={() => confirm({ title: 'Delete WAN IP', message: `Delete ${wp.name}?`, variant: 'danger' }).then(() => deleteMut.mutate(Number(wp.id)))}
                        className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile Cards */}
        <div className="md:hidden space-y-2">
          {profiles.map((wp: Record<string, unknown>, i: number) => {
            const isDhcp = String(wp.ip_mode || 'dhcp') === 'dhcp';
            return (
              <div key={String(wp.id)} className="p-3 rounded-lg bg-glass border border-brd space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-tx3">{i + 1}</span>
                    <span className="font-bold text-sm">{String(wp.name)}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', isDhcp ? 'bg-accent/15 text-accent' : 'bg-offline/15 text-tx3')}>
                      {isDhcp ? 'DHCP' : 'Static'}
                    </span>
                  </div>
                  {canManage && <button onClick={() => confirm({ title: 'Delete WAN IP', message: `Delete ${wp.name}?`, variant: 'danger' }).then(() => deleteMut.mutate(Number(wp.id)))}
                    className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-tx3">
                  <span>VLAN: <strong className="text-tx2">{String(wp.vlan || '-')}</strong></span>
                  <span>Pri: <strong className="text-tx2">{String(wp.priority || '-')}</strong></span>
                  {!isDhcp && <span>IP: <strong className="text-tx2">{String(wp.ip_address)}</strong></span>}
                  {String(wp.gateway || '') && String(wp.gateway) !== '-' && <span>GW: <strong className="text-tx2">{String(wp.gateway)}</strong></span>}
                </div>
              </div>
            );
          })}
        </div>
        </>
      ) : (
        <EmptyTab message="No WAN IP profiles configured. Click 'Add Profile' to create one." />
      )}
    </div>
  );
}

// ═══ SPEED PROFILES TAB ═══

function SpeedProfilesTab({ oltId, canManage }: { oltId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['olt-speed-profiles', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/speed-profiles-full`, { credentials: 'include' }); return r.json(); },
  });
  const addTcontMut = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      await fetch(`/api/olt/${oltId}/tcont/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-speed-profiles', oltId] }); toast.success('TCONT added'); setShowTcont(false); },
  });
  const addTrafficMut = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      await fetch(`/api/olt/${oltId}/traffic/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-speed-profiles', oltId] }); toast.success('Traffic profile added'); setShowTraffic(false); },
  });
  const deleteTcontMut = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/olt/${oltId}/tcont/${id}/delete`, { method: 'POST', credentials: 'include' }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-speed-profiles', oltId] }); toast.success('TCONT deleted'); },
  });
  const deleteTrafficMut = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/olt/${oltId}/traffic/${id}/delete`, { method: 'POST', credentials: 'include' }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-speed-profiles', oltId] }); toast.success('Traffic profile deleted'); },
  });
  const [showTcont, setShowTcont] = useState(false);
  const [tcontForm, setTcontForm] = useState({ name: '', type: '4', max_bandwidth: '' });
  const [showTraffic, setShowTraffic] = useState(false);
  const [trafficForm, setTrafficForm] = useState({ name: '', sir: '', pir: '' });

  if (isLoading) return <TabSkeleton />;
  const profiles = data?.speed_profiles || [];
  const tconts = profiles.filter((p: Record<string, unknown>) => p.profile_type === 'tcont');
  const traffics = profiles.filter((p: Record<string, unknown>) => p.profile_type === 'traffic');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h6 className="text-sm font-semibold flex items-center gap-2"><Gauge size={16} /> Speed Profiles</h6>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-glass border border-brd hover:border-accent/30 transition-all disabled:opacity-50">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-glass p-4">
          <div className="flex items-center justify-between mb-3">
            <h6 className="text-sm font-semibold flex items-center gap-2"><ArrowUp size={14} className="text-success" /> Upload (Traffic)</h6>
            {canManage && <button onClick={() => setShowTraffic(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-accent text-white"><Plus size={12} /> Create</button>}
          </div>
          {showTraffic && (
            <div className="p-3 rounded-lg bg-glass border border-brd mb-3 space-y-2">
              <input value={trafficForm.name} onChange={e => setTrafficForm({ ...trafficForm, name: e.target.value })} className="w-full h-8 px-3 rounded bg-glass border border-brd text-xs" placeholder="Profile name" />
              <div className="flex gap-2">
                <input value={trafficForm.sir} onChange={e => setTrafficForm({ ...trafficForm, sir: e.target.value })} className="flex-1 h-8 px-3 rounded bg-glass border border-brd text-xs" placeholder="SIR (kbps)" />
                <input value={trafficForm.pir} onChange={e => setTrafficForm({ ...trafficForm, pir: e.target.value })} className="flex-1 h-8 px-3 rounded bg-glass border border-brd text-xs" placeholder="PIR (kbps)" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => addTrafficMut.mutate(trafficForm)} disabled={!trafficForm.name} className="px-3 py-1 rounded bg-accent text-white text-xs disabled:opacity-50">Save</button>
                <button onClick={() => setShowTraffic(false)} className="px-3 py-1 rounded bg-glass text-xs">Cancel</button>
              </div>
            </div>
          )}
          {traffics.length > 0 ? (
            <div className="space-y-2">
              {traffics.map((sp: Record<string, unknown>) => (
                <div key={String(sp.id)} className="flex items-center justify-between p-3 rounded-lg bg-glass/50 border border-brd">
                  <div><strong className="text-sm">{String(sp.name)}</strong><div className="text-xs text-tx3">SIR {String(sp.sir || '0')} / PIR {String(sp.pir || '0')} kbps</div></div>
                  {canManage && <button onClick={() => deleteTrafficMut.mutate(Number(sp.id))} className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          ) : <div className="text-center py-6 text-tx3 text-xs"><ArrowUp size={24} className="mx-auto mb-1 text-tx3/30" />No upload profiles</div>}
        </div>

        <div className="rounded-xl bg-glass p-4">
          <div className="flex items-center justify-between mb-3">
            <h6 className="text-sm font-semibold flex items-center gap-2"><ArrowDown size={14} className="text-accent" /> Download (TCONT)</h6>
            {canManage && <button onClick={() => setShowTcont(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-accent text-white"><Plus size={12} /> Create</button>}
          </div>
          {showTcont && (
            <div className="p-3 rounded-lg bg-glass border border-brd mb-3 space-y-2">
              <input value={tcontForm.name} onChange={e => setTcontForm({ ...tcontForm, name: e.target.value })} className="w-full h-8 px-3 rounded bg-glass border border-brd text-xs" placeholder="TCONT name" />
              <div className="flex gap-2">
                <select value={tcontForm.type} onChange={e => setTcontForm({ ...tcontForm, type: e.target.value })} className="h-8 px-3 rounded bg-glass border border-brd text-xs"><option value="1">Type 1</option><option value="2">Type 2</option><option value="3">Type 3</option><option value="4">Type 4</option><option value="5">Type 5</option></select>
                <input value={tcontForm.max_bandwidth} onChange={e => setTcontForm({ ...tcontForm, max_bandwidth: e.target.value })} className="flex-1 h-8 px-3 rounded bg-glass border border-brd text-xs" placeholder="Max bandwidth (kbps)" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => addTcontMut.mutate(tcontForm)} disabled={!tcontForm.name} className="px-3 py-1 rounded bg-accent text-white text-xs disabled:opacity-50">Save</button>
                <button onClick={() => setShowTcont(false)} className="px-3 py-1 rounded bg-glass text-xs">Cancel</button>
              </div>
            </div>
          )}
          {tconts.length > 0 ? (
            <div className="space-y-2">
              {tconts.map((sp: Record<string, unknown>) => (
                <div key={String(sp.id)} className="flex items-center justify-between p-3 rounded-lg bg-glass/50 border border-brd">
                  <div><strong className="text-sm">{String(sp.name)}</strong><div className="text-xs text-tx3">Type {String(sp.type_val || sp.type || '-')} | Max {String(sp.max_bandwidth || '0')} kbps</div></div>
                  {canManage && <button onClick={() => deleteTcontMut.mutate(Number(sp.id))} className="p-1.5 rounded hover:bg-danger/15 text-tx3 hover:text-danger"><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          ) : <div className="text-center py-6 text-tx3 text-xs"><ArrowDown size={24} className="mx-auto mb-1 text-tx3/30" />No download profiles</div>}
        </div>
      </div>
    </div>
  );
}

// ═══ SYSTEM TAB ═══

function SystemTab({ olt }: { olt: Record<string, unknown> }) {
  const fans = (olt as Record<string, unknown>).fans as Array<Record<string, unknown>> || [];
  const cards = (olt as Record<string, unknown>).cards as Array<Record<string, unknown>> || [];

  const formatUptime = (seconds: unknown): string => {
    if (!seconds) return 'N/A';
    const s = Number(seconds);
    if (isNaN(s) || s <= 0) return 'N/A';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <div className="space-y-4">
      <h6 className="text-sm font-semibold flex items-center gap-2"><Settings size={16} /> System Information</h6>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div className="rounded-xl bg-glass p-3 md:p-4">
          <h6 className="text-xs font-semibold text-tx3 uppercase mb-3">Device</h6>
          <div className="space-y-2 text-xs md:text-sm">
            {([['System Name', olt.name], ['IP Address', olt.ip_address || olt.ip], ['Vendor', String(olt.vendor || 'zte').toUpperCase()], ['Model', olt.model], ['Firmware', olt.firmware_version || 'N/A']] as [string, unknown][]).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-tx3">{k}</span><strong className="text-right max-w-[60%] truncate">{String(v || '-')}</strong></div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-glass p-3 md:p-4">
          <h6 className="text-xs font-semibold text-tx3 uppercase mb-3">Chassis</h6>
          <div className="space-y-2 text-xs md:text-sm">
            {([['Temperature', olt.temperature ? `${olt.temperature}°C` : 'N/A'], ['Uptime', formatUptime(olt.uptime)], ['Polling Interval', `${olt.polling_interval || 300}s`], ['Total Fans', olt.total_fan || 0], ['Total Cards', cards.length], ['Last Sync', olt.last_sync ? new Date(String(olt.last_sync)).toLocaleString() : 'Never']] as [string, unknown][]).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-tx3">{k}</span><strong>{String(v)}</strong></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div className="rounded-xl bg-glass p-3 md:p-4">
          <h6 className="text-xs font-semibold text-tx3 uppercase mb-3">Connection Status</h6>
          <div className="space-y-3">
            {([['SNMP', olt.snmp_status], ['Telnet', olt.telnet_status], ['Overall', olt.connection_status]] as [string, unknown][]).map(([k, v]) => {
              const isConnected = String(v || '').toLowerCase() === 'connected';
              return (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-tx3 text-sm">{k}</span>
                  <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', isConnected ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
                    {String(v || 'disconnected').toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl bg-glass p-3 md:p-4">
          <h6 className="text-xs font-semibold text-tx3 uppercase mb-3">Fan Status</h6>
          {fans.length > 0 ? (
            <div className="space-y-2">
              {fans.map((f: Record<string, unknown>) => {
                const statusStr = String(f.status || '').toLowerCase();
                const isOk = statusStr.includes('normal') || statusStr.includes('ok') || statusStr === 'in service' || statusStr === 'online';
                return (
                  <div key={String(f.number)} className="flex items-center gap-3 p-2 rounded-lg bg-glass/50 border border-brd">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isOk ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                      <RefreshCw size={14} className={isOk ? 'animate-spin-slow' : ''} />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="text-xs font-bold">Fan {String(f.number)}</span>
                        <span className={cn('text-xs', isOk ? 'text-success' : 'text-danger')}>{String(f.status || '-')}</span>
                      </div>
                      {(String(f.rpm || '') || String(f.speed_level || '')) && <div className="text-xs text-tx3">{f.rpm ? `${f.rpm} RPM` : ''} {f.speed_level ? `(${f.speed_level})` : ''}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <div className="text-center py-4 text-tx3 text-xs">No fan data available</div>}
        </div>
      </div>

      <div className="rounded-xl bg-glass p-3 md:p-4">
        <h6 className="text-xs font-semibold text-tx3 uppercase mb-3">Card Slots</h6>
        {cards.length > 0 ? (
          <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-brd text-tx3 text-xs uppercase">
                <th className="text-left py-2 px-3">Slot</th><th className="text-left py-2 px-3">Card Type</th><th className="text-left py-2 px-3">Status</th><th className="text-left py-2 px-3">Ports</th><th className="text-left py-2 px-3">Ports Up</th><th className="text-left py-2 px-3">Ports Down</th>
              </tr></thead>
              <tbody>
                {cards.map((c: Record<string, unknown>, i: number) => (
                  <tr key={i} className="border-b border-brd/50">
                    <td className="py-2 px-3 font-bold">{String(c.slot)}</td>
                    <td className="py-2 px-3">{String(c.card_type)}</td>
                    <td className="py-2 px-3"><span className={cn('px-2 py-0.5 rounded-full text-xs', String(c.status || '').toUpperCase() === 'INSERVICE' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{String(c.status || '-')}</span></td>
                    <td className="py-2 px-3">{String(c.total_ports || '-')}</td>
                    <td className="py-2 px-3 text-success">{String(c.ports_up || '0')}</td>
                    <td className="py-2 px-3 text-danger">{String(c.ports_down || '0')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {cards.map((c: Record<string, unknown>, i: number) => (
              <div key={i} className="p-2.5 rounded-lg bg-glass/50 border border-brd flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">Slot {String(c.slot)}</span>
                  <span className="text-xs text-tx3">{String(c.card_type)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', String(c.status || '').toUpperCase() === 'INSERVICE' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{String(c.status || '-')}</span>
                  <span className="text-[10px] text-tx3">{String(c.ports_up || '0')}↑ / {String(c.ports_down || '0')}↓</span>
                </div>
              </div>
            ))}
          </div>
          </>
        ) : <div className="text-center py-6 text-tx3 text-xs">No card data available. Run Sync.</div>}
      </div>
    </div>
  );
}

// ═══ SHARED COMPONENTS ═══

function MiniStat({ label, value, color }: { label: string; value: number | string | undefined; color?: string }) {
  return (
    <div className="glass-card p-2 md:p-3 text-center">
      <div className={cn('text-sm md:text-lg font-extrabold', color || 'text-tx1')}>{value ?? 0}</div>
      <div className="text-[10px] md:text-xs text-tx3 mt-0.5 truncate">{label}</div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-glass" />)}
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-tx3">
      <Settings size={40} className="mx-auto mb-3 text-tx3/30" />
      <p>{message}</p>
    </div>
  );
}

export default OltConfiguration;
