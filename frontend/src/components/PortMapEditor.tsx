import { Plus, Trash2 } from 'lucide-react';

/**
 * Per-port LAN/WiFi VLAN map editor.
 *
 * Produces extra.port_map rows consumed by both provisioning backends:
 *   { port: 'eth_0/1'|'wifi_0/1'|'veip_1'|..., mode: 'skip'|'tag'|'untag'|'trunk'|'hybrid', vlan?: '30' }
 *
 * Emitted CLI (ZTE pon-onu-mng):
 *   vlan port <port> mode tag vlan <vlan>      (tag)
 *   vlan port <port> mode untag              (untag)
 *   vlan port <port> mode trunk              (trunk)
 *   vlan port <port> mode hybrid def-vlan <vlan>  (hybrid)
 *   'skip' → no command at all (ONT keeps its default).
 */

export interface PortMapRow {
  port: string;
  mode: string;
  vlan: string;
}

interface PortMapEditorProps {
  value: PortMapRow[];
  onChange: (rows: PortMapRow[]) => void;
  /** include wifi_0/1,2,5,6 + veip_1 in the port dropdown */
  includeWifi?: boolean;
  /** when provided, the VLAN cell becomes a dropdown of known OLT VLANs */
  vlanList?: Array<{ vlan_id: number | string; name: string }>;
}

const ETH_PORTS = ['eth_0/1', 'eth_0/2', 'eth_0/3', 'eth_0/4'];
const WIFI_PORTS = ['wifi_0/1', 'wifi_0/2', 'wifi_0/5', 'wifi_0/6'];
const VEIP_PORTS = ['veip_1'];

const MODES: Array<{ v: string; l: string }> = [
  { v: 'skip', l: 'Skip' },
  { v: 'tag', l: 'Tag' },
  { v: 'untag', l: 'Untag' },
  { v: 'trunk', l: 'Trunk' },
  { v: 'hybrid', l: 'Hybrid' },
];

export function PortMapEditor({ value, onChange, includeWifi = false, vlanList }: PortMapEditorProps) {
  const ports = [...ETH_PORTS, ...(includeWifi ? [...WIFI_PORTS, ...VEIP_PORTS] : [])];
  const rows = Array.isArray(value) ? value : [];

  const setRow = (i: number, patch: Partial<PortMapRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const addRow = () => {
    const free = ports.find(p => !rows.some(r => r.port === p)) || ports[0];
    onChange([...rows, { port: free, mode: 'tag', vlan: '' }]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label-sm">Port VLAN Map</label>
        <button type="button" onClick={addRow}
          className="px-2 py-1 text-xs rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors flex items-center gap-1">
          <Plus size={12} /> Add Port
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-[10px] text-tx3">Empty = no explicit port config (ports keep ONT defaults / existing auto-tag).</p>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select value={r.port || ''} onChange={e => setRow(i, { port: e.target.value })}
              className="input-field !h-8 !text-xs w-28 flex-shrink-0">
              {ports.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={r.mode || 'tag'} onChange={e => setRow(i, { mode: e.target.value })}
              className="input-field !h-8 !text-xs w-24 flex-shrink-0">
              {MODES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
            {(r.mode === 'tag' || r.mode === 'hybrid') && (
              vlanList && vlanList.length > 0 ? (
                <select value={r.vlan || ''} onChange={e => setRow(i, { vlan: e.target.value })}
                  className="input-field !h-8 !text-xs flex-1 min-w-[90px]">
                  <option value="">VLAN...</option>
                  {vlanList.map(v => <option key={v.vlan_id} value={String(v.vlan_id)}>{v.vlan_id} — {v.name || '(unnamed)'}</option>)}
                </select>
              ) : (
                <input type="number" value={r.vlan || ''} placeholder={r.mode === 'hybrid' ? 'def-vlan' : 'VLAN'}
                  onChange={e => setRow(i, { vlan: e.target.value })}
                  min={1} max={4094}
                  className="input-field !h-8 !text-xs flex-1 min-w-[90px]" />
              )
            )}
            <button type="button" onClick={() => removeRow(i)}
              className="p-1.5 rounded text-danger hover:bg-danger/10 flex-shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PortMapEditor;
