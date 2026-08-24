import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import {
  Server, Search, RefreshCw, Loader2, Radio, Plus, Copy,
  ChevronDown, ChevronRight, Zap, AlertCircle, Wrench,
} from 'lucide-react';

interface UnconfiguredOnu {
  pon_port: string;
  sn: string;
  model?: string;
  vendor?: string;
  onu_id?: number;
  matched_type?: string;
  is_epon?: boolean;
}

interface OltScanResult {
  oltId: number;
  oltName: string;
  oltIp: string;
  oltModel: string;
  isOnline: boolean;
  onus: UnconfiguredOnu[];
  registeredTypes: string[];
  error?: string;
}

export function UnconfiguredOnus() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [scanAll, setScanAll] = useState(false);
  const [results, setResults] = useState<OltScanResult[]>([]);
  const [collapsedOlt, setCollapsedOlt] = useState<Record<number, boolean>>({});
  const [scanningOltIds, setScanningOltIds] = useState<Set<number>>(new Set());
  const [registerMode, setRegisterMode] = useState<'cli' | 'snmp'>('cli');

  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const olts = data?.olts || [];

  const scanOneOlt = useCallback(async (oltId: number): Promise<OltScanResult | null> => {
    const olt = olts.find((o: { id: number }) => o.id === oltId);
    if (!olt) return null;
    try {
      const res = await fetch('/api/scan-unconfigured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ olt_id: oltId, register_mode: registerMode }),
      });
      const d = await res.json();
      if (d.success) {
        return {
          oltId,
          oltName: olt.name,
          oltIp: olt.ip_address,
          oltModel: olt.model || 'ZTE-C320',
          isOnline: olt.is_online,
          onus: d.onus || [],
          registeredTypes: d.registered_types || [],
        };
      }
      return {
        oltId, oltName: olt.name, oltIp: olt.ip_address, oltModel: olt.model || 'ZTE-C320',
        isOnline: olt.is_online, onus: [], registeredTypes: [], error: d.message || 'Scan failed',
      };
    } catch {
      return {
        oltId, oltName: olt.name, oltIp: olt.ip_address, oltModel: olt.model || 'ZTE-C320',
        isOnline: olt.is_online, onus: [], registeredTypes: [], error: 'Connection failed',
      };
    }
  }, [olts]);

  const handleScanAll = async () => {
    if (olts.length === 0) return;
    setScanning(true);
    setScanAll(true);
    setResults([]);
    const allResults: OltScanResult[] = [];
    for (const olt of olts) {
      setScanningOltIds(prev => new Set(prev).add(olt.id));
      const r = await scanOneOlt(olt.id);
      if (r) allResults.push(r);
      setScanningOltIds(prev => { const n = new Set(prev); n.delete(olt.id); return n; });
      setResults([...allResults]);
    }
    const totalOnus = allResults.reduce((sum, r) => sum + r.onus.length, 0);
    if (totalOnus > 0) toast.success(`Found ${totalOnus} unconfigured ONU(s) across ${allResults.length} OLT(s)`);
    else toast.warning('No unconfigured ONUs found');
    setScanning(false);
    setScanAll(false);
  };

  const handleScanOne = async (oltId: number) => {
    setScanningOltIds(prev => new Set(prev).add(oltId));
    const r = await scanOneOlt(oltId);
    if (r) {
      setResults(prev => {
        const idx = prev.findIndex(x => x.oltId === oltId);
        if (idx >= 0) { const n = [...prev]; n[idx] = r; return n; }
        return [...prev, r];
      });
      if (r.onus.length > 0) toast.success(`Found ${r.onus.length} unconfigured ONU(s) on ${r.oltName}`);
      else if (r.error) toast.error(`${r.oltName}: ${r.error}`);
      else toast.warning(`No unconfigured ONUs on ${r.oltName}`);
    }
    setScanningOltIds(prev => { const n = new Set(prev); n.delete(oltId); return n; });
  };

  const totalOnus = results.reduce((sum, r) => sum + r.onus.length, 0);
  const onlineOlts = olts.filter((o: { is_online?: boolean }) => o.is_online).length;

  const copySn = (sn: string) => {
    navigator.clipboard?.writeText(sn);
    toast.success(`Copied: ${sn}`);
  };

  const goToRegister = (oltId: number, onu: UnconfiguredOnu) => {
    navigate('/dashboard/onus/wizard/register', {
      state: {
        prefillOltId: oltId,
        prefillOnu: onu,
        prefillRegisterMode: registerMode,
      },
    });
  };

  const goToPreRegister = () => {
    navigate('/dashboard/onus/wizard/preconfig');
  };

  const toggleOlt = (oltId: number) => {
    setCollapsedOlt(prev => ({ ...prev, [oltId]: !prev[oltId] }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => navigate('/dashboard/onus')}
            className="p-2 rounded-lg hover:bg-glass transition-colors text-tx2 hover:text-tx1 flex-shrink-0">
            <Server size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold truncate">Unconfigured ONUs</h1>
            <p className="text-tx2 text-xs md:text-sm mt-0.5 hidden sm:block">
              Discover and register ONUs across all OLTs
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={handleScanAll} disabled={scanning || olts.length === 0}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-accent text-white text-xs md:text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-all">
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span className="hidden sm:inline">{scanning ? 'Scanning...' : 'Scan All'}</span>
            <span className="sm:hidden">{scanning ? '...' : 'Scan'}</span>
          </button>
          <button onClick={goToPreRegister}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-glass border border-brd text-xs md:text-sm font-medium hover:border-accent/30 transition-all">
            <Plus size={14} />
            <span className="hidden sm:inline">Pre-Register</span>
            <span className="sm:hidden">Manual</span>
          </button>
        </div>
      </div>

      {/* Registration Mode Selector */}
      <div className="glass-card p-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs md:text-sm font-semibold text-tx2">Scan Mode:</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRegisterMode('cli')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition',
              registerMode === 'cli' ? 'border-accent bg-accent/10 text-accent' : 'border-brd text-tx3 hover:border-tx3')}>
            <Wrench size={14} /> CLI
          </button>
          <button type="button" onClick={() => setRegisterMode('snmp')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition',
              registerMode === 'snmp' ? 'border-accent bg-accent/10 text-accent' : 'border-brd text-tx3 hover:border-tx3')}>
            <Radio size={14} /> SNMP
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <div className="glass-card p-3 md:p-4 text-center">
          <div className="text-xl md:text-2xl font-bold text-accent">{olts.length}</div>
          <div className="text-[10px] md:text-xs text-tx3 uppercase font-semibold">Total OLTs</div>
        </div>
        <div className="glass-card p-3 md:p-4 text-center">
          <div className="text-xl md:text-2xl font-bold text-success">{onlineOlts}</div>
          <div className="text-[10px] md:text-xs text-tx3 uppercase font-semibold">Online</div>
        </div>
        <div className="glass-card p-3 md:p-4 text-center">
          <div className={cn('text-xl md:text-2xl font-bold', totalOnus > 0 ? 'text-warning' : 'text-tx3')}>
            {totalOnus}
          </div>
          <div className="text-[10px] md:text-xs text-tx3 uppercase font-semibold">Unconfigured</div>
        </div>
      </div>

      {/* Empty State */}
      {results.length === 0 && !scanning && (
        <div className="glass-card p-8 md:p-12 text-center">
          <Radio size={48} className="mx-auto text-tx3 mb-4 opacity-30" />
          <p className="text-tx2 text-sm md:text-base mb-2">No scan results yet</p>
          <p className="text-tx3 text-xs md:text-sm mb-4">
            Click <strong className="text-accent">Scan All</strong> to discover unconfigured ONUs across all OLTs,
            or <strong className="text-accent">Pre-Register</strong> for manual entry without scanning.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={handleScanAll} disabled={olts.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
              <Search size={16} /> Scan All OLTs
            </button>
            <button onClick={goToPreRegister}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-glass border border-brd text-sm hover:border-accent/30">
              <Plus size={16} /> Pre-Register Manual
            </button>
          </div>
        </div>
      )}

      {/* Scanning Progress */}
      {scanAll && (
        <div className="glass-card p-4 flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Scanning all OLTs...</div>
            <div className="text-xs text-tx3">
              {results.length}/{olts.length} OLTs scanned • {totalOnus} ONUs found so far
            </div>
          </div>
        </div>
      )}

      {/* Results per OLT */}
      <div className="space-y-3">
        {results.map((r) => {
          const isCollapsed = collapsedOlt[r.oltId];
          const isScanningThis = scanningOltIds.has(r.oltId);
          return (
            <div key={r.oltId} className="glass-card overflow-hidden">
              {/* OLT Header */}
              <div className="flex items-center gap-3 p-3 md:p-4 hover:bg-glass/50 transition-colors cursor-pointer"
                onClick={() => toggleOlt(r.oltId)}>
                <button className="text-tx3 hover:text-tx1 flex-shrink-0">
                  {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                </button>
                <div className={cn(
                  'w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  r.isOnline ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
                )}>
                  <Server size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{r.oltName}</div>
                  <div className="text-xs text-tx3 truncate">{r.oltModel} • {r.oltIp}</div>
                </div>
                {r.error && (
                  <div className="flex items-center gap-1 text-xs text-danger flex-shrink-0">
                    <AlertCircle size={14} /> <span className="hidden sm:inline">{r.error}</span>
                  </div>
                )}
                {!r.error && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn(
                      'px-2 py-1 rounded-lg text-xs font-medium',
                      r.onus.length > 0 ? 'bg-warning/15 text-warning' : 'bg-glass text-tx3',
                    )}>
                      {r.onus.length} ONU(s)
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleScanOne(r.oltId); }}
                      disabled={isScanningThis}
                      className="p-2 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors disabled:opacity-50"
                    >
                      {isScanningThis ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                  </div>
                )}
              </div>

              {/* ONU List */}
              {!isCollapsed && !r.error && r.onus.length > 0 && (
                <div className="border-t border-brd divide-y divide-brd">
                  {r.onus.map((onu, i) => {
                    const isEpon = onu.is_epon || onu.pon_port.includes('epon');
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 hover:bg-glass/30 transition-colors">
                        {/* Index */}
                        <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {i + 1}
                        </div>

                        {/* ONU Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* PON Type Badge */}
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase',
                              isEpon ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400',
                            )}>
                              {isEpon ? 'epon' : 'gpon'}
                            </span>
                            {/* Model */}
                            {onu.model && (
                              <span className="text-xs text-tx2 font-medium truncate">{onu.model}</span>
                            )}
                            {/* Matched Type */}
                            {onu.matched_type && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
                                → {onu.matched_type}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {/* SN / MAC */}
                            <span className="text-xs font-mono text-tx1 font-medium">{onu.sn}</span>
                            <button onClick={() => copySn(onu.sn)}
                              className="text-tx3 hover:text-accent transition-colors">
                              <Copy size={12} />
                            </button>
                            <span className="text-tx3 text-xs">•</span>
                            <span className="text-xs text-tx3">PON {onu.pon_port}</span>
                          </div>
                        </div>

                        {/* Register Button */}
                        <button
                          onClick={() => goToRegister(r.oltId, onu)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-all flex-shrink-0"
                        >
                          <Zap size={14} />
                          <span className="hidden sm:inline">Register</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No ONUs */}
              {!isCollapsed && !r.error && r.onus.length === 0 && !isScanningThis && (
                <div className="border-t border-brd p-4 text-center text-xs text-tx3">
                  No unconfigured ONUs found on this OLT
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
