import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, ArrowDown, ArrowUp, Search, Server, Radio, Clock } from 'lucide-react';
import { api } from '../lib/api';
import type { TrafficCard, TrafficPoint } from '../lib/api';
import { Modal } from '../components/ui';
import { cn } from '../lib/utils';

const PERIODS: { key: string; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: '1h', label: '1H' },
  { key: '6h', label: '6H' },
  { key: '1d', label: '1D' },
  { key: '3d', label: '3D' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

function fmtMbps(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(2)} Mbps`;
}

function fmtTimeLabel(iso: string, period: string) {
  const d = new Date(iso);
  if (period === '7d' || period === '30d' || period === '3d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/* ─── Mini card chart ─── */
function MiniTrafficChart({ points, portName }: { points: TrafficPoint[]; portName: string }) {
  const data = points.map(p => ({ t: p.t, dl: p.rx, ul: p.tx }));
  const gid = portName.replace(/[^a-zA-Z0-9]/g, '');
  // Compute Y-axis domain — when all values are 0, use [0, 1] so chart doesn't collapse
  const maxVal = Math.max(...data.map(d => Math.max(d.dl, d.ul)), 0);
  const yDomain: [number, number] = maxVal > 0 ? [0, maxVal * 1.1] : [0, 1];
  return (
    <ResponsiveContainer width="100%" height={130}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={`dlGradCard-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`ulGradCard-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis tick={{ fontSize: 9, fill: 'var(--color-tx3)' }} width={30} domain={yDomain} allowDataOverflow={false} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: 'var(--text-2)' }}
          labelFormatter={l => new Date(Number(l)).toLocaleString()}
          formatter={(v, name) => [fmtMbps(Number(v) || 0), name === 'dl' ? 'Download' : 'Upload']}
        />
        <Area type="monotone" dataKey="dl" stroke="var(--color-danger)" fill={`url(#dlGradCard-${gid})`} strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="ul" stroke="var(--color-info)" fill={`url(#ulGradCard-${gid})`} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── History chart section (used inside detail modal) ─── */
function HistorySection({ title, subtitle, oltId, portType, portName, period }: {
  title: string; subtitle: string; oltId: number; portType: 'uplink' | 'pon'; portName: string; period: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['traffic-history', oltId, portType, portName, period],
    queryFn: () => api.trafficHistory({ olt_id: oltId, port_type: portType, port_name: portName, period }),
  });
  const points = data?.points || [];
  const chartData = points.map(p => ({ t: fmtTimeLabel(p.t, period), dl: p.rx, ul: p.tx }));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-sm font-semibold text-tx1">{title}</div>
          <div className="text-xs text-tx3">{subtitle}</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-tx3">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-danger"></span> Download</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-info"></span> Upload</span>
        </div>
      </div>
      {isLoading ? (
        <div className="h-[160px] flex items-center justify-center text-tx3 text-xs">Loading...</div>
      ) : chartData.length === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-tx3 text-xs">No Data</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`dlGrad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`ulGrad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--color-tx3)' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: 'var(--color-tx3)' }} width={35} domain={(() => { const mx = Math.max(...chartData.map(d => Math.max(d.dl, d.ul)), 0); return mx > 0 ? [0, mx * 1.1] : [0, 1]; })()} allowDataOverflow={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: 'var(--text-2)' }}
              formatter={(v, name) => [fmtMbps(Number(v) || 0), name === 'dl' ? 'Download' : 'Upload']}
            />
            <Area type="monotone" dataKey="dl" stroke="var(--color-danger)" fill={`url(#dlGrad-${title})`} strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="ul" stroke="var(--color-info)" fill={`url(#ulGrad-${title})`} strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ─── Live traffic section (polls every 5s via real telnet read) ─── */
function LiveTrafficSection({ oltId, portType, portName }: { oltId: number; portType: 'uplink' | 'pon'; portName: string }) {
  const [samples, setSamples] = useState<{ t: string; dl: number; ul: number }[]>([]);
  const [current, setCurrent] = useState<{ rx: number; tx: number } | null>(null);
  const [error, setError] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await api.trafficLive({ olt_id: oltId, port_type: portType, port_name: portName });
      setCurrent({ rx: res.rx_mbps, tx: res.tx_mbps });
      setError(false);
      setSamples(prev => {
        const next = [...prev, { t: new Date(res.ts * 1000).toLocaleTimeString(), dl: res.rx_mbps, ul: res.tx_mbps }];
        return next.slice(-30);
      });
    } catch {
      setError(true);
    }
  }, [oltId, portType, portName]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [poll]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold text-tx1">Live Traffic</div>
          <div className="text-xs text-tx3">Real-time — update every 5s</div>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-sm font-bold text-danger"><ArrowDown size={14} /> {current ? fmtMbps(current.rx) : '—'}</span>
          <span className="flex items-center gap-1.5 text-sm font-bold text-info"><ArrowUp size={14} /> {current ? fmtMbps(current.tx) : '—'}</span>
        </div>
      </div>
      {error && samples.length === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-tx3 text-xs">No Data (device unreachable)</div>
      ) : samples.length < 2 ? (
        <div className="h-[160px] flex items-center justify-center text-tx3 text-xs">Collecting live data...</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={samples} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="dlGradLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ulGradLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--color-tx3)' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: 'var(--color-tx3)' }} width={35} domain={(() => { const mx = Math.max(...samples.map(d => Math.max(d.dl, d.ul)), 0); return mx > 0 ? [0, mx * 1.1] : [0, 1]; })()} allowDataOverflow={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: 'var(--text-2)' }}
              formatter={(v, name) => [fmtMbps(Number(v) || 0), name === 'dl' ? 'Download' : 'Upload']}
            />
            <Area type="monotone" dataKey="dl" stroke="var(--color-danger)" fill="url(#dlGradLive)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="ul" stroke="var(--color-info)" fill="url(#ulGradLive)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ─── Detail modal ─── */
function TrafficDetailModal({ oltId, oltName, portType, portName, onClose }: {
  oltId: number; oltName: string; portType: 'uplink' | 'pon'; portName: string; onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`${oltName} · ${portName}`} icon={<Activity size={18} className="mr-2" />} size="lg">
      <div className="space-y-6">
        <LiveTrafficSection oltId={oltId} portType={portType} portName={portName} />
        <div className="border-t border-brd pt-5">
          <HistorySection title="Last 1 Day" subtitle="30-minute interval" oltId={oltId} portType={portType} portName={portName} period="1d" />
        </div>
        <div className="border-t border-brd pt-5">
          <HistorySection title="Last 3 Days" subtitle="1-hour interval" oltId={oltId} portType={portType} portName={portName} period="3d" />
        </div>
        <div className="border-t border-brd pt-5">
          <HistorySection title="Last 7 Days" subtitle="2-hour interval" oltId={oltId} portType={portType} portName={portName} period="7d" />
        </div>
        <div className="border-t border-brd pt-5">
          <HistorySection title="Last 30 Days" subtitle="6-hour interval" oltId={oltId} portType={portType} portName={portName} period="30d" />
        </div>
      </div>
    </Modal>
  );
}

/* ─── Main Traffic page ─── */
export function Traffic() {
  const [oltId, setOltId] = useState<number | null>(null);
  const [portType, setPortType] = useState<'uplink' | 'pon'>('pon');
  const [period, setPeriod] = useState('6h');
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<TrafficCard | null>(null);

  const { data: meta } = useQuery({
    queryKey: ['traffic-meta'],
    queryFn: () => api.trafficMeta(),
  });

  const olts = meta?.olts || [];

  useEffect(() => {
    if (!oltId && olts.length > 0) setOltId(olts[0].id);
  }, [olts, oltId]);

  const currentOlt = olts.find(o => o.id === oltId);

  const { data: grid, isLoading, isFetching } = useQuery({
    queryKey: ['traffic-grid', oltId, portType, period, search],
    queryFn: () => api.trafficGrid({ olt_id: oltId as number, port_type: portType, period, search: search || undefined }),
    enabled: !!oltId,
    refetchInterval: period === 'live' ? 10000 : 30000,
  });

  const cards = grid?.cards || [];

  const timezoneLabel = useMemo(() => {
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    return `UTC${sign}${Math.abs(offsetMin / 60)}`;
  }, []);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2"><Activity size={22} className="text-accent" /> Traffic Monitoring</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">Real-time and historical bandwidth usage per OLT / PON port</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-3 md:p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-tx3 font-medium"><Server size={14} /> OLT</div>
            <select
              value={oltId ?? ''}
              onChange={e => setOltId(Number(e.target.value))}
              className="bg-glass border border-brd rounded-lg px-3 py-1.5 text-sm focus:border-accent/50 outline-none"
            >
              {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              {olts.length === 0 && <option value="">No OLT available</option>}
            </select>

            <div className="flex items-center rounded-lg bg-glass border border-brd p-0.5 ml-1">
              <button
                onClick={() => setPortType('uplink')}
                className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all', portType === 'uplink' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}
              >
                Uplink
              </button>
              <button
                onClick={() => setPortType('pon')}
                className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all', portType === 'pon' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}
              >
                PON
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-tx3">
            <Clock size={13} /> Timezone: <span className="font-medium text-tx2">{timezoneLabel}</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex items-center rounded-lg bg-glass border border-brd p-0.5 flex-wrap">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all', period === p.key ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 md:flex-none md:w-64">
            <Search size={15} className="text-tx3 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search interface..."
              className="flex-1 bg-glass border border-brd rounded-lg px-3 py-1.5 text-sm focus:border-accent/50 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="text-xs text-tx3 flex items-center justify-between">
        <span>{isFetching && !isLoading ? 'Refreshing...' : ''} {cards.length} {portType === 'uplink' ? 'uplink port(s)' : 'PON port(s)'} on {currentOlt?.name || '—'}</span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="glass-card p-10 text-center text-tx3 text-sm">Loading traffic data...</div>
      ) : !oltId ? (
        <div className="glass-card p-10 text-center text-tx3 text-sm">No OLT with CLI access configured yet.</div>
      ) : cards.length === 0 ? (
        <div className="glass-card p-10 text-center text-tx3 text-sm">No {portType === 'uplink' ? 'uplink' : 'PON'} ports found for this OLT.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(card => (
            <div
              key={card.port_name}
              onClick={() => setSelectedCard(card)}
              className="glass-card p-3.5 cursor-pointer hover:border-accent/40 hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Radio size={13} className="text-accent flex-shrink-0" />
                  <span className="text-xs font-semibold text-tx1 truncate">{currentOlt?.name}</span>
                </div>
              </div>
              <div className="text-sm font-bold text-tx2 mb-1 truncate">{card.port_name}</div>
              <div className="flex items-center gap-3 mb-1 text-[11px]">
                <span className="flex items-center gap-1 text-danger font-medium"><ArrowDown size={11} /> {fmtMbps(card.current_rx)}</span>
                <span className="flex items-center gap-1 text-info font-medium"><ArrowUp size={11} /> {fmtMbps(card.current_tx)}</span>
              </div>
              {card.has_data ? (
                <MiniTrafficChart points={card.points} portName={card.port_name} />
              ) : (
                <div className="h-[130px] flex items-center justify-center text-tx3 text-xs">No Data</div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedCard && oltId && (
        <TrafficDetailModal
          oltId={oltId}
          oltName={currentOlt?.name || ''}
          portType={portType}
          portName={selectedCard.port_name}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
