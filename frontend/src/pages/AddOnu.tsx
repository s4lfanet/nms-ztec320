import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type TechnicianData } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import { TutorialBanner } from '../components/TutorialBanner';
import {
  ArrowLeft, ArrowRight, Server, Cpu, Settings, Check,
  Loader2, Zap, Wifi, Globe, Search, Wrench
} from 'lucide-react';


const STEPS = [
  { id: 1, label: 'Select OLT', icon: <Server size={16} /> },
  { id: 2, label: 'ONU Info', icon: <Cpu size={16} /> },
  { id: 3, label: 'Configuration', icon: <Settings size={16} /> },
  { id: 4, label: 'Review & Provision', icon: <Check size={16} /> },
];

interface ProvisionResult {
  success?: boolean;
  message?: string;
  log?: string[];
  commands?: string[];
  onu_id?: number;
  warnings?: string[];
  error?: string;
}

export function AddOnu() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  // Step 1
  const [oltId, setOltId] = useState(0);
  // Step 2
  const [serialNumber, setSerialNumber] = useState('');
  const [onuType, setOnuType] = useState('F660');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frame, setFrame] = useState(1);
  const [slot, setSlot] = useState(1);
  const [port, setPort] = useState(1);
  // Step 3
  const [tcontProfile, setTcontProfile] = useState('1G');
  const [trafficProfile, setTrafficProfile] = useState('');
  const [serviceVlan, setServiceVlan] = useState(100);
  const [wanMode, setWanMode] = useState('bridge');
  const [wanIpProfile, setWanIpProfile] = useState('');
  const [wanIpProfileList, setWanIpProfileList] = useState<Array<{name: string; ip_address: string; cvlan: string}>>([]);
  const [pppoeUsername, setPppoeUsername] = useState('');
  const [pppoePassword, setPppoePassword] = useState('');
  const [tr069Enabled, setTr069Enabled] = useState(false);
  const [acsUrl, setAcsUrl] = useState('http://192.168.54.254:7547');
  const [acsUsername, setAcsUsername] = useState('acs');
  const [acsPassword, setAcsPassword] = useState('acs');
  const [tr069Vlan, setTr069Vlan] = useState(1010);
  const [tr069TagMode, setTr069TagMode] = useState<'tag' | 'untag'>('tag');
  const [tr069Profiles, setTr069Profiles] = useState<Array<{ id: number; name: string; acs_url: string; acs_username: string; acs_password: string; vlan: number; vlan_mode: string }>>([]);
  const [selectedTr069Profile, setSelectedTr069Profile] = useState('');
  const [technicianId, setTechnicianId] = useState<number | null>(null);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scannedOnus, setScannedOnus] = useState<Array<{pon_port: string; sn: string; model: string; onu_id?: number; matched_type?: string}>>([]);
  const [showScan, setShowScan] = useState(false);
  const [registeredTypes, setRegisteredTypes] = useState<string[]>([]);

  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const olts = data?.olts || [];

  const { data: techData } = useQuery({ queryKey: ['technicians'], queryFn: api.technicians });
  const technicians: TechnicianData[] = techData?.technicians || [];

  // Fetch VLANs from selected OLT
  const { data: vlanData } = useQuery({
    queryKey: ['olt-vlans', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/vlans`, { credentials: 'include' }); return r.json(); },
    enabled: !!oltId,
  });
  const vlanList: Array<{vlan_id: number; name: string}> = vlanData?.vlans || [];

  // Fetch PON structure (slots/ports) from selected OLT
  const { data: ponStructure } = useQuery({
    queryKey: ['olt-pon-structure', oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${oltId}/pon-structure`, { credentials: 'include' }); return r.json(); },
    enabled: !!oltId,
  });
  const slots: Array<{ card: number; ports: number[] }> = ponStructure?.structure || [];

  // Auto-set slot/port when structure loads
  useEffect(() => {
    if (slots.length > 0) {
      const found = slots.find(s => s.card === slot);
      if (!found) setSlot(slots[0].card);
      const currentSlot = found || slots[0];
      if (currentSlot.ports.length > 0 && !currentSlot.ports.includes(port)) {
        setPort(currentSlot.ports[0]);
      }
    }
  }, [slots]);

  // Auto-set serviceVlan when VLAN list loads
  useEffect(() => {
    if (vlanList.length > 0 && !vlanList.find(v => v.vlan_id === serviceVlan)) {
      setServiceVlan(vlanList[0].vlan_id);
    }
  }, [vlanList]);

  const scanOnus = async () => {
    if (!oltId) { toast.warning('Select an OLT first'); return; }
    setScanning(true);
    try {
      const res = await fetch('/api/scan-unconfigured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ olt_id: oltId }),
      });
      const d = await res.json();
      if (d.success) {
        setScannedOnus(d.onus || []);
        setRegisteredTypes(d.registered_types || []);
        setShowScan(true);
        if ((d.onus || []).length === 0) toast.warning('No unconfigured ONUs found');
        else toast.success(`Found ${d.onus.length} unconfigured ONU(s)`);
      } else {
        toast.error(d.message || 'Scan failed');
      }
    } catch { toast.error('Scan failed'); }
    setScanning(false);
  };

  const selectScannedOnu = (onu: {pon_port: string; sn: string; model: string; onu_id?: number; matched_type?: string}) => {
    setSerialNumber(onu.sn);
    // Use matched_type (registered ONU type on OLT) — NOT the raw model
    // F670LV9.0 (scan model) → F670L (registered type)
    if (onu.matched_type) {
      setOnuType(onu.matched_type);
    } else if (onu.model) {
      // Try exact match against registered types
      const found = registeredTypes.find(t => onu.model.toUpperCase().startsWith(t.toUpperCase()));
      setOnuType(found || onu.model);
    } else {
      setOnuType('All');
    }
    // Parse PON port "1/1/5" → frame=1, slot=1, port=5
    const parts = onu.pon_port.split('/');
    if (parts.length === 3) {
      setFrame(Number(parts[0]));
      setSlot(Number(parts[1]));
      setPort(Number(parts[2]));
    }
    setShowScan(false);
    toast.success(`Selected ONU ${onu.sn} on ${onu.pon_port}`);
  };

  const [profileList, setProfileList] = useState<string[]>([]);
  const [trafficList, setTrafficList] = useState<string[]>([]);
  useEffect(() => {
    if (oltId) {
      fetch(`/api/olt/${oltId}/speed-profiles`, { credentials: 'include' })
        .then(r => r.json()).then(d => {
          if (d.tcont && d.tcont.length > 0) {
            setProfileList(d.tcont);
            // Auto-set default if current selection not in real list
            if (!d.tcont.includes(tcontProfile)) setTcontProfile(d.tcont[0]);
          }
          if (d.traffic && d.traffic.length > 0) {
            setTrafficList(d.traffic);
          }
          if (d.wan_ip_profiles && d.wan_ip_profiles.length > 0) {
            setWanIpProfileList(d.wan_ip_profiles);
            if (!wanIpProfile) setWanIpProfile(d.wan_ip_profiles[0].name);
          }
        }).catch(() => {});
    }
  }, [oltId]);

  // Fetch TR069 profiles (any authenticated user)
  useEffect(() => {
    fetch('/api/tr069', { credentials: 'include' })
      .then(r => r.json()).then(setTr069Profiles).catch(() => {});
  }, []);

  const selectTr069Profile = (profileId: string) => {
    setSelectedTr069Profile(profileId);
    if (!profileId) return;
    const p = tr069Profiles.find(p => p.id === parseInt(profileId));
    if (p) {
      setAcsUrl(p.acs_url);
      setAcsUsername(p.acs_username);
      setAcsPassword(p.acs_password);
      setTr069Vlan(p.vlan || 0);
      setTr069TagMode((p.vlan_mode || 'tag') as 'tag' | 'untag');
    }
  };

  const provision = async (dryRun: boolean) => {
    setLoading(true);
    try {
      const res = await fetch('/api/provision/ont', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          olt_id: oltId, frame, slot, port,
          serial_number: serialNumber, vendor: 'zte', onu_type: onuType,
          name, description, tcont_profile: tcontProfile,
          traffic_profile: trafficProfile || tcontProfile,
          service_vlan: serviceVlan, wan_mode: wanMode,
          wan_ip_profile: wanIpProfile,
          pppoe_username: pppoeUsername, pppoe_password: pppoePassword,
          tr069_enabled: tr069Enabled, acs_url: acsUrl,
          acs_username: acsUsername, acs_password: acsPassword,
          tr069_vlan: tr069TagMode === 'tag' ? tr069Vlan : 0, dry_run: dryRun,
          technician_id: technicianId,
        }),
      });
      const d = await res.json();
      setResult(d);
      if (d.success && !dryRun) {
        toast.success('ONU provisioned! Auto-syncing OLT...');
        // Trigger OLT sync in background
        try {
          await fetch(`/api/olt/${oltId}/sync`, { method: 'POST', credentials: 'include' });
        } catch { /* sync runs in background */ }
        setTimeout(() => navigate('/dashboard/onus'), 2000);
      }
      else if (!d.success) toast.error(d.message || 'Failed');
    } catch { toast.error('Request failed'); }
    setLoading(false);
  };

  const canNext = () => {
    if (step === 1) return !!oltId;
    if (step === 2) return serialNumber.length >= 8;
    return true;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 md:gap-3">
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard/onus')}
          className="p-2 rounded-lg hover:bg-glass transition-colors text-tx2 hover:text-tx1 flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">Add New ONU</h1>
          <p className="text-tx2 text-xs md:text-sm mt-0.5 hidden sm:block">ZTE ONT provisioning</p>
        </div>
        <div className="ml-auto">
          <TutorialBanner
            guideId="provision-wizard"
            title="Panduan Provisioning ONU"
            prerequisites={
              <>
                <strong className="text-warning">Sebelum Mulai — Pastikan hal berikut sudah dikonfigurasi di OLT:</strong>
                <ul className="mt-1.5 ml-4 space-y-0.5 text-tx3">
                  <li>1. <strong className="text-tx2">ONU Type</strong> sudah terdaftar di OLT (OLT Configuration → ONU Types tab)</li>
                  <li>2. <strong className="text-tx2">TCONT Profile</strong> sudah dibuat (OLT Configuration → Speed Profiles tab, type=tcont)</li>
                  <li>3. <strong className="text-tx2">VLAN</strong> sudah dibuat di OLT (OLT Configuration → VLANs tab)</li>
                  <li>4. <strong className="text-tx2">WAN-IP Profile</strong> sudah dibuat jika menggunakan DHCP/PPPoE mode (OLT Configuration → WAN-IP tab)</li>
                  <li>5. <strong className="text-tx2">CLI/Telnet access</strong> OLT sudah dikonfigurasi (OLT Settings → CLI Username & Password)</li>
                  <li>6. ONU sudah terhubung fisik ke PON port OLT dan menyala (LED PON menyala hijau)</li>
                </ul>
              </>
            }
            steps={[
              { title: 'Select OLT', content: <><p>Pilih OLT tempat ONU akan didaftarkan. Pastikan OLT berstatus <span className="text-success">Online</span>.</p><p className="text-xs text-tx3 mt-1">Jika OLT belum ada, tambahkan di halaman OLT Settings terlebih dahulu.</p></> },
              { title: 'ONU Info', content: <><p>Masukkan Serial Number ONU.</p><p className="text-xs text-tx3 mt-1">Gunakan tombol <strong>Scan ONUs</strong> untuk menemukan ONU yang belum terdaftar di OLT secara otomatis. Klik ONU dari hasil scan untuk auto-fill Serial Number, ONU Type, Frame/Slot/Port — tidak perlu input manual.</p><p className="text-xs text-tx3 mt-1">Format SN: 4 huruf vendor + 8 hex (contoh: ZTEG0A1B2C3D)</p></> },
              { title: 'Configuration', content: <><p>Atur TCONT profile (upload bandwidth), Traffic profile (download), Service VLAN, dan WAN mode:</p><ul className="text-xs text-tx3 mt-1 ml-4 space-y-0.5"><li><strong className="text-tx2">Bridge</strong> — L2 transparent, VLAN via service-port saja. Cocok untuk ONU yang dikelola router eksternal</li><li><strong className="text-tx2">DHCP</strong> — ONU dapat IP via DHCP, butuh <strong>VLAN Profile (wan-ip)</strong>. Buat WAN-IP Profile di OLT Configuration → WAN-IP tab terlebih dahulu</li><li><strong className="text-tx2">PPPoE</strong> — ONU dial via PPPoE. Isi username & password untuk ZTE ONU.</li></ul><p className="mt-2">Aktifkan <strong>TR-069</strong> untuk manajemen remote via ACS (GenieACS). Pilih VLAN tag/untag sesuai topologi jaringan.</p><p className="text-xs text-tx3 mt-1">TR069 Profile: Buat TR069 Profile di halaman TR069 Profile terlebih dahulu untuk menyimpan ACS URL, Username, Password, dan VLAN config — tinggal pilih saat provisioning.</p></> },
              { title: 'Review & Provision', content: <><p>Periksa semua parameter. Klik <strong>Preview</strong> untuk melihat CLI commands yang akan dikirim tanpa eksekusi — berguna untuk verifikasi sebelum commit.</p><p className="text-xs text-tx3 mt-1">Klik <strong>Provision Now</strong> untuk eksekusi. Proses provisioning mengirim CLI via Telnet ke OLT: register ONU → TCONT → GEM port → service-port → pon-onu-mng (LAN/WAN/TR069).</p><p className="text-xs text-tx3 mt-1">Setelah provisioning berhasil, OLT akan <strong>auto-sync</strong> untuk update status ONU di All ONUs page. Anda akan otomatis diarahkan ke halaman All ONUs.</p></> },
            ]}
            tips={
              <>
                <strong className="text-tx2">Tips:</strong>
                <ul className="mt-1 ml-4 space-y-0.5">
                  <li>Gunakan <strong>Preview</strong> dulu untuk verifikasi commands sebelum eksekusi</li>
                  <li>Jika ada error CLI, cek apakah ONU type dan TCONT profile sudah terdaftar di OLT (OLT Configuration page)</li>
                  <li>Untuk DHCP/PPPoE mode, pastikan WAN-IP Profile sudah dibuat di OLT Configuration → WAN-IP tab</li>
                  <li>Scan ONUs auto-fills Serial Number, ONU Type, dan Frame/Slot/Port — lebih cepat dari input manual</li>
                  <li>Setelah provisioning berhasil, OLT akan auto-sync — tunggu beberapa detik lalu refresh All ONUs page</li>
                </ul>
              </>
            }
          />
        </div>
      </div>

      {/* Step Indicator */}
      {step <= 4 && (
        <div className="flex items-center gap-1 md:gap-2 overflow-x-auto scrollbar-thin pb-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 md:gap-2 flex-shrink-0">
              <button onClick={() => { if (s.id < step) setStep(s.id); }}
                className={cn('flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-[11px] md:text-xs font-medium transition-all whitespace-nowrap',
                  step === s.id ? 'bg-accent text-white' : step > s.id ? 'bg-success/15 text-success' : 'bg-glass text-tx3')}>
                {step > s.id ? <Check size={14} /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.id}</span>
              </button>
              {i < STEPS.length - 1 && <div className={cn('w-3 md:w-8 h-0.5 rounded', step > s.id ? 'bg-success' : 'bg-glass')} />}
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Select OLT */}
      {step === 1 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Server size={18} /> Select OLT</h2>
          <div className="grid gap-2 md:gap-3">
            {olts.length === 0 && (
              <div className="text-center py-8 text-tx3">
                <Server size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No OLTs available</p>
                <p className="text-xs mt-1">Add an OLT in OLT Settings first</p>
              </div>
            )}
            {olts.map((olt: {id: number; name: string; ip_address: string; is_online?: boolean}) => (
              <button key={olt.id} onClick={() => setOltId(olt.id)}
                className={cn('flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border transition-all text-left',
                  oltId === olt.id ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30 bg-glass')}>
                <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  olt.is_online ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                  <Server size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{olt.name}</div>
                  <div className="text-xs text-tx3 truncate">{olt.ip_address}</div>
                </div>
                {oltId === olt.id && <Check size={20} className="text-accent flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: ONU Info */}
      {step === 2 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Cpu size={18} /> ONU Information</h2>
          {/* Scan Button */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <button onClick={scanOnus} disabled={scanning || !oltId}
              className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs md:text-sm font-medium hover:bg-accent/25 disabled:opacity-50">
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {scanning ? 'Scanning...' : 'Scan ONUs'}
            </button>
            {scannedOnus.length > 0 && !showScan && (
              <button onClick={() => setShowScan(true)} className="text-xs text-accent hover:underline">
                Show {scannedOnus.length} result(s)
              </button>
            )}
          </div>

          {/* Scanned ONUs List */}
          {showScan && scannedOnus.length > 0 && (
            <div className="p-4 rounded-xl border border-brd bg-glass max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-tx3 font-semibold uppercase">Unconfigured ONUs ({scannedOnus.length})</span>
                <button onClick={() => setShowScan(false)} className="text-xs text-tx3 hover:text-tx1">✕ Close</button>
              </div>
              <div className="grid gap-2">
                {scannedOnus.map((onu, i) => (
                  <button key={i} onClick={() => selectScannedOnu(onu)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-brd hover:border-accent/40 hover:bg-accent/5 transition-all text-left">
                    <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">
                      {(onu.onu_id || i + 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono">{onu.sn}</span>
                        {onu.model && <span className="text-xs text-tx3">{onu.model}</span>}
                        {onu.matched_type && <span className="text-xs px-1.5 py-0.5 rounded bg-accent/15 text-accent">→ {onu.matched_type}</span>}
                      </div>
                      <div className="text-xs text-tx3">PON: {onu.pon_port}</div>
                    </div>
                    <Check size={16} className="text-accent opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="label-sm mb-1">Serial Number *</label>
              <input type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value.toUpperCase())}
                placeholder="ZTEG0A1B2C3D" className="input-field" />
            </div>
            <div>
              <label className="label-sm mb-1">ONU Type</label>
              {registeredTypes.length > 0 ? (
                <select value={onuType} onChange={e => setOnuType(e.target.value)} className="input-field">
                  {registeredTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input type="text" value={onuType} onChange={e => setOnuType(e.target.value)} className="input-field" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="label-sm mb-1">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="ODP-RW03-03_USERNAME" className="input-field" />
            </div>
            <div>
              <label className="label-sm mb-1">Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="ODP-RW03-03 | User Name" className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div>
              <label className="label-sm mb-1">Frame</label>
              <input type="number" value={frame} onChange={e => setFrame(Number(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="label-sm mb-1">Slot (Card)</label>
              {slots.length > 0 ? (
                <select value={slot} onChange={e => {
                  const newSlot = Number(e.target.value);
                  setSlot(newSlot);
                  const s = slots.find(s => s.card === newSlot);
                  if (s && s.ports.length > 0) setPort(s.ports[0]);
                }} className="input-field">
                  {slots.map(s => <option key={s.card} value={s.card}>Card {s.card}</option>)}
                </select>
              ) : (
                <input type="number" value={slot} onChange={e => setSlot(Number(e.target.value))} className="input-field" placeholder="Auto" />
              )}
              {slots.length === 0 && oltId && <p className="text-[10px] text-tx3 mt-1">Sync OLT to load cards</p>}
            </div>
            <div>
              <label className="label-sm mb-1">PON Port</label>
              {slots.length > 0 ? (() => {
                const currentSlot = slots.find(s => s.card === slot);
                return (
                  <select value={port} onChange={e => setPort(Number(e.target.value))} className="input-field">
                    {(currentSlot?.ports || []).map(p => <option key={p} value={p}>Port {p}</option>)}
                  </select>
                );
              })() : (
                <input type="number" value={port} onChange={e => setPort(Number(e.target.value))} className="input-field" placeholder="Auto" />
              )}
            </div>
          </div>
          {technicians.length > 0 && (
            <div>
              <label className="label-sm mb-1 flex items-center gap-1.5"><Wrench size={12} /> Teknisi Lapangan</label>
              <select value={technicianId ?? ''} onChange={e => setTechnicianId(e.target.value ? Number(e.target.value) : null)}
                className="input-field">
                <option value="">— Tidak ada teknisi —</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}{t.phone ? ` (${t.phone})` : ''}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configuration */}
      {step === 3 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Settings size={18} /> Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="label-sm mb-1">TCONT Profile (Upload)</label>
              <select value={tcontProfile} onChange={e => setTcontProfile(e.target.value)} className="input-field">
                {profileList.length > 0 ? profileList.map(p => <option key={p} value={p}>{p}</option>) : (
                  <><option value="1G">1G</option><option value="UP-PPPOE">UP-PPPOE</option></>
                )}
              </select>
              <p className="text-[10px] text-tx3 mt-1">Upload bandwidth limit profile</p>
            </div>
            <div>
              <label className="label-sm mb-1">Traffic Profile (Download)</label>
              <select value={trafficProfile} onChange={e => setTrafficProfile(e.target.value)} className="input-field">
                <option value="">— Same as TCONT —</option>
                {trafficList.map(p => <option key={p} value={p}>{p}</option>)}
                {profileList.filter(p => !trafficList.includes(p)).map(p => (
                  <option key={p} value={p}>{p} (from TCONT)</option>
                ))}
              </select>
              <p className="text-[10px] text-tx3 mt-1">Download bandwidth limit profile</p>
            </div>
            <div>
              <label className="label-sm mb-1">Service VLAN</label>
              <select value={serviceVlan} onChange={e => setServiceVlan(Number(e.target.value))} className="input-field">
                <option value={0}>— Select VLAN —</option>
                {vlanList.map(v => (
                  <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name}</option>
                ))}
                {!vlanList.find(v => v.vlan_id === serviceVlan) && serviceVlan > 0 && (
                  <option value={serviceVlan}>{serviceVlan} (custom)</option>
                )}
              </select>
              <input type="number" value={serviceVlan || ''} onChange={e => setServiceVlan(Number(e.target.value))}
                min={1} max={4094} className="input-field mt-1" placeholder="Custom VLAN ID" />
            </div>
          </div>

          <div>
            <label className="label-sm mb-1">WAN Mode</label>
            <div className="flex gap-2 md:gap-3 flex-wrap">
              {[{v:'bridge',l:'Bridge',d:'Transparent L2 bridge'},{v:'dhcp',l:'DHCP',d:'ONU gets IP via DHCP'},{v:'pppoe',l:'PPPoE',d:'ONU dial via PPPoE'}].map(m => (
                <button key={m.v} onClick={() => setWanMode(m.v)}
                  className={cn('px-3 md:px-4 py-2 rounded-lg border text-xs md:text-sm transition-all',
                    wanMode === m.v ? 'border-accent bg-accent/10 text-accent' : 'border-brd bg-glass text-tx2 hover:border-accent/30')}>
                  {m.l}
                </button>
              ))}
            </div>
            <p className="text-xs text-tx3 mt-1">
              ZTE C320: wan-ip 1 mode dhcp vlan-profile {'<profile>'} host 1 — PPPoE handled by ONU via profile
            </p>
          </div>
          {(wanMode === 'dhcp' || wanMode === 'pppoe') && (
            <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd space-y-3">
              <div>
                <label className="label-sm mb-1">VLAN Profile (wan-ip)</label>
                {wanIpProfileList.length > 0 ? (
                  <select value={wanIpProfile} onChange={e => setWanIpProfile(e.target.value)} className="input-field">
                    {wanIpProfileList.map(p => (
                      <option key={p.name} value={p.name}>{p.name} {p.cvlan ? `(VLAN ${p.cvlan})` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={wanIpProfile} onChange={e => setWanIpProfile(e.target.value)}
                    className="input-field" placeholder={wanMode === 'pppoe' ? 'pppoe' : 'genieacs'} />
                )}
                <p className="text-[10px] text-tx3 mt-1">
                  {wanMode === 'pppoe' ? 'PPPoE profile name — ONU handles auth via this profile' : 'DHCP profile name (e.g. genieacs)'}
                </p>
              </div>
              {wanMode === 'pppoe' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-sm mb-1">PPPoE Username</label>
                    <input type="text" value={pppoeUsername} onChange={e => setPppoeUsername(e.target.value)}
                      className="input-field" placeholder="server2" />
                  </div>
                  <div>
                    <label className="label-sm mb-1">PPPoE Password</label>
                    <input type="password" value={pppoePassword} onChange={e => setPppoePassword(e.target.value)}
                      className="input-field" placeholder="••••••" />
                  </div>
                </div>
              )}
            </div>
          )}
          <hr className="border-brd" />
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tr069Enabled} onChange={e => setTr069Enabled(e.target.checked)} />
              <Wifi size={16} /><span className="text-sm font-medium">Enable TR-069</span>
            </label>
            <p className="text-xs text-tx3 mt-1 ml-6">
              TR069 commands are sent via OLT OMCI — ZTE supports TR069 via standard OMCI.
            </p>
          </div>
          {tr069Enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 p-3 md:p-4 rounded-lg bg-glass border border-brd">
              <div className="md:col-span-2">
                <label className="label-sm mb-1">TR069 Profile</label>
                <select value={selectedTr069Profile} onChange={e => selectTr069Profile(e.target.value)} className="input-field">
                  <option value="">Select Profile...</option>
                  {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                </select>
                <p className="text-[10px] text-tx3 mt-1">Select a saved TR069 profile to auto-fill ACS settings, or fill manually below.</p>
              </div>
              <div className="md:col-span-2"><label className="label-sm mb-1">ACS URL *</label>
                <input type="text" value={acsUrl} onChange={e => setAcsUrl(e.target.value)} className="input-field"
                  placeholder="http://192.168.54.254:7547" /></div>
              <div><label className="label-sm mb-1">ACS Username</label>
                <input type="text" value={acsUsername} onChange={e => setAcsUsername(e.target.value)} className="input-field" /></div>
              <div><label className="label-sm mb-1">ACS Password</label>
                <input type="password" value={acsPassword} onChange={e => setAcsPassword(e.target.value)} className="input-field" /></div>
              <div>
                <label className="label-sm mb-1">VLAN Mode</label>
                <div className="flex gap-3">
                  {[{v:'tag',l:'Tagged'},{v:'untag',l:'Untagged'}].map(m => (
                    <button key={m.v} type="button" onClick={() => setTr069TagMode(m.v as 'tag' | 'untag')}
                      className={cn('px-4 py-2 rounded-lg border text-sm transition-all',
                        tr069TagMode === m.v ? 'border-accent bg-accent/10 text-accent' : 'border-brd bg-glass text-tx2 hover:border-accent/30')}>
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>
              {tr069TagMode === 'tag' && (
                <div>
                  <label className="label-sm mb-1">TR069 VLAN</label>
                  <select value={tr069Vlan} onChange={e => setTr069Vlan(Number(e.target.value))} className="input-field">
                    <option value={0}>— Select VLAN —</option>
                    {vlanList.map(v => (
                      <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name}</option>
                    ))}
                    {!vlanList.find(v => v.vlan_id === tr069Vlan) && tr069Vlan > 0 && (
                      <option value={tr069Vlan}>{tr069Vlan} (custom)</option>
                    )}
                  </select>
                  <p className="text-[10px] text-tx3 mt-1">Select VLAN from OLT or type custom ID below</p>
                  <input type="number" value={tr069Vlan} onChange={e => setTr069Vlan(Number(e.target.value))}
                    min={1} max={4094} className="input-field mt-1" placeholder="Custom VLAN ID" />
                </div>
              )}
              <div>
                <label className="label-sm mb-1">Preview Commands</label>
                <div className="code-block text-xs space-y-0.5">
                  <div>tr069-mgmt 1 state unlock</div>
                  <div>tr069-mgmt 1 acs {acsUrl || '...'} validate basic username {acsUsername || '...'} password ***</div>
                  {tr069TagMode === 'tag' && tr069Vlan > 0 && <div>tr069-mgmt 1 tag pri 0 vlan {tr069Vlan}</div>}
                  {tr069TagMode === 'untag' && <div className="text-tx3 italic"># untag (default, no command needed)</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Check size={18} /> Review & Provision</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {[
              ['OLT', olts.find((o: {id:number}) => o.id === oltId)?.name || ''],
              ['PON Port', `${frame}/${slot}/${port}`],
              ['SN', serialNumber], ['ONU Type', onuType],
              ['TCONT', tcontProfile], ['Download', trafficProfile || tcontProfile], ['VLAN', String(serviceVlan)],
              ['WAN Mode', wanMode], ...(wanMode !== 'bridge' ? [['WAN Profile', wanIpProfile]] : []),
              ...(tr069Enabled ? [['TR069 ACS', acsUrl], ['TR069 Mode', tr069TagMode === 'tag' ? `VLAN ${tr069Vlan}` : 'untag']] : []),
            ].map(([label, val]) => (
              <div key={label as string} className="p-2 rounded-lg bg-glass">
                <div className="text-[10px] text-tx3 uppercase font-semibold">{label}</div>
                <div className="text-sm font-medium truncate">{val as string || '-'}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 md:gap-3 pt-2 flex-wrap">
            <button onClick={() => provision(true)} disabled={loading}
              className="flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-xl bg-glass border border-brd text-xs md:text-sm font-medium hover:border-accent/30 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Preview
            </button>
            <button onClick={() => provision(false)} disabled={loading}
              className="flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-xl bg-accent text-white text-xs md:text-sm font-medium hover:bg-accent-hover disabled:opacity-50 glow-accent">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} Provision Now
            </button>
          </div>
          {result && (
            <div className={cn('p-4 rounded-xl border', result.success ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5')}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('text-sm font-semibold', result.success ? 'text-success' : 'text-danger')}>
                  {result.success ? '✅ Success' : '❌ Failed'}
                </span>
                <span className="text-xs text-tx3">{String(result['message'] || '')}</span>
              </div>
              {result['log'] && (result['log'] as string[]).length > 0 && (
                <pre className="code-block text-xs overflow-auto max-h-60">
                  {(result['log'] as string[]).join('\n')}
                </pre>
              )}
              {result['commands'] && (result['commands'] as string[]).length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-tx3 mb-1">Commands:</div>
                  <pre className="code-block text-xs overflow-auto max-h-40">
                    {(result['commands'] as string[]).map((c: string) => `> ${c}`).join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      {step <= 4 && !result && (
        <div className="flex justify-between gap-2">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard/onus')}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-glass border border-brd text-xs md:text-sm text-tx2 hover:border-accent/30">
            <ArrowLeft size={14} /> Back
          </button>
          <button onClick={() => setStep(step + 1)} disabled={!canNext()}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-accent text-white text-xs md:text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
            Next <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

