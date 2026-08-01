import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Blocks, Wifi, Radio, Server, Network, Router,
  Layers, ArrowRight, Check
} from 'lucide-react';
import { TutorialBanner } from '../components/TutorialBanner';

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

export default function Templates() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedTemplate = templates.find(t => t.id === selected);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Templates</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">ONU configuration templates for automatic provisioning</p>
        </div>
        <div className="flex items-center gap-2">
          <TutorialBanner
            title="Panduan Templates"
            steps={[
              { title: 'Pilih Template', content: <><p>Pilih template konfigurasi ONU sesuai jenis ONU dan kebutuhan. Klik kartu template untuk melihat detail.</p><p className="text-xs text-tx3 mt-1">Setiap template menampilkan: features, service types, WAN modes, dan SSID support.</p></> },
              { title: 'Register ONU', content: <><p>Setelah memilih template, klik <strong>Register ONU</strong> untuk lanjut ke Register Wizard dengan template yang sudah dipilih.</p><p className="text-xs text-tx3 mt-1">Template akan auto-fill parameter seperti VLAN, WAN mode, WiFi config, dan TR069 settings.</p></> },
            ]}
            tips={
              <>
                <strong className="text-tx2">Tips:</strong>
                <ul className="mt-1 ml-4 space-y-0.5">
                  <li>Template Bridge cocok untuk ONU yang dikelola router eksternal</li>
                  <li>Template ZTE Single/Dual/Multi untuk ZTE ONU dengan WiFi</li>
                  <li>Template Huawei Full untuk Huawei ONU multi-service</li>
                  <li>Template Fiberhome VEIP untuk Fiberhome ONU dengan TR069</li>
                </ul>
              </>
            }
          />
          <Link to="/dashboard/onus/register" className="btn-primary flex items-center gap-2 text-sm">
            <ArrowRight size={16} />
            Register ONU
          </Link>
        </div>
      </div>

      {/* Template Cards */}
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
    </div>
  );
}
