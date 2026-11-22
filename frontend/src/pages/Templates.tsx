import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type OltInfo } from '../lib/api';
import {
  Blocks, Wifi, Radio, Server, Network, Router,
  Layers, ArrowRight, Check, Plus, Edit3, Trash2, Loader2
} from 'lucide-react';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { cn } from '../lib/utils';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, Modal, Select } from '../components/ui';

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
  const { t } = useTranslation();
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
    if (!form.name.trim()) { toast.error(t('pg_templates.nameIsRequired')); return; }
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
      } else { toast.error(data.message || t('pg_templates.saveFailed')); }
    } catch { toast.error(t('pg_templates.networkError')); }
    setSaving(false);
  };

  const doDelete = async (tpl: DbTemplate) => {
    const ok = await confirm({ title: t('pg_templates.deleteTemplate'), message: t('pg_templates.deleteMsg', { name: tpl.name }), confirmLabel: t('pg_templates.delete'), variant: 'danger' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/template/${tpl.id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' }, credentials: 'include' });
      const data = await res.json();
      if (data.success) { toast.success(t('pg_templates.templateDeleted')); fetchTemplates(); }
      else toast.error(t('pg_templates.failedToDelete'));
    } catch { toast.error(t('pg_templates.networkError')); }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('pg_templates.onuTemplates')}
        description={t('pg_templates.onuConfigurationTemplatesFor')}
        action={
          <>
            <Button variant="primary" icon={<Plus size={16} />} onClick={openAdd}>
              Add Template
            </Button>
            <Link to="/dashboard/onus/register" className="btn-cancel border border-brd flex items-center gap-2 text-sm">
              <ArrowRight size={16} />
              Register ONU
            </Link>
          </>
        }
      />

      {/* Built-in Template Cards */}
      <div>
        <h2 className="text-sm font-semibold text-tx3 uppercase tracking-wider mb-3">{t('pg_templates.builtInTemplates')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {templates.map(tpl => (
            <Card
              key={tpl.id}
              onClick={() => setSelected(selected === tpl.id ? null : tpl.id)}
              className={cn(
                'cursor-pointer transition-all hover:border-accent/40',
                selected === tpl.id ? 'border-accent bg-accent/5' : '',
              )}
              bodyClassName="p-3 md:p-4"
            >
              <div className="flex items-start gap-2.5 md:gap-3">
                <div className={`p-2 rounded-lg bg-glass flex-shrink-0 ${tpl.color}`}>{tpl.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{tpl.name}</h3>
                  <p className="text-xs text-tx3 mt-1 line-clamp-2">{t(`pg_templates.builtin_${tpl.id}`)}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tpl.serviceTypes.map(st => (
                      <span key={st} className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">{st}</span>
                    ))}
                    {tpl.ssidSupport && <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">SSID</span>}
                    {tpl.tr069Support && <span className="px-1.5 py-0.5 rounded text-[10px] bg-glass border border-brd text-tx3">TR069</span>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Custom (DB) Templates */}
      <div>
        <h2 className="text-sm font-semibold text-tx3 uppercase tracking-wider mb-3">{t('pg_templates.customTemplates')}</h2>
        {loadingDb ? (
          <div className="flex items-center gap-2 text-tx3 text-sm py-4"><Loader2 size={16} className="animate-spin" /> {t('pg_templates.loading')}</div>
        ) : dbTemplates.length === 0 ? (
          <EmptyState title={t('pg_templates.noCustomTemplatesYet')} description='Click "Add Template" to create one.' />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {dbTemplates.map(t => (
              <Card key={t.id} bodyClassName="p-3 md:p-4">
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
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedTemplate && (
        <Card className="border-accent/20 animate-fade-in" bodyClassName="p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2.5 md:gap-3">
            <div className={`p-2.5 md:p-3 rounded-lg bg-glass flex-shrink-0 ${selectedTemplate.color}`}>{selectedTemplate.icon}</div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-bold truncate">{selectedTemplate.name}</h2>
              <p className="text-xs md:text-sm text-tx3">{t(`pg_templates.builtin_${selectedTemplate.id}`)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {/* Features */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-tx3 uppercase tracking-wider">{t('pg_templates.features')}</h4>
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
              <h4 className="text-xs font-semibold text-tx3 uppercase tracking-wider">{t('pg_templates.serviceTypes')}</h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.serviceTypes.map(st => (
                  <span key={st} className="px-2 py-1 rounded-lg text-xs bg-glass border border-brd">{st}</span>
                ))}
              </div>
            </div>

            {/* WAN Modes */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-tx3 uppercase tracking-wider">{t('pg_templates.wanModes')}</h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.wanModes.map(wm => (
                  <span key={wm} className="px-2 py-1 rounded-lg text-xs bg-glass border border-brd">{wm}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 md:gap-4 mt-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${selectedTemplate.ssidSupport ? 'bg-success' : 'bg-tx3/30'}`} />
                  <span className="text-xs">{t('pg_templates.ssidSupport')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${selectedTemplate.tr069Support ? 'bg-success' : 'bg-tx3/30'}`} />
                  <span className="text-xs">{t('pg_templates.tr069Support')}</span>
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
        </Card>
      )}

      {/* Add/Edit Template Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Template' : 'Add Template'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>{t('pg_templates.cancel')}</Button>
            <Button variant="primary" icon={<Check size={14} />} onClick={doSave} loading={saving}>
              {editingId ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
              {/* Basic Info */}
              <div>
                <label className="label-sm mb-1">{t('pg_templates.templateName')}</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder={t('pg_templates.eGZteF609')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm mb-1">Vendor</label>
                  <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className="input-field" placeholder={t('pg_templates.zteHuaweiEtc')} />
                </div>
                <div>
                  <label className="label-sm mb-1">Model</label>
                  <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="input-field" placeholder={t('pg_templates.f609Etc')} />
                </div>
              </div>
              <div>
                <label className="label-sm mb-1">{t('pg_templates.description')}</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" placeholder={t('pg_templates.briefDescription')} />
              </div>

              <div className="pt-2">
                <div className="text-xs font-semibold text-tx3 uppercase tracking-wider mb-3">{t('pg_templates.oltConfiguration')}</div>
              </div>

              {/* OLT Selector — fetch actual data */}
              <div>
                <Select
                  label={<>{t('pg_templates.sourceOltForActual')} <span className="text-tx3 text-xs font-normal normal-case">{t('pg_templates.optional')}</span></>}
                  value={selectedOltId}
                  onChange={e => setSelectedOltId(Number(e.target.value))}
                  options={[
                    { value: '0', label: t('pg_templates.selectOltToLoad') },
                    ...olts.map(o => ({ value: String(o.id), label: `${o.name} (${o.ip_address})` })),
                  ]}
                />
                {fetchingOltData && <p className="text-xs text-tx3 mt-1 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {t('pg_templates.loadingOltData')}</p>}
                {selectedOltId > 0 && !fetchingOltData && (
                  <p className="text-xs text-tx3 mt-1">{onuTypes.length} ONU types, {tcontProfiles.length} TCONT, {trafficProfiles.length} traffic, {vlanList.length} VLANs</p>
                )}
              </div>

              {/* Service Template */}
              <div>
                <label className="label-sm mb-2">{t('pg_templates.serviceTemplate')}</label>
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
                {onuTypes.length > 0 ? (
                  <Select
                    label="ONU Type"
                    value={cfg.onu_type}
                    onChange={e => setCfg({ ...cfg, onu_type: e.target.value })}
                    options={[
                      { value: 'All', label: t('pg_templates.allAutoDetect') },
                      ...onuTypes.map(t => ({ value: t, label: t })),
                    ]}
                  />
                ) : (
                  <>
                    <label className="label-sm mb-1.5">ONU Type</label>
                    <input value={cfg.onu_type} onChange={e => setCfg({ ...cfg, onu_type: e.target.value })} className="input-field" placeholder={t('pg_templates.zteF609AllEtc')} />
                  </>
                )}
              </div>

              {/* TCONT + Traffic Profiles */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  {tcontProfiles.length > 0 ? (
                    <Select
                      label={<>TCONT Profile <span className="text-tx3 text-xs font-normal normal-case">(Upload)</span></>}
                      value={cfg.tcont_profile}
                      onChange={e => setCfg({ ...cfg, tcont_profile: e.target.value })}
                      options={[
                        { value: '', label: t('pg_templates.selectProfile') },
                        ...tcontProfiles.map(p => ({ value: p, label: p })),
                      ]}
                    />
                  ) : (
                    <>
                      <label className="label-sm mb-1.5">TCONT Profile <span className="text-tx3 text-xs">(Upload)</span></label>
                      <input value={cfg.tcont_profile} onChange={e => setCfg({ ...cfg, tcont_profile: e.target.value })} className="input-field" placeholder={t('pg_templates.1g500mEtc')} />
                    </>
                  )}
                </div>
                <div>
                  {trafficProfiles.length > 0 ? (
                    <Select
                      label={<>Traffic Profile <span className="text-tx3 text-xs font-normal normal-case">(Download)</span></>}
                      value={cfg.traffic_profile}
                      onChange={e => setCfg({ ...cfg, traffic_profile: e.target.value })}
                      options={[
                        { value: '', label: t('pg_templates.noneNoDlLimit') },
                        ...trafficProfiles.map(p => ({ value: p, label: p })),
                      ]}
                    />
                  ) : (
                    <>
                      <label className="label-sm mb-1.5">Traffic Profile <span className="text-tx3 text-xs">(Download)</span></label>
                      <input value={cfg.traffic_profile} onChange={e => setCfg({ ...cfg, traffic_profile: e.target.value })} className="input-field" placeholder={t('pg_templates.100mEtc')} />
                    </>
                  )}
                </div>
              </div>

              {/* VLAN */}
              <div>
                {vlanList.length > 0 ? (
                  <Select
                    label="VLAN ID"
                    value={cfg.vlan}
                    onChange={e => setCfg({ ...cfg, vlan: parseInt(e.target.value) || 100 })}
                    options={[
                      { value: '100', label: '100 (default)' },
                      ...vlanList.map(v => ({ value: String(v.vlan_id), label: `${v.vlan_id} — ${v.name || '(unnamed)'}` })),
                    ]}
                  />
                ) : (
                  <>
                    <label className="label-sm mb-1.5">VLAN ID</label>
                    <input type="number" min={1} max={4094} value={cfg.vlan} onChange={e => setCfg({ ...cfg, vlan: parseInt(e.target.value) || 100 })} className="input-field" placeholder="100" />
                  </>
                )}
              </div>

              {/* Template-specific config */}
              {cfg.template !== 'bridge' && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-tx3 uppercase tracking-wider mb-3">{t('pg_templates.serviceConfiguration')}</div>
                </div>
              )}

              {/* Template-specific: PPPoE */}
              {cfg.template === 'pppoe' && (
                <div className="p-3 rounded-lg bg-glass border border-accent/20 space-y-3">
                  <h4 className="text-sm font-semibold text-accent">{t('pg_templates.pppoeSettings')}</h4>
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
                    <span className="text-sm font-medium">{t('pg_templates.enablePppoe')}</span>
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
                      <input type="text" value={String(cfg.extra.ssid_name || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid_name: e.target.value } })} className="input-field col-span-2" placeholder={t('pg_templates.ssidName')} />
                      <select value={cfg.extra.ssid_auth || 'wpa2'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid_auth: e.target.value } })} className="input-field">
                        <option value="wpa2">WPA2-PSK</option>
                        <option value="mixed">WPA/WPA2 Mixed</option>
                        <option value="wpa">WPA-PSK</option>
                        <option value="open">Open</option>
                      </select>
                    </div>
                    {cfg.extra.ssid_name && cfg.extra.ssid_auth !== 'open' && (
                      <input type="text" value={String(cfg.extra.ssid_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid_pass: e.target.value } })} className="input-field" placeholder={t('pg_templates.wifiPasswordMin8')} />
                    )}
                  </div>
                  {/* Firewall */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.extra.enable_firewall === 'true'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, enable_firewall: e.target.checked ? 'true' : '' } })} />
                    <span className="text-sm font-medium">{t('pg_templates.enableFirewall')}</span>
                  </label>
                  {cfg.extra.enable_firewall === 'true' && (
                    <select value={cfg.extra.firewall_level || 'low'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, firewall_level: e.target.value } })} className="input-field">
                      <option value="low">{t('pg_templates.low')}</option>
                      <option value="medium">{t('pg_templates.medium')}</option>
                      <option value="high">{t('pg_templates.high')}</option>
                    </select>
                  )}
                  {/* TR069 */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.extra.enable_tr069 === 'true'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, enable_tr069: e.target.checked ? 'true' : '' } })} />
                    <span className="text-sm font-medium">{t('pg_templates.enableTr069Acs')}</span>
                  </label>
                  {cfg.extra.enable_tr069 === 'true' && tr069Profiles.length > 0 && (
                    <select value={cfg.extra.tr069_profile_id || ''} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, tr069_profile_id: e.target.value } })} className="input-field">
                      <option value="">{t('pg_templates.selectProfile2')}</option>
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
                      <input type="text" value={String(cfg.extra.ssid1_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid1_pass: e.target.value } })} className="input-field" placeholder={t('pg_templates.wifiPassword24ghz')} />
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
                      <input type="text" value={String(cfg.extra.ssid2_pass || '')} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, ssid2_pass: e.target.value } })} className="input-field" placeholder={t('pg_templates.wifiPassword5ghz')} />
                    )}
                  </div>
                  {/* TR069 */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.extra.enable_tr069 === 'true'} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, enable_tr069: e.target.checked ? 'true' : '' } })} />
                    <span className="text-sm font-medium">{t('pg_templates.enableTr069Acs')}</span>
                  </label>
                  {cfg.extra.enable_tr069 === 'true' && tr069Profiles.length > 0 && (
                    <select value={cfg.extra.tr069_profile_id || ''} onChange={e => setCfg({ ...cfg, extra: { ...cfg.extra, tr069_profile_id: e.target.value } })} className="input-field">
                      <option value="">{t('pg_templates.selectProfile2')}</option>
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
                        <option value="">{t('pg_templates.selectProfile2')}</option>
                        {tr069Profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.acs_url}</option>)}
                      </select></div>
                  )}
                </div>
              )}
        </div>
      </Modal>
    </PageContainer>
  );
}
