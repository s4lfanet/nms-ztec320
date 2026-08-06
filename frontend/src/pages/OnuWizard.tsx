import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type TechnicianData } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import {
  ArrowLeft, Server, Search, Check, Loader2, Settings, FileText,
  Zap, Plus, Trash2, Wrench, Radio, Wifi, Globe, Shield,
  Cpu, ChevronDown, ChevronRight, Eye, EyeOff,
} from 'lucide-react';

// ==================== Types ====================

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
  enabled: boolean;
  service_type: 'internet' | 'tr069' | 'iptv' | 'bridge';
  vlan_mode: 'tag' | 'untag' | 'qinq';
  vlans: string[];
  wan_mode: 'webpage' | 'nat' | 'wan';
  wan_ip_mode: 'PPPoE' | 'DHCP' | 'STATIC';
  vlan_profile: string;
  username: string;
  password: string;
  mvlan: string;
  profile_upload: string;
  profile_download: string;
}

interface SsidEntry {
  port: string;
  name: string;
  pass: string;
  auth: 'wpa2' | 'mixed' | 'wpa' | 'open';
  vlan: string;
  enabled: boolean;
  hidden: boolean;
}

interface WizardState {
  oltId: number;
  // ONU identification
  serialNumber: string;
  onuType: string;
  frame: number;
  slot: number;
  port: number;
  onuIdMode: 'auto' | 'custom';
  customOnuId: string;
  isEpon: boolean;
  useVeip: boolean;
  // Naming
  name: string;
  description: string;
  // Profiles
  tcontProfile: string;
  trafficProfile: string;
  // Services (R-Config style: up to 4)
  services: ServiceEntry[];
  // WiFi
  ssids: SsidEntry[];
  // LAN port VLANs
  lanVlans: string[];
  // TR069
  enableTr069: boolean;
  tr069ProfileId: string;
  acsUrl: string;
  acsUser: string;
  acsPass: string;
  tr069Vlan: string;
  tr069VlanMode: 'tag' | 'untag';
  // Firewall
  enableFirewall: boolean;
  firewallLevel: 'low' | 'medium' | 'high';
  // Technician
  technicianId: number | null;
}

type WizardMode = 'register' | 'provision' | 'preconfig';

// ==================== Constants ====================

const STEPS_BY_MODE: Record<WizardMode, { id: number; label: string; icon: React.ReactNode }[]> = {
  register: [
    { id: 1, label: 'Select OLT', icon: <Server size={16} /> },
    { id: 2, label: 'Scan & Select', icon: <Search size={16} /> },
    { id: 3, label: 'Configure', icon: <Settings size={16} /> },
    { id: 4, label: 'Review', icon: <Check size={16} /> },
  ],
  provision: [
    { id: 1, label: 'Select OLT', icon: <Server size={16} /> },
    { id: 2, label: 'Select ONUs', icon: <Radio size={16} /> },
    { id: 3, label: 'Configure', icon: <Settings size={16} /> },
    { id: 4, label: 'Review', icon: <Check size={16} /> },
  ],
  preconfig: [
    { id: 1, label: 'Select OLT', icon: <Server size={16} /> },
    { id: 2, label: 'ONU Details', icon: <Cpu size={16} /> },
    { id: 3, label: 'Configure', icon: <Settings size={16} /> },
    { id: 4, label: 'Review', icon: <Check size={16} /> },
  ],
};

const SERVICE_TYPES = [
  { value: 'internet', label: 'Internet', icon: <Globe size={12} />, color: 'text-blue-400' },
  { value: 'tr069', label: 'TR069', icon: <Shield size={12} />, color: 'text-green-400' },
  { value: 'iptv', label: 'IPTV', icon: <Radio size={12} />, color: 'text-purple-400' },
  { value: 'bridge', label: 'Bridge', icon: <Server size={12} />, color: 'text-orange-400' },
];

const DEFAULT_SERVICE: ServiceEntry = {
  enabled: true,
  service_type: 'internet',
  vlan_mode: 'tag',
  vlans: [],
  wan_mode: 'webpage',
  wan_ip_mode: 'PPPoE',
  vlan_profile: '',
  username: '',
  password: '',
  mvlan: '',
  profile_upload: '',
  profile_download: '',
};

const DEFAULT_SSID: SsidEntry = {
  port: 'wifi_0/1',
  name: '',
  pass: '',
  auth: 'wpa2',
  vlan: '',
  enabled: true,
  hidden: false,
};

const WIFI_PORTS = ['wifi_0/1', 'wifi_0/2', 'wifi_0/3', 'wifi_0/4', 'wifi_0/5', 'wifi_0/6', 'wifi_0/7', 'wifi_0/8'];

const INITIAL_STATE: WizardState = {
  oltId: 0,
  serialNumber: '',
  onuType: 'All',
  frame: 1, slot: 1, port: 1,
  onuIdMode: 'auto',
  customOnuId: '',
  isEpon: false,
  useVeip: false,
  name: '',
  description: '',
  tcontProfile: '',
  trafficProfile: '',
  services: [{ ...DEFAULT_SERVICE }],
  ssids: [],
  lanVlans: ['', '', '', ''],
  enableTr069: false,
  tr069ProfileId: '',
  acsUrl: '',
  acsUser: '',
  acsPass: '',
  tr069Vlan: '',
  tr069VlanMode: 'tag',
  enableFirewall: false,
  firewallLevel: 'low',
  technicianId: null,
};

// ==================== Helper Components ====================

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-glass border border-brd p-2.5">
      <div className="text-[10px] text-tx3 uppercase font-semibold mb-0.5">{label}</div>
      <div className="text-xs md:text-sm font-medium truncate">{value}</div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-tx3">{label}</span>
      <span className="text-tx1 font-medium text-right truncate">{value}</span>
    </div>
  );
}

function ServiceTypeBadge({ type }: { type: string }) {
  const st = SERVICE_TYPES.find(s => s.value === type) || SERVICE_TYPES[0];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium', `bg-current/10 ${st.color}`)}>
      {st.icon} {st.label}
    </span>
  );
}

// ==================== Script Generator ====================

function generateScript(state: WizardState): string {
  const lines: string[] = [];
  const onuIf = state.isEpon
    ? `epon-onu_${state.frame}/${state.slot}/${state.port}:${state.onuIdMode === 'custom' ? state.customOnuId : '1'}`
    : `gpon-onu_${state.frame}/${state.slot}/${state.port}:${state.onuIdMode === 'custom' ? state.customOnuId : '1'}`;

  // Register
  if (state.isEpon) {
    lines.push(`epon-onu ${state.frame}/${state.slot}/${state.port}:${state.onuIdMode === 'custom' ? state.customOnuId : '1'} type ${state.onuType} mac ${state.serialNumber}`);
  } else {
    lines.push(`gpon-onu ${state.frame}/${state.slot}/${state.port}:${state.onuIdMode === 'custom' ? state.customOnuId : '1'} type ${state.onuType} sn ${state.serialNumber}`);
  }
  if (state.name) lines.push(`  name ${state.name}`);
  if (state.description) lines.push(`  description ${state.description}`);

  // Interface config
  lines.push('!');
  lines.push(`interface ${onuIf}`);
  const enabledSvcs = state.services.filter(s => s.enabled);
  enabledSvcs.forEach((svc, idx) => {
    const n = idx + 1;
    const vlan = svc.vlans[0] || '100';
    const svcName = `service${n}`;
    lines.push(`  tcont ${n} name ${svcName} profile ${state.tcontProfile}`);
    lines.push(`  gemport ${n} tcont ${n}`);
    if (state.trafficProfile) lines.push(`  gemport ${n} traffic-limit downstream ${state.trafficProfile}`);
    const cvlan = svc.vlans[1] || '';
    if (svc.vlan_mode === 'qinq' && cvlan) {
      lines.push(`  service-port ${n} vport ${n} user-vlan ${cvlan} vlan ${vlan} QinQ`);
    } else if (svc.vlan_mode === 'untag') {
      lines.push(`  service-port ${n} vport ${n} untag`);
    } else {
      lines.push(`  service-port ${n} vport ${n} user-vlan ${vlan} vlan ${vlan}`);
    }
  });

  lines.push('!');
  lines.push(`pon-onu-mng ${onuIf}`);

  // Service mapping
  enabledSvcs.forEach((svc, idx) => {
    const n = idx + 1;
    const vlan = svc.vlans[0] || '100';
    const cvlan = svc.vlans[1] || '';
    const svcName = `service${n}`;
    const vlanSuffix = svc.vlan_mode === 'untag' ? '' : svc.vlan_mode === 'qinq' && cvlan ? ` vlan ${vlan} cvlan ${cvlan}` : ` vlan ${vlan}`;
    if (svc.service_type === 'bridge') {
      lines.push(`  service ${svcName} gemport ${n}${vlanSuffix}`);
    } else if (state.useVeip) {
      lines.push(`  service ${svcName} gemport ${n}${vlanSuffix}`);
    } else if (n === 1) {
      lines.push(`  service ${svcName} gemport ${n} iphost 1${vlanSuffix}`);
    } else {
      lines.push(`  service ${svcName} gemport ${n}${vlanSuffix}`);
    }

    // WAN config per service
    if (svc.service_type === 'tr069' && svc.vlan_profile) {
      lines.push(`  wan-ip ${n} mode dhcp vlan-profile ${svc.vlan_profile} host ${n}`);
    } else if (svc.service_type === 'internet' && svc.wan_mode === 'nat' && svc.username) {
      lines.push(`  pppoe ${n} nat enable user ${svc.username} password ${svc.password}`);
      lines.push(`  wan ${n} service internet host ${n}`);
    } else if (svc.service_type === 'internet' && svc.wan_mode === 'wan') {
      if (svc.wan_ip_mode === 'PPPoE' && svc.username) {
        lines.push(`  wan-ip ${n} mode pppoe username ${svc.username} password ${svc.password} vlan-profile ${svc.vlan_profile} host ${n}`);
      } else if (svc.wan_ip_mode === 'DHCP') {
        lines.push(`  wan-ip ${n} mode dhcp vlan-profile ${svc.vlan_profile} host ${n}`);
      }
    }
  });

  if (state.useVeip) {
    lines.push('  vlan port veip_1 mode hybrid');
    lines.push('  vlan port veip_1 vlan 1');
  }

  // LAN port VLANs
  for (let lp = 1; lp <= 4; lp++) {
    const v = state.lanVlans[lp - 1];
    if (v) lines.push(`  vlan port eth_0/${lp} mode tag vlan ${v}`);
  }

  // WiFi SSIDs
  state.ssids.filter(s => s.name && s.enabled).forEach(s => {
    lines.push(`  interface wifi ${s.port} state unlock`);
    const hideStr = s.hidden ? 'enable' : 'disable';
    lines.push(`  ssid ctrl ${s.port} name ${s.name.replace(/ /g, '_')} hide ${hideStr}`);
    if (s.auth !== 'open') {
      const authMode = s.auth === 'mixed' ? 'wpa-wpa2-psk' : s.auth === 'wpa' ? 'wpa-psk' : 'wpa2-psk';
      lines.push(`  ssid auth wpa ${s.port} ${authMode}`);
      lines.push(`  ssid auth wpa ${s.port} encrypt aes`);
      if (s.pass) lines.push(`  ssid auth wpa ${s.port} key ${s.pass}`);
    } else {
      lines.push(`  ssid auth wpa ${s.port} no-auth`);
      lines.push(`  ssid auth wpa ${s.port} encrypt none`);
      lines.push(`  ssid auth wpa ${s.port} no-key`);
    }
  });

  // Firewall
  if (state.enableFirewall) {
    lines.push(`  firewall enable level ${state.firewallLevel} anti-hack disable`);
  }

  // TR069
  if (state.enableTr069) {
    lines.push('  tr069-mgmt 1 state unlock');
    lines.push(`  tr069-mgmt 1 acs ${state.acsUrl || 'http://192.168.54.254:7547'} validate basic username ${state.acsUser || 'acs'} password ${state.acsPass || 'acs'}`);
    if (state.tr069VlanMode === 'tag' && state.tr069Vlan) {
      lines.push(`  tr069-mgmt 1 tag pri 0 vlan ${state.tr069Vlan}`);
    } else {
      lines.push('  tr069-mgmt 1 untag');
    }
  }

  lines.push('  security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069');
  lines.push('!');
  return lines.join('\n');
}

// ==================== Main Component ====================

export function OnuWizard({ mode }: { mode: WizardMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(() => {
    const navState = location.state as { prefillOltId?: number; prefillOnu?: UnconfiguredOnu } | null;
    if (navState?.prefillOnu && navState.prefillOltId) {
      const onu = navState.prefillOnu;
      const match = onu.pon_port.match(/(\d+)\/(\d+)\/(\d+)/);
      const isEpon = onu.is_epon || onu.pon_port.includes('epon');
      return {
        ...INITIAL_STATE,
        oltId: navState.prefillOltId,
        serialNumber: onu.sn,
        onuType: onu.matched_type || 'All',
        frame: match ? parseInt(match[1]) : 1,
        slot: match ? parseInt(match[2]) : 1,
        port: match ? parseInt(match[3]) : 1,
        isEpon,
        useVeip: !onu.sn.toUpperCase().startsWith('ZTEG'),
      };
    }
    return { ...INITIAL_STATE };
  });

  const [scanning, setScanning] = useState(false);
  const [unconfiguredOnus, setUnconfiguredOnus] = useState<UnconfiguredOnu[]>([]);
  const [selectedFromScan, setSelectedFromScan] = useState<UnconfiguredOnu[]>([]);
  const [onuTypes, setOnuTypes] = useState<string[]>([]);
  const [tcontProfiles, setTcontProfiles] = useState<string[]>([]);
  const [trafficProfiles, setTrafficProfiles] = useState<string[]>([]);
  const [vlanList, setVlanList] = useState<Array<{ vlan_id: number; name: string }>>([]);
  const [wanIpProfiles, setWanIpProfiles] = useState<Array<{ name: string; vlan: number; ip_mode: string }>>([]);
  const [tr069Profiles, setTr069Profiles] = useState<Array<{ id: number; name: string; acs_url: string; acs_username: string; acs_password: string; vlan: number; vlan_mode: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});

  const { data: dashData } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const olts = dashData?.olts || [];
  const { data: techData } = useQuery({ queryKey: ['technicians'], queryFn: api.technicians });
  const technicians: TechnicianData[] = techData?.technicians || [];

  const steps = STEPS_BY_MODE[mode];
  const modeLabel = mode === 'register' ? 'Register ONU' : mode === 'provision' ? 'Provision ONU' : 'Pre-config ONU';

  // Prefill: skip to step 3 if coming from UnconfiguredOnus
  useEffect(() => {
    const navState = location.state as { prefillOnu?: unknown } | null;
    if (navState?.prefillOnu && step === 1) setStep(3);
  }, [location.state, step]);

  // Fetch OLT data when OLT selected
  useEffect(() => {
    if (!state.oltId) return;
    const olt = olts.find(o => o.id === state.oltId);
    if (!olt) return;

    fetch(`/api/olt/${state.oltId}/onu-types`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success && d.types) setOnuTypes(d.types); }).catch(() => {});
    fetch(`/api/olt/${state.oltId}/speed-profiles`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.tcont) setTcontProfiles(d.tcont);
        if (d.success && d.traffic) setTrafficProfiles(d.traffic);
      }).catch(() => {});
    fetch(`/api/olt/${state.oltId}/vlans`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.vlans) setVlanList(d.vlans); }).catch(() => {});
    fetch('/api/tr069', { credentials: 'include' })
      .then(r => r.json()).then(setTr069Profiles).catch(() => {});
    fetch(`/api/olt/${state.oltId}/wan-ip-profiles`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success && d.wan_ip_profiles) setWanIpProfiles(d.wan_ip_profiles); }).catch(() => {});
  }, [state.oltId, olts]);

  const update = useCallback(<K extends keyof WizardState>(k: K, v: WizardState[K]) => {
    setState(prev => ({ ...prev, [k]: v }));
  }, []);

  const scanOnus = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan-unconfigured', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ olt_id: state.oltId }),
      });
      const d = await res.json();
      if (d.success && d.onus) {
        setUnconfiguredOnus(d.onus);
        if (d.onus.length === 0) toast.warning('No unconfigured ONUs found');
        else toast.success(`Found ${d.onus.length} unconfigured ONU(s)`);
      } else { toast.error(d.message || 'Scan failed'); }
    } catch { toast.error('Scan failed'); }
    setScanning(false);
  };

  const toggleScanOnu = (onu: UnconfiguredOnu) => {
    setSelectedFromScan(prev => {
      const exists = prev.some(o => o.sn === onu.sn);
      return exists ? prev.filter(o => o.sn !== onu.sn) : [...prev, onu];
    });
  };

  const selectTr069Profile = (profileId: string) => {
    const p = tr069Profiles.find(p => p.id === parseInt(profileId));
    if (p) {
      const isUntag = (p.vlan_mode || 'tag') === 'untag';
      update('tr069ProfileId', profileId);
      update('acsUrl', p.acs_url);
      update('acsUser', p.acs_username);
      update('acsPass', p.acs_password);
      update('tr069Vlan', isUntag ? '' : String(p.vlan));
      update('tr069VlanMode', (p.vlan_mode as 'tag' | 'untag') || 'tag');
    } else {
      update('tr069ProfileId', '');
      update('acsUrl', ''); update('acsUser', ''); update('acsPass', '');
      update('tr069Vlan', ''); update('tr069VlanMode', 'tag');
    }
  };

  const addService = () => {
    if (state.services.length >= 4) return;
    update('services', [...state.services, { ...DEFAULT_SERVICE }]);
  };

  const updateService = (idx: number, patch: Partial<ServiceEntry>) => {
    update('services', state.services.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeService = (idx: number) => {
    update('services', state.services.filter((_, i) => i !== idx));
  };

  const addSsid = () => {
    if (state.ssids.length >= 8) return;
    const port = WIFI_PORTS[state.ssids.length] || `wifi_0/${state.ssids.length + 1}`;
    update('ssids', [...state.ssids, { ...DEFAULT_SSID, port }]);
  };

  const updateSsid = (idx: number, patch: Partial<SsidEntry>) => {
    update('ssids', state.ssids.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeSsid = (idx: number) => {
    update('ssids', state.ssids.filter((_, i) => i !== idx));
  };

  const canNext = (): boolean => {
    if (step === 1) return !!state.oltId;
    if (step === 2) {
      if (mode === 'register') return selectedFromScan.length > 0;
      if (mode === 'provision') return selectedFromScan.length > 0;
      if (mode === 'preconfig') return !!state.serialNumber && !!state.onuType;
    }
    if (step === 3) {
      if (!state.tcontProfile) return false;
      return state.services.filter(s => s.enabled).every(s => {
        if (s.vlan_mode === 'untag') return true;
        if (s.vlan_mode === 'tag') return !!s.vlans[0];
        if (s.vlan_mode === 'qinq') return !!s.vlans[0] && !!s.vlans[1];
        return false;
      });
    }
    return true;
  };

  // Apply scanned ONU selection to state when moving to step 3
  useEffect(() => {
    if (step === 3 && mode !== 'preconfig' && selectedFromScan.length > 0) {
      const first = selectedFromScan[0];
      const match = first.pon_port.match(/(\d+)\/(\d+)\/(\d+)/);
      const isEpon = first.is_epon || first.pon_port.includes('epon');
      update('serialNumber', first.sn);
      update('onuType', first.matched_type || 'All');
      if (match) { update('frame', parseInt(match[1])); update('slot', parseInt(match[2])); update('port', parseInt(match[3])); }
      update('isEpon', isEpon);
      update('useVeip', !first.sn.toUpperCase().startsWith('ZTEG'));
    }
  }, [step, mode, selectedFromScan]);

  const submit = async (dryRun: boolean) => {
    setSubmitting(true);
    try {
      const payload = {
        olt_id: state.oltId,
        frame: state.frame, slot: state.slot, port: state.port,
        onu_id: state.onuIdMode === 'custom' ? parseInt(state.customOnuId) : 1,
        onu_type: state.isEpon && state.onuType === 'All' ? 'ALL-EPON' : state.onuType,
        serial: state.serialNumber,
        vlan: state.services[0]?.vlan_mode === 'untag' ? 0 : parseInt(state.services[0]?.vlans[0] || '100'),
        tcont_profile: state.tcontProfile,
        traffic_profile: state.trafficProfile,
        name: state.name, description: state.description,
        configure: true,
        template: 'zte_multi',
        extra: {
          services: JSON.stringify(state.services),
          ssids: state.ssids,
          lan_vlans: state.lanVlans,
          use_veip: state.useVeip ? 'true' : '',
          enable_tr069: state.enableTr069 ? 'true' : '',
          acs_url: state.acsUrl, acs_user: state.acsUser, acs_pass: state.acsPass,
          tr069_vlan: state.tr069Vlan, tr069_vlan_mode: state.tr069VlanMode,
          enable_firewall: state.enableFirewall ? 'true' : '',
          firewall_level: state.firewallLevel,
        },
        technician_id: state.technicianId,
        pon_port: `${state.frame}/${state.slot}/${state.port}`,
        is_epon: state.isEpon,
        dry_run: dryRun,
      };

      const r = await fetch('/api/pre-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) {
        if (dryRun) {
          toast.success('Preview generated');
          setShowScript(true);
        } else {
          toast.success('ONU registered successfully!');
          try {
            await fetch(`/api/olt/${state.oltId}/sync`, { method: 'POST', credentials: 'include' });
          } catch {}
          setTimeout(() => navigate('/dashboard/onus'), 1500);
        }
      } else {
        toast.error(d.message || 'Failed');
      }
    } catch { toast.error('Request failed'); }
    setSubmitting(false);
  };

  const script = generateScript(state);

  // ==================== Render ====================

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => step > 1 && step <= 4 ? setStep(step - 1) : navigate('/dashboard/onus/unconfigured')}
            className="p-2 rounded-lg hover:bg-glass transition-colors text-tx2 hover:text-tx1 flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold truncate">{modeLabel} Wizard</h1>
            <p className="text-tx2 text-xs md:text-sm mt-0.5 hidden sm:block">
              {mode === 'register' ? 'Register scanned ONU with full configuration' :
               mode === 'provision' ? 'Provision multiple ONUs with batch config' :
               'Pre-configure ONU before physical connection'}
            </p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      {step <= 4 && (
        <div className="flex items-center gap-1 md:gap-2 overflow-x-auto scrollbar-thin pb-1">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 md:gap-2 flex-shrink-0">
              <button
                onClick={() => { if (s.id < step) setStep(s.id); }}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-[11px] md:text-xs font-medium transition-all whitespace-nowrap',
                  step === s.id ? 'bg-accent text-white' : step > s.id ? 'bg-success/15 text-success' : 'bg-glass text-tx3',
                )}
              >
                {step > s.id ? <Check size={14} /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.id}</span>
              </button>
              {i < steps.length - 1 && <div className={cn('w-3 md:w-8 h-0.5 rounded', step > s.id ? 'bg-success' : 'bg-glass')} />}
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Select OLT */}
      {step === 1 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Server size={18} /> Select OLT Device</h2>
          <p className="text-tx2 text-xs md:text-sm">Choose which OLT to {mode === 'preconfig' ? 'pre-configure' : 'register'} ONUs on.</p>
          <div className="grid gap-2 md:gap-3">
            {olts.length === 0 && (
              <div className="text-center py-8 text-tx3">
                <Server size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No OLTs available</p>
                <p className="text-xs mt-1">Add an OLT in OLT Settings first</p>
              </div>
            )}
            {olts.map((olt: { id: number; name: string; model: string; ip_address: string; is_online: boolean }) => (
              <button key={olt.id} onClick={() => update('oltId', olt.id)}
                className={cn(
                  'flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border transition-all text-left',
                  state.oltId === olt.id ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30 bg-glass',
                )}>
                <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  olt.is_online ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                  <Server size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{olt.name}</div>
                  <div className="text-xs text-tx3 truncate">{olt.model} &bull; {olt.ip_address} &bull; {olt.is_online ? 'Online' : 'Offline'}</div>
                </div>
                {state.oltId === olt.id && <Check size={20} className="text-accent flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Scan/Select ONUs or Manual Entry */}
      {step === 2 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          {mode === 'preconfig' ? (
            <>
              <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Cpu size={18} /> ONU Details</h2>
              <p className="text-tx2 text-xs md:text-sm">Enter ONU details manually for pre-configuration.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="label-sm mb-1.5">Serial Number / MAC</label>
                  <input type="text" value={state.serialNumber} onChange={e => update('serialNumber', e.target.value.toUpperCase())}
                    className="input-field" placeholder="ZTEG0A1B2C3D or MAC address" />
                  <p className="text-xs text-tx3 mt-1">Format: 4 letters + 8 hex digits</p>
                </div>
                <div>
                  <label className="label-sm mb-1.5">ONU Type</label>
                  <select value={state.onuType} onChange={e => update('onuType', e.target.value)} className="input-field">
                    <option value="All">All (auto-detect)</option>
                    {onuTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="label-sm mb-1">Frame</label>
                    <input type="number" value={state.frame} onChange={e => update('frame', parseInt(e.target.value) || 1)} className="input-field" min={1} /></div>
                  <div><label className="label-sm mb-1">Slot</label>
                    <input type="number" value={state.slot} onChange={e => update('slot', parseInt(e.target.value) || 1)} className="input-field" min={1} /></div>
                  <div><label className="label-sm mb-1">PON Port</label>
                    <input type="number" value={state.port} onChange={e => update('port', parseInt(e.target.value) || 1)} className="input-field" min={1} /></div>
                </div>
                <div>
                  <label className="label-sm mb-1.5">PON Type</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="pontype" checked={!state.isEpon} onChange={() => update('isEpon', false)} />
                      <span className="text-sm">GPON</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="pontype" checked={state.isEpon} onChange={() => update('isEpon', true)} />
                      <span className="text-sm">EPON</span>
                    </label>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Search size={18} /> Unconfigured ONUs</h2>
                <button onClick={scanOnus} disabled={scanning}
                  className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-accent text-white text-xs md:text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                  {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {scanning ? 'Scanning...' : 'Scan OLT'}
                </button>
              </div>

              {unconfiguredOnus.length === 0 && !scanning && (
                <div className="text-center py-12">
                  <Radio size={48} className="mx-auto text-tx3 mb-4 opacity-30" />
                  <p className="text-tx3">Click <strong>Scan OLT</strong> to discover unconfigured ONUs</p>
                </div>
              )}

              {scanning && (
                <div className="text-center py-12">
                  <Loader2 size={48} className="mx-auto text-accent mb-4 animate-spin" />
                  <p className="text-tx3">Scanning OLT for unconfigured ONUs...</p>
                </div>
              )}

              {unconfiguredOnus.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {unconfiguredOnus.map((onu, i) => {
                    const selected = selectedFromScan.some(o => o.sn === onu.sn);
                    return (
                      <button key={i} onClick={() => toggleScanOnu(onu)}
                        className={cn(
                          'flex items-center gap-3 md:gap-4 w-full p-3 rounded-xl border transition-all text-left',
                          selected ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30 bg-glass',
                        )}>
                        <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0',
                          selected ? 'border-accent bg-accent' : 'border-brd')}>
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs md:text-sm font-medium truncate">{onu.sn}</div>
                          <div className="text-[10px] md:text-xs text-tx3 truncate">
                            Port: {onu.pon_port} {onu.vendor ? `\u2022 ${onu.vendor}` : ''} {onu.model ? `\u2022 ${onu.model}` : ''}
                          </div>
                        </div>
                        {onu.matched_type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium flex-shrink-0">
                            {onu.matched_type}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedFromScan.length > 0 && (
                <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 text-sm text-accent">
                  {selectedFromScan.length} ONU(s) selected
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 3: Configure */}
      {step === 3 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Settings size={18} /> Configuration</h2>

          {/* ONU Info Summary */}
          <div className="p-3 rounded-lg bg-glass border border-brd">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div><span className="text-tx3">SN:</span> <span className="font-mono font-medium">{state.serialNumber}</span></div>
              <div><span className="text-tx3">Type:</span> <span className="font-medium">{state.onuType}</span></div>
              <div><span className="text-tx3">PON:</span> <span className="font-medium">{state.isEpon ? 'EPON' : 'GPON'} {state.frame}/{state.slot}/{state.port}</span></div>
              <div><span className="text-tx3">VEIP:</span> <span className="font-medium">{state.useVeip ? 'ON' : 'OFF'}</span></div>
            </div>
          </div>

          {/* ONU ID Auto/Custom */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="label-sm mb-1.5">ONU ID</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="onuid" checked={state.onuIdMode === 'auto'} onChange={() => update('onuIdMode', 'auto')} />
                  <span className="text-sm">Auto (next available)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="onuid" checked={state.onuIdMode === 'custom'} onChange={() => update('onuIdMode', 'custom')} />
                  <span className="text-sm">Custom</span>
                </label>
                {state.onuIdMode === 'custom' && (
                  <input type="number" value={state.customOnuId} onChange={e => update('customOnuId', e.target.value)}
                    min={1} max={128} className="input-field w-24" placeholder="ID" />
                )}
              </div>
            </div>
            <div>
              <label className="label-sm mb-1.5">VEIP Mode</label>
              <div className="flex items-center gap-3 h-9">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={state.useVeip} onChange={e => update('useVeip', e.target.checked)} />
                  <span className="text-sm">Use VEIP (for non-ZTE ONUs)</span>
                </label>
              </div>
            </div>
          </div>

          <hr className="border-brd" />

          {/* Profiles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="label-sm mb-1.5">TCONT Profile <span className="text-tx3">(Upload)</span></label>
              <select value={state.tcontProfile} onChange={e => update('tcontProfile', e.target.value)} className="input-field">
                <option value="">Select profile...</option>
                {tcontProfiles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label-sm mb-1.5">Traffic Profile <span className="text-tx3">(Download)</span></label>
              <select value={state.trafficProfile} onChange={e => update('trafficProfile', e.target.value)} className="input-field">
                <option value="">None (no DL limit)</option>
                {trafficProfiles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <hr className="border-brd" />

          {/* Multi-Service (R-Config style) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center gap-2"><Globe size={14} /> Services (max 4)</span>
              <button type="button" onClick={addService} disabled={state.services.length >= 4}
                className="px-2 py-1 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1">
                <Plus size={12} /> Add Service
              </button>
            </div>
            {state.services.map((svc, idx) => (
              <div key={idx} className={cn("p-3 rounded-lg border border-brd bg-glass space-y-3", !svc.enabled && "opacity-60")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-tx2">Service {idx + 1}</span>
                    <ServiceTypeBadge type={svc.service_type} />
                    <label className="flex items-center gap-1 text-xs cursor-pointer ml-2">
                      <input type="checkbox" checked={svc.enabled} onChange={e => updateService(idx, { enabled: e.target.checked })} className="w-3 h-3 rounded accent-accent" />
                      <span className="text-tx3">{svc.enabled ? 'ON' : 'OFF'}</span>
                    </label>
                  </div>
                  {state.services.length > 1 && (
                    <button type="button" onClick={() => removeService(idx)} className="text-danger hover:text-danger/70 text-xs flex items-center gap-1">
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className="label-sm mb-1">Service Type</label>
                    <select value={svc.service_type} onChange={e => updateService(idx, { service_type: e.target.value as ServiceEntry['service_type'] })} className="input-field">
                      <option value="internet">Internet</option>
                      <option value="tr069">TR069</option>
                      <option value="iptv">IPTV</option>
                      <option value="bridge">Bridge</option>
                    </select></div>
                  <div><label className="label-sm mb-1">VLAN Mode</label>
                    <select value={svc.vlan_mode} onChange={e => {
                      const mode = e.target.value as ServiceEntry['vlan_mode'];
                      if (mode === 'untag') updateService(idx, { vlan_mode: mode, vlans: [] });
                      else if (mode === 'tag') updateService(idx, { vlan_mode: mode, vlans: svc.vlans.slice(0, 1) });
                      else updateService(idx, { vlan_mode: mode });
                    }} className="input-field">
                      <option value="tag">Tag</option>
                      <option value="untag">Untag</option>
                      <option value="qinq">Q-in-Q</option>
                    </select></div>
                  {svc.vlan_mode !== 'untag' && (
                    <div><label className="label-sm mb-1">VLAN {svc.vlan_mode === 'qinq' ? '(S-VLAN)' : ''}</label>
                      {vlanList.length > 0 ? (
                        <select value={svc.vlans[0] || ''} onChange={e => updateService(idx, { vlans: [e.target.value, svc.vlans[1] || ''] })} className="input-field">
                          <option value="">Select VLAN...</option>
                          {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                        </select>
                      ) : (
                        <input type="number" value={svc.vlans[0] || ''} onChange={e => updateService(idx, { vlans: [e.target.value, svc.vlans[1] || ''] })} className="input-field" placeholder="VLAN ID" />
                      )}</div>
                  )}
                  {svc.vlan_mode === 'qinq' && (
                    <div><label className="label-sm mb-1">C-VLAN (Inner)</label>
                      {vlanList.length > 0 ? (
                        <select value={svc.vlans[1] || ''} onChange={e => updateService(idx, { vlans: [svc.vlans[0] || '', e.target.value] })} className="input-field">
                          <option value="">Select C-VLAN...</option>
                          {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                        </select>
                      ) : (
                        <input type="number" value={svc.vlans[1] || ''} onChange={e => updateService(idx, { vlans: [svc.vlans[0] || '', e.target.value] })} className="input-field" placeholder="C-VLAN ID" />
                      )}</div>
                  )}
                  <div><label className="label-sm mb-1">WAN Mode</label>
                    <select value={svc.wan_mode} onChange={e => updateService(idx, { wan_mode: e.target.value as ServiceEntry['wan_mode'] })} className="input-field">
                      <option value="webpage">Setup via ONT</option>
                      <option value="nat">PPPoE NAT</option>
                      <option value="wan">WAN-IP</option>
                    </select></div>
                  {svc.wan_mode === 'wan' && svc.service_type === 'internet' && (
                    <div><label className="label-sm mb-1">WAN IP Mode</label>
                      <select value={svc.wan_ip_mode} onChange={e => updateService(idx, { wan_ip_mode: e.target.value as ServiceEntry['wan_ip_mode'] })} className="input-field">
                        <option value="PPPoE">PPPoE</option>
                        <option value="DHCP">DHCP</option>
                        <option value="STATIC">Static</option>
                      </select></div>
                  )}
                  {svc.wan_mode === 'wan' && (
                    <div><label className="label-sm mb-1">VLAN Profile</label>
                      <select value={svc.vlan_profile} onChange={e => updateService(idx, { vlan_profile: e.target.value })} className="input-field">
                        <option value="">Select VLAN Profile...</option>
                        {wanIpProfiles.map(p => <option key={p.name} value={p.name}>{p.vlan || '—'} — {p.name}</option>)}
                      </select></div>
                  )}
                  {svc.service_type === 'iptv' && (
                    <div><label className="label-sm mb-1">MVLAN</label>
                      <input type="number" value={svc.mvlan} onChange={e => updateService(idx, { mvlan: e.target.value })} className="input-field" placeholder="MVLAN" /></div>
                  )}
                  {((svc.wan_mode === 'nat' && svc.service_type === 'internet') || (svc.wan_mode === 'wan' && svc.wan_ip_mode === 'PPPoE' && svc.service_type === 'internet')) && (
                    <>
                      <div><label className="label-sm mb-1">PPPoE Username</label>
                        <input type="text" value={svc.username} onChange={e => updateService(idx, { username: e.target.value })} className="input-field" placeholder="Username" /></div>
                      <div><label className="label-sm mb-1">PPPoE Password</label>
                        <input type="text" value={svc.password} onChange={e => updateService(idx, { password: e.target.value })} className="input-field" placeholder="Password" /></div>
                    </>
                  )}
                  <div><label className="label-sm mb-1">Upload Profile</label>
                    <select value={svc.profile_upload} onChange={e => updateService(idx, { profile_upload: e.target.value })} className="input-field">
                      <option value="">Use global</option>
                      {tcontProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                    </select></div>
                  <div><label className="label-sm mb-1">Download Profile</label>
                    <select value={svc.profile_download} onChange={e => updateService(idx, { profile_download: e.target.value })} className="input-field">
                      <option value="">Use global</option>
                      {trafficProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                    </select></div>
                </div>
              </div>
            ))}
          </div>

          <hr className="border-brd" />

          {/* WiFi SSIDs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center gap-2"><Wifi size={14} /> WiFi SSID List (max 8)</span>
              <button type="button" onClick={addSsid} disabled={state.ssids.length >= 8}
                className="px-2 py-1 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1">
                <Plus size={12} /> Add SSID
              </button>
            </div>
            {state.ssids.length === 0 && <p className="text-xs text-tx3">No SSIDs added. Click "Add SSID" to configure WiFi.</p>}
            {state.ssids.map((s, i) => (
              <div key={i} className={cn("p-3 rounded-lg border border-brd bg-glass space-y-2", !s.enabled && "opacity-60")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-tx2">SSID {i + 1}</span>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={s.enabled} onChange={e => updateSsid(i, { enabled: e.target.checked })} className="w-3 h-3 rounded accent-accent" />
                      <span className="text-tx3">{s.enabled ? 'ON' : 'OFF'}</span>
                    </label>
                    {s.enabled && (
                      <label className="flex items-center gap-1 text-xs cursor-pointer ml-2">
                        <input type="checkbox" checked={s.hidden} onChange={e => updateSsid(i, { hidden: e.target.checked })} className="w-3 h-3 rounded accent-accent" />
                        <span className="text-tx3">Hidden</span>
                      </label>
                    )}
                  </div>
                  <button type="button" onClick={() => removeSsid(i)} className="text-danger hover:text-danger/70 text-xs">Remove</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  <div><label className="label-sm mb-1">WiFi Port</label>
                    <select value={s.port} onChange={e => updateSsid(i, { port: e.target.value })} className="input-field">
                      {WIFI_PORTS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select></div>
                  <div className="sm:col-span-1"><label className="label-sm mb-1">SSID Name</label>
                    <input type="text" value={s.name} onChange={e => updateSsid(i, { name: e.target.value })} className="input-field" placeholder="WiFi name" disabled={!s.enabled} /></div>
                  <div><label className="label-sm mb-1">Auth</label>
                    <select value={s.auth} onChange={e => updateSsid(i, { auth: e.target.value as SsidEntry['auth'] })} className="input-field" disabled={!s.enabled}>
                      <option value="wpa2">WPA2-PSK</option>
                      <option value="mixed">WPA/WPA2 Mixed</option>
                      <option value="wpa">WPA-PSK</option>
                      <option value="open">Open (No Password)</option>
                    </select></div>
                  <div><label className="label-sm mb-1">VLAN Tag</label>
                    {vlanList.length > 0 ? (
                      <select value={s.vlan} onChange={e => updateSsid(i, { vlan: e.target.value })} className="input-field" disabled={!s.enabled}>
                        <option value="">No VLAN tag</option>
                        {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                      </select>
                    ) : (
                      <input type="number" value={s.vlan} onChange={e => updateSsid(i, { vlan: e.target.value })} className="input-field" placeholder="VLAN ID" disabled={!s.enabled} />
                    )}</div>
                </div>
                {s.enabled && s.name && s.auth !== 'open' && (
                  <div><label className="label-sm mb-1">Password</label>
                    <div className="relative">
                      <input type={showPass[`ssid${i}`] ? 'text' : 'password'} value={s.pass} onChange={e => updateSsid(i, { pass: e.target.value })} className="input-field pr-10" placeholder="Min 8 characters" />
                      <button type="button" onClick={() => setShowPass(p => ({ ...p, [`ssid${i}`]: !p[`ssid${i}`] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">
                        {showPass[`ssid${i}`] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div></div>
                )}
              </div>
            ))}
          </div>

          <hr className="border-brd" />

          {/* LAN Port VLANs */}
          <div className="space-y-2">
            <span className="text-sm font-medium">LAN Port VLAN Tags (optional)</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(ethPort => (
                <div key={ethPort}><label className="label-sm mb-1">ETH 0/{ethPort}</label>
                  {vlanList.length > 0 ? (
                    <select value={state.lanVlans[ethPort - 1] || ''} onChange={e => { const next = [...state.lanVlans]; next[ethPort - 1] = e.target.value; update('lanVlans', next); }} className="input-field">
                      <option value="">Primary VLAN</option>
                      {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={state.lanVlans[ethPort - 1] || ''} onChange={e => { const next = [...state.lanVlans]; next[ethPort - 1] = e.target.value; update('lanVlans', next); }} className="input-field" placeholder="VLAN ID" />
                  )}</div>
              ))}
            </div>
          </div>

          <hr className="border-brd" />

          {/* Firewall & TR069 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={state.enableFirewall} onChange={e => update('enableFirewall', e.target.checked)} />
                <span className="text-sm font-medium flex items-center gap-1"><Shield size={12} /> Firewall</span>
              </label>
              {state.enableFirewall && (
                <select value={state.firewallLevel} onChange={e => update('firewallLevel', e.target.value as WizardState['firewallLevel'])} className="input-field">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={state.enableTr069} onChange={e => update('enableTr069', e.target.checked)} />
                <span className="text-sm font-medium flex items-center gap-1"><Globe size={12} /> TR069/ACS</span>
              </label>
              {state.enableTr069 && (
                <div className="space-y-2 pl-6">
                  <select value={state.tr069ProfileId} onChange={e => selectTr069Profile(e.target.value)} className="input-field">
                    <option value="">Select Profile...</option>
                    {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                  </select>
                  {state.tr069ProfileId && (
                    <div className="grid grid-cols-2 gap-2 text-xs text-tx3">
                      <div>ACS: <span className="text-tx1 font-mono">{state.acsUrl}</span></div>
                      <div>User: <span className="text-tx1">{state.acsUser}</span></div>
                      <div>VLAN: <span className="text-tx1 font-mono">{state.tr069Vlan || 'untag'}</span></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <hr className="border-brd" />

          {/* Name & Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="label-sm mb-1.5">Name (optional)</label>
              <input type="text" value={state.name} onChange={e => update('name', e.target.value)} className="input-field" placeholder="e.g. ODP-RW03-01" />
            </div>
            <div>
              <label className="label-sm mb-1.5">Description (optional)</label>
              <input type="text" value={state.description} onChange={e => update('description', e.target.value)} className="input-field" placeholder="e.g. Pelanggan RT03" />
            </div>
          </div>

          {technicians.length > 0 && (
            <div>
              <label className="label-sm mb-1.5 flex items-center gap-1.5"><Wrench size={12} /> Teknisi</label>
              <select value={state.technicianId ?? ''} onChange={e => update('technicianId', e.target.value ? Number(e.target.value) : null)} className="input-field">
                <option value="">— Tidak ada teknisi —</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.phone ? ` (${t.phone})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><FileText size={18} /> Review & {mode === 'preconfig' ? 'Save' : 'Register'}</h2>

          <div>
            <h3 className="text-sm font-semibold mb-2 text-accent">General Settings</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              <InfoBox label="OLT" value={olts.find(o => o.id === state.oltId)?.name || '-'} />
              <InfoBox label="Serial Number" value={state.serialNumber} />
              <InfoBox label="ONU Type" value={state.onuType} />
              <InfoBox label="PON Type" value={state.isEpon ? 'EPON' : 'GPON'} />
              <InfoBox label="PON Port" value={`${state.frame}/${state.slot}/${state.port}`} />
              <InfoBox label="ONU ID" value={state.onuIdMode === 'custom' ? `Custom: ${state.customOnuId}` : 'Auto'} />
              <InfoBox label="VEIP" value={state.useVeip ? 'ON' : 'OFF'} />
              <InfoBox label="TCONT" value={state.tcontProfile || '-'} />
              <InfoBox label="Traffic" value={state.trafficProfile || 'None'} />
              <InfoBox label="Firewall" value={state.enableFirewall ? state.firewallLevel : 'Off'} />
              <InfoBox label="TR069" value={state.enableTr069 ? 'Enabled' : 'Off'} />
              <InfoBox label="Name" value={state.name || '-'} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2 text-accent">Services</h3>
            <div className="rounded-lg border border-brd bg-glass p-3 md:p-4 space-y-2 text-xs md:text-sm">
              {state.services.filter(s => s.enabled).map((svc, i) => (
                <div key={i} className="space-y-1 pl-2 border-l-2 border-brd">
                  <ConfigRow label={`Service ${i + 1} Type`} value={svc.service_type} />
                  <ConfigRow label={`Service ${i + 1} VLAN Mode`} value={svc.vlan_mode} />
                  {svc.vlan_mode !== 'untag' && <ConfigRow label={`Service ${i + 1} VLAN`} value={svc.vlans[0] || '-'} />}
                  {svc.vlan_mode === 'qinq' && <ConfigRow label={`Service ${i + 1} C-VLAN`} value={svc.vlans[1] || '-'} />}
                  <ConfigRow label={`Service ${i + 1} WAN Mode`} value={svc.wan_mode} />
                  {svc.wan_mode === 'wan' && <ConfigRow label={`Service ${i + 1} WAN IP`} value={svc.wan_ip_mode} />}
                  {svc.username && <ConfigRow label={`Service ${i + 1} PPPoE User`} value={svc.username} />}
                </div>
              ))}
              {state.services.filter(s => s.enabled).length === 0 && <div className="text-tx3">No services enabled.</div>}
            </div>
          </div>

          {state.ssids.filter(s => s.name).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-accent">WiFi SSIDs</h3>
              <div className="rounded-lg border border-brd bg-glass p-3 md:p-4 space-y-2 text-xs md:text-sm">
                {state.ssids.filter(s => s.name).map((s, i) => (
                  <ConfigRow key={i} label={`SSID ${i + 1} (${s.port})`} value={`${s.name}${s.enabled === false ? ' [OFF]' : ''}${s.hidden ? ' [Hidden]' : ''}`} />
                ))}
              </div>
            </div>
          )}

          {/* Script Preview */}
          <div>
            <button onClick={() => setShowScript(!showScript)}
              className="flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-hover">
              {showScript ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              CLI Script Preview
            </button>
            {showScript && (
              <pre className="mt-2 p-3 rounded-lg bg-black/30 border border-brd text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto text-tx2">
                {script}
              </pre>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 md:gap-3 flex-wrap">
            <button onClick={() => submit(true)} disabled={submitting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-glass border border-brd text-sm font-medium hover:border-accent/30 disabled:opacity-50">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              Preview (Dry Run)
            </button>
            <button onClick={() => submit(false)} disabled={submitting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {mode === 'preconfig' ? 'Save Config' : 'Register Now'}
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      {step < 4 && (
        <div className="flex justify-end gap-2">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard/onus/unconfigured')}
            className="px-4 py-2.5 rounded-xl bg-glass border border-brd text-sm hover:border-accent/30">
            Back
          </button>
          <button onClick={() => canNext() && setStep(step + 1)} disabled={!canNext()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
