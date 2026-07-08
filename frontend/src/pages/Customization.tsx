import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type RxColorRange } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import {
  Eye, EyeOff, Monitor, Smartphone, Save, ArrowUp, ArrowDown,
  RotateCcw, Signal, AlertTriangle, CheckCircle, AlertCircle, Palette, Plus, Trash2
} from 'lucide-react';

interface Column { id: string; column_name: string; column_key: string; visible_desktop: boolean; visible_mobile: boolean; sort_order: number; }

const PREVIEW_DATA = [
  { olt: 'OLT-SMG', name: 'Customer-001', desc: 'Pelanggan Semarang', pppoe: 'user001@isp', onu_id: '1/1/1:1', status: 'online', rx_olt: '-12.5 dBm', rx_onu: '-18.2 dBm', sn: 'HWTC12345678', type: 'HG8245H' },
  { olt: 'OLT-KMT', name: 'Customer-002', desc: 'Pelanggan Kalimantan', pppoe: 'corp002@isp', onu_id: '1/1/2:1', status: 'offline', rx_olt: 'N/A', rx_onu: 'N/A', sn: 'ZTEG87654321', type: 'F670L' },
  { olt: 'OLT-MKS', name: 'Customer-003', desc: 'Pelanggan Makasar', pppoe: 'soho003@isp', onu_id: '1/1/3:1', status: 'los', rx_olt: 'N/A', rx_onu: 'N/A', sn: 'HWTC11223344', type: 'HG8245Q2' },
  { olt: 'OLT-JKT', name: 'Customer-004', desc: 'Pelanggan Jakarta', pppoe: 'soho004@isp', onu_id: '1/1/4:1', status: 'dyinggasp', rx_olt: 'N/A', rx_onu: 'N/A', sn: 'ZTEC11221122', type: 'F660V8.0' },
];

const STATUS_STYLES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  online: { label: 'Online', color: 'text-success', icon: <CheckCircle size={12} /> },
  offline: { label: 'Offline', color: 'text-tx3', icon: <AlertCircle size={12} /> },
  los: { label: 'LOS', color: 'text-danger', icon: <AlertTriangle size={12} /> },
  dyinggasp: { label: 'DyingGasp', color: 'text-warning', icon: <AlertTriangle size={12} /> },
};

function getCellValue(key: string, row: typeof PREVIEW_DATA[0]) {
  const map: Record<string, string> = {
    olt_name: row.olt, name: row.name, description: row.desc, pppoe: row.pppoe,
    onu_id_str: row.onu_id, status: row.status, rx_power: row.rx_olt, onu_rx_power: row.rx_onu,
    serial_number: row.sn, actual_type: row.type,
  };
  return map[key] || '';
}

export function Customization() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'desktop' | 'mobile' | 'signal' | 'rxcolors'>('desktop');
  const [localColumns, setLocalColumns] = useState<Column[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customization'],
    queryFn: async () => {
      const res = await fetch('/api/customization/columns', { credentials: 'include' });
      if (!res.ok) return { columns: [] };
      return res.json() as Promise<{ columns: Column[] }>;
    },
  });

  useEffect(() => {
    if (data?.columns) {
      setLocalColumns(data.columns);
      setHasChanges(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (columns: Column[]) => {
      const res = await fetch('/api/customization/column', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ columns: columns.map((c, i) => ({ name: c.column_name, key: c.column_key, desktop: c.visible_desktop, mobile: c.visible_mobile, sort_order: i })) }),
      });
      if (!res.ok) throw new Error('Save failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customization'] });
      toast.success('Column settings saved');
      setHasChanges(false);
    },
    onError: () => toast.error('Failed to save'),
  });

  const toggleVisibility = (id: string, field: 'visible_desktop' | 'visible_mobile') => {
    setLocalColumns(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, [field]: !c[field] } : c);
      setHasChanges(true);
      return updated;
    });
  };

  const moveColumn = (id: string, dir: 'up' | 'down') => {
    setLocalColumns(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx < 0) return prev;
      const newIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      updated.forEach((c, i) => c.sort_order = i);
      setHasChanges(true);
      return updated;
    });
  };

  const handleSave = () => {
    saveMutation.mutate(localColumns);
  };

  if (isLoading) return <div className="animate-pulse glass-card h-64" />;

  const columns = localColumns;
  const desktopColumns = columns.filter(c => c.visible_desktop);
  const mobileColumns = columns.filter(c => c.visible_mobile);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Customization</h1>
        <p className="text-tx2 text-xs md:text-sm mt-1">All ONUs Custom Page</p>
      </div>

      {/* Tabs */}
      <div className="glass-card overflow-hidden">
        <div className="flex border-b border-brd overflow-x-auto">
          <button onClick={() => setActiveTab('desktop')}
            className={cn('flex items-center gap-1.5 md:gap-2 px-3 md:px-6 py-3 text-xs md:text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === 'desktop' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-tx3 hover:text-tx1')}>
            <Monitor size={16} /> Desktop
          </button>
          <button onClick={() => setActiveTab('mobile')}
            className={cn('flex items-center gap-1.5 md:gap-2 px-3 md:px-6 py-3 text-xs md:text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === 'mobile' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-tx3 hover:text-tx1')}>
            <Smartphone size={16} /> Mobile
          </button>
          <button onClick={() => setActiveTab('signal')}
            className={cn('flex items-center gap-1.5 md:gap-2 px-3 md:px-6 py-3 text-xs md:text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === 'signal' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-tx3 hover:text-tx1')}>
            <Signal size={16} /> Signal Filter
          </button>
          <button onClick={() => setActiveTab('rxcolors')}
            className={cn('flex items-center gap-1.5 md:gap-2 px-3 md:px-6 py-3 text-xs md:text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === 'rxcolors' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-tx3 hover:text-tx1')}>
            <Palette size={16} /> RX Colors
          </button>
        </div>

        {/* Desktop Table Tab */}
        {activeTab === 'desktop' && (
          <div className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Monitor size={16} className="text-accent" /> Desktop ONUs Table</h3>
              <button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50">
                <Save size={14} /> Save Changes
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brd">
                    <th className="px-3 py-2 text-left text-xs font-medium text-tx3 uppercase">Column</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-tx3 uppercase">Visible</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-tx3 uppercase">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c, idx) => (
                    <tr key={c.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                      <td className="px-3 py-2.5 font-medium">{c.column_name}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => toggleVisibility(c.id, 'visible_desktop')}
                          className={cn('p-1.5 rounded-lg transition-colors', c.visible_desktop ? 'text-success bg-success/10' : 'text-tx3 bg-glass')}>
                          {c.visible_desktop ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => moveColumn(c.id, 'up')} disabled={idx === 0}
                            className="p-1 rounded hover:bg-glass text-tx3 disabled:opacity-30 transition-colors">
                            <ArrowUp size={14} />
                          </button>
                          <button onClick={() => moveColumn(c.id, 'down')} disabled={idx === columns.length - 1}
                            className="p-1 rounded hover:bg-glass text-tx3 disabled:opacity-30 transition-colors">
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Preview Table */}
            <div className="mt-6">
              <div className="text-xs text-tx3 mb-2 font-medium uppercase tracking-wide">Preview</div>
              <div className="overflow-x-auto rounded-lg border border-brd">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-glass border-b border-brd">
                      {desktopColumns.map(c => (
                        <th key={c.id} className="px-3 py-2 text-left font-medium text-tx3">{c.column_name}</th>
                      ))}
                      <th className="px-3 py-2 text-left font-medium text-tx3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PREVIEW_DATA.map((row, i) => (
                      <tr key={i} className="border-b border-brd/30">
                        {desktopColumns.map(c => {
                          const val = getCellValue(c.column_key, row);
                          if (c.column_key === 'status') {
                            const st = STATUS_STYLES[row.status] || STATUS_STYLES.offline;
                            return <td key={c.id} className="px-3 py-2"><span className={cn('inline-flex items-center gap-1', st.color)}>{st.icon} {st.label}</span></td>;
                          }
                          if (c.column_key === 'rx_power' || c.column_key === 'onu_rx_power') {
                            return <td key={c.id} className="px-3 py-2"><span className={cn('inline-flex items-center gap-1', val === 'N/A' ? 'text-tx3' : 'text-info')}><Signal size={10} /> {val}</span></td>;
                          }
                          if (c.column_key === 'onu_id_str') {
                            return <td key={c.id} className="px-3 py-2"><code className="text-tx2 font-mono">{val}</code></td>;
                          }
                          return <td key={c.id} className="px-3 py-2 text-tx2">{val}</td>;
                        })}
                        <td className="px-3 py-2"><span className="text-accent text-[10px]">Setting</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Table Tab */}
        {activeTab === 'mobile' && (
          <div className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Smartphone size={16} className="text-accent" /> Mobile ONUs Table</h3>
              <button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50">
                <Save size={14} /> Save Changes
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brd">
                    <th className="px-3 py-2 text-left text-xs font-medium text-tx3 uppercase">Column</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-tx3 uppercase">Visible</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-tx3 uppercase">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c, idx) => (
                    <tr key={c.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                      <td className="px-3 py-2.5 font-medium">{c.column_name}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => toggleVisibility(c.id, 'visible_mobile')}
                          className={cn('p-1.5 rounded-lg transition-colors', c.visible_mobile ? 'text-success bg-success/10' : 'text-tx3 bg-glass')}>
                          {c.visible_mobile ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => moveColumn(c.id, 'up')} disabled={idx === 0}
                            className="p-1 rounded hover:bg-glass text-tx3 disabled:opacity-30 transition-colors">
                            <ArrowUp size={14} />
                          </button>
                          <button onClick={() => moveColumn(c.id, 'down')} disabled={idx === columns.length - 1}
                            className="p-1 rounded hover:bg-glass text-tx3 disabled:opacity-30 transition-colors">
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Preview Cards */}
            <div className="mt-6">
              <div className="text-xs text-tx3 mb-2 font-medium uppercase tracking-wide">Preview (Mobile Cards)</div>
              <div className="space-y-2 md:max-w-sm">
                {PREVIEW_DATA.map((row, i) => (
                  <div key={i} className="glass-card p-3 rounded-lg border border-brd/50">
                    <div className="flex items-center justify-between mb-2">
                      {mobileColumns.find(c => c.column_key === 'name') && (
                        <span className="font-medium text-sm">{row.name}</span>
                      )}
                      {mobileColumns.find(c => c.column_key === 'status') && (
                        <span className={cn('inline-flex items-center gap-1 text-xs', STATUS_STYLES[row.status].color)}>
                          {STATUS_STYLES[row.status].icon} {STATUS_STYLES[row.status].label}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {mobileColumns.filter(c => c.column_key !== 'name' && c.column_key !== 'status').map(c => (
                        <div key={c.id}>
                          <span className="text-tx3">{c.column_name}:</span>{' '}
                          <span className="text-tx2">{getCellValue(c.column_key, row)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Signal Filter Tab */}
        {activeTab === 'signal' && (
          <SignalFilterTab />
        )}

        {/* RX Colors Tab */}
        {activeTab === 'rxcolors' && (
          <RxColorsTab />
        )}
      </div>
    </div>
  );
}

function SignalFilterTab() {
  const MIN_VAL = -32;
  const MAX_VAL = -20;
  const DEFAULT_CRITICAL = -28.0;
  const DEFAULT_GOOD = -26.0;

  const { data, isLoading } = useQuery({
    queryKey: ['signal-filter'],
    queryFn: async () => {
      const res = await fetch('/api/customization/signal-filter', { credentials: 'include' });
      if (!res.ok) return { critical_threshold: DEFAULT_CRITICAL, good_threshold: DEFAULT_GOOD };
      return res.json();
    },
  });

  const [critical, setCritical] = useState(DEFAULT_CRITICAL);
  const [good, setGood] = useState(DEFAULT_GOOD);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setCritical(data.critical_threshold ?? DEFAULT_CRITICAL);
      setGood(data.good_threshold ?? DEFAULT_GOOD);
      setHasChanges(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/customization/signal-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ critical_threshold: critical, good_threshold: good }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Save failed');
      }
    },
    onSuccess: () => { toast.success('Signal filter thresholds saved'); setHasChanges(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 animate-pulse h-40 glass-card" />;

  const range = MAX_VAL - MIN_VAL;
  const criticalPct = ((critical - MIN_VAL) / range) * 100;
  const goodPct = ((good - MIN_VAL) / range) * 100;

  const scaleValues = [];
  for (let v = MIN_VAL; v <= MAX_VAL; v += 2) scaleValues.push(v);

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Signal size={16} className="text-accent" /> ONU Signal Filter</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => { setCritical(DEFAULT_CRITICAL); setGood(DEFAULT_GOOD); setHasChanges(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass hover:bg-glass/70 text-tx2 text-sm font-medium transition-all">
            <RotateCcw size={14} /> Default
          </button>
          <button onClick={() => saveMutation.mutate()} disabled={!hasChanges || saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50">
            <Save size={14} /> Apply
          </button>
        </div>
      </div>

      {/* Slider Visualization */}
      <div className="mb-8">
        {/* Zone labels */}
        <div className="flex justify-between text-xs font-medium mb-2">
          <span className="text-danger">Critical</span>
          <span className="text-warning">Warning</span>
          <span className="text-success">Good</span>
        </div>

        {/* Slider bar */}
        <div className="relative h-8 rounded-lg overflow-hidden">
          {/* Critical zone */}
          <div className="absolute inset-y-0 left-0 bg-danger/20" style={{ width: `${criticalPct}%` }} />
          {/* Warning zone */}
          <div className="absolute inset-y-0 bg-warning/20" style={{ left: `${criticalPct}%`, width: `${goodPct - criticalPct}%` }} />
          {/* Good zone */}
          <div className="absolute inset-y-0 right-0 bg-success/20" style={{ width: `${100 - goodPct}%` }} />

          {/* Critical threshold handle */}
          <div className="absolute inset-y-0 flex flex-col items-center justify-center" style={{ left: `calc(${criticalPct}% - 10px)` }}>
            <div className="w-5 h-5 rounded-full bg-danger border-2 border-white shadow-lg cursor-ew-resize" />
          </div>
          {/* Good threshold handle */}
          <div className="absolute inset-y-0 flex flex-col items-center justify-center" style={{ left: `calc(${goodPct}% - 10px)` }}>
            <div className="w-5 h-5 rounded-full bg-success border-2 border-white shadow-lg cursor-ew-resize" />
          </div>
        </div>

        {/* Drag labels */}
        <div className="flex justify-between mt-2 text-[10px] text-tx3">
          <span>Drag to adjust Critical threshold</span>
          <span>Drag to adjust Good threshold</span>
        </div>

        {/* Scale */}
        <div className="flex justify-between mt-3 text-[9px] md:text-[10px] text-tx3 overflow-x-auto">
          {scaleValues.map(v => <span key={v} className="whitespace-nowrap">{v}</span>)}
        </div>

        {/* Current values */}
        <div className="flex justify-center gap-4 md:gap-8 mt-4">
          <div className="text-center">
            <div className="text-xl md:text-2xl font-bold text-danger">{critical.toFixed(1)} dBm</div>
            <div className="text-[10px] text-tx3 mt-0.5">Critical threshold</div>
          </div>
          <div className="text-center">
            <div className="text-xl md:text-2xl font-bold text-success">{good.toFixed(1)} dBm</div>
            <div className="text-[10px] text-tx3 mt-0.5">Good threshold</div>
          </div>
        </div>
      </div>

      {/* Range inputs for precise control */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="text-xs text-tx3 mb-1 block">Critical Threshold (dBm)</label>
          <input type="number" step="0.5" value={critical} min={MIN_VAL} max={good - 0.5}
            onChange={e => { setCritical(parseFloat(e.target.value)); setHasChanges(true); }}
            className="w-full px-3 py-2 rounded-lg bg-glass border border-brd text-sm focus:border-accent focus:outline-none" />
        </div>
        <div>
          <label className="text-xs text-tx3 mb-1 block">Good Threshold (dBm)</label>
          <input type="number" step="0.5" value={good} min={critical + 0.5} max={MAX_VAL}
            onChange={e => { setGood(parseFloat(e.target.value)); setHasChanges(true); }}
            className="w-full px-3 py-2 rounded-lg bg-glass border border-brd text-sm focus:border-accent focus:outline-none" />
        </div>
      </div>

      {/* Zone descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-card p-4 rounded-lg border border-success/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-success" />
            <h4 className="text-sm font-semibold text-success">Good</h4>
          </div>
          <p className="text-xs text-tx2">Signal power is optimal when it's greater than or equal to {good.toFixed(1)} dBm</p>
        </div>
        <div className="glass-card p-4 rounded-lg border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-warning" />
            <h4 className="text-sm font-semibold text-warning">Warning</h4>
          </div>
          <p className="text-xs text-tx2">Signal is acceptable but needs monitoring when between {critical.toFixed(1)} dBm and {good.toFixed(1)} dBm</p>
        </div>
        <div className="glass-card p-4 rounded-lg border border-danger/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={16} className="text-danger" />
            <h4 className="text-sm font-semibold text-danger">Critical</h4>
          </div>
          <p className="text-xs text-tx2">Signal is poor and needs attention when less than {critical.toFixed(1)} dBm</p>
        </div>
      </div>
    </div>
  );
}

function RxColorsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['rx-colors'], queryFn: api.getRxColors });
  const [ranges, setRanges] = useState<RxColorRange[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data?.ranges) { setRanges(data.ranges); setHasChanges(false); }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.saveRxColors(ranges),
    onSuccess: () => { toast.success('RX color ranges saved'); queryClient.invalidateQueries({ queryKey: ['rx-colors'] }); setHasChanges(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const colorOptions = [
    { value: 'green', label: 'Green', class: 'bg-success/10 text-success' },
    { value: 'yellow', label: 'Yellow', class: 'bg-warning/10 text-warning' },
    { value: 'red', label: 'Red', class: 'bg-danger/10 text-danger' },
    { value: 'blue', label: 'Blue', class: 'bg-blue-500/10 text-blue-400' },
    { value: 'purple', label: 'Purple', class: 'bg-purple-500/10 text-purple-400' },
    { value: 'orange', label: 'Orange', class: 'bg-orange-500/10 text-orange-400' },
    { value: 'gray', label: 'Gray', class: 'bg-gray-500/10 text-gray-400' },
  ];

  const updateRange = (i: number, field: keyof RxColorRange, value: string | number) => {
    const next = [...ranges];
    next[i] = { ...next[i], [field]: value };
    setRanges(next); setHasChanges(true);
  };

  const addRange = () => {
    setRanges([...ranges, { min: -99, max: -30, color: 'gray', label: '' }]);
    setHasChanges(true);
  };

  const removeRange = (i: number) => {
    setRanges(ranges.filter((_, idx) => idx !== i));
    setHasChanges(true);
  };

  if (isLoading) return <div className="p-6 text-tx3 text-sm">Loading...</div>;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Palette size={16} className="text-accent" /> RX Power Color Ranges</h3>
        <div className="flex items-center gap-2">
          <button onClick={addRange}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass hover:bg-glass/70 text-tx2 text-sm font-medium transition-all">
            <Plus size={14} /> Add Range
          </button>
          <button onClick={() => saveMutation.mutate()} disabled={!hasChanges || saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50">
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <p className="text-xs text-tx3 mb-4">Set color ranges for RX ONU power values. Each range defines a min and max dBm value with a color. Values within that range will be displayed with the corresponding color in the All ONUs table.</p>

      <div className="space-y-3">
        {ranges.map((r, i) => {
          const colorOpt = colorOptions.find(c => c.value === r.color);
          return (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-glass border border-brd">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0', colorOpt?.class || colorOptions[2].class)}>
                {i + 1}
              </div>
              <div className="grid grid-cols-2 gap-2 flex-1">
                <div>
                  <label className="text-[10px] text-tx3 block mb-0.5">Min (dBm)</label>
                  <input type="number" step="0.5" value={r.min}
                    onChange={e => updateRange(i, 'min', parseFloat(e.target.value))}
                    className="w-full px-2 py-1.5 rounded-lg bg-glass border border-brd text-sm focus:border-accent focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-tx3 block mb-0.5">Max (dBm)</label>
                  <input type="number" step="0.5" value={r.max}
                    onChange={e => updateRange(i, 'max', parseFloat(e.target.value))}
                    className="w-full px-2 py-1.5 rounded-lg bg-glass border border-brd text-sm focus:border-accent focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-tx3 block mb-0.5">Color</label>
                <select value={r.color} onChange={e => updateRange(i, 'color', e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-glass border border-brd text-sm focus:border-accent focus:outline-none">
                  {colorOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-tx3 block mb-0.5">Label</label>
                <input type="text" value={r.label || ''} placeholder="e.g. Good"
                  onChange={e => updateRange(i, 'label', e.target.value)}
                  className="w-24 px-2 py-1.5 rounded-lg bg-glass border border-brd text-sm focus:border-accent focus:outline-none" />
              </div>
              <button onClick={() => removeRange(i)}
                className="p-2 rounded-lg hover:bg-danger/10 text-tx3 hover:text-danger transition-colors flex-shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Preview */}
      <div className="mt-6">
        <h4 className="text-xs font-semibold text-tx3 uppercase mb-3">Preview</h4>
        <div className="flex flex-wrap gap-2">
          {[-15, -18, -20, -22, -24, -25, -26, -27, -28, -29, -30, -32].map(val => {
            let colorClass = 'bg-gray-500/10 text-gray-400';
            for (const r of ranges) {
              if (val >= r.min && val < r.max) {
                const opt = colorOptions.find(c => c.value === r.color);
                colorClass = opt?.class || colorClass;
                break;
              }
            }
            return (
              <span key={val} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-mono font-medium', colorClass)}>
                {val.toFixed(2)} dBm
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
