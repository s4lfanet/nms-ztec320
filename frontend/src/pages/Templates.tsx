import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type OltInfo } from '../lib/api';
import {
  Blocks, Wifi, Radio, Server, Network, Router,
  Layers, ArrowRight, Check, Plus, Edit3, Trash2, X, Loader2
} from 'lucide-react';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { cn } from '../lib/utils';

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  serviceTypes: string[];
  wanModes: string[];
  ssidSupport: boolean;
  tr069Support: boolean;
  color: string;
}

const templates: TemplateInfo[] = [
  {
    id: 'bridge',
    name: 'Bridge',
    description: 'Simple bridge mode — transparent VLAN passthrough, no WAN-IP.',
    icon: <Blocks size={24} />,
    features: ['TCONT + Gemport', 'Service-port VLAN', 'No WAN-IP', 'No PPPoE'],
    serviceTypes: ['Bridge'],
    wanModes: ['Setup via ONT'],
    ssidSupport: false,
    tr069Support: false,
    color: 'text-accent',
  },
  {
    id: 'pppoe',
    name: 'PPPoE',
    description: 'PPPoE dial-up internet with OMCI WAN-IP PPPoE mode.',
    icon: <Network size={24} />,
    features: ['TCONT + Gemport', 'Service-port VLAN', 'WAN-IP PPPoE', 'PPPoE credentials'],
    serviceTypes: ['Internet'],
    wanModes: ['WAN-IP PPPoE'],
    ssidSupport: false,
    tr069Support: false,
    color: 'text-info',
  },
  {
    id: 'zte_single',
    name: 'ZTE Single',
    description: 'Single SSID + single VLAN with WPA2/WPA/Mixed/Open auth.',
    icon: <Wifi size={24} />,
    features: ['Single SSID 2.4GHz', 'WAN-IP PPPoE/DHCP', 'Firewall', 'Security Mgmt', 'VLAN port config'],
    serviceTypes: ['Internet'],
    wanModes: ['WAN-IP PPPoE', 'WAN-IP DHCP', 'PPPoE NAT'],
    ssidSupport: true,
    tr069Support: false,
    color: 'text-success',
  },
  {
    id: 'zte_full',
    name: 'ZTE Dual Band',
    description: 'Dual SSID (2.4GHz + 5GHz), dual VLAN, TR069 management.',
    icon: <Radio size={24} />,
    features: ['Dual SSID 2.4GHz + 5GHz', 'Dual VLAN', 'WAN-IP PPPoE/DHCP', 'Firewall', 'TR069/ACS', 'Security Mgmt'],
    serviceTypes: ['Internet', 'TR069'],
    wanModes: ['WAN-IP PPPoE', 'WAN-IP DHCP', 'PPPoE NAT'],
    ssidSupport: true,
    tr069Support: true,
    color: 'text-info',
  },
  {
    id: 'zte_multi',
    name: 'ZTE Multi-Service',
    description: 'Multi-service WAN (1-4 services) + OMCI SSID + TR069. Matches r-config CLI output.',
    icon: <Layers size={24} />,
    features: [
      '1-4 dynamic services',
      'Service types: Internet, TR069, IPTV, Bridge',
      'WAN modes: WAN-IP, PPPoE NAT, Setup via ONT',
      'Per-service Download/Upload profiles',
      'IPTV with MVLAN + LAN port picker',
      'Dual SSID 2.4GHz + 5GHz (Open/WPA/WPA2/Mixed)',
      'TR069/ACS with VLAN tagging',
      'Firewall + Security Mgmt',
    ],
    serviceTypes: ['Internet', 'TR069', 'IPTV', 'Bridge'],
    wanModes: ['WAN-IP PPPoE', 'WAN-IP DHCP', 'WAN-IP STATIC', 'PPPoE NAT', 'Setup via ONT'],
    ssidSupport: true,
    tr069Support: true,
    color: 'text-amber-400',
  },
  {
    id: 'huawei_full',
    name: 'Huawei Full',
    description: 'Multi-VLAN config for Huawei ONUs with WAN DHCP and TR069.',
    icon: <Router size={24} />,
    features: ['Mgmt VLAN', 'Internet VLAN', 'VoIP VLAN', 'WAN-IP DHCP', 'TR069/ACS'],
    serviceTypes: ['Internet', 'TR069', 'VoIP'],
    wanModes: ['WAN-IP DHCP'],
    ssidSupport: false,
    tr069Support: true,
    color: 'text-warning',
  },
  {
    id: 'fiberhome_veip',
    name: 'Fiberhome VEIP',
    description: 'TR069 + Internet + VoIP for Fiberhome/Vsol ONUs using VEIP mode.',
    icon: <Server size={24} />,
    features: ['VEIP mode', 'TR069 management VLAN', 'Internet VLAN', 'VoIP VLAN', 'ETH port tagging'],
    serviceTypes: ['Internet', 'TR069', 'VoIP'],
    wanModes: ['Setup via ONT'],
    ssidSupport: false,
    tr069Support: true,
    color: 'text-warning',
  },
];

interface DbTemplate {
  id: number;
  name: string;
  vendor: string;
  model: string;
  onu_type: string;
  tcont_profile: string;
  traffic_profile: string;
  vlan: number;
  description: string;
  config: string;
  created_at: string | null;
}

const SERVICE_TYPES = [
  { v: 'bridge', l: 'Bridge', desc: 'Transparent bridge mode' },
  { v: 'pppoe', l: 'PPPoE', desc: 'PPPoE dial-up internet' },
  { v: 'zte_single', l: 'ZTE Single', desc: 'Single SSID + VLAN' },
  { v: 'zte_full', l: 'ZTE Dual Band', desc: 'Dual SSID, Dual VLAN, TR069' },
  { v: 'zte_multi', l: 'ZTE Multi-Service', desc: '1-4 services, IPTV, TR069' },
  { v: 'huawei_full', l: 'Huawei Full', desc: 'Multi VLAN, WAN DHCP' },
  { v: 'fiberhome_veip', l: 'Fiberhome VEIP', desc: 'TR069+Internet+VoIP' },
];

interface TemplateConfig {
  template: string;
  onu_type: string;
  tcont_profile: string;
  traffic_profile: string;
  vlan: number;
  extra: Record<string, string>;
}

function parseConfig(configStr: string): TemplateConfig {
  if (!configStr) return { template: '', onu_type: '', tcont_profile: '', traffic_profile: '', vlan: 100, extra: {} };
  try {
    const parsed = JSON.parse(configStr);
    return {
      template: parsed.template || '',
      onu_type: parsed.onu_type || '',
      tcont_profile: parsed.tcont_profile || '',
      traffic_profile: parsed.traffic_profile || '',
      vlan: parsed.vlan || 100,
      extra: parsed.extra || {},
    };
  } catch {
    // Legacy: config was just the service type string
    return { template: configStr, onu_type: '', tcont_profile: '', traffic_profile: '', vlan: 100, extra: {} };
  }
}

export default function Templates() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedTemplate = templates.find(t => t.id === selected);
  const [dbTemplates, setDbTemplates] = useState<DbTemplate[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', vendor: '', model: '', description: '',
    config: '' as string,
  });

  // OLT data for template config
  const { data: dashData } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const olts: OltInfo[] = dashData?.olts || [];
  const [selectedOltId, setSelectedOltId] = useState<number>(0);
  const [onuTypes, setOnuTypes] = useState<string[]>([]);
  const [tcontProfiles, setTcontProfiles] = useState<string[]>([]);
  const [trafficProfiles, setTrafficProfiles] = useState<string[]>([]);
  const [vlanList, setVlanList] = useState<Array<{ vlan_id: number; name: string }>>([]);
  const [tr069Profiles, setTr069Profiles] = useState<Array<{ id: number; name: string; acs_url: string }>>([]);
  const [fetchingOltData, setFetchingOltData] = useState(false);

  // Parse config into editable state
  const [cfg, setCfg] = useState<TemplateConfig>({ template: 'bridge', onu_type: '', tcont_profile: '', traffic_profile: '', vlan: 100, extra: {} });

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/template', { credentials: 'include', headers: { 'X-Requested-With': 'fetch' } });
      if (res.ok) {
        const data = await res.json();
        setDbTemplates(data);
      }
    } catch { /* ignore */ }
    setLoadingDb(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Fetch OLT data when selectedOltId changes
  useEffect(() => {
    if (!selectedOltId) return;
    setFetchingOltData(true);
    setOnuTypes([]); setTcontProfiles([]); setTrafficProfiles([]); setVlanList([]);
    Promise.all([
      fetch(`/api/olt/${selectedOltId}/onu-types`, { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      fetch(`/api/olt/${selectedOltId}/speed-profiles`, { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      fetch(`/api/olt/${selectedOltId}/vlans`, { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      fetch('/api/tr069', { credentials: 'include' }).then(r => r.json()).catch(() => []),
    ]).then(([types, speed, vlans, tr069]) => {
      if (types.success && types.types) setOnuTypes(types.types.map((t: unknown) => typeof t === 'string' ? t : (t as Record<string, string>).type_name).filter(Boolean));
      if (speed.success) { setTcontProfiles(speed.tcont || []); setTrafficProfiles(speed.traffic || []); }
      if (vlans.success && vlans.vlans) setVlanList(vlans.vlans);
      else if (vlans.vlans) setVlanList(vlans.vlans);
      if (Array.isArray(tr069)) setTr069Profiles(tr069);
    }).finally(() => setFetchingOltData(false));
  }, [selectedOltId]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', vendor: '', model: '', description: '', config: '' });
    setSelectedOltId(0);
    setCfg({ template: 'bridge', onu_type: '', tcont_profile: '', traffic_profile: '', vlan: 100, extra: {} });
    setShowModal(true);
  };

  const openEdit = (t: DbTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, vendor: t.vendor, model: t.model, description: t.description, config: t.config });
    setSelectedOltId(0);
    setCfg(parseConfig(t.config));
    setShowModal(true);
  };

  const doSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const configJson = JSON.stringify(cfg);
    const payload = {
      name: form.name, vendor: form.vendor, model: form.model,
      onu_type: cfg.onu_type, tcont_profile: cfg.tcont_profile,
      traffic_profile: cfg.traffic_profile, vlan: cfg.vlan,
      description: form.description, config: configJson,
    };
    setSaving(true);
    try {
      const url = editingId ? `/api/template/${editingId}` : '/api/template';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingId ? 'Template updated' : 'Template created');
        setShowModal(false);
        fetchTemplates();
      } else { toast.error(data.message || 'Failed to save'); }
    } catch { toast.error('Network error'); }
    setSaving(false);
  };

  const doDelete = async (t: DbTemplate) => {
    const ok = await confirm({ title: 'Delete Template', message: `Delete "${t.name}"? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/template/${t.id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' }, credentials: 'include' });
      const data = await res.json();
      if (data.success) { toast.success('Template deleted'); fetchTemplates(); }
      else toast.error('Failed to delete');
    } catch { toast.error('Network error'); }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Templates</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">ONU configuration templates for automatic provisioning</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} />
            Add Template
          </button>
          <Link to="/dashboard/onus/register" className="btn-secondary flex items-center gap-2 text-sm">
            <ArrowRight size={16} />
            Register ONU
          </Link>
        </div>
      </div>

      {/* Built-in Template Cards */}
      <div>
        <h2 className="text-sm font-semibold text-tx3 uppercase tracking-wider mb-3">Built-in Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => setSelected(selected === t.id ? null : t.id)}
              className={`cursor-pointer rounded-xl border p-3 md:p-4 transition-all hover:border-accent/40 hover:bg-glass/50 ${selected === t.id ? 'border-accent bg-accent/5' : 'border-brd bg-glass/30'}`}
            >
              <div className="flex items-start gap-2.5 md:gap-3">
                <div className={`p-2 rounded-lg bg-glass flex-shrink-0 ${t.color}`}>{t.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{t.name}</h3>
                  <p className="text-xs text-tx3 mt-1 line-clamp-2">{t.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.serviceTypes.map(st => (
                      <span key={st} className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">{st}</span>
                    ))}
                    {t.ssidSupport && <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">SSID</span>}
                    {t.tr069Support && <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">TR069</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom (DB) Templates */}
      <div>
        <h2 className="text-sm font-semibold text-tx3 uppercase tracking-wider mb-3">Custom Templates</h2>
        {loadingDb ? (
          <div className="flex items-center gap-2 text-tx3 text-sm py-4"><Loader2 size={16} className="animate-spin" /> Loading...</div>
        ) : dbTemplates.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed border-brd">
            <p className="text-tx3 text-sm">No custom templates yet. Click "Add Template" to create one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {dbTemplates.map(t => (
              <div key={t.id} className="rounded-xl border border-brd bg-glass/30 p-3 md:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                    <p className="text-xs text-tx3 mt-1 line-clamp-2">{t.description || 'No description'}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {t.vendor && <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">{t.vendor}</span>}
                      {t.onu_type && <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">{t.onu_type}</span>}
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">VLAN {t.vlan}</span>
                      {t.tcont_profile && <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">{t.tcont_profile}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors"><Edit3 size={14} /></button>
                    <button onClick={() => doDelete(t)} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-danger transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedTemplate && (
        <div className="rounded-xl border border-accent/20 bg-glass p-4 md:p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2.5 md:gap-3">
            <div className={`p-2.5 md:p-3 rounded-lg bg-glass flex-shrink-0 ${selectedTemplate.color}`}>{selectedTemplate.icon}</div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-bold truncate">{selectedTemplate.name}</h2>
              <p className="text-xs md:text-sm text-tx3">{selectedTemplate.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {/* Features */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-tx3 uppercase tracking-wider">Features</h4>
              <ul className="space-y-1">
                {selectedTemplate.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={14} className="text-success mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Service Types */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-tx3 uppercase tracking-wider">Service Types</h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.serviceTypes.map(st => (
                  <span key={st} className="px-2 py-1 rounded-lg text-xs bg-glass border border-brd">{st}</span>
                ))}
              </div>
            </div>

            {/* WAN Modes */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-tx3 uppercase tracking-wider">WAN Modes</h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.wanModes.map(wm => (
                  <span key={wm} className="px-2 py-1 rounded-lg text-xs bg-glass border border-brd">{wm}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 md:gap-4 mt-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${selectedTemplate.ssidSupport ? 'bg-success' : 'bg-tx3/30'}`} />
                  <span className="text-xs">SSID Support</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${selectedTemplate.tr069Support ? 'bg-success' : 'bg-tx3/30'}`} />
                  <span className="text-xs">TR069 Support</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Link to="/dashboard/onus/register" className="btn-primary inline-flex items-center gap-2 text-sm">
              Use this template
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* Add/Edit Template Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="modal-overlay" onClick={() => setShowModal(false)} />
          <div className="relative glass-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="px-4 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between sticky top-0 bg-surface z-10 rounded-t-2xl md:rounded-t-2xl">
              <h2 className="text-base font-semibold">{editingId ? 'Edit Template' : 'Add Template'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-glass text-tx3"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-4 md:p-5 space-y-4">
              {/* Basic Info */}
              <div>
                <label className="label-sm mb-1">Template Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g. ZTE-F609 Internet Only" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-1">Vendor</label>
                  <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className="input-field" placeholder="ZTE, Huawei, etc." />
                </div>
                <div>
                  <label className="label-sm mb-1">Model</label>
                  <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="input-field" placeholder="F609, etc." />
                </div>
              </div>
              <div>
                <label className="label-sm mb-1">Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" placeholder="Brief description" />
              </div>

              <div className="pt-2">
                <div className="text-xs font-semibold text-tx3 uppercase tracking-wider mb-3">OLT Configuration</div>
              </div>

              {/* OLT Selector — fetch actual data */}
              <div>
                <label className="label-sm mb-1.5">Source OLT (for actual data) <span className="text-tx3 text-xs">— optional</span></label>
                <select value={selectedOltId} onChange={e => setSelectedOltId(Number(e.target.value))} className="input-field">
                  <option value={0}>— Select OLT to load profiles —</option>
                  {olts.map(o => <option key={o.id} value={o.id}>{o.name} ({o.ip_address})</option>)}
                </select>
                {fetchingOltData && <p className="text-xs text-tx3 mt-1 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading OLT data...</p>}
                {selectedOltId > 0 && !fetchingOltData && (
                  <p className="text-xs text-tx3 mt-1">{onuTypes.length} ONU types, {tcontProfiles.length} TCONT, {trafficProfiles.length} traffic, {vlanList.length} VLANs</p>
                )}
              </div>

              {/* Service Template */}
              <div>
                <label className="label-sm mb-2">Service Template</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {SERVICE_TYPES.map(t => (
                    <button key={t.v} onClick={() => setCfg({ ...cfg, template: t.v })}
                      className={cn(
                        'p-2.5 rounded-xl border text-left transition-all',
                        cfg.template === t.v ? 'border-accent bg-accent/10' : 'border-brd hover:border-accent/30 bg-glass',
                      )}>
                      <div className="text-xs font-medium">{t.l}</div>
                      <div className="text-[10px] text-tx3">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ONU Type */}
              <div>
                <label className="label-sm mb-1.5">ONU Type</label>
                {onuTypes.length > 0 ? (
                  <select value={cfg.onu_type} onChange={e => setCfg({ ...cfg, onu_type: e.target.value })} className="input-field">
                    <option value="All">All (auto-detect)</option>
                    {onuTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input value={cfg.onu_type} onChange={e => setCfg({ ...cfg, onu_type: e.target.value })} className="input-field" placeholder="ZTE-F609, All, etc." />
                )}
              </div>

              {/* TCONT + Traffic Profiles */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-1.5">TCONT Profile <span className="text-tx3 text-xs">(Upload)</span></label>
                  {tcontProfiles.length > 0 ? (
                    <select value={cfg.tcont_profile} onChange={e => setCfg({ ...cfg, tcont_profile: e.target.value })} className="input-field">
                      <option value="">Select profile...</option>
                      {tcontProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input value={cfg.tcont_profile} onChange={e => setCfg({ ...cfg, tcont_profile: e.target.value })} className="input-field" placeholder="1G, 500M, etc." />
                  )}
                </div>
                <div>
                  <label className="label-sm mb-1.5">Traffic Profile <span className="text-tx3 text-xs">(Download)</span></label>
                  {trafficProfiles.length > 0 ? (
                    <select value={cfg.traffic_profile} onChange={e => setCfg({ ...cfg, traffic_profile: e.target.value })} className="input-field">
                      <option value="">None (no DL limit)</option>
                      {trafficProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input value={cfg.traffic_profile} onChange={e => setCfg({ ...cfg, traffic_profile: e.target.value })} className="input-field" placeholder="100M, etc." />
                  )}
                </div>
              </div>

              {/* VLAN */}
              <div>
                <label className="label-sm mb-1.5">VLAN ID</label>
                {vlanList.length > 0 ? (
                  <select value={cfg.vlan} onChange={e => setCfg({ ...cfg, vlan: parseInt(e.target.value) || 100 })} className="input-field">
                    <option value={100}>100 (default)</option>
                    {vlanList.map(v => <option key={v.vlan_id} value={v.vlan_id}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                  </select>
                ) : (
                  <input type="number" min={1} max={4094} value={cfg.vlan} onChange={e => setCfg({ ...cfg, vlan: parseInt(e.target.value) || 100 })} className="input-field" placeholder="100" />
                )}
              </div>

              {/* Template-specific config */}
              {cfg.template !== 'bridge' && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-tx3 uppercase tracking-wider mb-3">Service Configuration</div>
                </div>
              )}

              {/* Template-specific: PPPoE */}
              {cfg.template === 'pppoe' && (
                <div className="p-3 rounded-lg bg-glass border border-accent/20 space-y-3">
                  <h4 className="text-sm font-semibold text-accent">PPPoE Settings</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label-sm mb-1">Username</label>
                      <input type="text" value={String(cfg.extra.pppoe_user || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, pppoe_user: e.target.value } })} className="input-field" placeholder="PPPoE Username" /></div>
                    <div><label className="label-sm mb-1">Password</label>
                      <input type="text" value={String(cfg.extra.pppoe_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, pppoe_pass: e.target.value } })} className="input-field" placeholder="PPPoE Password" /></div>
                  </div>
                </div>
              )}

              {/* Template-specific: ZTE Single */}
              {cfg.template === 'zte_single' && (
                <div className="p-3 rounded-lg bg-glass border border-accent/20 space-y-3">
                  <h4 className="text-sm font-semibold text-accent">ZTE Single Band Config</h4>
                  {/* PPPoE */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.extra.enable_pppoe === 'true'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, enable_pppoe: e.target.checked ? 'true' : '' } })} />
                    <span className="text-sm font-medium">Enable PPPoE</span>
                  </label>
                  {cfg.extra.enable_pppoe === 'true' && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <input type="text" value={String(cfg.extra.pppoe_user || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, pppoe_user: e.target.value } })} className="input-field" placeholder="PPPoE Username" />
                      <input type="text" value={String(cfg.extra.pppoe_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, pppoe_pass: e.target.value } })} className="input-field" placeholder="PPPoE Password" />
                    </div>
                  )}
                  {/* SSID 2.4GHz */}
                  <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                    <div className="text-xs font-semibold text-tx2">WiFi SSID 2.4GHz</div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={String(cfg.extra.ssid_name || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid_name: e.target.value } })} className="input-field col-span-2" placeholder="SSID Name" />
                      <select value={cfg.extra.ssid_auth || 'wpa2'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid_auth: e.target.value } })} className="input-field">
                        <option value="wpa2">WPA2-PSK</option>
                        <option value="mixed">WPA/WPA2 Mixed</option>
                        <option value="wpa">WPA-PSK</option>
                        <option value="open">Open</option>
                      </select>
                    </div>
                    {cfg.extra.ssid_name && cfg.extra.ssid_auth !== 'open' && (
                      <input type="text" value={String(cfg.extra.ssid_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid_pass: e.target.value } })} className="input-field" placeholder="WiFi Password (min 8 chars)" />
                    )}
                  </div>
                  {/* Firewall */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.extra.enable_firewall === 'true'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, enable_firewall: e.target.checked ? 'true' : '' } })} />
                    <span className="text-sm font-medium">Enable Firewall</span>
                  </label>
                  {cfg.extra.enable_firewall === 'true' && (
                    <select value={cfg.extra.firewall_level || 'low'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, firewall_level: e.target.value } })} className="input-field">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  )}
                  {/* TR069 */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.extra.enable_tr069 === 'true'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, enable_tr069: e.target.checked ? 'true' : '' } })} />
                    <span className="text-sm font-medium">Enable TR069/ACS</span>
                  </label>
                  {cfg.extra.enable_tr069 === 'true' && tr069Profiles.length > 0 && (
                    <select value={cfg.extra.tr069_profile_id || ''} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, tr069_profile_id: e.target.value } })} className="input-field">
                      <option value="">Select Profile...</option>
                      {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Template-specific: ZTE Dual Band */}
              {cfg.template === 'zte_full' && (
                <div className="p-3 rounded-lg bg-glass border border-accent/20 space-y-3">
                  <h4 className="text-sm font-semibold text-accent">ZTE Dual Band Config</h4>
                  {/* SSID 2.4GHz */}
                  <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                    <div className="text-xs font-semibold text-tx2">WiFi SSID 2.4GHz (wifi_0/1)</div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={String(cfg.extra.ssid1_name || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid1_name: e.target.value } })} className="input-field col-span-2" placeholder="SSID 2.4GHz" />
                      <select value={cfg.extra.ssid1_auth || 'wpa2'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid1_auth: e.target.value } })} className="input-field">
                        <option value="wpa2">WPA2</option><option value="mixed">Mixed</option><option value="wpa">WPA</option><option value="open">Open</option>
                      </select>
                    </div>
                    {cfg.extra.ssid1_name && cfg.extra.ssid1_auth !== 'open' && (
                      <input type="text" value={String(cfg.extra.ssid1_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid1_pass: e.target.value } })} className="input-field" placeholder="WiFi Password 2.4GHz" />
                    )}
                  </div>
                  {/* SSID 5GHz */}
                  <div className="space-y-2 pl-4 border-l-2 border-accent/20">
                    <div className="text-xs font-semibold text-tx2">WiFi SSID 5GHz (wifi_0/5)</div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={String(cfg.extra.ssid2_name || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid2_name: e.target.value } })} className="input-field col-span-2" placeholder="SSID 5GHz" />
                      <select value={cfg.extra.ssid2_auth || 'wpa2'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid2_auth: e.target.value } })} className="input-field">
                        <option value="wpa2">WPA2</option><option value="mixed">Mixed</option><option value="wpa">WPA</option><option value="open">Open</option>
                      </select>
                    </div>
                    {cfg.extra.ssid2_name && cfg.extra.ssid2_auth !== 'open' && (
                      <input type="text" value={String(cfg.extra.ssid2_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid2_pass: e.target.value } })} className="input-field" placeholder="WiFi Password 5GHz" />
                    )}
                  </div>
                  {/* TR069 */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.extra.enable_tr069 === 'true'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, enable_tr069: e.target.checked ? 'true' : '' } })} />
                    <span className="text-sm font-medium">Enable TR069/ACS</span>
                  </label>
                  {cfg.extra.enable_tr069 === 'true' && tr069Profiles.length > 0 && (
                    <select value={cfg.extra.tr069_profile_id || ''} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, tr069_profile_id: e.target.value } })} className="input-field">
                      <option value="">Select Profile...</option>
                      {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Template-specific: Huawei Full / Fiberhome VEIP — VLAN config */}
              {(cfg.template === 'huawei_full' || cfg.template === 'fiberhome_veip') && (
                <div className="p-3 rounded-lg bg-glass border border-accent/20 space-y-3">
                  <h4 className="text-sm font-semibold text-accent">{cfg.template === 'huawei_full' ? 'Huawei Full' : 'Fiberhome VEIP'} Config</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label-sm mb-1">Mgmt VLAN</label>
                      <input type="number" value={String(cfg.extra.mgmt_vlan || cfg.extra.tr069_vlan || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, mgmt_vlan: e.target.value, tr069_vlan: e.target.value } })} className="input-field" placeholder="1010" /></div>
                    <div><label className="label-sm mb-1">Internet VLAN</label>
                      <input type="number" value={String(cfg.extra.internet_vlan || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, internet_vlan: e.target.value } })} className="input-field" placeholder="30" /></div>
                  </div>
                  {cfg.template === 'fiberhome_veip' && (
                    <div><label className="label-sm mb-1">VoIP VLAN</label>
                      <input type="number" value={String(cfg.extra.voip_vlan || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, voip_vlan: e.target.value } })} className="input-field" placeholder="200" /></div>
                  )}
                  {tr069Profiles.length > 0 && (
                    <div><label className="label-sm mb-1">TR069 Profile</label>
                      <select value={cfg.extra.tr069_profile_id || ''} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, tr069_profile_id: e.target.value } })} className="input-field">
                        <option value="">Select Profile...</option>
                        {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                      </select></div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-brd sticky bottom-0 bg-surface rounded-b-2xl md:rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={doSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
