import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../components/Toast';
import {
  Cloud, Download, Play, Square, Save, Terminal,
  CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw,
} from 'lucide-react';

interface CfStatus {
  success: boolean;
  installed: boolean;
  version: string;
  tunnel_running: boolean;
  tunnel_id: string;
  tunnel_name: string;
  domain: string;
  configured: boolean;
}

export function CloudflareTunnel() {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const [domain, setDomain] = useState('');
  const [tunnelName, setTunnelName] = useState('salfanet-nms');
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState('');

  const { data: status, isLoading, refetch } = useQuery<CfStatus>({
    queryKey: ['cf-status'],
    queryFn: async () => {
      const r = await fetch('/api/cloudflare/status', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch status');
      return r.json();
    },
    refetchInterval: 10000,
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/cloudflare/install', { method: 'POST', credentials: 'include' });
      return r.json();
    },
    onSuccess: (d: { success: boolean; message?: string; version?: string }) => {
      if (d.success) toast.success(d.message || 'Installed');
      else toast.error(d.message || 'Install failed');
      qc.invalidateQueries({ queryKey: ['cf-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const configureMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/cloudflare/configure', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnel_token: token, domain, tunnel_name: tunnelName }),
      });
      return r.json();
    },
    onSuccess: (d: { success: boolean; message?: string }) => {
      if (d.success) toast.success(d.message || 'Configured');
      else toast.error(d.message || 'Configuration failed');
      qc.invalidateQueries({ queryKey: ['cf-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/cloudflare/start', { method: 'POST', credentials: 'include' });
      return r.json();
    },
    onSuccess: (d: { success: boolean; message?: string }) => {
      if (d.success) toast.success(d.message || 'Started');
      else toast.error(d.message || 'Start failed');
      qc.invalidateQueries({ queryKey: ['cf-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/cloudflare/stop', { method: 'POST', credentials: 'include' });
      return r.json();
    },
    onSuccess: (d: { success: boolean; message?: string }) => {
      if (d.success) toast.success(d.message || 'Stopped');
      else toast.error(d.message || 'Stop failed');
      qc.invalidateQueries({ queryKey: ['cf-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fetchLogs = async () => {
    setShowLogs(!showLogs);
    if (!showLogs) {
      const r = await fetch('/api/cloudflare/logs', { credentials: 'include' });
      const d = await r.json();
      setLogs(d.logs || 'No logs available');
    }
  };

  const installed = status?.installed;
  const running = status?.tunnel_running;
  const configured = status?.configured;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Cloud size={22} className="text-accent" />
            Cloudflare Tunnel
          </h1>
          <p className="text-tx3 text-xs mt-0.5">
            Hubungkan VPS ke domain via Cloudflare Tunnel — tanpa buka port, tanpa IP publik
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-glass text-tx2 hover:text-tx1">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 border border-brd">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-tx3 uppercase tracking-wide">cloudflared</span>
            {installed ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-danger" />}
          </div>
          <div className="text-sm font-semibold">{installed ? 'Installed' : 'Not Installed'}</div>
          {status?.version && <div className="text-[10px] text-tx3 mt-0.5 font-mono truncate">{status.version}</div>}
        </div>

        <div className="glass-card p-4 border border-brd">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-tx3 uppercase tracking-wide">Tunnel</span>
            {running ? <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> : <span className="w-2 h-2 rounded-full bg-danger" />}
          </div>
          <div className="text-sm font-semibold">{running ? 'Running' : 'Stopped'}</div>
          {status?.tunnel_name && <div className="text-[10px] text-tx3 mt-0.5">{status.tunnel_name}</div>}
        </div>

        <div className="glass-card p-4 border border-brd">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-tx3 uppercase tracking-wide">Domain</span>
            {configured ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-tx3" />}
          </div>
          <div className="text-sm font-semibold truncate">{status?.domain || 'Not set'}</div>
          {configured && status?.domain && (
            <a href={`https://${status.domain}`} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-accent hover:underline mt-0.5 inline-flex items-center gap-0.5">
              {status.domain} <ExternalLink size={9} />
            </a>
          )}
        </div>
      </div>

      {/* Step 1: Install cloudflared */}
      {!installed && (
        <div className="glass-card p-5 border border-brd">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center">1</span>
            Install cloudflared
          </h3>
          <p className="text-xs text-tx3 mb-3">
            Download dan install Cloudflare Tunnel daemon di VPS ini.
          </p>
          <button
            onClick={() => installMutation.mutate()}
            disabled={installMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 text-sm font-medium transition-all disabled:opacity-50"
          >
            {installMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Install cloudflared
          </button>
        </div>
      )}

      {/* Step 2: Configure Tunnel */}
      {installed && (
        <div className="glass-card p-5 border border-brd">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center">2</span>
            Configure Tunnel
          </h3>
          <p className="text-xs text-tx3 mb-4">
            Buat tunnel di <a href="https://one.dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">Cloudflare Zero Trust <ExternalLink size={9} /></a> → Networks → Tunnels → Create Tunnel.
            Copy tunnel token dan paste di bawah. Set hostname public ke <code className="text-accent">http://localhost:80</code>.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-tx2 font-medium mb-1 block">Tunnel Token</label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="eyJhIjoi... (dari Cloudflare Zero Trust dashboard)"
                className="w-full px-3 py-2 text-xs rounded-lg bg-glass border border-brd focus:outline-none focus:border-accent/50 text-tx1 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-tx2 font-medium mb-1 block">Domain</label>
                <input
                  type="text"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="nms.example.com"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-glass border border-brd focus:outline-none focus:border-accent/50 text-tx1"
                />
              </div>
              <div>
                <label className="text-xs text-tx2 font-medium mb-1 block">Tunnel Name</label>
                <input
                  type="text"
                  value={tunnelName}
                  onChange={e => setTunnelName(e.target.value)}
                  placeholder="salfanet-nms"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-glass border border-brd focus:outline-none focus:border-accent/50 text-tx1"
                />
              </div>
            </div>
            <button
              onClick={() => configureMutation.mutate()}
              disabled={configureMutation.isPending || !token || !domain}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 text-sm font-medium transition-all disabled:opacity-50"
            >
              {configureMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save & Start Tunnel
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Control */}
      {installed && configured && (
        <div className="glass-card p-5 border border-brd">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center">3</span>
            Tunnel Control
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startMutation.mutate()}
              disabled={running || startMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/15 text-success border border-success/20 hover:bg-success/25 text-sm font-medium transition-all disabled:opacity-50"
            >
              {startMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Start
            </button>
            <button
              onClick={() => stopMutation.mutate()}
              disabled={!running || stopMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger/15 text-danger border border-danger/20 hover:bg-danger/25 text-sm font-medium transition-all disabled:opacity-50"
            >
              {stopMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
              Stop
            </button>
            <button
              onClick={fetchLogs}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-glass border border-brd hover:border-accent/30 text-sm font-medium transition-all"
            >
              <Terminal size={16} />
              {showLogs ? 'Hide Logs' : 'View Logs'}
            </button>
          </div>

          {showLogs && (
            <div className="mt-3">
              <pre className="text-[10px] font-mono text-tx2 bg-glass rounded-lg p-3 max-h-64 overflow-auto border border-brd whitespace-pre-wrap">{logs}</pre>
            </div>
          )}
        </div>
      )}

      {/* Info Banner */}
      <div className="glass-card p-4 border border-info/20 bg-info/5">
        <div className="flex items-start gap-2">
          <Cloud size={16} className="text-info flex-shrink-0 mt-0.5" />
          <div className="text-xs text-tx2 space-y-1">
            <p><strong className="text-tx1">Cara kerja Cloudflare Tunnel:</strong></p>
            <p>1. <code className="text-accent">cloudflared</code> di VPS membuat outbound connection ke Cloudflare edge — tidak perlu buka port inbound.</p>
            <p>2. Traffic dari domain di-route melalui Cloudflare ke tunnel → VPS <code className="text-accent">localhost:80</code> (nginx).</p>
            <p>3. Nginx proxy ke Flask (5000) + WebSocket (8765) — sudah dikonfigurasi.</p>
            <p>4. SSL/TLS otomatis dari Cloudflare — tidak perlu certbot.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
