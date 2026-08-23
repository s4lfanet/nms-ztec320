import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type TechnicianData } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import {
  ArrowLeft, ArrowRight, Server, Search, Check, Loader2,
  Zap, Wifi, Globe,
  Plus, Trash2, Wrench, Radio, Shield, Copy, Eye, Cpu
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UnconfiguredOnu {
  pon_port: string;
  sn: string;
  model?: string;
  vendor?: string;
  onu_id?: number;
  matched_type?: string;
  is_epon?: boolean;
}

interface ServiceEntry {
  id: string;
  vlan: number;
  cvlan: number;           // C-VLAN (inner) for Q-in-Q mode
  vlan_mode: 'tag' | 'untag' | 'qinq';
  label: string;           // e.g. "Internet", "VoIP", "TR069", "IPTV"
  wan_mode: 'bridge' | 'dhcp' | 'pppoe' | 'pppoe-nat';
  pppoe_user: string;
  pppoe_pass: string;
  vlan_profile: string;    // wan-ip profile for DHCP/PPPoE
  traffic_profile: string; // per-service download limit
}

interface SsidEntry {
  port: string;
  name: string;
  pass: string;
  auth: 'wpa2' | 'wpa' | 'mixed' | 'open';
  vlan: string;
  enabled: boolean;
  hidden: boolean;
}

interface WifiConfig {
  ssids: SsidEntry[];
  // Legacy fields kept for backward compat
  ssid1_name: string;
  ssid1_pass: string;
  ssid1_auth: 'wpa2' | 'wpa' | 'mixed' | 'open';
  ssid2_name: string;
  ssid2_pass: string;
  ssid2_auth: 'wpa2' | 'wpa' | 'mixed' | 'open';
}

interface Tr069Config {
  enabled: boolean;
  acs_url: string;
  acs_user: string;
  acs_pass: string;
  tr069_vlan: number;
  tr069_vlan_mode: 'tag' | 'untag';
  profile_id: string;
}

interface WizardState {
  oltId: number;
  selectedOnus: UnconfiguredOnu[];
  onuType: string;
  namePrefix: string;
  description: string;
  tcontProfile: string;
  trafficProfile: string;
  slaProfile: string;
  useVeip: boolean | null; // null = auto-detect
  services: ServiceEntry[];
  wifi: WifiConfig;
  tr069: Tr069Config;
  technicianId: number | null;
  registerMode: 'telnet' | 'snmp';
}

// ─── Defaults ────────────────────────────────────────────────────────────────

let _nextId = 1;
const newService = (overrides?: Partial<ServiceEntry>): ServiceEntry => ({
  id: `svc-${_nextId++}`,
  vlan: 100,
  cvlan: 0,
  vlan_mode: 'tag',
  label: '',
  wan_mode: 'bridge',
  pppoe_user: '',
  pppoe_pass: '',
  vlan_profile: '',
  traffic_profile: '',
  ...overrides,
});

const STEPS = [
  { id: 1, label: 'OLT', icon: <Server size={15} /> },
  { id: 2, label: 'ONUs', icon: <Search size={15} /> },
  { id: 3, label: 'Services', icon: <Radio size={15} /> },
  { id: 4, label: 'WiFi & TR069', icon: <Wifi size={15} /> },
  { id: 5, label: 'Review', icon: <Check size={15} /> },
];

// ─── Script Generator ───────────────────────────────────────────────────────

function generateScript(d: WizardState): string {
  const lines: string[] = [];
  if (d.selectedOnus.length === 0) return '(no ONU selected)';

  const onu = d.selectedOnus[0];
  const match = onu.pon_port.match(/(\d+)\/(\d+)\/(\d+)/);
  const f = match ? match[1] : '1';
  const s = match ? match[2] : '1';
  const p = match ? match[3] : '1';
  const oid = onu.onu_id || 1;
  const isEpon = onu.pon_port.includes('epon-olt') || onu.pon_port.includes('epon_olt') || onu.is_epon === true;
  const onuPfx = isEpon ? 'epon-onu' : 'gpon-onu';
  const oltPfx = isEpon ? 'epon-olt' : 'gpon-olt';
  const onuIf = `${onuPfx}_${f}/${s}/${p}:${oid}`;
  const ponIf = `${oltPfx}_${f}/${s}/${p}`;

  // Auto-detect VEIP
  const isZte = (onu.sn || '').toUpperCase().startsWith('ZTEG');
  const useVeip = d.useVeip === null ? !isZte : d.useVeip;

  lines.push('! --- Register ONU ---');
  lines.push(`interface ${ponIf}`);
  const regKw = isEpon ? (onu.sn.startsWith('EPON-') ? '' : 'mac') : 'sn';
  const regPart = regKw ? `${regKw} ${onu.sn}` : '';
  lines.push(`  onu ${oid} type ${d.onuType} ${regPart}`.trim());
  lines.push('!');
  lines.push(`interface ${onuIf}`);
  if (d.namePrefix) lines.push(`  name ${d.namePrefix}`);
  if (d.description) lines.push(`  description ${d.description}`);

  // TCONT + GEM + service-port per VLAN
  d.services.forEach((svc, i) => {
    const n = i + 1;
    const v = svc.vlan || 100;
    const cv = svc.cvlan || 0;
    const svcName = svc.label ? svc.label.replace(/[^a-zA-Z0-9]/g, '') : `service${n}`;
    lines.push(`  tcont ${n} name ${svcName} profile ${d.tcontProfile}`);
    lines.push(`  gemport ${n} tcont ${n}`);
    if (svc.traffic_profile || d.trafficProfile) {
      lines.push(`  gemport ${n} traffic-limit downstream ${svc.traffic_profile || d.trafficProfile}`);
    }
    if (svc.vlan_mode === 'qinq' && cv) {
      lines.push(`  service-port ${n} vport ${n} user-vlan ${cv} vlan ${v} QinQ`);
    } else if (svc.vlan_mode === 'untag') {
      lines.push(`  service-port ${n} vport ${n} untag`);
    } else {
      lines.push(`  service-port ${n} vport ${n} user-vlan ${v} vlan ${v}`);
    }
  });

  lines.push('!');
  lines.push(`pon-onu-mng ${onuIf}`);

  // Service definitions per VLAN
  d.services.forEach((svc, i) => {
    const n = i + 1;
    const v = svc.vlan || 100;
    const cv = svc.cvlan || 0;
    const svcName = svc.label ? svc.label.replace(/[^a-zA-Z0-9]/g, '') : `service${n}`;
    const needsIphost = !useVeip && svc.wan_mode !== 'bridge';
    const vlanSuffix = svc.vlan_mode === 'untag' ? '' : svc.vlan_mode === 'qinq' && cv ? ` vlan ${v} cvlan ${cv}` : ` vlan ${v}`;

    if (needsIphost) {
      lines.push(`  service ${svcName} gemport ${n} iphost ${n}${vlanSuffix}`);
    } else if (!useVeip && n === 1) {
      lines.push(`  service ${svcName} gemport ${n} iphost 1${vlanSuffix}`);
    } else {
      lines.push(`  service ${svcName} gemport ${n}${vlanSuffix}`);
    }

    // WAN config
    if (svc.wan_mode === 'pppoe-nat' && svc.pppoe_user) {
      lines.push(`  pppoe ${n} nat enable user ${svc.pppoe_user} password ${svc.pppoe_pass}`);
      lines.push(`  wan ${n} service internet host ${n}`);
    } else if (svc.wan_mode === 'pppoe' && svc.pppoe_user) {
      lines.push(`  wan-ip ${n} mode pppoe username ${svc.pppoe_user} password ${svc.pppoe_pass} vlan-profile ${svc.vlan_profile || 'pppoe'} host ${n}`);
      lines.push(`  wan-ip ${n} ping-response enable traceroute-response enable`);
    } else if (svc.wan_mode === 'dhcp') {
      lines.push(`  wan-ip ${n} mode dhcp vlan-profile ${svc.vlan_profile || 'default'} host ${n}`);
      lines.push(`  wan-ip ${n} ping-response enable traceroute-response enable`);
    }
    // bridge = no wan config
  });

  // VEIP
  if (useVeip) {
    lines.push('  vlan port veip_1 mode hybrid');
    lines.push('  vlan port veip_1 vlan 1');
  }

  // Auto-tag LAN ports: eth_0/N → service N VLAN, extras → primary VLAN
  const primaryVlan = d.services[0]?.vlan || 100;
  for (let lp = 1; lp <= 4; lp++) {
    const portVlan = d.services[lp - 1]?.vlan || primaryVlan;
    lines.push(`  vlan port eth_0/${lp} mode tag vlan ${portVlan}`);
  }

  // WiFi VLAN tagging — per-SSID VLAN from ssids array
  const pwSsids = d.wifi.ssids || [];
  const hasNamedSsid = pwSsids.some(s => s.name);
  if (hasNamedSsid) {
    const hasPerSsidVlan = pwSsids.some(s => s.name && s.vlan);
    if (hasPerSsidVlan) {
      pwSsids.forEach(s => {
        if (s.name && s.vlan) lines.push(`  vlan port ${s.port || 'wifi_0/1'} mode tag vlan ${s.vlan}`);
      });
    } else {
      pwSsids.forEach(s => {
        if (s.name) lines.push(`  vlan port ${s.port || 'wifi_0/1'} mode tag vlan ${primaryVlan}`);
      });
    }
  }

  // Firewall + security
  const hasWan = d.services.some(s => s.wan_mode !== 'bridge');
  if (hasWan) {
    lines.push('  firewall enable level low');
    lines.push('  security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069');
  }

  // TR069
  if (d.tr069.enabled) {
    lines.push('  tr069-mgmt 1 state unlock');
    lines.push(`  tr069-mgmt 1 acs ${d.tr069.acs_url || 'http://...'} validate basic username ${d.tr069.acs_user || 'acs'} password ${d.tr069.acs_pass || 'acs'}`);
    if (d.tr069.tr069_vlan && d.tr069.tr069_vlan_mode === 'tag') {
      lines.push(`  tr069-mgmt 1 tag pri 0 vlan ${d.tr069.tr069_vlan}`);
    } else {
      lines.push('  tr069-mgmt 1 untag');
    }
  }

  // WiFi — dynamic SSID list
  const namedSsids = (d.wifi.ssids || []).filter(s => s.name);
  if (namedSsids.length > 0) {
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    namedSsids.forEach(s => {
      const wp = s.port || 'wifi_0/1';
      const enabled = s.enabled !== false;
      if (!enabled) {
        lines.push(`  interface wifi ${wp} state lock`);
        return;
      }
      lines.push(`  interface wifi ${wp} state unlock`);
      const hideStr = s.hidden ? 'enable' : 'disable';
      lines.push(`  ssid ctrl ${wp} name ${s.name.replace(/ /g, '_')} hide ${hideStr}`);
      if (s.auth !== 'open' && s.pass) {
        const authMode = s.auth === 'mixed' ? 'wpa-wpa2-psk' : s.auth === 'wpa' ? 'wpa-psk' : 'wpa2-psk';
        lines.push(`  ssid auth wpa ${wp} ${authMode}`);
        lines.push(`  ssid auth wpa ${wp} encrypt aes`);
        lines.push(`  ssid auth wpa ${wp} key ${s.pass}`);
      } else if (s.auth === 'open') {
        lines.push(`  ssid auth wpa ${wp} no-auth`);
        lines.push(`  ssid auth wpa ${wp} encrypt none`);
        lines.push(`  ssid auth wpa ${wp} no-key`);
        lines.push(`  ssid auth wep ${wp} open-system`);
      }
    });
  }

  lines.push('!');
  return lines.join('\n');
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProvisionWizard({ manualMode = false }: { manualMode?: boolean }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ sn: string; success: boolean; message: string }>>([]);
  const [showScript, setShowScript] = useState(false);

  // Manual entry state (for pre-config mode)
  const [manualSn, setManualSn] = useState('');
  const [manualFrame, setManualFrame] = useState(1);
  const [manualSlot, setManualSlot] = useState(1);
  const [manualPort, setManualPort] = useState(1);
  const [manualOnuId, setManualOnuId] = useState(1);

  const [data, setData] = useState<WizardState>({
    oltId: 0,
    selectedOnus: [],
    onuType: 'All',
    namePrefix: '',
    description: '',
    tcontProfile: '',
    trafficProfile: '',
    slaProfile: '',
    useVeip: null,
    services: [newService({ vlan: 100 })],
    wifi: { ssids: [], ssid1_name: '', ssid1_pass: '', ssid1_auth: 'wpa2', ssid2_name: '', ssid2_pass: '', ssid2_auth: 'wpa2' },
    tr069: { enabled: false, acs_url: '', acs_user: '', acs_pass: '', tr069_vlan: 0, tr069_vlan_mode: 'tag', profile_id: '' },
    technicianId: null,
    registerMode: 'telnet',
  });

  const [scanning, setScanning] = useState(false);
  const [unconfiguredOnus, setUnconfiguredOnus] = useState<UnconfiguredOnu[]>([]);
  const [onuTypes, setOnuTypes] = useState<Array<{ type_name: string; pon_type: string }>>([]);
  const [tcontProfiles, setTcontProfiles] = useState<string[]>([]);
  const [trafficProfiles, setTrafficProfiles] = useState<string[]>([]);
  const [slaProfiles, setSlaProfiles] = useState<string[]>([]);
  const [vlanList, setVlanList] = useState<Array<{ vlan_id: number; name: string }>>([]);
  const [wanIpProfiles, setWanIpProfiles] = useState<Array<{ name: string }>>([]);
  const [tr069Profiles, setTr069Profiles] = useState<Array<{ id: number; name: string; acs_url: string; acs_username: string; acs_password: string; vlan: number; vlan_mode: string }>>([]);

  const { data: dashData } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const olts = dashData?.olts || [];
  const { data: techData } = useQuery({ queryKey: ['technicians'], queryFn: api.technicians });
  const technicians: TechnicianData[] = techData?.technicians || [];

  // Fetch PON structure (slots/ports) from selected OLT
  const { data: ponStructure } = useQuery({
    queryKey: ['olt-pon-structure', data.oltId],
    queryFn: async () => { const r = await fetch(`/api/olt/${data.oltId}/pon-structure`, { credentials: 'include' }); return r.json(); },
    enabled: !!data.oltId,
  });
  const ponSlots: Array<{ card: number; ports: number[] }> = ponStructure?.structure || [];

  // Auto-set slot/port when structure loads
  useEffect(() => {
    if (ponSlots.length > 0) {
      const found = ponSlots.find(s => s.card === manualSlot);
      if (!found) setManualSlot(ponSlots[0].card);
      const currentSlot = found || ponSlots[0];
      if (currentSlot.ports.length > 0 && !currentSlot.ports.includes(manualPort)) {
        setManualPort(currentSlot.ports[0]);
      }
    }
  }, [ponSlots]);

  // Detect vendor from selected ONUs
  const detectedVendor = useMemo(() => {
    if (data.selectedOnus.length === 0) return 'unknown';
    const sn = data.selectedOnus[0].sn.toUpperCase();
    if (sn.startsWith('ZTEG') || sn.startsWith('ZICG')) return 'zte';
    if (sn.startsWith('HWTC')) return 'huawei';
    if (sn.startsWith('FHTT')) return 'fiberhome';
    return 'universal';
  }, [data.selectedOnus]);

  const isZte = detectedVendor === 'zte';

  // Fetch OLT data when selected
  useEffect(() => {
    if (!data.oltId) return;
    fetch(`/api/olt/${data.oltId}/onu-types`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.types) {
          const types = d.types.map((t: any) =>
            typeof t === 'string' ? { type_name: t, pon_type: 'gpon' } : t
          );
          setOnuTypes(types);
        }
      }).catch(() => {});
    fetch(`/api/olt/${data.oltId}/speed-profiles`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.tcont) setTcontProfiles(d.tcont);
        if (d.success && d.traffic) setTrafficProfiles(d.traffic);
        if (d.success && d.wan_ip_profiles) setWanIpProfiles(d.wan_ip_profiles);
        if (d.tcont?.length && !data.tcontProfile) setData(prev => ({ ...prev, tcontProfile: d.tcont[0] }));
      }).catch(() => {});

    fetch(`/api/olt/${data.oltId}/speed-profiles-full`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.speed_profiles) {
          setSlaProfiles(d.speed_profiles.filter((p: any) => p.profile_type === 'sla').map((p: any) => p.name));
        }
      }).catch(() => {});
    fetch(`/api/olt/${data.oltId}/vlans`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.vlans) setVlanList(d.vlans);
      }).catch(() => {});
    fetch('/api/tr069', { credentials: 'include' })
      .then(r => r.json()).then(setTr069Profiles).catch(() => {});
  }, [data.oltId]);

  const update = <K extends keyof WizardState>(key: K, val: WizardState[K]) =>
    setData(prev => ({ ...prev, [key]: val }));

  const updateService = (id: string, field: keyof ServiceEntry, value: unknown) =>
    setData(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === id ? { ...s, [field]: value } : s),
    }));

  const addService = () =>
    setData(prev => ({ ...prev, services: [...prev.services, newService({ vlan: prev.services[0]?.vlan || 100 })] }));

  const removeService = (id: string) =>
    setData(prev => ({ ...prev, services: prev.services.filter(s => s.id !== id) }));

  // Scan
  const scanOnus = async () => {
    if (!data.oltId) { toast.warning('Select an OLT first'); return; }
    setScanning(true);
    try {
      const res = await fetch('/api/scan-unconfigured', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ olt_id: data.oltId, register_mode: data.registerMode }),
      });
      const d = await res.json();
      if (d.success && d.onus) {
        setUnconfiguredOnus(d.onus);
        if (d.onu_types) {
          const types = d.onu_types.map((t: any) =>
            typeof t === 'string' ? { type_name: t, pon_type: 'gpon' } : t
          );
          setOnuTypes(types);
        }
        if (d.registered_types) {
          const types = d.registered_types.map((t: any) =>
            typeof t === 'string' ? { type_name: t, pon_type: 'gpon' } : t
          );
          setOnuTypes(prev => {
            const seen = new Set(prev.map((t: { type_name: string; pon_type: string }) => t.type_name));
            return [...prev, ...types.filter((t: { type_name: string; pon_type: string }) => !seen.has(t.type_name))];
          });
        }
        toast[d.onus.length ? 'success' : 'warning'](d.onus.length ? `Found ${d.onus.length} ONU(s)` : 'No unconfigured ONUs found');
      } else toast.error(d.message || 'Scan failed');
    } catch { toast.error('Scan failed'); }
    setScanning(false);
  };

  const toggleOnu = (onu: UnconfiguredOnu) =>
    setData(prev => ({
      ...prev,
      selectedOnus: prev.selectedOnus.some(o => o.sn === onu.sn)
        ? prev.selectedOnus.filter(o => o.sn !== onu.sn)
        : [...prev.selectedOnus, onu],
    }));

  // Provision
  const provision = async () => {
    setLoading(true);
    const res: Array<{ sn: string; success: boolean; message: string }> = [];

    for (let i = 0; i < data.selectedOnus.length; i++) {
      const onu = data.selectedOnus[i];
      const match = onu.pon_port.match(/(\d+)\/(\d+)\/(\d+)/);
      const frame = match ? parseInt(match[1]) : 1;
      const slot = match ? parseInt(match[2]) : 1;
      const port = match ? parseInt(match[3]) : 1;
      const isEpon = onu.pon_port.includes('epon-olt') || onu.pon_port.includes('epon_olt') || onu.is_epon === true;
      // Universal onu-type name differs per PON type ('All' for GPON, 'ALL-EPON' for EPON)
      const onuTypeToSend = isEpon && data.onuType === 'All' ? 'ALL-EPON' : data.onuType;

      try {
        const r = await fetch('/api/provision/unified', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            olt_id: data.oltId, frame, slot, port,
            onu_id: onu.onu_id || (i + 1), serial: onu.sn,
            onu_type: onuTypeToSend, tcont_profile: data.tcontProfile,
            traffic_profile: data.trafficProfile,
            sla_profile: data.slaProfile,
            name: data.namePrefix || '',
            description: data.description,
            services: data.services.map(s => ({
              service_type: s.wan_mode === 'bridge' ? 'bridge' : 'internet',
              vlan: s.vlan,
              cvlan: s.cvlan,
              vlan_mode: s.vlan_mode,
              wan_mode: s.wan_mode === 'pppoe-nat' ? 'nat' : s.wan_mode === 'pppoe' ? 'wan' : s.wan_mode,
              wan_ip_mode: s.wan_mode === 'pppoe' ? 'PPPoE' : s.wan_mode === 'dhcp' ? 'DHCP' : '',
              pppoe_user: s.pppoe_user,
              pppoe_pass: s.pppoe_pass,
              vlan_profile: s.vlan_profile,
              mvlan: 0,
              traffic_profile: s.traffic_profile,
            })),
            use_veip: data.useVeip,
            wifi_config: isZte && (data.wifi.ssids || []).some(s => s.name) ? { ssids: data.wifi.ssids } : null,
            tr069_config: data.tr069.enabled ? data.tr069 : null,
            technician_id: data.technicianId,
            pon_port: onu.pon_port,
            is_epon: isEpon,
            register_mode: data.registerMode,
          }),
        });
        const d = await r.json();
        res.push({ sn: onu.sn, success: d.success, message: d.message || '' });
        if (d.success) toast.success(`ONU ${onu.sn} registered!`);
        else toast.error(`${onu.sn}: ${d.message}`);
      } catch (e: unknown) {
        res.push({ sn: onu.sn, success: false, message: e instanceof Error ? e.message : 'Failed' });
        toast.error(`${onu.sn}: failed`);
      }
      if (i < data.selectedOnus.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    setResults(res);
    setLoading(false);
    setStep(6);

    if (res.some(r => r.success) && data.oltId) {
      toast.info('Auto-syncing OLT...');
      try { await fetch(`/api/olt/${data.oltId}/sync`, { method: 'POST', credentials: 'include' }); } catch {}
    }
  };

  const canNext = () => {
    if (step === 1) return !!data.oltId;
    if (step === 2) {
      if (manualMode) return manualSn.length >= 8 && manualFrame > 0 && manualSlot > 0 && manualPort > 0;
      return data.selectedOnus.length > 0;
    }
    if (step === 3) return data.services.length > 0 && data.services.every(s => {
      if (s.vlan_mode === 'untag') return true;
      if (s.vlan_mode === 'tag') return s.vlan > 0;
      if (s.vlan_mode === 'qinq') return s.vlan > 0 && s.cvlan > 0;
      return false;
    });
    return true;
  };

  // In manual mode, add ONU to selectedOnus when proceeding from step 2
  const handleStep2Next = () => {
    if (manualMode && manualSn.length >= 8) {
      const manualOnu: UnconfiguredOnu = {
        pon_port: `${manualFrame}/${manualSlot}/${manualPort}`,
        sn: manualSn.toUpperCase(),
        onu_id: manualOnuId,
      };
      setData(prev => ({ ...prev, selectedOnus: [manualOnu] }));
    }
    if (canNext()) setStep(step + 1);
  };

  const script = useMemo(() => generateScript(data), [data]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard/onus')}
            className="p-2 rounded-lg hover:bg-glass transition-colors text-tx2 hover:text-tx1 flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold truncate">{manualMode ? 'Pre-config ONT' : 'Provision ONU'}</h1>
            <p className="text-tx2 text-xs md:text-sm mt-0.5 hidden sm:block">{manualMode ? 'Manual SN input — no OLT scan needed' : 'Unified wizard — all vendors, dynamic services'}</p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      {step <= 5 && (
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

      {/* ═══ Step 1: Select OLT ═══ */}
      {step === 1 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Server size={18} /> Select OLT</h2>
          <div className="grid gap-2 md:gap-3">
            {olts.length === 0 && (
              <div className="text-center py-8 text-tx3">
                <Server size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No OLTs available</p>
              </div>
            )}
            {olts.map((olt: { id: number; name: string; ip_address: string; is_online?: boolean }) => (
              <button key={olt.id} onClick={() => update('oltId', olt.id)}
                className={cn('flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border transition-all text-left',
                  data.oltId === olt.id ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30 bg-glass')}>
                <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  olt.is_online ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                  <Server size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{olt.name}</div>
                  <div className="text-xs text-tx3">{olt.ip_address}</div>
                </div>
                {data.oltId === olt.id && <Check size={20} className="text-accent flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/* Registration Mode */}
          {data.oltId > 0 && (
            <div className="pt-2">
              <label className="label-sm mb-2">Registration Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => update('registerMode', 'telnet')}
                  className={cn('flex items-center gap-2 p-2.5 rounded-lg border text-left transition',
                    data.registerMode === 'telnet' ? 'border-accent bg-accent/10' : 'border-brd hover:border-tx3')}>
                  <Wrench size={16} className={data.registerMode === 'telnet' ? 'text-accent' : 'text-tx3'} />
                  <div>
                    <div className="text-sm font-medium">Telnet / CLI</div>
                    <div className="text-xs text-tx3">Full provisioning</div>
                  </div>
                </button>
                <button type="button" onClick={() => update('registerMode', 'snmp')}
                  className={cn('flex items-center gap-2 p-2.5 rounded-lg border text-left transition',
                    data.registerMode === 'snmp' ? 'border-accent bg-accent/10' : 'border-brd hover:border-tx3')}>
                  <Radio size={16} className={data.registerMode === 'snmp' ? 'text-accent' : 'text-tx3'} />
                  <div>
                    <div className="text-sm font-medium">SNMP</div>
                    <div className="text-xs text-tx3">SNMP SET (write community)</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Step 2: Scan & Select ONUs (or Manual Entry) ═══ */}
      {step === 2 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
            {manualMode ? <><Cpu size={18} /> Enter ONU Details</> : <><Search size={18} /> Select ONUs</>}
          </h2>

          {manualMode ? (
            /* ─── Manual Entry Mode ─── */
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-accent/5 border border-accent/20 text-xs text-accent">
                <strong>Pre-config Mode:</strong> Masukkan Serial Number ONU secara manual tanpa scan OLT. Pastikan SN benar dan ONU sudah terhubung ke PON port yang dituju.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-tx3 mb-1 block">Serial Number *</label>
                  <input type="text" value={manualSn} onChange={e => setManualSn(e.target.value.toUpperCase())}
                    placeholder="ZTEG0A1B2C3D" className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm font-mono" />
                  <p className="text-[10px] text-tx3 mt-1">Format: 4 huruf vendor + 8 hex (contoh: HWTCF95F8CAC)</p>
                </div>
                <div>
                  <label className="text-xs text-tx3 mb-1 block">ONU ID</label>
                  <input type="number" value={manualOnuId} onChange={e => setManualOnuId(Number(e.target.value))}
                    min={1} max={128} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
                  <p className="text-[10px] text-tx3 mt-1">ID ONU pada PON port (1-128)</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-tx3 mb-1 block">Frame</label>
                  <input type="number" value={manualFrame} onChange={e => setManualFrame(Number(e.target.value))}
                    min={1} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
                </div>
                <div>
                  <label className="text-xs text-tx3 mb-1 block">Slot (Card)</label>
                  {ponSlots.length > 0 ? (
                    <select value={manualSlot} onChange={e => {
                      const newSlot = Number(e.target.value);
                      setManualSlot(newSlot);
                      const s = ponSlots.find(s => s.card === newSlot);
                      if (s && s.ports.length > 0) setManualPort(s.ports[0]);
                    }} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm">
                      {ponSlots.map(s => <option key={s.card} value={s.card}>Card {s.card}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={manualSlot} onChange={e => setManualSlot(Number(e.target.value))}
                      min={1} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
                  )}
                  {ponSlots.length === 0 && data.oltId && <p className="text-[10px] text-tx3 mt-1">Sync OLT to load cards</p>}
                </div>
                <div>
                  <label className="text-xs text-tx3 mb-1 block">PON Port</label>
                  {ponSlots.length > 0 ? (() => {
                    const currentSlot = ponSlots.find(s => s.card === manualSlot);
                    return (
                      <select value={manualPort} onChange={e => setManualPort(Number(e.target.value))}
                        className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm">
                        {(currentSlot?.ports || []).map(p => <option key={p} value={p}>Port {p}</option>)}
                      </select>
                    );
                  })() : (
                    <input type="number" value={manualPort} onChange={e => setManualPort(Number(e.target.value))}
                      min={1} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
                  )}
                </div>
              </div>
              {manualSn.length >= 8 && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/20 text-xs text-accent">
                  <Check size={14} /> ONU akan didaftarkan: <strong className="font-mono">{manualSn}</strong> pada PON {manualFrame}/{manualSlot}/{manualPort}:{manualOnuId}
                </div>
              )}
            </div>
          ) : (
            /* ─── Scan Mode (original) ─── */
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={scanOnus} disabled={scanning || !data.oltId}
                  className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs md:text-sm font-medium hover:bg-accent/25 disabled:opacity-50">
                  {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {scanning ? 'Scanning...' : 'Scan OLT'}
                </button>
                {unconfiguredOnus.length > 0 && (
                  <button onClick={() => setData(prev => ({ ...prev, selectedOnus: [...unconfiguredOnus] }))}
                    className="text-xs text-accent hover:underline">Select All ({unconfiguredOnus.length})</button>
                )}
              </div>

              {unconfiguredOnus.length > 0 && (
                <div className="p-3 rounded-xl border border-brd bg-glass max-h-64 overflow-y-auto space-y-1.5">
                  {unconfiguredOnus.map((onu, i) => {
                    const selected = data.selectedOnus.some(o => o.sn === onu.sn);
                    return (
                      <button key={i} onClick={() => toggleOnu(onu)}
                        className={cn('flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left w-full',
                          selected ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30')}>
                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                          selected ? 'bg-accent text-white' : 'bg-glass text-tx3')}>
                          {selected ? <Check size={14} /> : (onu.onu_id || i + 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold font-mono">{onu.sn}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-glass text-tx3">{onu.vendor || '?'}</span>
                            {onu.matched_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">→ {onu.matched_type}</span>}
                          </div>
                          <div className="text-[11px] text-tx3">PON: {onu.pon_port}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {data.selectedOnus.length > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/20 text-xs text-accent">
                  <Check size={14} /> {data.selectedOnus.length} ONU(s) selected
                  {detectedVendor !== 'unknown' && <span className="ml-auto text-tx3">Vendor: <strong className="text-tx1">{detectedVendor.toUpperCase()}</strong></span>}
                </div>
              )}
            </>
          )}

          {/* ONU Type + basic info (shared) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-tx3 mb-1 block">ONU Type</label>
              {onuTypes.length > 0 ? (
                <select value={data.onuType} onChange={e => update('onuType', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm">
                  <option value="All">All (auto-detect)</option>
                  {(() => {
                    const isEpon = data.selectedOnus.length > 0 &&
                      (data.selectedOnus[0].pon_port.includes('epon') || data.selectedOnus[0].is_epon === true);
                    const filtered = isEpon
                      ? onuTypes.filter(t => t.pon_type === 'epon')
                      : onuTypes.filter(t => t.pon_type === 'gpon');
                    return filtered.map(t => <option key={t.type_name} value={t.type_name}>{t.type_name}</option>);
                  })()}
                </select>
              ) : (
                <input value={data.onuType} onChange={e => update('onuType', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
              )}
            </div>
            <div>
              <label className="text-xs text-tx3 mb-1 block">ONU Name</label>
              <input value={data.namePrefix} onChange={e => update('namePrefix', e.target.value)} placeholder="salsa@rw04" className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
            </div>
            <div>
              <label className="text-xs text-tx3 mb-1 block">Description</label>
              <input value={data.description} onChange={e => update('description', e.target.value)} placeholder="ODP-RW03-03 | User" className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
            </div>
            <div>
                <label className="text-xs text-tx3 mb-1 flex items-center gap-1"><Wrench size={11} /> Technician</label>
                <select value={data.technicianId ?? ''} onChange={e => update('technicianId', e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm">
                  <option value="">— Tidak ada teknisi —</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
                {technicians.length === 0 && (
                  <p className="text-[10px] text-tx3 mt-1">Belum ada user dengan role Technician. Tambahkan di User Management.</p>
                )}
              </div>
          </div>
        </div>
      )}

      {/* ═══ Step 3: VLANs & Services ═══ */}
      {step === 3 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Globe size={18} /> VLANs & WAN</h2>
            <button onClick={addService}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 transition-colors">
              <Plus size={14} /> Add VLAN
            </button>
          </div>

          <p className="text-xs text-tx3">Tambah VLAN sesuai kebutuhan. Setiap VLAN bisa punya WAN config berbeda (Bridge/DHCP/PPPoE).</p>

          {/* Global Profiles */}
          {(() => {
            const isEponUI = data.selectedOnus.length > 0 && (data.selectedOnus[0].pon_port.includes('epon') || data.selectedOnus[0].is_epon === true);
            return isEponUI ? (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-tx3 mb-1 block">EPON SLA Profile (Speed Limit)</label>
                  <select value={data.slaProfile} onChange={e => update('slaProfile', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm">
                    <option value="">— No SLA (Default) —</option>
                    {slaProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-tx3 mb-1 block">TCONT Profile (Upload)</label>
                  <select value={data.tcontProfile} onChange={e => update('tcontProfile', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm">
                    {tcontProfiles.length > 0 ? tcontProfiles.map(p => <option key={p} value={p}>{p}</option>) : (
                      <><option value="1G">1G</option><option value="UP-PPPOE">UP-PPPOE</option></>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-tx3 mb-1 block">Traffic Profile (Download)</label>
                  <select value={data.trafficProfile} onChange={e => update('trafficProfile', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm">
                    <option value="">— Same as TCONT —</option>
                    {trafficProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            );
          })()}

          {/* VEIP toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-glass border border-brd">
            <Zap size={16} className={cn(data.useVeip === true ? 'text-accent' : data.useVeip === false ? 'text-tx3' : 'text-warning')} />
            <div className="flex-1">
              <div className="text-sm font-medium">VEIP Mode</div>
              <div className="text-[11px] text-tx3">
                {data.useVeip === null
                  ? `Auto: ${isZte ? 'iphost (ZTE)' : 'VEIP (non-ZTE)'}`
                  : data.useVeip ? 'Manual: VEIP' : 'Manual: iphost'}
              </div>
            </div>
            <select value={data.useVeip === null ? 'auto' : data.useVeip ? 'veip' : 'iphost'}
              onChange={e => update('useVeip', e.target.value === 'auto' ? null : e.target.value === 'veip')}
              className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs">
              <option value="auto">Auto</option>
              <option value="veip">VEIP</option>
              <option value="iphost">iphost</option>
            </select>
          </div>

          {/* VLAN cards */}
          <div className="space-y-2">
            {data.services.map((svc, idx) => (
              <div key={svc.id} className="p-3 rounded-xl border border-brd bg-glass">
                {/* Row 1: VLAN Mode + VLAN + Label + WAN + Delete */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold flex-shrink-0">{idx + 1}</span>

                  {/* VLAN Mode */}
                  <select value={svc.vlan_mode} onChange={e => {
                    const mode = e.target.value as ServiceEntry['vlan_mode'];
                    if (mode === 'untag') { updateService(svc.id, 'vlan_mode', mode); updateService(svc.id, 'vlan', 0); }
                    else updateService(svc.id, 'vlan_mode', mode);
                  }}
                    className="h-8 px-1.5 rounded-lg bg-glass border border-brd text-xs font-medium">
                    <option value="tag">Tag</option>
                    <option value="untag">Untag</option>
                    <option value="qinq">Q-in-Q</option>
                  </select>

                  {/* VLAN input (disabled for untag) */}
                  {svc.vlan_mode !== 'untag' && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-tx3">{svc.vlan_mode === 'qinq' ? 'S-VLAN' : 'VLAN'}</span>
                      {vlanList.length > 0 ? (
                        <select value={svc.vlan} onChange={e => updateService(svc.id, 'vlan', Number(e.target.value))}
                          className="h-8 w-20 px-1.5 rounded-lg bg-glass border border-brd text-xs font-mono">
                          <option value={0}>—</option>
                          {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id}</option>)}
                          {!vlanList.find(v => v.vlan_id === svc.vlan) && svc.vlan > 0 && <option value={svc.vlan}>{svc.vlan}</option>}
                        </select>
                      ) : (
                        <input type="number" value={svc.vlan || ''} onChange={e => updateService(svc.id, 'vlan', Number(e.target.value))}
                          min={1} max={4094} className="h-8 w-20 px-2 rounded-lg bg-glass border border-brd text-xs font-mono" />
                      )}
                    </div>
                  )}

                  {/* C-VLAN input (only for QinQ) */}
                  {svc.vlan_mode === 'qinq' && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-tx3">C-VLAN</span>
                      {vlanList.length > 0 ? (
                        <select value={svc.cvlan} onChange={e => updateService(svc.id, 'cvlan', Number(e.target.value))}
                          className="h-8 w-20 px-1.5 rounded-lg bg-glass border border-brd text-xs font-mono">
                          <option value={0}>—</option>
                          {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id}</option>)}
                        </select>
                      ) : (
                        <input type="number" value={svc.cvlan || ''} onChange={e => updateService(svc.id, 'cvlan', Number(e.target.value))}
                          min={1} max={4094} className="h-8 w-20 px-2 rounded-lg bg-glass border border-brd text-xs font-mono" />
                      )}
                    </div>
                  )}

                  {/* Label */}
                  <input value={svc.label} onChange={e => updateService(svc.id, 'label', e.target.value)}
                    className="h-8 flex-1 min-w-[80px] px-2 rounded-lg bg-glass border border-brd text-xs" placeholder="Label (Internet/VoIP/TR069...)" />

                  {/* WAN mode */}
                  <select value={svc.wan_mode} onChange={e => updateService(svc.id, 'wan_mode', e.target.value)}
                    className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs font-medium">
                    <option value="bridge">🔗 Bridge</option>
                    <option value="dhcp">📡 DHCP</option>
                    <option value="pppoe">🔑 PPPoE</option>
                    <option value="pppoe-nat">🔒 PPPoE NAT</option>
                  </select>

                  {data.services.length > 1 && (
                    <button onClick={() => removeService(svc.id)} className="p-1.5 rounded-lg hover:bg-danger/15 text-tx3 hover:text-danger transition-colors flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Row 2: PPPoE creds (conditional) */}
                {(svc.wan_mode === 'pppoe' || svc.wan_mode === 'pppoe-nat') && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input value={svc.pppoe_user} onChange={e => updateService(svc.id, 'pppoe_user', e.target.value)}
                      className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs" placeholder="PPPoE Username" />
                    <input type="password" value={svc.pppoe_pass} onChange={e => updateService(svc.id, 'pppoe_pass', e.target.value)}
                      className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs" placeholder="PPPoE Password" />
                  </div>
                )}

                {/* Row 3: VLAN Profile (for DHCP/PPPoE) */}
                {(svc.wan_mode === 'dhcp' || svc.wan_mode === 'pppoe') && wanIpProfiles.length > 0 && (
                  <div className="mt-2">
                    <select value={svc.vlan_profile} onChange={e => updateService(svc.id, 'vlan_profile', e.target.value)}
                      className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs w-full sm:w-auto">
                      <option value="">— VLAN Profile (wan-ip) —</option>
                      {wanIpProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick add from OLT VLAN list */}
          {vlanList.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-tx3">Tambah dari VLAN OLT:</span>
              <div className="flex flex-wrap gap-1.5">
                {vlanList.filter(v => !data.services.find(s => s.vlan === v.vlan_id)).map(v => (
                  <button key={v.vlan_id}
                    onClick={() => setData(prev => ({ ...prev, services: [...prev.services, newService({ vlan: v.vlan_id, label: v.name || '' })] }))}
                    className="px-2 py-1 rounded-lg bg-glass border border-brd text-[10px] text-tx2 hover:border-accent/30 hover:text-accent transition-all">
                    {v.vlan_id}{v.name ? ` — ${v.name}` : ''}
                  </button>
                ))}
                {vlanList.every(v => data.services.find(s => s.vlan === v.vlan_id)) && (
                  <span className="text-[10px] text-tx3 italic">Semua VLAN sudah ditambahkan</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Step 4: WiFi & TR069 ═══ */}
      {step === 4 && (
        <div className="glass-card p-4 md:p-6 space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Wifi size={18} /> WiFi & TR069</h2>

          {/* WiFi — ZTE only */}
          {isZte ? (
            <div className="p-3 md:p-4 rounded-xl border border-brd bg-glass space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi size={16} className="text-accent" />
                  <h4 className="text-sm font-semibold">WiFi Configuration</h4>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">ZTE</span>
                </div>
                <button type="button" onClick={() => {
                  const cur = data.wifi.ssids || [];
                  if (cur.length < 8) {
                    const defaultPorts = ['wifi_0/1', 'wifi_0/5', 'wifi_0/2', 'wifi_0/6', 'wifi_0/3', 'wifi_0/7', 'wifi_0/4', 'wifi_0/8'];
                    cur.push({ port: defaultPorts[cur.length] || `wifi_0/${cur.length + 1}`, name: '', pass: '', auth: 'wpa2', vlan: '', enabled: true, hidden: false });
                    update('wifi', { ...data.wifi, ssids: cur });
                  }
                }} className="px-2 py-1 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover flex items-center gap-1">
                  <Plus size={12} /> Add SSID
                </button>
              </div>

              {(data.wifi.ssids || []).length === 0 && (
                <p className="text-xs text-tx3">No SSIDs added. Click "Add SSID" to configure WiFi.</p>
              )}

              {(data.wifi.ssids || []).map((s, i) => (
                <div key={i} className={cn("p-3 rounded-lg border border-brd bg-glass space-y-2", !s.enabled && "opacity-60")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-tx2">SSID {i + 1}</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={s.enabled} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, enabled: e.target.checked }; update('wifi', { ...data.wifi, ssids: next }); }}
                          className="w-3 h-3 rounded accent-accent" />
                        <span className="text-[10px] text-tx3">{s.enabled ? 'Enabled' : 'Disabled'}</span>
                      </label>
                      {s.enabled && (
                        <label className="flex items-center gap-1 cursor-pointer ml-2">
                          <input type="checkbox" checked={s.hidden} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, hidden: e.target.checked }; update('wifi', { ...data.wifi, ssids: next }); }}
                            className="w-3 h-3 rounded accent-accent" />
                          <span className="text-[10px] text-tx3">Hidden</span>
                        </label>
                      )}
                    </div>
                    <button type="button" onClick={() => update('wifi', { ...data.wifi, ssids: (data.wifi.ssids || []).filter((_, idx) => idx !== i) })}
                      className="text-danger hover:text-danger/70 text-xs flex items-center gap-1">
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-tx3 font-medium uppercase">WiFi Port</label>
                      <select value={s.port} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, port: e.target.value }; update('wifi', { ...data.wifi, ssids: next }); }}
                        className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs w-full">
                        {['wifi_0/1', 'wifi_0/2', 'wifi_0/3', 'wifi_0/4', 'wifi_0/5', 'wifi_0/6', 'wifi_0/7', 'wifi_0/8'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-tx3 font-medium uppercase">SSID Name</label>
                      <input value={s.name} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, name: e.target.value }; update('wifi', { ...data.wifi, ssids: next }); }}
                        className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs w-full" placeholder="Nama WiFi" disabled={!s.enabled} />
                    </div>
                    <div>
                      <label className="text-[10px] text-tx3 font-medium uppercase">Auth</label>
                      <select value={s.auth} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, auth: e.target.value as SsidEntry['auth'] }; update('wifi', { ...data.wifi, ssids: next }); }}
                        className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs w-full" disabled={!s.enabled}>
                        <option value="wpa2">WPA2</option>
                        <option value="wpa">WPA</option>
                        <option value="mixed">WPA/WPA2</option>
                        <option value="open">Open</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-tx3 font-medium uppercase">VLAN Tag</label>
                      {vlanList.length > 0 ? (
                        <select value={s.vlan} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, vlan: e.target.value }; update('wifi', { ...data.wifi, ssids: next }); }}
                          className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs w-full" disabled={!s.enabled}>
                          <option value="">No VLAN tag</option>
                          {vlanList.map(v => <option key={v.vlan_id} value={String(v.vlan_id)}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                        </select>
                      ) : (
                        <input type="number" value={s.vlan} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, vlan: e.target.value }; update('wifi', { ...data.wifi, ssids: next }); }}
                          className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs w-full" placeholder="VLAN ID" min={1} max={4094} disabled={!s.enabled} />
                      )}
                    </div>
                  </div>
                  {s.enabled && s.name && s.auth !== 'open' && (
                    <div>
                      <label className="text-[10px] text-tx3 font-medium uppercase">Password</label>
                      <input type="password" value={s.pass} onChange={e => { const next = [...(data.wifi.ssids || [])]; next[i] = { ...s, pass: e.target.value }; update('wifi', { ...data.wifi, ssids: next }); }}
                        className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs w-full" placeholder="Min 8 karakter" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
              <Wifi size={14} className="inline mr-1.5 text-tx3" />
              WiFi config via OMCI is ZTE-specific. Non-ZTE ONUs configure WiFi via web interface or TR-069 ACS.
            </div>
          )}

          {/* TR069 */}
          <div className="p-3 md:p-4 rounded-xl border border-brd bg-glass space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-accent" />
                <h4 className="text-sm font-semibold">TR-069 ACS</h4>
              </div>
              <button onClick={() => update('tr069', { ...data.tr069, enabled: !data.tr069.enabled })}
                className={cn('w-10 h-5 rounded-full relative transition-colors', data.tr069.enabled ? 'bg-accent' : 'bg-glass border border-brd')}>
                <div className={cn('w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all', data.tr069.enabled ? 'left-5.5' : 'left-0.5')} />
              </button>
            </div>

            {data.tr069.enabled && (
              <div className="space-y-3">
                {/* Profile selector */}
                {tr069Profiles.length > 0 && (
                  <div>
                    <label className="text-[10px] text-tx3 mb-0.5 block">Load from Profile</label>
                    <select value={data.tr069.profile_id} onChange={e => {
                      const pid = e.target.value;
                      const p = tr069Profiles.find(x => x.id === parseInt(pid));
                      if (p) {
                        update('tr069', { ...data.tr069, profile_id: pid, acs_url: p.acs_url, acs_user: p.acs_username, acs_pass: p.acs_password, tr069_vlan: p.vlan || 0, tr069_vlan_mode: (p.vlan_mode || 'tag') as 'tag' | 'untag' });
                      } else {
                        update('tr069', { ...data.tr069, profile_id: '' });
                      }
                    }} className="w-full h-8 px-2 rounded-lg bg-glass border border-brd text-xs">
                      <option value="">— Manual —</option>
                      {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-tx3 mb-0.5 block">ACS URL</label>
                    <input value={data.tr069.acs_url} onChange={e => update('tr069', { ...data.tr069, acs_url: e.target.value })}
                      className="w-full h-8 px-2 rounded-lg bg-glass border border-brd text-xs font-mono" placeholder="http://acs:7547" />
                  </div>
                  <div>
                    <label className="text-[10px] text-tx3 mb-0.5 block">ACS Username</label>
                    <input value={data.tr069.acs_user} onChange={e => update('tr069', { ...data.tr069, acs_user: e.target.value })}
                      className="w-full h-8 px-2 rounded-lg bg-glass border border-brd text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-tx3 mb-0.5 block">ACS Password</label>
                    <input type="password" value={data.tr069.acs_pass} onChange={e => update('tr069', { ...data.tr069, acs_pass: e.target.value })}
                      className="w-full h-8 px-2 rounded-lg bg-glass border border-brd text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-tx3 mb-0.5 block">TR069 VLAN</label>
                    <div className="flex gap-1">
                      <input type="number" value={data.tr069.tr069_vlan || ''} onChange={e => update('tr069', { ...data.tr069, tr069_vlan: Number(e.target.value) })}
                        className="flex-1 h-8 px-2 rounded-lg bg-glass border border-brd text-xs" placeholder="VLAN ID" />
                      <select value={data.tr069.tr069_vlan_mode} onChange={e => update('tr069', { ...data.tr069, tr069_vlan_mode: e.target.value as 'tag' | 'untag' })}
                        className="h-8 px-2 rounded-lg bg-glass border border-brd text-xs">
                        <option value="tag">Tag</option>
                        <option value="untag">Untag</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Step 5: Review ═══ */}
      {step === 5 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Check size={18} /> Review & Provision</h2>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-glass border border-brd">
              <div className="text-tx3">OLT</div>
              <div className="font-semibold truncate">{olts.find(o => o.id === data.oltId)?.name || '?'}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-glass border border-brd">
              <div className="text-tx3">ONUs</div>
              <div className="font-semibold">{data.selectedOnus.length} selected</div>
            </div>
            <div className="p-2.5 rounded-lg bg-glass border border-brd">
              <div className="text-tx3">VLANs</div>
              <div className="font-semibold">{data.services.length} ({data.services.map(s => s.label || `V${s.vlan}`).join(', ')})</div>
            </div>
            <div className="p-2.5 rounded-lg bg-glass border border-brd">
              <div className="text-tx3">VEIP</div>
              <div className="font-semibold">{data.useVeip === null ? (isZte ? 'No (auto)' : 'Yes (auto)') : data.useVeip ? 'Yes' : 'No'}</div>
            </div>
          </div>

          {/* ONU list */}
          <div className="text-xs space-y-1">
            {data.selectedOnus.map((onu, i) => (
              <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-glass/50">
                <span className="text-tx3">{i + 1}.</span>
                <span className="font-mono font-semibold">{onu.sn}</span>
                <span className="text-tx3">on {onu.pon_port}</span>
                {data.namePrefix && <span className="text-accent ml-auto">{data.namePrefix}</span>}
              </div>
            ))}
          </div>

          {/* Services detail */}
          <div className="space-y-1.5">
            {data.services.map((svc, i) => (
              <div key={svc.id} className="flex items-center gap-2 p-2 rounded-lg bg-glass border border-brd text-xs">
                <span className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                <span className="font-mono font-semibold">VLAN {svc.vlan}</span>
                {svc.label && <span className="text-accent">{svc.label}</span>}
                <span className="text-tx3">• {svc.wan_mode.toUpperCase()}</span>
                {(svc.wan_mode === 'pppoe' || svc.wan_mode === 'pppoe-nat') && svc.pppoe_user && <span className="text-tx3">• {svc.pppoe_user}</span>}
              </div>
            ))}
          </div>

          {/* WiFi & TR069 summary */}
          {(data.wifi.ssids || []).some(s => s.name) && (
            <div className="p-2 rounded-lg bg-glass border border-brd text-xs">
              <Wifi size={12} className="inline mr-1 text-accent" />
              {(data.wifi.ssids || []).filter(s => s.name).map((s, i) => (
                <span key={i}>
                  {i > 0 && ' • '}
                  {s.port}: {s.name}
                  {s.vlan ? ` (VLAN ${s.vlan})` : ''}
                  {s.enabled === false ? ' [OFF]' : ''}
                  {s.hidden ? ' [Hidden]' : ''}
                </span>
              ))}
            </div>
          )}
          {data.tr069.enabled && (
            <div className="p-2 rounded-lg bg-glass border border-brd text-xs">
              <Shield size={12} className="inline mr-1 text-accent" />
              TR069: {data.tr069.acs_url} (VLAN {data.tr069.tr069_vlan || '—'} {data.tr069.tr069_vlan_mode})
            </div>
          )}

          {/* Script preview */}
          <div>
            <button onClick={() => setShowScript(!showScript)}
              className="flex items-center gap-1.5 text-xs text-accent hover:underline mb-2">
              <Eye size={12} /> {showScript ? 'Hide' : 'Show'} CLI Script
            </button>
            {showScript && (
              <div className="relative">
                <button onClick={() => { navigator.clipboard.writeText(script); toast.success('Copied!'); }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-glass border border-brd text-tx3 hover:text-tx1 z-10">
                  <Copy size={12} />
                </button>
                <pre className="code-block text-[11px] overflow-x-auto max-h-64 overflow-y-auto">
                  {script}
                </pre>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={provision} disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 disabled:opacity-50 transition-all">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {loading ? 'Provisioning...' : `Register ${data.selectedOnus.length} ONU(s)`}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 6: Results ═══ */}
      {step === 6 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
            {results.every(r => r.success) ? <Check className="text-success" size={18} /> : <Zap className="text-warning" size={18} />}
            Results
          </h2>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={cn('flex items-center gap-3 p-3 rounded-lg border',
                r.success ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5')}>
                {r.success ? <Check size={16} className="text-success flex-shrink-0" /> : <Zap size={16} className="text-danger flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono font-semibold">{r.sn}</div>
                  <div className="text-xs text-tx3">{r.message}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate('/dashboard/onus')}
              className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-all">
              View All ONUs
            </button>
            <button onClick={() => { setStep(1); setResults([]); }}
              className="px-4 py-2.5 rounded-xl bg-glass border border-brd text-sm font-medium hover:border-accent/30 transition-all">
              Register More
            </button>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      {step >= 1 && step <= 5 && (
        <div className="flex justify-between">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard/onus')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-glass border border-brd text-sm text-tx2 hover:text-tx1 hover:border-accent/30 transition-all">
            <ArrowLeft size={16} /> Back
          </button>
          {step < 5 ? (
            <button onClick={() => { if (step === 2 && manualMode) handleStep2Next(); else if (canNext()) setStep(step + 1); }} disabled={!canNext()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-all">
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <div /> /* provision button is inside step 5 */
          )}
        </div>
      )}
    </div>
  );
}
