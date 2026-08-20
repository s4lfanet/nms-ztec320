import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Blocks, Wifi, Radio, Server, Network, Router,
  Layers, ArrowRight, Check, Plus, Edit3, Trash2, X, Loader2
} from 'lucide-react';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';

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
  { v: 'bridge', l: 'Bridge' },
  { v: 'pppoe', l: 'PPPoE' },
  { v: 'zte_single', l: 'ZTE Single' },
  { v: 'zte_full', l: 'ZTE Dual Band' },
  { v: 'zte_multi', l: 'ZTE Multi-Service' },
  { v: 'huawei_full', l: 'Huawei Full' },
  { v: 'fiberhome_veip', l: 'Fiberhome VEIP' },
];

export default function Templates() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedTemplate = templates.find(t => t.id === selected);
  const [dbTemplates, setDbTemplates] = useState<DbTemplate[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', vendor: '', model: '', onu_type: '',
    tcont_profile: '', traffic_profile: '', vlan: 100,
    description: '', config: '',
  });

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

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', vendor: '', model: '', onu_type: '', tcont_profile: '', traffic_profile: '', vlan: 100, description: '', config: '' });
    setShowModal(true);
  };

  const openEdit = (t: DbTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, vendor: t.vendor, model: t.model, onu_type: t.onu_type, tcont_profile: t.tcont_profile, traffic_profile: t.traffic_profile, vlan: t.vlan, description: t.description, config: t.config });
    setShowModal(true);
  };

  const doSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/template/${editingId}` : '/api/template';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, credentials: 'include',
        body: JSON.stringify(form),
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-bg border border-brd rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-brd">
              <h2 className="text-base font-semibold">{editingId ? 'Edit Template' : 'Add Template'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-glass text-tx3"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="label-sm mb-1">Name *</label>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-1">ONU Type</label>
                  <input value={form.onu_type} onChange={e => setForm({ ...form, onu_type: e.target.value })} className="input-field" placeholder="ZTE-F609, All, etc." />
                </div>
                <div>
                  <label className="label-sm mb-1">VLAN</label>
                  <input type="number" value={form.vlan} onChange={e => setForm({ ...form, vlan: Number(e.target.value) })} className="input-field" placeholder="100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-1">TCONT Profile</label>
                  <input value={form.tcont_profile} onChange={e => setForm({ ...form, tcont_profile: e.target.value })} className="input-field" placeholder="1G, 500M, etc." />
                </div>
                <div>
                  <label className="label-sm mb-1">Traffic Profile</label>
                  <input value={form.traffic_profile} onChange={e => setForm({ ...form, traffic_profile: e.target.value })} className="input-field" placeholder="100M, etc." />
                </div>
              </div>
              <div>
                <label className="label-sm mb-1">Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" placeholder="Brief description" />
              </div>
              <div>
                <label className="label-sm mb-1">Service Type (for RegisterWizard)</label>
                <select value={form.config} onChange={e => setForm({ ...form, config: e.target.value })} className="input-field">
                  <option value="">— None (basic config only) —</option>
                  {SERVICE_TYPES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
                <p className="text-xs text-tx3 mt-1">Selecting a service type allows this template to be loaded in RegisterWizard to pre-fill configuration.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-brd">
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
