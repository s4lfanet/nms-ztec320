import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type TechnicianData } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import {
  ArrowLeft, ArrowRight, Server, Radio, Search, Check, Loader2,
  Settings, FileText, Zap, HelpCircle, ChevronDown, ChevronUp, Copy, Plus, Trash2, Wrench
} from 'lucide-react';

interface UnconfiguredOnu {
  pon_port: string;
  sn: string;
  model?: string;
  vendor?: string;
  onu_id?: number;
}

interface WizardData {
  oltId: number;
  selectedOnus: UnconfiguredOnu[];
  onuType: string;
  namePrefix: string;
  description: string;
  tcontProfile: string;
  trafficProfile: string;
  vlan: number;
  configure: boolean;
  template: string;
  extra: Record<string, string>;
  technicianId: number | null;
}

const STEPS = [
  { id: 1, label: 'Select OLT', icon: <Server size={16} /> },
  { id: 2, label: 'Scan ONUs', icon: <Search size={16} /> },
  { id: 3, label: 'Configure', icon: <Settings size={16} /> },
  { id: 4, label: 'Review & Register', icon: <Check size={16} /> },
];

function generateRegisterScript(d: WizardData): string {
  const lines: string[] = [];
  const onu = d.selectedOnus[0];
  if (!onu) return '';
  const match = onu.pon_port.match(/(\d+)\/(\d+)\/(\d+)/);
  const frame = match ? match[1] : '1';
  const slot = match ? match[2] : '1';
  const port = match ? match[3] : '1';
  const onuId = onu.onu_id || 1;
  const onuIf = `gpon-onu_${frame}/${slot}/${port}:${onuId}`;
  const oltIf = `gpon-olt_${frame}/${slot}/${port}`;
  const vlan = d.vlan;
  const svcName = `VLAN${String(vlan).padStart(4, '0')}`;
  const e = d.extra;

  // Auto-detect VEIP from SN: ZTE (ZTEG) = iphost, non-ZTE = VEIP
  const allZte = d.selectedOnus.length > 0 && d.selectedOnus.every(o => o.sn.toUpperCase().startsWith('ZTEG'));
  const allNonZte = d.selectedOnus.length > 0 && d.selectedOnus.every(o => !o.sn.toUpperCase().startsWith('ZTEG'));
  const autoVeip = allNonZte ? true : allZte ? false : e.use_veip === 'true';
  const eWithVeip = { ...e, use_veip: autoVeip ? 'true' : '' };

  lines.push('!');
  lines.push(`interface ${oltIf}`);
  lines.push(`  onu ${onuId} type ${d.onuType} sn ${onu.sn}`);
  lines.push('!');
  lines.push(`interface ${onuIf}`);
  if (d.namePrefix) lines.push(`  name ${d.namePrefix}-1`);
  if (d.description) lines.push(`  description ${d.description}`);

  if (d.template === 'bridge') {
    lines.push(`  tcont 1 name ${svcName} profile ${d.tcontProfile}`);
    lines.push('  gemport 1 tcont 1');
    lines.push(`  service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`);
  } else if (d.template === 'pppoe') {
    lines.push(`  tcont 1 name ${svcName} profile ${d.tcontProfile}`);
    lines.push('  gemport 1 tcont 1');
    lines.push(`  service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`);
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    lines.push(`  service INTERNET gemport 1 vlan ${vlan}`);
    lines.push(`  vlan port eth_0/1 mode hybrid def-vlan ${vlan}`);
    lines.push(`  vlan port eth_0/2 mode hybrid def-vlan ${vlan}`);
    lines.push(`  vlan port eth_0/3 mode hybrid def-vlan ${vlan}`);
    lines.push(`  vlan port eth_0/4 mode hybrid def-vlan ${vlan}`);
    lines.push(`  wan-ip 1 mode pppoe username ${e.pppoe_user || ''} password ${e.pppoe_pass || ''} vlan-profile ${e.vlan_profile || 'pppoe'} host 1`);
  } else if (d.template === 'zte_single') {
    lines.push(`  tcont 1 name ${svcName} profile ${d.tcontProfile}`);
    lines.push('  gemport 1 tcont 1');
    if (d.trafficProfile) lines.push(`  gemport 1 traffic-limit downstream ${d.trafficProfile}`);
    lines.push(`  service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`);
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    const useVeip = eWithVeip.use_veip === 'true';
    if (useVeip) {
      lines.push(`  service INTERNET gemport 1 vlan ${vlan}`);
      lines.push('  vlan port veip_1 mode hybrid');
      lines.push('  vlan port veip_1 vlan 1');
    } else {
      lines.push(`  service INTERNET gemport 1 iphost 1 vlan ${vlan}`);
    }
    const enableTr069 = e.enable_tr069 === 'true';
    if (enableTr069) lines.push('  wan 1 service tr069 internet host 1');
    else lines.push('  wan 1 service internet host 1');
    if (e.enable_pppoe === 'true' && e.pppoe_user) lines.push(`  pppoe 1 nat enable user ${e.pppoe_user} password ${e.pppoe_pass}`);
    lines.push(`  vlan port eth_0/1 mode hybrid def-vlan ${vlan}`);
    lines.push(`  vlan port eth_0/2 mode hybrid def-vlan ${vlan}`);
    lines.push(`  vlan port eth_0/3 mode hybrid def-vlan ${vlan}`);
    lines.push(`  vlan port eth_0/4 mode hybrid def-vlan ${vlan}`);
    if (e.ssid_name) lines.push(`  vlan port wifi_0/1 mode tag vlan ${vlan}`);
    if (e.enable_firewall === 'true') lines.push(`  firewall enable level ${e.firewall_level || 'low'} anti-hack disable`);
    if (enableTr069) {
      lines.push('  tr069-mgmt 1 state unlock');
      lines.push(`  tr069-mgmt 1 acs ${e.acs_url || 'http://192.168.54.254:7547'} validate basic username ${e.acs_user || 'acs'} password ${e.acs_pass || 'acs'}`);
      if (e.tr069_vlan_mode === 'tag' && e.tr069_vlan) lines.push(`  tr069-mgmt 1 tag pri 0 vlan ${e.tr069_vlan}`);
    }
    lines.push('  security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069');
  } else if (d.template === 'zte_full') {
    const pv = e.primary_vlan || '30';
    const sv = e.secondary_vlan || '151';
    lines.push(`  tcont 1 name VLAN${String(pv).padStart(4, '0')} profile ${d.tcontProfile}`);
    lines.push('  gemport 1 tcont 1');
    if (d.trafficProfile) lines.push(`  gemport 1 traffic-limit downstream ${d.trafficProfile}`);
    lines.push(`  tcont 2 name VLAN${sv} profile ${d.tcontProfile}`);
    lines.push('  gemport 2 tcont 2');
    if (d.trafficProfile) lines.push(`  gemport 2 traffic-limit downstream ${d.trafficProfile}`);
    lines.push(`  service-port 1 vport 1 user-vlan ${pv} vlan ${pv}`);
    lines.push(`  service-port 2 vport 2 user-vlan ${sv} vlan ${sv}`);
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    const useVeipF = eWithVeip.use_veip === 'true';
    if (useVeipF) {
      lines.push(`  service VLAN${String(pv).padStart(4, '0')} gemport 1 vlan ${pv}`);
    } else {
      lines.push(`  service VLAN${String(pv).padStart(4, '0')} gemport 1 iphost 1 vlan ${pv}`);
    }
    lines.push(`  service VLAN${sv} gemport 2 vlan ${sv}`);
    if (useVeipF) {
      lines.push('  vlan port veip_1 mode hybrid');
      lines.push('  vlan port veip_1 vlan 1');
    }
    const enableTr069 = e.enable_tr069 === 'true';
    if (enableTr069) lines.push('  wan 1 service tr069 internet host 1');
    else lines.push('  wan 1 service internet host 1');
    if (e.enable_pppoe === 'true' && e.pppoe_user) lines.push(`  pppoe 1 nat enable user ${e.pppoe_user} password ${e.pppoe_pass}`);
    lines.push(`  vlan port eth_0/1 mode tag vlan ${pv}`);
    lines.push(`  vlan port eth_0/2 mode tag vlan ${pv}`);
    lines.push(`  vlan port eth_0/3 mode tag vlan ${pv}`);
    lines.push(`  vlan port eth_0/4 mode tag vlan ${pv}`);
    lines.push(`  vlan port wifi_0/1 mode tag vlan ${pv}`);
    lines.push(`  vlan port wifi_0/5 mode tag vlan ${pv}`);
    if (e.enable_firewall === 'true') lines.push(`  firewall enable level ${e.firewall_level || 'low'} anti-hack disable`);
    if (enableTr069) {
      lines.push('  tr069-mgmt 1 state unlock');
      lines.push(`  tr069-mgmt 1 acs ${e.acs_url || 'http://192.168.54.254:7547'} validate basic username ${e.acs_user || 'acs'} password ${e.acs_pass || 'acs'}`);
      if (e.tr069_vlan_mode === 'tag' && e.tr069_vlan) lines.push(`  tr069-mgmt 1 tag pri 0 vlan ${e.tr069_vlan}`);
    }
    lines.push('  security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069');
  } else if (d.template === 'zte_multi') {
    const svcs = JSON.parse(e.services || '[]');
    const enabledSvcs = svcs.filter((s: Record<string, unknown>) => s.enabled);
    // Phase 1: Interface config
    enabledSvcs.forEach((svc: Record<string, unknown>, idx: number) => {
      const n = idx + 1;
      const svcVlans = (svc.vlans as string[]) || [];
      const pv = svcVlans[0] || String(d.vlan);
      const svcType = String(svc.service_type || 'internet');
      const svcName = `service${n}`;
      lines.push(`  tcont ${n} name ${svcName} profile ${d.tcontProfile}`);
      lines.push(`  gemport ${n} tcont ${n}`);
      if (d.trafficProfile) lines.push(`  gemport ${n} traffic-limit downstream ${d.trafficProfile}`);
      if (svcType === 'iptv') {
        const mvlan = String(svc.mvlan || '');
        if (mvlan) lines.push(`  service-port ${n} vport ${n} user-vlan ${mvlan} vlan ${mvlan}`);
        else lines.push(`  service-port ${n} vport ${n} user-vlan ${pv} vlan ${pv}`);
      } else {
        lines.push(`  service-port ${n} vport ${n} user-vlan ${pv} vlan ${pv}`);
      }
    });
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    // Phase 2: pon-onu-mng config
    const useVeipM = eWithVeip.use_veip === 'true';
    enabledSvcs.forEach((svc: Record<string, unknown>, idx: number) => {
      const n = idx + 1;
      const svcVlans = (svc.vlans as string[]) || [];
      const pv = svcVlans[0] || String(d.vlan);
      const svcType = String(svc.service_type || 'internet');
      const wanMode = String(svc.wan_mode || 'webpage');
      const wanIpMode = String(svc.wan_ip_mode || 'PPPoE');
      const vlanProfile = String(svc.vlan_profile || '');
      const username = String(svc.username || '');
      const password = String(svc.password || '');
      const svcName = `service${n}`;
      let svcVlan = pv;
      if (svcType === 'iptv') { const mv = String(svc.mvlan || ''); svcVlan = mv || pv; }
      const needsIphost = !useVeipM && (svcType === 'internet' || svcType === 'tr069') && (wanMode === 'nat' || wanMode === 'wan');
      if (needsIphost) {
        lines.push(`  service ${svcName} gemport ${n} iphost ${n} vlan ${svcVlan}`);
      } else if (!useVeipM && n === 1) {
        lines.push(`  service ${svcName} gemport ${n} iphost 1 vlan ${svcVlan}`);
      } else {
        lines.push(`  service ${svcName} gemport ${n} vlan ${svcVlan}`);
      }
      if (svcType === 'bridge') { /* no wan-ip */ }
      else if (svcType === 'tr069' && vlanProfile) {
        lines.push(`  wan-ip ${n} mode dhcp vlan-profile ${vlanProfile} host ${n}`);
        lines.push(`  wan-ip ${n} ping-response enable traceroute-response enable`);
      } else if (svcType === 'internet' && wanMode === 'nat' && username) {
        lines.push(`  pppoe ${n} nat enable user ${username} password ${password}`);
        lines.push(`  wan ${n} service internet host ${n}`);
      } else if (svcType === 'internet' && wanMode === 'wan') {
        if (wanIpMode === 'PPPoE' && username) {
          lines.push(`  wan-ip ${n} mode pppoe username ${username} password ${password} vlan-profile ${vlanProfile} host ${n}`);
          lines.push(`  wan-ip ${n} ping-response enable traceroute-response enable`);
        } else if (wanIpMode === 'DHCP') {
          lines.push(`  wan-ip ${n} mode dhcp vlan-profile ${vlanProfile} host ${n}`);
          lines.push(`  wan-ip ${n} ping-response enable traceroute-response enable`);
        }
      }
    });
    if (useVeipM) {
      lines.push('  vlan port veip_1 mode hybrid');
      lines.push('  vlan port veip_1 vlan 1');
    }
    const hasNonBridge = enabledSvcs.some((s: Record<string, unknown>) => s.service_type !== 'bridge');
    if (hasNonBridge) {
      lines.push('  firewall enable level low');
      lines.push('  security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069');
    }
    if (e.enable_tr069 === 'true') {
      lines.push('  tr069-mgmt 1 state unlock');
      lines.push(`  tr069-mgmt 1 acs ${e.acs_url || 'http://192.168.54.254:7547'} validate basic username ${e.acs_user || 'acs'} password ${e.acs_pass || 'acs'}`);
      if (e.tr069_vlan_mode === 'tag' && e.tr069_vlan) lines.push(`  tr069-mgmt 1 tag pri 0 vlan ${e.tr069_vlan}`);
      else lines.push('  tr069-mgmt 1 untag');
    }
  } else if (d.template === 'huawei_full') {
    const vlanProfile = e.vlan_profile || 'genieacs';
    const vlans = Array.isArray(e.vlans) && e.vlans.length > 0 ? e.vlans : [
      { vlan: e.mgmt_vlan || '1010', label: 'Mgmt' },
      { vlan: e.internet_vlan || '30', label: 'Internet' },
      { vlan: e.voip_vlan || '151', label: 'VoIP' },
    ];
    lines.push('  sn-bind enable sn');
    lines.push(`  tcont 1 profile ${d.tcontProfile}`);
    lines.push('  gemport 1 tcont 1');
    vlans.forEach((v, i) => {
      const vid = v.vlan || v;
      lines.push(`  service-port ${i + 1} vport 1 user-vlan ${vid} vlan ${vid}`);
    });
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    lines.push('  service ServiceONU1 gemport 1');
    lines.push(`  wan-ip 1 mode dhcp vlan-profile ${vlanProfile} host 1`);
  } else if (d.template === 'fiberhome_veip') {
    const tv = e.tr069_vlan || '1010';
    const iv = e.internet_vlan || '30';
    const vv = e.voip_vlan || '151';
    lines.push('  sn-bind enable sn');
    lines.push(`  tcont 1 profile ${d.tcontProfile}`);
    lines.push('  gemport 1 tcont 1');
    if (d.trafficProfile) lines.push(`  gemport 1 traffic-limit downstream ${d.trafficProfile}`);
    lines.push(`  tcont 2 profile ${d.tcontProfile}`);
    lines.push('  gemport 2 tcont 2');
    lines.push(`  tcont 3 profile ${d.tcontProfile}`);
    lines.push('  gemport 3 tcont 3');
    lines.push(`  service-port 1 vport 1 user-vlan ${tv} vlan ${tv}`);
    lines.push(`  service-port 2 vport 2 user-vlan ${iv} vlan ${iv}`);
    lines.push(`  service-port 3 vport 3 user-vlan ${vv} vlan ${vv}`);
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    lines.push(`  service service1 gemport 1 vlan ${tv}`);
    lines.push(`  service 2 gemport 2 vlan ${iv}`);
    lines.push(`  service 3 gemport 3 vlan ${vv}`);
    lines.push('  vlan port veip_1 mode hybrid');
    lines.push(`  vlan port eth_0/1 mode tag vlan ${iv}`);
    lines.push(`  vlan port eth_0/2 mode tag vlan ${iv}`);
    lines.push(`  vlan port eth_0/3 mode tag vlan ${iv}`);
    lines.push(`  vlan port eth_0/4 mode tag vlan ${iv}`);
    lines.push(`  vlan port wifi_0/1 mode tag vlan ${iv}`);
    lines.push('  tr069-mgmt 1 state unlock');
    lines.push(`  tr069-mgmt 1 acs ${e.acs_url || 'http://192.168.54.254:7547'} validate basic username ${e.acs_user || 'acs'} password ${e.acs_pass || 'acs'}`);
    lines.push(`  tr069-mgmt 1 tag pri 0 vlan ${tv}`);
  }

  // SSID config (for zte_single and zte_full)
  if ((d.template === 'zte_single' || d.template === 'zte_full') && (e.ssid_name || e.ssid1_name)) {
    lines.push('!');
    lines.push(`pon-onu-mng ${onuIf}`);
    if (d.template === 'zte_single' && e.ssid_name) {
      const auth = e.ssid_auth || 'wpa2';
      if (auth === 'wpa2' || auth === 'mixed' || auth === 'wpa') {
        lines.push(`  ssid auth ${auth === 'mixed' ? 'wpa' : 'wpa2'} wifi_0/1 encrypt aes key ${e.ssid_pass || ''}`);
      }
      lines.push(`  ssid ctrl wifi_0/1 name ${e.ssid_name.replace(/ /g, '_')}`);
    }
    if (d.template === 'zte_full') {
      if (e.ssid1_name) {
        const auth = e.ssid1_auth || 'wpa2';
        if (auth === 'wpa2' || auth === 'mixed' || auth === 'wpa') {
          lines.push(`  ssid auth ${auth === 'mixed' ? 'wpa' : 'wpa2'} wifi_0/1 encrypt aes key ${e.ssid1_pass || ''}`);
        }
        lines.push(`  ssid ctrl wifi_0/1 name ${e.ssid1_name.replace(/ /g, '_')}`);
      }
      if (e.ssid2_name) {
        const auth = e.ssid2_auth || 'wpa2';
        if (auth === 'wpa2' || auth === 'mixed' || auth === 'wpa') {
          lines.push(`  ssid auth ${auth === 'mixed' ? 'wpa' : 'wpa2'} wifi_0/5 encrypt aes key ${e.ssid2_pass || ''}`);
        }
        lines.push(`  ssid ctrl wifi_0/5 name ${e.ssid2_name.replace(/ /g, '_')}`);
      }
    }
  }

  lines.push('!');
  return lines.join('\n');
}

export function RegisterWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    oltId: 0, selectedOnus: [], onuType: 'All', namePrefix: '',
    description: '', tcontProfile: '', trafficProfile: '', vlan: 100, configure: true,
    template: 'bridge', extra: {}, technicianId: null,
  });
  const [scanning, setScanning] = useState(false);
  const [unconfiguredOnus, setUnconfiguredOnus] = useState<UnconfiguredOnu[]>([]);
  const [onuTypes, setOnuTypes] = useState<string[]>([]);
  const [tcontProfiles, setTcontProfiles] = useState<string[]>([]);
  const [trafficProfiles, setTrafficProfiles] = useState<string[]>([]);
  const [vlanList, setVlanList] = useState<Array<{ vlan_id: number; name: string }>>([]);
  const [wanIpProfiles, setWanIpProfiles] = useState<Array<{ name: string; vlan: number; ip_mode: string }>>([]);
  const [tr069Profiles, setTr069Profiles] = useState<Array<{ id: number; name: string; acs_url: string; acs_username: string; acs_password: string; vlan: number; vlan_mode: string; default_olt_id: number | null }>>([]);
  const [registering, setRegistering] = useState(false);
  const [results, setResults] = useState<Array<{ sn: string; success: boolean; message: string }>>([]);

  const { data: dashData } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const olts = dashData?.olts || [];
  const { data: techData } = useQuery({ queryKey: ['technicians'], queryFn: api.technicians });
  const technicians: TechnicianData[] = techData?.technicians || [];

  // Fetch ONU types and profiles when OLT is selected
  useEffect(() => {
    if (!data.oltId) return;
    const olt = olts.find(o => o.id === data.oltId);
    if (!olt) return;

    // Fetch ONU types
    fetch(`/api/olt/${data.oltId}/onu-types`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.types) setOnuTypes(d.types);
      }).catch(() => {});

    // Fetch speed profiles
    fetch(`/api/olt/${data.oltId}/speed-profiles`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.tcont) setTcontProfiles(d.tcont);
        if (d.success && d.traffic) setTrafficProfiles(d.traffic);
      }).catch(() => {});

    // Fetch VLAN list
    fetch(`/api/olt/${data.oltId}/vlans`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.vlans) setVlanList(d.vlans);
        else if (d.vlans) setVlanList(d.vlans);
      }).catch(() => {});

    // Fetch TR069 profiles
    fetch('/api/tr069', { credentials: 'include' })
      .then(r => r.json()).then(setTr069Profiles).catch(() => {});

    // Fetch WAN-IP profiles (for VLAN Profile dropdown)
    fetch(`/api/olt/${data.oltId}/wan-ip-profiles`, { credentials: 'include' })
      .then(r => r.json()).then(d => {
        if (d.success && d.wan_ip_profiles) setWanIpProfiles(d.wan_ip_profiles);
      }).catch(() => {});
  }, [data.oltId, olts]);

  const update = (k: keyof WizardData, v: unknown) => setData(prev => ({ ...prev, [k]: v }));

  // Helper: select TR069 profile → auto-fill ACS fields
  const selectTr069Profile = (profileId: string) => {
    const p = tr069Profiles.find(p => p.id === parseInt(profileId));
    if (p) {
      const isUntag = (p.vlan_mode || 'tag') === 'untag';
      update('extra', { ...data.extra, tr069_profile_id: profileId, acs_url: p.acs_url, acs_user: p.acs_username, acs_pass: p.acs_password, tr069_vlan: isUntag ? '' : String(p.vlan), tr069_vlan_mode: p.vlan_mode || 'tag' });
    } else {
      update('extra', { ...data.extra, tr069_profile_id: '', acs_url: '', acs_user: '', acs_pass: '', tr069_vlan: '', tr069_vlan_mode: 'tag' });
    }
  };

  const scanOnus = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan-unconfigured', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ olt_id: data.oltId }),
      });
      const d = await res.json();
      if (d.success && d.onus) {
        setUnconfiguredOnus(d.onus);
        if (d.onus.length === 0) toast.warning('No unconfigured ONUs found');
        else toast.success(`Found ${d.onus.length} unconfigured ONU(s)`);
      } else {
        toast.error(d.message || 'Scan failed');
      }
    } catch { toast.error('Scan failed'); }
    setScanning(false);
  };

  const toggleOnu = (onu: UnconfiguredOnu) => {
    setData(prev => {
      const exists = prev.selectedOnus.some(o => o.sn === onu.sn);
      return {
        ...prev,
        selectedOnus: exists ? prev.selectedOnus.filter(o => o.sn !== onu.sn) : [...prev.selectedOnus, onu],
      };
    });
  };

  const selectAll = () => {
    setData(prev => ({ ...prev, selectedOnus: [...unconfiguredOnus] }));
  };

  const registerOnus = async () => {
    setRegistering(true);
    const res: Array<{ sn: string; success: boolean; message: string }> = [];

    for (let i = 0; i < data.selectedOnus.length; i++) {
      const onu = data.selectedOnus[i];
      const ponPort = onu.pon_port || '';
      // Parse pon_port: "1/1/1" or "gpon-olt_1/1/1"
      const match = ponPort.match(/(\d+)\/(\d+)\/(\d+)/);
      const frame = match ? parseInt(match[1]) : 1;
      const slot = match ? parseInt(match[2]) : 1;
      const port = match ? parseInt(match[3]) : 1;

      try {
        const extraToSend = data.extra;
        const r = await fetch('/api/pre-register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            olt_id: data.oltId, frame, slot, port,
            onu_id: onu.onu_id || (i + 1), onu_type: data.onuType, serial: onu.sn,
            vlan: data.vlan, tcont_profile: data.tcontProfile,
            traffic_profile: data.trafficProfile,
            name: data.namePrefix ? `${data.namePrefix}-${i + 1}` : '',
            description: data.description, configure: data.configure,
            template: data.template, extra: extraToSend,
            technician_id: data.technicianId,
          }),
        });
        const d = await r.json();
        res.push({ sn: onu.sn, success: d.success, message: d.message || '' });
        if (d.success) toast.success(`ONU ${onu.sn} registered!`);
        else toast.error(`ONU ${onu.sn}: ${d.message}`);
      } catch (e: unknown) {
        res.push({ sn: onu.sn, success: false, message: e instanceof Error ? e.message : 'Failed' });
        toast.error(`ONU ${onu.sn}: failed`);
      }
      // Small delay between registrations
      if (i < data.selectedOnus.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    setResults(res);
    setRegistering(false);
    setStep(5); // Results step

    // Auto-sync OLT if any registration succeeded
    const anySuccess = res.some(r => r.success);
    if (anySuccess && data.oltId) {
      toast.info('Auto-syncing OLT to update ONU status...');
      try {
        await fetch(`/api/olt/${data.oltId}/sync`, { method: 'POST', credentials: 'include' });
      } catch { /* sync runs in background, ignore errors */ }
    }
  };

  const canNext = () => {
    if (step === 1) return !!data.oltId;
    if (step === 2) return data.selectedOnus.length > 0;
    if (step === 3) return !!data.onuType;
    return true;
  };

  const [showTutor, setShowTutor] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => step > 1 && step <= 4 ? setStep(step - 1) : navigate('/dashboard/onus/add')}
            className="p-2 rounded-lg hover:bg-glass transition-colors text-tx2 hover:text-tx1 flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold truncate">Register ONU Wizard</h1>
            <p className="text-tx2 text-xs md:text-sm mt-0.5 hidden sm:block">Step-by-step ONU registration with auto-configuration</p>
          </div>
        </div>
        <button onClick={() => setShowTutor(!showTutor)}
          className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg bg-glass border border-brd text-xs text-tx2 hover:text-tx1 hover:border-accent/30 transition-all flex-shrink-0">
          <HelpCircle size={14} /> <span className="hidden sm:inline">Tutor</span>
          {showTutor ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Tutorial */}
      {showTutor && (
        <div className="glass-card p-3 md:p-5 space-y-3 md:space-y-4 border border-accent/20">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-accent">
            <HelpCircle size={16} /> Panduan Register ONU Wizard
          </h3>

          {/* Prerequisites */}
          <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-tx2">
            <strong className="text-warning">Sebelum Mulai — Pastikan hal berikut sudah dikonfigurasi di OLT:</strong>
            <ul className="mt-1.5 ml-4 space-y-0.5 text-tx3">
              <li>1. <strong className="text-tx2">ONU Type</strong> sudah terdaftar di OLT (OLT Configuration → ONU Types tab)</li>
              <li>2. <strong className="text-tx2">TCONT Profile</strong> sudah dibuat (OLT Configuration → Speed Profiles tab, type=tcont)</li>
              <li>3. <strong className="text-tx2">Traffic Profile</strong> sudah dibuat (opsional, untuk download limit — Speed Profiles tab, type=traffic)</li>
              <li>4. <strong className="text-tx2">VLAN</strong> sudah dibuat di OLT (OLT Configuration → VLANs tab)</li>
              <li>5. <strong className="text-tx2">CLI/Telnet access</strong> OLT sudah dikonfigurasi (OLT Settings → CLI Username & Password)</li>
              <li>6. ONU sudah terhubung fisik ke PON port OLT dan menyala (LED PON menyala hijau)</li>
            </ul>
          </div>

          <div className="space-y-3 text-xs md:text-sm text-tx2">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <strong className="text-tx1">Select OLT</strong>
                <p>Pilih OLT tempat ONU akan diregister. Pastikan OLT berstatus <span className="text-success">Online</span> dan CLI access sudah dikonfigurasi.</p>
                <p className="text-xs text-tx3 mt-1">Jika OLT belum ada, tambahkan di halaman OLT Settings terlebih dahulu.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <strong className="text-tx1">Scan ONUs</strong>
                <p>Klik <strong>Scan OLT</strong> untuk menemukan ONU yang belum terdaftar (unconfigured). ONU yang muncul adalah ONU yang sudah terhubung fisik ke PON port tapi belum diregister di OLT.</p>
                <p className="text-xs text-tx3 mt-1">Pilih satu atau multiple ONU dengan klik pada list. Gunakan tombol <strong>All</strong> untuk select semua. Hanya ONU dengan serial number terdeteksi (show gpon onu uncfg) yang akan muncul.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <strong className="text-tx1">Configure</strong>
                <p>Pilih <strong>Service Template</strong> sesuai jenis ONU dan kebutuhan:</p>
                <ul className="text-xs text-tx3 mt-1 ml-4 space-y-0.5">
                  <li><strong className="text-tx2">Bridge</strong> — Transparent L2, ONU hanya bridge VLAN. Cocok untuk ONU yang dikelola router eksternal</li>
                  <li><strong className="text-tx2">PPPoE</strong> — ONU dial PPPoE langsung. Isi username & password PPPoE</li>
                  <li><strong className="text-tx2">ZTE Single</strong> — 1 SSID WiFi 2.4GHz + 1 VLAN. Untuk ZTE ONU (F660, F609, dll). VEIP auto-detect dari SN</li>
                  <li><strong className="text-tx2">ZTE Dual Band</strong> — 2 SSID (2.4GHz + 5GHz) + 2 VLAN + TR069. Untuk ZTE ONU dual band (F670L, F670LV9)</li>
                  <li><strong className="text-tx2">ZTE Multi-Service</strong> — 1-4 dynamic services (Internet/IPTV/TR069/Bridge) + SSID + TR069. Untuk ZTE ONU dengan multi-service</li>
                  <li><strong className="text-tx2">Huawei Full</strong> — Multi VLAN (Mgmt/Internet/VoIP) + WAN DHCP + TR069. Untuk Huawei ONU (HG8145V5, dll)</li>
                  <li><strong className="text-tx2">Fiberhome VEIP</strong> — VEIP mode, TR069 + Internet + VoIP. Untuk Fiberhome ONU (HG6145D2, dll)</li>
                </ul>
                <p className="mt-2">Lengkapi parameter berikut:</p>
                <ul className="text-xs text-tx3 mt-1 ml-4 space-y-0.5">
                  <li><strong className="text-tx2">ONU Type</strong> — pilih dari daftar type yang terdaftar di OLT. Gunakan "All" untuk auto-detect</li>
                  <li><strong className="text-tx2">TCONT Profile</strong> — batas bandwidth upload. Wajib diisi</li>
                  <li><strong className="text-tx2">Traffic Profile</strong> — batas bandwidth download. Opsional (kosong = no limit)</li>
                  <li><strong className="text-tx2">VLAN ID</strong> — pilih dari VLAN yang ada di OLT atau ketik manual</li>
                  <li><strong className="text-tx2">Name Prefix</strong> — nama ONU otomatis (contoh: "ODP-RW03" → ONU 1 = "ODP-RW03-1")</li>
                  <li><strong className="text-tx2">Description</strong> — deskripsi ONU (contoh: "ODP-RW03-03 | Budi")</li>
                </ul>
                <p className="mt-2 text-xs text-accent">TR069: Pilih dari saved TR069 Profile (halaman TR069 Profile). ACS URL, Username, Password, VLAN & mode (tag/untag) akan auto-fill. Buat TR069 Profile terlebih dahulu jika belum ada.</p>
                <p className="mt-1 text-xs text-tx3">VEIP Mode: Untuk ZTE template, VEIP auto-detect dari SN — ZTE ONU (ZTEG*) → iphost mode, non-ZTE → VEIP mode. Untuk mixed vendors, toggle manual.</p>
                <p className="mt-1 text-xs text-tx3">WiFi SSID: Untuk ZTE template, isi SSID name & password jika ingin set WiFi via wizard. Kosongkan jika ingin default ONU.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <strong className="text-tx1">Review & Register</strong>
                <p>Periksa semua parameter, configuration details, dan list ONU yang akan diregister. Ada <strong>Script Preview</strong> yang menampilkan CLI commands yang akan dikirim ke OLT — bisa di-copy dengan tombol <strong>Copy Script</strong>.</p>
                <p className="text-xs text-tx3 mt-1">Klik <strong>Register</strong> untuk memulai proses. Setiap ONU diregister berurutan dengan delay 1 detik. Proses: register ONU → TCONT → GEM → service-port → pon-onu-mng (LAN/WAN/TR069 sesuai template).</p>
                <p className="text-xs text-tx3 mt-1">Setelah selesai, hasil berhasil/gagal ditampilkan per ONU. Klik <strong>View All ONUs</strong> untuk melihat di All ONUs page.</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
              <strong className="text-tx2">Tips:</strong>
              <ul className="mt-1 ml-4 space-y-0.5">
                <li>Pastikan ONU Type dan TCONT Profile sudah terdaftar di OLT sebelum register (OLT Configuration page)</li>
                <li>Jika ada error CLI, cek pesan error di halaman results — biasanya ONU type tidak terdaftar atau TCONT profile tidak ditemukan</li>
                <li>Setelah registrasi berhasil, OLT akan auto-sync untuk update status ONU di All ONUs page</li>
                <li>Untuk batch registrasi banyak ONU, gunakan Name Prefix agar nama ONU terurut otomatis</li>
                <li>Gunakan <strong>Copy Script</strong> di Step 4 untuk dokumentasi atau manual troubleshooting via Telnet</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      {step <= 4 && (
        <div className="flex items-center gap-1 md:gap-2 overflow-x-auto scrollbar-thin pb-1">
          {STEPS.map((s, i) => (
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
              {i < STEPS.length - 1 && <div className={cn('w-3 md:w-8 h-0.5 rounded', step > s.id ? 'bg-success' : 'bg-glass')} />}
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Select OLT */}
      {step === 1 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Server size={18} /> Select OLT Device</h2>
          <p className="text-tx2 text-xs md:text-sm">Choose which OLT to register ONUs on.</p>
          <div className="grid gap-2 md:gap-3">
            {olts.length === 0 && (
              <div className="text-center py-8 text-tx3">
                <Server size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No OLTs available</p>
                <p className="text-xs mt-1">Add an OLT in OLT Settings first</p>
              </div>
            )}
            {olts.map(olt => (
              <button key={olt.id} onClick={() => update('oltId', olt.id)}
                className={cn(
                  'flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border transition-all text-left',
                  data.oltId === olt.id ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30 bg-glass',
                )}>
                <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  olt.is_online ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
                  <Server size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{olt.name}</div>
                  <div className="text-xs text-tx3 truncate">{olt.model} &bull; {olt.ip_address} &bull; {olt.is_online ? 'Online' : 'Offline'}</div>
                </div>
                {data.oltId === olt.id && <Check size={20} className="text-accent flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Scan & Select ONUs */}
      {step === 2 && (
        <div className="glass-card p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Search size={18} /> Unconfigured ONUs</h2>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={scanOnus} disabled={scanning}
                className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-accent text-white text-xs md:text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                <span className="hidden sm:inline">{scanning ? 'Scanning...' : 'Scan OLT'}</span>
                <span className="sm:hidden">{scanning ? '...' : 'Scan'}</span>
              </button>
              {unconfiguredOnus.length > 0 && (
                <button onClick={selectAll}
                  className="px-3 md:px-4 py-2 rounded-xl bg-glass border border-brd text-xs md:text-sm hover:border-accent/30">
                  All ({unconfiguredOnus.length})
                </button>
              )}
            </div>
          </div>

          {unconfiguredOnus.length === 0 && !scanning && (
            <div className="text-center py-12">
              <Radio size={48} className="mx-auto text-tx3 mb-4" />
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
                const selected = data.selectedOnus.some(o => o.sn === onu.sn);
                return (
                  <button key={i} onClick={() => toggleOnu(onu)}
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
                      <div className="text-[10px] md:text-xs text-tx3 truncate">Port: {onu.pon_port} {onu.vendor ? `• ${onu.vendor}` : ''} {onu.model ? `• ${onu.model}` : ''}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {data.selectedOnus.length > 0 && (
            <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 text-sm text-accent">
              {data.selectedOnus.length} ONU(s) selected for registration
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configure */}
      {step === 3 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><Settings size={18} /> Configuration</h2>
          <p className="text-tx2 text-xs md:text-sm">Configure registration parameters for {data.selectedOnus.length} ONU(s).</p>

          {/* Service Template */}
          <div>
            <label className="label-sm mb-2">Service Template</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
              {[
                { v: 'bridge', l: 'Bridge', desc: 'Transparent bridge mode' },
                { v: 'pppoe', l: 'PPPoE', desc: 'PPPoE dial-up internet' },
                { v: 'zte_single', l: 'ZTE Single', desc: 'Single SSID + VLAN' },
                { v: 'zte_full', l: 'ZTE Dual Band', desc: 'Dual SSID, Dual VLAN, TR069' },
                { v: 'zte_multi', l: 'ZTE Multi-Service', desc: '1-4 services, IPTV, TR069' },
                { v: 'huawei_full', l: 'Huawei Full', desc: 'Multi VLAN, WAN DHCP' },
                { v: 'fiberhome_veip', l: 'Fiberhome VEIP', desc: 'TR069+Internet+VoIP' },
              ].map(t => (
                <button key={t.v} onClick={() => update('template', t.v)}
                  className={cn(
                    'p-2.5 md:p-3 rounded-xl border text-left transition-all',
                    data.template === t.v ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30 bg-glass',
                  )}>
                  <div className="text-xs md:text-sm font-medium">{t.l}</div>
                  <div className="text-[10px] md:text-xs text-tx3">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <hr className="border-brd" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {/* ONU Type */}
            <div>
              <label className="label-sm mb-1.5">ONU Type</label>
              <select value={data.onuType} onChange={e => update('onuType', e.target.value)}
                className="input-field">
                <option value="All">All (auto-detect)</option>
                {onuTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {onuTypes.length > 0 && <p className="text-xs text-tx3 mt-1">{onuTypes.length} types available from OLT</p>}
            </div>

            {/* TCONT & Traffic Profile */}
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div>
                <label className="label-sm mb-1.5">TCONT Profile <span className="text-tx3">(Upload)</span></label>
                <select value={data.tcontProfile} onChange={e => update('tcontProfile', e.target.value)}
                  className="input-field">
                  <option value="">Select profile...</option>
                  {tcontProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {tcontProfiles.length > 0 && <p className="text-xs text-tx3 mt-1">{tcontProfiles.length} TCONT profiles</p>}
              </div>
              <div>
                <label className="label-sm mb-1.5">Traffic Profile <span className="text-tx3">(Download)</span></label>
                <select value={data.trafficProfile} onChange={e => update('trafficProfile', e.target.value)}
                  className="input-field">
                  <option value="">None (no DL limit)</option>
                  {trafficProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {trafficProfiles.length > 0 && <p className="text-xs text-tx3 mt-1">{trafficProfiles.length} traffic profiles</p>}
              </div>
            </div>

            {/* VLAN */}
            <div>
              <label className="label-sm mb-1.5">VLAN ID</label>
              {vlanList.length > 0 ? (
                <select value={data.vlan} onChange={e => update('vlan', parseInt(e.target.value) || 100)}
                  className="input-field">
                  <option value={100}>100 (default)</option>
                  {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                </select>
              ) : (
                <input type="number" value={data.vlan} onChange={e => update('vlan', parseInt(e.target.value) || 100)}
                  min={1} max={4094} className="input-field" />
              )}
              {vlanList.length > 0 && <p className="text-xs text-tx3 mt-1">{vlanList.length} VLANs available from OLT</p>}
            </div>

            {/* Configure toggle */}
            <div>
              <label className="label-sm mb-1.5">Auto-Configure</label>
              <div className="flex items-center gap-3 h-9">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.configure} onChange={e => update('configure', e.target.checked)} />
                  <span className="text-sm">Configure TCONT/GEM/Service-Port after registration</span>
                </label>
              </div>
            </div>
          </div>

          {/* Template-specific fields */}
          {data.template === 'pppoe' && (
            <div className="p-3 md:p-4 rounded-lg bg-glass border border-accent/20 space-y-3">
              <h4 className="text-sm font-semibold text-accent">PPPoE Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label-sm mb-1">Username</label>
                  <input type="text" value={String(data.extra.pppoe_user || '')} onChange={e => update('extra', { ...data.extra, pppoe_user: e.target.value })} className="input-field" placeholder="PPPoE Username" /></div>
                <div><label className="label-sm mb-1">Password</label>
                  <div className="relative">
                    <input type={data.extra._show_pppoe_pass === 'true' ? 'text' : 'password'} value={String(data.extra.pppoe_pass || '')} onChange={e => update('extra', { ...data.extra, pppoe_pass: e.target.value })} className="input-field pr-10" placeholder="PPPoE Password" />
                    <button type="button" onClick={() => update('extra', { ...data.extra, _show_pppoe_pass: data.extra._show_pppoe_pass === 'true' ? '' : 'true' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">{data.extra._show_pppoe_pass === 'true' ? '🙈' : '👁'}</button>
                  </div></div>
              </div>
            </div>
          )}

          {data.template === 'zte_single' && (
            <div className="p-3 md:p-4 rounded-lg bg-glass border border-accent/20 space-y-4">
              <h4 className="text-sm font-semibold text-accent">ZTE Single Band Config</h4>

              {/* VEIP Mode — auto-detected from SN */}
              {(() => {
                const allZte = data.selectedOnus.length > 0 && data.selectedOnus.every(o => o.sn.toUpperCase().startsWith('ZTEG'));
                const allNonZte = data.selectedOnus.length > 0 && data.selectedOnus.every(o => !o.sn.toUpperCase().startsWith('ZTEG'));
                if (allZte) {
                  return <div className="text-xs text-tx3"><span className="inline-block px-2 py-1 rounded bg-accent/10 text-accent font-medium">VEIP: OFF (ZTE ONU detected)</span> — Using iphost mode</div>;
                } else if (allNonZte) {
                  return <div className="text-xs text-tx3"><span className="inline-block px-2 py-1 rounded bg-success/10 text-success font-medium">VEIP: ON (non-ZTE ONU detected)</span> — Using VEIP mode</div>;
                } else if (data.selectedOnus.length > 0) {
                  return <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={data.extra.use_veip === 'true'} onChange={e => update('extra', { ...data.extra, use_veip: e.target.checked ? 'true' : '' })} />
                      <span className="text-sm font-medium">Use VEIP mode (mixed vendors)</span>
                    </label>
                    <p className="text-xs text-tx3 pl-6">Some ONUs are ZTE, some are not. Toggle manually per batch.</p>
                  </div>;
                }
                return null;
              })()}

              {/* PPPoE */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_pppoe === 'true'} onChange={e => update('extra', { ...data.extra, enable_pppoe: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable PPPoE</span>
                </label>
                {data.extra.enable_pppoe === 'true' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                    <div><label className="label-sm mb-1">PPPoE Username</label>
                      <input type="text" value={String(data.extra.pppoe_user || '')} onChange={e => update('extra', { ...data.extra, pppoe_user: e.target.value })} className="input-field" placeholder="PPPoE Username" /></div>
                    <div><label className="label-sm mb-1">PPPoE Password</label>
                      <div className="relative">
                        <input type={data.extra._show_pppoe_pass === 'true' ? 'text' : 'password'} value={String(data.extra.pppoe_pass || '')} onChange={e => update('extra', { ...data.extra, pppoe_pass: e.target.value })} className="input-field pr-10" placeholder="PPPoE Password" />
                        <button type="button" onClick={() => update('extra', { ...data.extra, _show_pppoe_pass: data.extra._show_pppoe_pass === 'true' ? '' : 'true' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">{data.extra._show_pppoe_pass === 'true' ? '🙈' : '👁'}</button>
                      </div></div>
                  </div>
                )}
              </div>

              {/* SSID 2.4GHz (wifi_0/1) */}
              <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                <div className="text-xs font-semibold text-tx2">WiFi SSID 2.4GHz — opsional (kosong = default ONT)</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2"><label className="label-sm mb-1">SSID Name</label>
                    <input type="text" value={String(data.extra.ssid_name || '')} onChange={e => update('extra', { ...data.extra, ssid_name: e.target.value })} className="input-field" placeholder="Nama WiFi 2.4GHz (tanpa spasi)" /></div>
                  <div><label className="label-sm mb-1">Auth</label>
                    <select value={data.extra.ssid_auth || 'wpa2'} onChange={e => update('extra', { ...data.extra, ssid_auth: e.target.value })} className="input-field">
                      <option value="wpa2">WPA2-PSK</option>
                      <option value="mixed">WPA/WPA2 Mixed</option>
                      <option value="wpa">WPA-PSK</option>
                      <option value="open">Open (No Password)</option>
                    </select></div>
                </div>
                {data.extra.ssid_name && data.extra.ssid_auth !== 'open' && (
                  <div><label className="label-sm mb-1">WiFi Password</label>
                    <div className="relative">
                      <input type={data.extra._show_ssid_pass === 'true' ? 'text' : 'password'} value={String(data.extra.ssid_pass || '')} onChange={e => update('extra', { ...data.extra, ssid_pass: e.target.value })} className="input-field pr-10" placeholder="Min 8 karakter" />
                      <button type="button" onClick={() => update('extra', { ...data.extra, _show_ssid_pass: data.extra._show_ssid_pass === 'true' ? '' : 'true' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">{data.extra._show_ssid_pass === 'true' ? '🙈' : '👁'}</button>
                    </div></div>
                )}
              </div>

              {/* Firewall */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_firewall === 'true'} onChange={e => update('extra', { ...data.extra, enable_firewall: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable Firewall</span>
                </label>
                {data.extra.enable_firewall === 'true' && (
                  <div className="pl-6"><label className="label-sm mb-1">Firewall Level</label>
                    <select value={data.extra.firewall_level || 'low'} onChange={e => update('extra', { ...data.extra, firewall_level: e.target.value })} className="input-field">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select></div>
                )}
              </div>

              {/* TR069 */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_tr069 === 'true'} onChange={e => update('extra', { ...data.extra, enable_tr069: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable TR069/ACS Remote Management</span>
                </label>
                {data.extra.enable_tr069 === 'true' && (
                  <div className="pl-6 space-y-3">
                    <div><label className="label-sm mb-1">TR069 Profile</label>
                      <select value={data.extra.tr069_profile_id || ''} onChange={e => selectTr069Profile(e.target.value)} className="input-field">
                        <option value="">Select Profile...</option>
                        {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                      </select></div>
                    {data.extra.tr069_profile_id && (
                      <div className="grid grid-cols-2 gap-3 text-xs text-tx3">
                        <div>ACS URL: <span className="text-tx1 font-mono">{data.extra.acs_url}</span></div>
                        <div>Username: <span className="text-tx1">{data.extra.acs_user}</span></div>
                        <div>Password: <span className="text-tx1 font-mono">{data.extra._show_acs_pass === 'true' ? data.extra.acs_pass : '••••••••'}</span> <button type="button" onClick={() => update('extra', { ...data.extra, _show_acs_pass: data.extra._show_acs_pass === 'true' ? '' : 'true' })} className="text-tx3 hover:text-accent ml-1">{data.extra._show_acs_pass === 'true' ? '🙈' : '👁'}</button></div>
                        <div>VLAN: <span className="text-tx1 font-mono">{data.extra.tr069_vlan}</span> <span className="text-tx3">({data.extra.tr069_vlan_mode || 'tag'})</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {data.template === 'zte_full' && (
            <div className="p-3 md:p-4 rounded-lg bg-glass border border-accent/20 space-y-4">
              <h4 className="text-sm font-semibold text-accent">ZTE Dual Band Config</h4>

              {/* VEIP Mode — auto-detected from SN */}
              {(() => {
                const allZte = data.selectedOnus.length > 0 && data.selectedOnus.every(o => o.sn.toUpperCase().startsWith('ZTEG'));
                const allNonZte = data.selectedOnus.length > 0 && data.selectedOnus.every(o => !o.sn.toUpperCase().startsWith('ZTEG'));
                if (allZte) {
                  return <div className="text-xs text-tx3"><span className="inline-block px-2 py-1 rounded bg-accent/10 text-accent font-medium">VEIP: OFF (ZTE ONU detected)</span> — Using iphost mode</div>;
                } else if (allNonZte) {
                  return <div className="text-xs text-tx3"><span className="inline-block px-2 py-1 rounded bg-success/10 text-success font-medium">VEIP: ON (non-ZTE ONU detected)</span> — Using VEIP mode</div>;
                } else if (data.selectedOnus.length > 0) {
                  return <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={data.extra.use_veip === 'true'} onChange={e => update('extra', { ...data.extra, use_veip: e.target.checked ? 'true' : '' })} />
                      <span className="text-sm font-medium">Use VEIP mode (mixed vendors)</span>
                    </label>
                    <p className="text-xs text-tx3 pl-6">Some ONUs are ZTE, some are not. Toggle manually per batch.</p>
                  </div>;
                }
                return null;
              })()}

              {/* VLANs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label-sm mb-1">Primary VLAN (Internet)</label>
                  {vlanList.length > 0 ? (
                    <select value={data.extra.primary_vlan || ''} onChange={e => update('extra', { ...data.extra, primary_vlan: e.target.value })} className="input-field">
                      <option value="">Select VLAN...</option>
                      {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={data.extra.primary_vlan || '30'} onChange={e => update('extra', { ...data.extra, primary_vlan: e.target.value })} className="input-field" placeholder="30" />
                  )}</div>
                <div><label className="label-sm mb-1">Secondary VLAN (Voucher)</label>
                  {vlanList.length > 0 ? (
                    <select value={data.extra.secondary_vlan || ''} onChange={e => update('extra', { ...data.extra, secondary_vlan: e.target.value })} className="input-field">
                      <option value="">Select VLAN...</option>
                      {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={data.extra.secondary_vlan || '151'} onChange={e => update('extra', { ...data.extra, secondary_vlan: e.target.value })} className="input-field" placeholder="151" />
                  )}</div>
              </div>

              {/* PPPoE */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_pppoe === 'true'} onChange={e => update('extra', { ...data.extra, enable_pppoe: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable PPPoE</span>
                </label>
                {data.extra.enable_pppoe === 'true' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                    <div><label className="label-sm mb-1">PPPoE Username</label>
                      <input type="text" value={String(data.extra.pppoe_user || '')} onChange={e => update('extra', { ...data.extra, pppoe_user: e.target.value })} className="input-field" placeholder="PPPoE Username" /></div>
                    <div><label className="label-sm mb-1">PPPoE Password</label>
                      <div className="relative">
                        <input type={data.extra._show_pppoe_pass === 'true' ? 'text' : 'password'} value={String(data.extra.pppoe_pass || '')} onChange={e => update('extra', { ...data.extra, pppoe_pass: e.target.value })} className="input-field pr-10" placeholder="PPPoE Password" />
                        <button type="button" onClick={() => update('extra', { ...data.extra, _show_pppoe_pass: data.extra._show_pppoe_pass === 'true' ? '' : 'true' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">{data.extra._show_pppoe_pass === 'true' ? '🙈' : '👁'}</button>
                      </div></div>
                  </div>
                )}
              </div>

              {/* SSID 2.4GHz (wifi_0/1) */}
              <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                <div className="text-xs font-semibold text-tx2">SSID 2.4GHz (wifi_0/1) — opsional</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2"><label className="label-sm mb-1">SSID Name</label>
                    <input type="text" value={String(data.extra.ssid1_name || '')} onChange={e => update('extra', { ...data.extra, ssid1_name: e.target.value })} className="input-field" placeholder="Nama WiFi 2.4GHz (tanpa spasi)" /></div>
                  <div><label className="label-sm mb-1">Auth</label>
                    <select value={data.extra.ssid1_auth || 'wpa2'} onChange={e => update('extra', { ...data.extra, ssid1_auth: e.target.value })} className="input-field">
                      <option value="wpa2">WPA2-PSK</option>
                      <option value="mixed">WPA/WPA2 Mixed</option>
                      <option value="wpa">WPA-PSK</option>
                      <option value="open">Open (No Password)</option>
                    </select></div>
                </div>
                {data.extra.ssid1_name && data.extra.ssid1_auth !== 'open' && (
                  <div><label className="label-sm mb-1">Password 2.4GHz</label>
                    <div className="relative">
                      <input type={data.extra._show_ssid1_pass === 'true' ? 'text' : 'password'} value={String(data.extra.ssid1_pass || '')} onChange={e => update('extra', { ...data.extra, ssid1_pass: e.target.value })} className="input-field pr-10" placeholder="Min 8 karakter" />
                      <button type="button" onClick={() => update('extra', { ...data.extra, _show_ssid1_pass: data.extra._show_ssid1_pass === 'true' ? '' : 'true' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">{data.extra._show_ssid1_pass === 'true' ? '🙈' : '👁'}</button>
                    </div></div>
                )}
              </div>

              {/* SSID 5GHz (wifi_0/5) */}
              <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                <div className="text-xs font-semibold text-tx2">SSID 5GHz (wifi_0/5) — opsional</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2"><label className="label-sm mb-1">SSID Name</label>
                    <input type="text" value={String(data.extra.ssid2_name || '')} onChange={e => update('extra', { ...data.extra, ssid2_name: e.target.value })} className="input-field" placeholder="Nama WiFi 5GHz (tanpa spasi)" /></div>
                  <div><label className="label-sm mb-1">Auth</label>
                    <select value={data.extra.ssid2_auth || 'wpa2'} onChange={e => update('extra', { ...data.extra, ssid2_auth: e.target.value })} className="input-field">
                      <option value="wpa2">WPA2-PSK</option>
                      <option value="mixed">WPA/WPA2 Mixed</option>
                      <option value="wpa">WPA-PSK</option>
                      <option value="open">Open (No Password)</option>
                    </select></div>
                </div>
                {data.extra.ssid2_name && data.extra.ssid2_auth !== 'open' && (
                  <div><label className="label-sm mb-1">Password 5GHz</label>
                    <div className="relative">
                      <input type={data.extra._show_ssid2_pass === 'true' ? 'text' : 'password'} value={String(data.extra.ssid2_pass || '')} onChange={e => update('extra', { ...data.extra, ssid2_pass: e.target.value })} className="input-field pr-10" placeholder="Min 8 karakter" />
                      <button type="button" onClick={() => update('extra', { ...data.extra, _show_ssid2_pass: data.extra._show_ssid2_pass === 'true' ? '' : 'true' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">{data.extra._show_ssid2_pass === 'true' ? '🙈' : '👁'}</button>
                    </div></div>
                )}
              </div>

              {/* Firewall */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_firewall === 'true'} onChange={e => update('extra', { ...data.extra, enable_firewall: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable Firewall</span>
                </label>
                {data.extra.enable_firewall === 'true' && (
                  <div className="pl-6"><label className="label-sm mb-1">Firewall Level</label>
                    <select value={data.extra.firewall_level || 'low'} onChange={e => update('extra', { ...data.extra, firewall_level: e.target.value })} className="input-field">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select></div>
                )}
              </div>

              {/* TR069 */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_tr069 === 'true'} onChange={e => update('extra', { ...data.extra, enable_tr069: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable TR069/ACS Remote Management</span>
                </label>
                {data.extra.enable_tr069 === 'true' && (
                  <div className="pl-6 space-y-3">
                    <div><label className="label-sm mb-1">TR069 Profile</label>
                      <select value={data.extra.tr069_profile_id || ''} onChange={e => selectTr069Profile(e.target.value)} className="input-field">
                        <option value="">Select Profile...</option>
                        {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                      </select></div>
                    {data.extra.tr069_profile_id && (
                      <div className="grid grid-cols-2 gap-3 text-xs text-tx3">
                        <div>ACS URL: <span className="text-tx1 font-mono">{data.extra.acs_url}</span></div>
                        <div>Username: <span className="text-tx1">{data.extra.acs_user}</span></div>
                        <div>Password: <span className="text-tx1 font-mono">{data.extra._show_acs_pass === 'true' ? data.extra.acs_pass : '••••••••'}</span> <button type="button" onClick={() => update('extra', { ...data.extra, _show_acs_pass: data.extra._show_acs_pass === 'true' ? '' : 'true' })} className="text-tx3 hover:text-accent ml-1">{data.extra._show_acs_pass === 'true' ? '🙈' : '👁'}</button></div>
                        <div>VLAN: <span className="text-tx1 font-mono">{data.extra.tr069_vlan}</span> <span className="text-tx3">({data.extra.tr069_vlan_mode || 'tag'})</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {data.template === 'zte_multi' && (
            <div className="p-3 md:p-4 rounded-lg bg-glass border border-accent/20 space-y-4">
              <h4 className="text-sm font-semibold text-accent">ZTE Multi-Service Config</h4>

              {/* VEIP Mode — auto-detected from SN */}
              {(() => {
                const allZte = data.selectedOnus.length > 0 && data.selectedOnus.every(o => o.sn.toUpperCase().startsWith('ZTEG'));
                const allNonZte = data.selectedOnus.length > 0 && data.selectedOnus.every(o => !o.sn.toUpperCase().startsWith('ZTEG'));
                if (allZte) {
                  return <div className="text-xs text-tx3"><span className="inline-block px-2 py-1 rounded bg-accent/10 text-accent font-medium">VEIP: OFF (ZTE ONU detected)</span> — Using iphost mode</div>;
                } else if (allNonZte) {
                  return <div className="text-xs text-tx3"><span className="inline-block px-2 py-1 rounded bg-success/10 text-success font-medium">VEIP: ON (non-ZTE ONU detected)</span> — Using VEIP mode</div>;
                } else if (data.selectedOnus.length > 0) {
                  return <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={data.extra.use_veip === 'true'} onChange={e => update('extra', { ...data.extra, use_veip: e.target.checked ? 'true' : '' })} />
                      <span className="text-sm font-medium">Use VEIP mode (mixed vendors)</span>
                    </label>
                    <p className="text-xs text-tx3 pl-6">Some ONUs are ZTE, some are not. Toggle manually per batch.</p>
                  </div>;
                }
                return null;
              })()}

              {/* Dynamic Services */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Services (max 4)</span>
                  <button type="button" onClick={() => {
                    const svcs = JSON.parse(data.extra.services || '[]');
                    if (svcs.length < 4) {
                      svcs.push({ enabled: true, service_type: 'internet', vlans: [], vlan_names: [], wan_mode: 'webpage', wan_ip_mode: 'PPPoE', vlan_profile: '', username: '', password: '', mvlan: 0, profile_upload: '', profile_download: '' });
                      update('extra', { ...data.extra, services: JSON.stringify(svcs) });
                    }
                  }} className="px-2 py-1 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover">+ Add Service</button>
                </div>
                {(() => {
                  const svcs = JSON.parse(data.extra.services || '[]');
                  if (svcs.length === 0) return <p className="text-xs text-tx3">No services added. Click "Add Service" to start.</p>;
                  return svcs.map((svc: Record<string, unknown>, idx: number) => (
                    <div key={idx} className="p-3 rounded-lg border border-brd bg-glass space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-tx2">Service {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="checkbox" checked={svc.enabled as boolean} onChange={e => {
                              const next = [...svcs]; next[idx] = { ...svc, enabled: e.target.checked };
                              update('extra', { ...data.extra, services: JSON.stringify(next) });
                            }} /> Enabled
                          </label>
                          <button type="button" onClick={() => {
                            const next = svcs.filter((_: unknown, i: number) => i !== idx);
                            update('extra', { ...data.extra, services: JSON.stringify(next) });
                          }} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div><label className="label-sm mb-1">Service Type</label>
                          <select value={String(svc.service_type || 'internet')} onChange={e => {
                            const next = [...svcs]; next[idx] = { ...svc, service_type: e.target.value };
                            update('extra', { ...data.extra, services: JSON.stringify(next) });
                          }} className="input-field">
                            <option value="internet">Internet</option>
                            <option value="tr069">TR069</option>
                            <option value="iptv">IPTV</option>
                            <option value="bridge">Bridge</option>
                          </select></div>
                        <div><label className="label-sm mb-1">VLAN</label>
                          {vlanList.length > 0 ? (
                            <select value={Array.isArray(svc.vlans) ? String(svc.vlans[0] || '') : ''} onChange={e => {
                              const next = [...svcs]; next[idx] = { ...svc, vlans: [e.target.value], vlan_names: [vlanList.find(v => String(v.vlan_id) === e.target.value)?.name || ''] };
                              update('extra', { ...data.extra, services: JSON.stringify(next) });
                            }} className="input-field">
                              <option value="">Select VLAN...</option>
                              {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                            </select>
                          ) : (
                            <input type="number" value={Array.isArray(svc.vlans) ? String(svc.vlans[0] || '') : ''} onChange={e => {
                              const next = [...svcs]; next[idx] = { ...svc, vlans: [e.target.value] };
                              update('extra', { ...data.extra, services: JSON.stringify(next) });
                            }} className="input-field" placeholder="VLAN ID" />
                          )}</div>
                        <div><label className="label-sm mb-1">WAN Mode</label>
                          <select value={String(svc.wan_mode || 'webpage')} onChange={e => {
                            const next = [...svcs]; next[idx] = { ...svc, wan_mode: e.target.value };
                            update('extra', { ...data.extra, services: JSON.stringify(next) });
                          }} className="input-field">
                            <option value="webpage">Setup via ONT</option>
                            <option value="nat">PPPoE NAT</option>
                            <option value="wan">WAN-IP</option>
                          </select></div>
                        {svc.service_type === 'iptv' && (
                          <div><label className="label-sm mb-1">MVLAN (IPTV)</label>
                            <input type="number" value={String(svc.mvlan || '')} onChange={e => {
                              const next = [...svcs]; next[idx] = { ...svc, mvlan: e.target.value };
                              update('extra', { ...data.extra, services: JSON.stringify(next) });
                            }} className="input-field" placeholder="MVLAN" /></div>
                        )}
                        {svc.service_type === 'tr069' && (
                          <>
                            <div><label className="label-sm mb-1">WAN Mode</label>
                              <select value={String(svc.wan_mode || 'wan')} onChange={e => {
                                const next = [...svcs]; next[idx] = { ...svc, wan_mode: e.target.value, wan_ip_mode: 'DHCP' };
                                update('extra', { ...data.extra, services: JSON.stringify(next) });
                              }} className="input-field">
                                <option value="wan">WAN-IP DHCP</option>
                                <option value="webpage">Setup via ONT</option>
                              </select></div>
                            {svc.wan_mode === 'wan' && (
                              <div><label className="label-sm mb-1">VLAN Profile</label>
                                <select value={String(svc.vlan_profile || '')} onChange={e => {
                                  const next = [...svcs]; next[idx] = { ...svc, vlan_profile: e.target.value };
                                  update('extra', { ...data.extra, services: JSON.stringify(next) });
                                }} className="input-field">
                                  <option value="">Select VLAN Profile...</option>
                                  {wanIpProfiles.map(p => <option key={p.name} value={p.name}>{p.vlan || '—'} — {p.name}</option>)}
                                </select></div>
                            )}
                          </>
                        )}
                        {svc.wan_mode === 'wan' && svc.service_type === 'internet' && (
                          <>
                            <div><label className="label-sm mb-1">WAN IP Mode</label>
                              <select value={String(svc.wan_ip_mode || 'PPPoE')} onChange={e => {
                                const next = [...svcs]; next[idx] = { ...svc, wan_ip_mode: e.target.value };
                                update('extra', { ...data.extra, services: JSON.stringify(next) });
                              }} className="input-field">
                                <option value="PPPoE">PPPoE</option>
                                <option value="DHCP">DHCP</option>
                                <option value="STATIC">Static</option>
                              </select></div>
                            <div><label className="label-sm mb-1">VLAN Profile</label>
                              <select value={String(svc.vlan_profile || '')} onChange={e => {
                                const next = [...svcs]; next[idx] = { ...svc, vlan_profile: e.target.value };
                                update('extra', { ...data.extra, services: JSON.stringify(next) });
                              }} className="input-field">
                                <option value="">Select VLAN Profile...</option>
                                {wanIpProfiles.map(p => <option key={p.name} value={p.name}>{p.vlan || '—'} — {p.name}</option>)}
                              </select></div>
                          </>
                        )}
                        {((svc.wan_mode === 'nat' && svc.service_type === 'internet') || (svc.wan_mode === 'wan' && svc.wan_ip_mode === 'PPPoE' && svc.service_type === 'internet')) && (
                          <>
                            <div><label className="label-sm mb-1">PPPoE Username</label>
                              <input type="text" value={String(svc.username || '')} onChange={e => {
                                const next = [...svcs]; next[idx] = { ...svc, username: e.target.value };
                                update('extra', { ...data.extra, services: JSON.stringify(next) });
                              }} className="input-field" placeholder="Username" /></div>
                            <div><label className="label-sm mb-1">PPPoE Password</label>
                              <input type="text" value={String(svc.password || '')} onChange={e => {
                                const next = [...svcs]; next[idx] = { ...svc, password: e.target.value };
                                update('extra', { ...data.extra, services: JSON.stringify(next) });
                              }} className="input-field" placeholder="Password" /></div>
                          </>
                        )}
                        <div><label className="label-sm mb-1">Upload Profile</label>
                          <select value={String(svc.profile_upload || '')} onChange={e => {
                            const next = [...svcs]; next[idx] = { ...svc, profile_upload: e.target.value };
                            update('extra', { ...data.extra, services: JSON.stringify(next) });
                          }} className="input-field">
                            <option value="">Use global</option>
                            {tcontProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                          </select></div>
                        <div><label className="label-sm mb-1">Download Profile</label>
                          <select value={String(svc.profile_download || '')} onChange={e => {
                            const next = [...svcs]; next[idx] = { ...svc, profile_download: e.target.value };
                            update('extra', { ...data.extra, services: JSON.stringify(next) });
                          }} className="input-field">
                            <option value="">Use global</option>
                            {trafficProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                          </select></div>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* SSID 2.4GHz */}
              <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                <div className="text-xs font-semibold text-tx2">SSID 2.4GHz (wifi_0/1) — opsional</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2"><label className="label-sm mb-1">SSID Name</label>
                    <input type="text" value={String(data.extra.ssid1_name || '')} onChange={e => update('extra', { ...data.extra, ssid1_name: e.target.value })} className="input-field" placeholder="Nama WiFi 2.4GHz" /></div>
                  <div><label className="label-sm mb-1">Auth</label>
                    <select value={data.extra.ssid1_auth || 'wpa2'} onChange={e => update('extra', { ...data.extra, ssid1_auth: e.target.value })} className="input-field">
                      <option value="wpa2">WPA2-PSK</option>
                      <option value="mixed">WPA/WPA2 Mixed</option>
                      <option value="wpa">WPA-PSK</option>
                      <option value="open">Open</option>
                    </select></div>
                </div>
                {data.extra.ssid1_name && data.extra.ssid1_auth !== 'open' && (
                  <div><label className="label-sm mb-1">Password 2.4GHz</label>
                    <input type="text" value={String(data.extra.ssid1_pass || '')} onChange={e => update('extra', { ...data.extra, ssid1_pass: e.target.value })} className="input-field" placeholder="Min 8 karakter" /></div>
                )}
              </div>

              {/* SSID 5GHz */}
              <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                <div className="text-xs font-semibold text-tx2">SSID 5GHz (wifi_0/5) — opsional</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2"><label className="label-sm mb-1">SSID Name</label>
                    <input type="text" value={String(data.extra.ssid2_name || '')} onChange={e => update('extra', { ...data.extra, ssid2_name: e.target.value })} className="input-field" placeholder="Nama WiFi 5GHz" /></div>
                  <div><label className="label-sm mb-1">Auth</label>
                    <select value={data.extra.ssid2_auth || 'wpa2'} onChange={e => update('extra', { ...data.extra, ssid2_auth: e.target.value })} className="input-field">
                      <option value="wpa2">WPA2-PSK</option>
                      <option value="mixed">WPA/WPA2 Mixed</option>
                      <option value="wpa">WPA-PSK</option>
                      <option value="open">Open</option>
                    </select></div>
                </div>
                {data.extra.ssid2_name && data.extra.ssid2_auth !== 'open' && (
                  <div><label className="label-sm mb-1">Password 5GHz</label>
                    <input type="text" value={String(data.extra.ssid2_pass || '')} onChange={e => update('extra', { ...data.extra, ssid2_pass: e.target.value })} className="input-field" placeholder="Min 8 karakter" /></div>
                )}
              </div>

              {/* TR069 */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_tr069 === 'true'} onChange={e => update('extra', { ...data.extra, enable_tr069: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable TR069/ACS Remote Management</span>
                </label>
                {data.extra.enable_tr069 === 'true' && (
                  <div className="pl-6 space-y-3">
                    <div><label className="label-sm mb-1">TR069 Profile</label>
                      <select value={data.extra.tr069_profile_id || ''} onChange={e => selectTr069Profile(e.target.value)} className="input-field">
                        <option value="">Select Profile...</option>
                        {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                      </select></div>
                    {data.extra.tr069_profile_id && (
                      <div className="grid grid-cols-2 gap-3 text-xs text-tx3">
                        <div>ACS URL: <span className="text-tx1 font-mono">{data.extra.acs_url}</span></div>
                        <div>Username: <span className="text-tx1">{data.extra.acs_user}</span></div>
                        <div>Password: <span className="text-tx1 font-mono">{data.extra._show_acs_pass === 'true' ? data.extra.acs_pass : '••••••••'}</span> <button type="button" onClick={() => update('extra', { ...data.extra, _show_acs_pass: data.extra._show_acs_pass === 'true' ? '' : 'true' })} className="text-tx3 hover:text-accent ml-1">{data.extra._show_acs_pass === 'true' ? '🙈' : '👁'}</button></div>
                        <div>VLAN: <span className="text-tx1 font-mono">{data.extra.tr069_vlan}</span> <span className="text-tx3">({data.extra.tr069_vlan_mode || 'tag'})</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {data.template === 'huawei_full' && (
            <div className="p-3 md:p-4 rounded-lg bg-glass border border-accent/20 space-y-4">
              <h4 className="text-sm font-semibold text-accent">Huawei Full Config</h4>
              <p className="text-xs text-tx3">WiFi/SSID config via TR069/GenieACS (no OMCI support via ZTE OLT)</p>

              {/* Dynamic VLAN list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label-sm">VLAN List (Service Ports)</label>
                  <button type="button" onClick={() => {
                    const cur = Array.isArray(data.extra.vlans) ? data.extra.vlans : [];
                    update('extra', { ...data.extra, vlans: [...cur, { vlan: '', label: '' }] });
                  }} className="px-2 py-1 text-xs rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors flex items-center gap-1">
                    <Plus size={12} /> Add VLAN
                  </button>
                </div>
                <div className="space-y-2">
                  {(Array.isArray(data.extra.vlans) && data.extra.vlans.length > 0 ? data.extra.vlans : [
                    { vlan: data.extra.mgmt_vlan || '1010', label: 'Mgmt' },
                    { vlan: data.extra.internet_vlan || '30', label: 'Internet' },
                    { vlan: data.extra.voip_vlan || '151', label: 'VoIP' },
                  ]).map((v, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-[10px] text-tx3 w-6 flex-shrink-0">#{i + 1}</span>
                      <input type="number" value={v.vlan || ''} placeholder="VLAN ID"
                        onChange={e => {
                          const cur = Array.isArray(data.extra.vlans) ? [...data.extra.vlans] : [
                            { vlan: data.extra.mgmt_vlan || '1010', label: 'Mgmt' },
                            { vlan: data.extra.internet_vlan || '30', label: 'Internet' },
                            { vlan: data.extra.voip_vlan || '151', label: 'VoIP' },
                          ];
                          cur[i] = { ...cur[i], vlan: e.target.value };
                          update('extra', { ...data.extra, vlans: cur });
                        }}
                        className="input-field flex-1" min={1} max={4094} />
                      <input type="text" value={v.label || ''} placeholder="Label (opt)"
                        onChange={e => {
                          const cur = Array.isArray(data.extra.vlans) ? [...data.extra.vlans] : [
                            { vlan: data.extra.mgmt_vlan || '1010', label: 'Mgmt' },
                            { vlan: data.extra.internet_vlan || '30', label: 'Internet' },
                            { vlan: data.extra.voip_vlan || '151', label: 'VoIP' },
                          ];
                          cur[i] = { ...cur[i], label: e.target.value };
                          update('extra', { ...data.extra, vlans: cur });
                        }}
                        className="input-field flex-1" />
                      <button type="button" onClick={() => {
                        const cur = Array.isArray(data.extra.vlans) ? data.extra.vlans.filter((_, idx) => idx !== i) : [];
                        update('extra', { ...data.extra, vlans: cur });
                      }} className="p-1.5 rounded text-red-400 hover:bg-red-500/10 flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-tx3 mt-1">Setiap VLAN akan dibuatkan service-port pada ONU. Jumlah VLAN fleksibel sesuai kebutuhan tenant.</p>
              </div>

              <div><label className="label-sm mb-1">VLAN Profile Name</label>
                <input type="text" value={String(data.extra.vlan_profile || 'genieacs')} onChange={e => update('extra', { ...data.extra, vlan_profile: e.target.value })} className="input-field" /></div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data.extra.enable_tr069 === 'true'} onChange={e => update('extra', { ...data.extra, enable_tr069: e.target.checked ? 'true' : '' })} />
                  <span className="text-sm font-medium">Enable TR069/ACS</span>
                </label>
                {data.extra.enable_tr069 === 'true' && (
                  <div className="pl-6 space-y-3">
                    <div><label className="label-sm mb-1">TR069 Profile</label>
                      <select value={data.extra.tr069_profile_id || ''} onChange={e => selectTr069Profile(e.target.value)} className="input-field">
                        <option value="">Select Profile...</option>
                        {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                      </select></div>
                    {data.extra.tr069_profile_id && (
                      <div className="grid grid-cols-2 gap-3 text-xs text-tx3">
                        <div>ACS URL: <span className="text-tx1 font-mono">{data.extra.acs_url}</span></div>
                        <div>Username: <span className="text-tx1">{data.extra.acs_user}</span></div>
                        <div>Password: <span className="text-tx1 font-mono">{data.extra._show_acs_pass === 'true' ? data.extra.acs_pass : '••••••••'}</span> <button type="button" onClick={() => update('extra', { ...data.extra, _show_acs_pass: data.extra._show_acs_pass === 'true' ? '' : 'true' })} className="text-tx3 hover:text-accent ml-1">{data.extra._show_acs_pass === 'true' ? '🙈' : '👁'}</button></div>
                        <div>VLAN: <span className="text-tx1 font-mono">{data.extra.tr069_vlan}</span> <span className="text-tx3">({data.extra.tr069_vlan_mode || 'tag'})</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {data.template === 'fiberhome_veip' && (
            <div className="p-3 md:p-4 rounded-lg bg-glass border border-accent/20 space-y-3">
              <h4 className="text-sm font-semibold text-accent">Fiberhome VEIP (HG6145D2)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="label-sm mb-1">TR069 VLAN</label>
                  <input type="number" value={data.extra.tr069_vlan || '100'} onChange={e => update('extra', { ...data.extra, tr069_vlan: e.target.value })} className="input-field" /></div>
                <div><label className="label-sm mb-1">Internet VLAN</label>
                  <input type="number" value={data.extra.internet_vlan || '30'} onChange={e => update('extra', { ...data.extra, internet_vlan: e.target.value })} className="input-field" /></div>
                <div><label className="label-sm mb-1">VoIP VLAN</label>
                  <input type="number" value={data.extra.voip_vlan || '151'} onChange={e => update('extra', { ...data.extra, voip_vlan: e.target.value })} className="input-field" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="label-sm mb-1">ACS URL</label>
                  <input type="text" value={String(data.extra.acs_url ?? '')} onChange={e => update('extra', { ...data.extra, acs_url: e.target.value })} className="input-field" placeholder="http://192.168.54.254:7547" /></div>
                <div><label className="label-sm mb-1">ACS Username</label>
                  <input type="text" value={String(data.extra.acs_user ?? '')} onChange={e => update('extra', { ...data.extra, acs_user: e.target.value })} className="input-field" placeholder="acs" /></div>
                <div><label className="label-sm mb-1">ACS Password</label>
                  <div className="relative">
                    <input type={data.extra._show_acs_pass === 'true' ? 'text' : 'password'} value={String(data.extra.acs_pass ?? '')} onChange={e => update('extra', { ...data.extra, acs_pass: e.target.value })} className="input-field pr-10" placeholder="acs" />
                    <button type="button" onClick={() => update('extra', { ...data.extra, _show_acs_pass: data.extra._show_acs_pass === 'true' ? '' : 'true' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1">
                      {data.extra._show_acs_pass === 'true' ? '🙈' : '👁'}
                    </button>
                  </div></div>
              </div>
            </div>
          )}

          <hr className="border-brd" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {/* Name prefix */}
            <div>
              <label className="label-sm mb-1.5">Name Prefix (optional)</label>
              <input type="text" value={data.namePrefix} onChange={e => update('namePrefix', e.target.value)}
                placeholder="e.g. ODP-RW03" className="input-field" />
              <p className="text-xs text-tx3 mt-1">ONUs will be named: prefix-1, prefix-2, ...</p>
            </div>

            {/* Description */}
            <div>
              <label className="label-sm mb-1.5">Description (optional)</label>
              <input type="text" value={data.description} onChange={e => update('description', e.target.value)}
                placeholder="e.g. Pelanggan RT03" className="input-field" />
            </div>
          </div>

          {technicians.length > 0 && (
            <div>
              <label className="label-sm mb-1.5 flex items-center gap-1.5"><Wrench size={12} /> Teknisi Lapangan</label>
              <select value={data.technicianId ?? ''} onChange={e => update('technicianId', e.target.value ? Number(e.target.value) : null)}
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

      {/* Step 4: Review & Register */}
      {step === 4 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2"><FileText size={18} /> Review & Register</h2>

          {/* General Settings */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-accent">General Settings</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              <InfoBox label="OLT" value={olts.find(o => o.id === data.oltId)?.name || '-'} />
              <InfoBox label="ONUs to Register" value={String(data.selectedOnus.length)} />
              <InfoBox label="ONU Type" value={data.onuType} />
              <InfoBox label="Template" value={data.template === 'zte_full' ? 'ZTE Dual Band' : data.template === 'zte_multi' ? 'ZTE Multi-Service' : data.template.replace('_', ' ')} />
              <InfoBox label="VLAN ID" value={String(data.vlan)} />
              <InfoBox label="TCONT Profile" value={data.tcontProfile || '-'} />
              <InfoBox label="Traffic Profile" value={data.trafficProfile || 'None'} />
              <InfoBox label="Auto-Configure" value={data.configure ? 'Yes' : 'No'} />
              <InfoBox label="Name Prefix" value={data.namePrefix || '-'} />
              <InfoBox label="Description" value={data.description || '-'} />
            </div>
          </div>

          {/* Template-specific config summary */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-accent">Configuration Details</h3>
            <div className="rounded-lg border border-brd bg-glass p-3 md:p-4 space-y-2 text-xs md:text-sm">
              {data.template === 'bridge' && (
                <div className="text-tx3">Transparent bridge mode — no additional configuration.</div>
              )}

              {data.template === 'pppoe' && (
                <div className="space-y-1">
                  <ConfigRow label="PPPoE Username" value={String(data.extra.pppoe_user || '-')} />
                  <ConfigRow label="PPPoE Password" value={String(data.extra.pppoe_pass || '-')} />
                </div>
              )}

              {data.template === 'zte_single' && (
                <div className="space-y-1">
                  <ConfigRow label="VEIP Mode" value={data.extra.use_veip === 'true' ? 'Enabled (non-ZTE ONU)' : 'Disabled (ZTE ONU)'} />
                  <ConfigRow label="PPPoE" value={data.extra.enable_pppoe === 'true' ? 'Enabled' : 'Disabled'} />
                  {data.extra.enable_pppoe === 'true' && (
                    <>
                      <ConfigRow label="PPPoE Username" value={String(data.extra.pppoe_user || '-')} />
                      <ConfigRow label="PPPoE Password" value={String(data.extra.pppoe_pass || '-')} />
                    </>
                  )}
                  {data.extra.ssid_name && <ConfigRow label="SSID 2.4GHz" value={String(data.extra.ssid_name)} />}
                  {data.extra.ssid_name && <ConfigRow label="SSID Auth" value={{wpa2:'WPA2-PSK',mixed:'WPA/WPA2 Mixed',wpa:'WPA-PSK',open:'Open (No Password)'}[data.extra.ssid_auth as string] || 'WPA2-PSK'} />}
                  {data.extra.ssid_name && data.extra.ssid_auth !== 'open' && data.extra.ssid_pass && <ConfigRow label="SSID Password" value={String(data.extra.ssid_pass)} />}
                  <ConfigRow label="Firewall" value={data.extra.enable_firewall === 'true' ? `Enabled (${data.extra.firewall_level || 'low'})` : 'Disabled'} />
                  <ConfigRow label="TR069/ACS" value={data.extra.enable_tr069 === 'true' ? 'Enabled' : 'Disabled'} />
                  {data.extra.enable_tr069 === 'true' && (
                    <>
                      <ConfigRow label="ACS URL" value={String(data.extra.acs_url || '-')} />
                      <ConfigRow label="ACS User" value={String(data.extra.acs_user || '-')} />
                      <ConfigRow label="TR069 VLAN Mode" value={data.extra.tr069_vlan_mode || 'untag'} />
                      {data.extra.tr069_vlan_mode === 'tag' && <ConfigRow label="TR069 VLAN" value={String(data.extra.tr069_vlan || '-')} />}
                    </>
                  )}
                </div>
              )}

              {data.template === 'zte_full' && (
                <div className="space-y-1">
                  <ConfigRow label="VEIP Mode" value={data.extra.use_veip === 'true' ? 'Enabled (non-ZTE ONU)' : 'Disabled (ZTE ONU)'} />
                  <ConfigRow label="Primary VLAN" value={String(data.extra.primary_vlan || '30')} />
                  <ConfigRow label="Secondary VLAN" value={String(data.extra.secondary_vlan || '151')} />
                  <ConfigRow label="PPPoE" value={data.extra.enable_pppoe === 'true' ? 'Enabled' : 'Disabled'} />
                  {data.extra.enable_pppoe === 'true' && (
                    <>
                      <ConfigRow label="PPPoE Username" value={String(data.extra.pppoe_user || '-')} />
                      <ConfigRow label="PPPoE Password" value={String(data.extra.pppoe_pass || '-')} />
                    </>
                  )}
                  {data.extra.ssid1_name && <ConfigRow label="SSID 2.4GHz" value={String(data.extra.ssid1_name)} />}
                  {data.extra.ssid1_name && <ConfigRow label="Auth 2.4GHz" value={{wpa2:'WPA2-PSK',mixed:'WPA/WPA2 Mixed',wpa:'WPA-PSK',open:'Open (No Password)'}[data.extra.ssid1_auth as string] || 'WPA2-PSK'} />}
                  {data.extra.ssid1_name && data.extra.ssid1_auth !== 'open' && data.extra.ssid1_pass && <ConfigRow label="Password 2.4GHz" value={String(data.extra.ssid1_pass)} />}
                  {data.extra.ssid2_name && <ConfigRow label="SSID 5GHz" value={String(data.extra.ssid2_name)} />}
                  {data.extra.ssid2_name && <ConfigRow label="Auth 5GHz" value={{wpa2:'WPA2-PSK',mixed:'WPA/WPA2 Mixed',wpa:'WPA-PSK',open:'Open (No Password)'}[data.extra.ssid2_auth as string] || 'WPA2-PSK'} />}
                  {data.extra.ssid2_name && data.extra.ssid2_auth !== 'open' && data.extra.ssid2_pass && <ConfigRow label="Password 5GHz" value={String(data.extra.ssid2_pass)} />}
                  <ConfigRow label="Firewall" value={data.extra.enable_firewall === 'true' ? `Enabled (${data.extra.firewall_level || 'low'})` : 'Disabled'} />
                  <ConfigRow label="TR069/ACS" value={data.extra.enable_tr069 === 'true' ? 'Enabled' : 'Disabled'} />
                  {data.extra.enable_tr069 === 'true' && (
                    <>
                      <ConfigRow label="ACS URL" value={String(data.extra.acs_url || '-')} />
                      <ConfigRow label="ACS User" value={String(data.extra.acs_user || '-')} />
                      <ConfigRow label="TR069 VLAN Mode" value={data.extra.tr069_vlan_mode || 'untag'} />
                      {data.extra.tr069_vlan_mode === 'tag' && <ConfigRow label="TR069 VLAN" value={String(data.extra.tr069_vlan || '-')} />}
                    </>
                  )}
                </div>
              )}

              {data.template === 'zte_multi' && (
                <div className="space-y-1">
                  <ConfigRow label="VEIP Mode" value={data.extra.use_veip === 'true' ? 'Enabled (non-ZTE ONU)' : 'Disabled (ZTE ONU)'} />
                  {(() => {
                    const svcs = JSON.parse(data.extra.services || '[]');
                    if (svcs.length === 0) return <div className="text-tx3">No services configured.</div>;
                    return svcs.map((svc: Record<string, unknown>, idx: number) => (
                      <div key={idx} className="space-y-1 pl-2 border-l-2 border-brd">
                        <ConfigRow label={`Service ${idx + 1} Type`} value={String(svc.service_type || 'internet')} />
                        <ConfigRow label={`Service ${idx + 1} VLAN`} value={Array.isArray(svc.vlans) ? String(svc.vlans[0] || '-') : '-'} />
                        <ConfigRow label={`Service ${idx + 1} WAN Mode`} value={String(svc.wan_mode || 'webpage')} />
                        {svc.service_type === 'iptv' && <ConfigRow label={`Service ${idx + 1} MVLAN`} value={String(svc.mvlan || '-')} />}
                        {svc.wan_mode === 'nat' && <ConfigRow label={`Service ${idx + 1} PPPoE`} value={svc.username ? String(svc.username) : '-'} />}
                      </div>
                    ));
                  })()}
                  {data.extra.ssid1_name && <ConfigRow label="SSID 2.4GHz" value={String(data.extra.ssid1_name)} />}
                  {data.extra.ssid2_name && <ConfigRow label="SSID 5GHz" value={String(data.extra.ssid2_name)} />}
                  <ConfigRow label="TR069/ACS" value={data.extra.enable_tr069 === 'true' ? 'Enabled' : 'Disabled'} />
                  {data.extra.enable_tr069 === 'true' && (
                    <>
                      <ConfigRow label="ACS URL" value={String(data.extra.acs_url || '-')} />
                      <ConfigRow label="ACS User" value={String(data.extra.acs_user || '-')} />
                      <ConfigRow label="TR069 VLAN Mode" value={data.extra.tr069_vlan_mode || 'untag'} />
                      {data.extra.tr069_vlan_mode === 'tag' && <ConfigRow label="TR069 VLAN" value={String(data.extra.tr069_vlan || '-')} />}
                    </>
                  )}
                </div>
              )}

              {data.template === 'huawei_full' && (
                <div className="space-y-1">
                  {(() => {
                    const vlans = Array.isArray(data.extra.vlans) && data.extra.vlans.length > 0 ? data.extra.vlans : [
                      { vlan: data.extra.mgmt_vlan || '1010', label: 'Mgmt' },
                      { vlan: data.extra.internet_vlan || '30', label: 'Internet' },
                      { vlan: data.extra.voip_vlan || '151', label: 'VoIP' },
                    ];
                    return vlans.map((v, i) => (
                      <ConfigRow key={i} label={`VLAN #${i + 1}${v.label ? ` (${v.label})` : ''}`} value={String(v.vlan || '-')} />
                    ));
                  })()}
                  <ConfigRow label="VLAN Profile" value={String(data.extra.vlan_profile || 'genieacs')} />
                  <ConfigRow label="TR069/ACS" value={data.extra.enable_tr069 === 'true' ? 'Enabled' : 'Disabled'} />
                  {data.extra.enable_tr069 === 'true' && (
                    <>
                      <ConfigRow label="ACS URL" value={String(data.extra.acs_url || '-')} />
                      <ConfigRow label="ACS User" value={String(data.extra.acs_user || '-')} />
                      <ConfigRow label="ACS Password" value={data.extra.acs_pass ? '••••••••' : '-'} />
                    </>
                  )}
                </div>
              )}

              {data.template === 'fiberhome_veip' && (
                <div className="space-y-1">
                  <ConfigRow label="TR069 VLAN" value={String(data.extra.tr069_vlan || '100')} />
                  <ConfigRow label="Internet VLAN" value={String(data.extra.internet_vlan || '30')} />
                  <ConfigRow label="VoIP VLAN" value={String(data.extra.voip_vlan || '151')} />
                  <ConfigRow label="ACS URL" value={String(data.extra.acs_url || '-')} />
                  <ConfigRow label="ACS User" value={String(data.extra.acs_user || '-')} />
                  <ConfigRow label="ACS Password" value={data.extra.acs_pass ? '••••••••' : '-'} />
                </div>
              )}
            </div>
          </div>

          {/* Register Script Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-accent">Register Script Preview</h3>
              <button
                type="button"
                onClick={() => {
                  const script = generateRegisterScript(data);
                  navigator.clipboard.writeText(script).then(() => toast.success('Script copied!')).catch(() => toast.error('Copy failed'));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
              >
                <Copy size={14} /> Copy Script
              </button>
            </div>
            <pre className="rounded-lg border border-brd bg-[#0d1117] text-[#c9d1d9] text-[10px] md:text-xs font-mono p-3 md:p-4 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre">
{generateRegisterScript(data)}
            </pre>
            <p className="text-xs text-tx3 mt-1">Script preview untuk ONU pertama ({data.selectedOnus[0]?.sn || '-'}). ONU lainnya akan menggunakan format yang sama dengan SN & port berbeda.</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">ONUs to Register</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.selectedOnus.map((onu, i) => (
                <div key={i} className="flex items-center gap-2 md:gap-3 p-2 rounded-lg bg-glass text-xs md:text-sm">
                  <span className="text-tx3 w-5 md:w-6 flex-shrink-0">{i + 1}.</span>
                  <span className="font-mono truncate">{onu.sn}</span>
                  <span className="text-tx3 text-[10px] md:text-xs flex-shrink-0">{onu.pon_port}</span>
                  {data.namePrefix && <span className="text-accent text-[10px] md:text-xs flex-shrink-0">{data.namePrefix}-{i + 1}</span>}
                </div>
              ))}
            </div>
          </div>

          {registering && (
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/20">
              <div className="flex items-center gap-3">
                <Loader2 size={20} className="text-accent animate-spin" />
                <div>
                  <div className="text-sm font-medium">Registering ONUs...</div>
                  <div className="text-xs text-tx3">Please wait, this may take a moment</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 md:gap-3">
            <button onClick={() => setStep(3)} className="btn-cancel">Back</button>
            <button onClick={registerOnus} disabled={registering || !data.tcontProfile}
              className="btn-primary flex items-center gap-2">
              {registering ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {registering ? 'Registering...' : `Register ${data.selectedOnus.length} ONU(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Results */}
      {step === 5 && (
        <div className="glass-card p-4 md:p-6 space-y-4 md:space-y-5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
            <Check size={18} className="text-success" /> Registration Results
          </h2>

          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="p-3 md:p-4 rounded-xl bg-success/10 border border-success/20 text-center">
              <div className="text-xl md:text-2xl font-bold text-success">{results.filter(r => r.success).length}</div>
              <div className="text-[10px] md:text-xs text-tx3">Successful</div>
            </div>
            <div className="p-3 md:p-4 rounded-xl bg-danger/10 border border-danger/20 text-center">
              <div className="text-xl md:text-2xl font-bold text-danger">{results.filter(r => !r.success).length}</div>
              <div className="text-[10px] md:text-xs text-tx3">Failed</div>
            </div>
            <div className="p-3 md:p-4 rounded-xl bg-glass border border-brd text-center">
              <div className="text-xl md:text-2xl font-bold">{results.length}</div>
              <div className="text-[10px] md:text-xs text-tx3">Total</div>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className={cn('flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg border text-xs md:text-sm',
                r.success ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20')}>
                {r.success ? <Check size={16} className="text-success flex-shrink-0" /> : <span className="text-danger flex-shrink-0">!</span>}
                <span className="font-mono flex-shrink-0">{r.sn}</span>
                <span className="text-tx3 text-[10px] md:text-xs flex-1 truncate">{r.message}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 md:gap-3">
            <button onClick={() => { setStep(1); setResults([]); setData(prev => ({ ...prev, selectedOnus: [] })); }}
              className="btn-cancel">Register More</button>
            <button onClick={() => navigate('/dashboard/onus')} className="btn-primary">View All ONUs</button>
          </div>
        </div>
      )}

      {/* Navigation */}
      {step >= 1 && step <= 3 && (
        <div className="flex justify-end gap-2 md:gap-3">
          <button onClick={() => setStep(step + 1)} disabled={!canNext()}
            className="btn-primary flex items-center gap-2">
            Next <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 md:p-3 rounded-lg bg-glass">
      <div className="text-[10px] md:text-xs text-tx3 mb-0.5 truncate">{label}</div>
      <div className="text-xs md:text-sm font-medium truncate">{value}</div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 md:gap-4 py-1 border-b border-brd/50 last:border-0">
      <span className="text-tx3 text-xs flex-shrink-0">{label}</span>
      <span className="text-xs md:text-sm font-medium text-right truncate">{value}</span>
    </div>
  );
}
