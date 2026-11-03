import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { Terminal as TermIcon, RefreshCw, Power } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { useHasPerm } from '../hooks/useHasPerm';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';

export function Terminal() {
  const hasPerm = useHasPerm();
  const canUse = hasPerm('olt_terminal');
  const [params, setParams] = useSearchParams();
  const oltId = parseInt(params.get('olt') || '0');
  const [proto, setProto] = useState<'telnet' | 'ssh'>('telnet');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'closed'>('idle');
  const termRef = useRef<HTMLDivElement>(null);
  const term = useRef<any>(null);
  const ws = useRef<WebSocket | null>(null);
  const fit = useRef<FitAddon | null>(null);

  const sendSize = () => {
    if (ws.current?.readyState === WebSocket.OPEN && term.current) {
      ws.current.send('' + JSON.stringify({ cols: term.current.cols, rows: term.current.rows }));
    }
  };

  // ResizeObserver → fit + kirim ukuran baru ke backend (SSH resize_pty / Telnet NAWS)
  useEffect(() => {
    const el = termRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      try { fit.current?.fit(); } catch { /* belum open */ }
      sendSize();
    });
    ro.observe(el);
    return () => { ro.disconnect(); ws.current?.close(); term.current?.dispose(); };
  }, []);

  const { data: dash } = useQuery({ queryKey: ['olts'], queryFn: api.dashboard });
  const oltList = dash?.olts || [];
  const currentOlt = Array.isArray(oltList) ? oltList.find((o: any) => o.id === oltId) : null;

  const connect = async () => {
    if (!oltId || !termRef.current) return;
    try {
      // Get WS token
      const tokResp = await fetch('/api/ws-token', { credentials: 'include' });
      const { token } = await tokResp.json();
      if (!token) { toast.error('Gagal ambil WS token'); return; }
      // Init terminal
      if (term.current) { term.current.dispose(); }
      term.current = new XTerm({
        cursorBlink: true, fontSize: 13, scrollback: 5000,
        theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff' },
      });
      fit.current = new FitAddon();
      term.current.loadAddon(fit.current);
      term.current.loadAddon(new WebLinksAddon());
      term.current.open(termRef.current);
      fit.current.fit();
      term.current.clear();
      // Connect WS
      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
      // Connect via nginx /ws/ proxy (port 8765 is bound to localhost only)
      const url = `${wsProto}://${location.host}/ws/terminal/${oltId}?token=${token}&proto=${proto}`;
      ws.current = new WebSocket(url);
      setStatus('connecting');
      ws.current.onopen = () => { setStatus('connected'); sendSize(); };
      ws.current.onmessage = (e) => term.current?.write(e.data);
      ws.current.onclose = () => { setStatus('closed'); term.current?.writeln('\r\n\x1b[31m[disconnected]\x1b[0m'); };
      ws.current.onerror = () => { setStatus('closed'); };
      term.current.onData((d: string) => ws.current?.send(d));
    } catch (e: any) {
      toast.error(e?.message || 'Gagal koneksi');
      setStatus('closed');
    }
  };

  const disconnect = () => {
    ws.current?.close();
    setStatus('closed');
  };

  if (!canUse) return <PageContainer><div className="text-xs text-tx3">Anda tidak punya izin olt_terminal.</div></PageContainer>;

  return (
    <PageContainer>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><TermIcon size={20} className="text-accent" /> Terminal OLT</h1>
        <select value={oltId} onChange={e => setParams({ olt: e.target.value }, { replace: true })}
          className="px-2 py-1.5 text-xs rounded bg-surface border border-brd focus:border-accent outline-none">
          <option value={0}>— pilih OLT —</option>
          {Array.isArray(oltList) && oltList.map((o: any) => (
            <option key={o.id} value={o.id}>{o.name} ({o.ip_address})</option>
          ))}
        </select>
        <select value={proto} onChange={e => setProto(e.target.value as any)}
          className="px-2 py-1.5 text-xs rounded bg-surface border border-brd focus:border-accent outline-none">
          <option value="telnet">Telnet</option>
          <option value="ssh">SSH</option>
        </select>
        {status !== 'connected' ? (
          <button onClick={connect} disabled={!oltId || status === 'connecting'}
            className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 flex items-center gap-1.5">
            <RefreshCw size={12} className={status === 'connecting' ? 'animate-spin' : ''} />
            {status === 'connecting' ? 'Menghubungkan…' : 'Hubungkan'}
          </button>
        ) : (
          <button onClick={disconnect}
            className="px-3 py-1.5 text-xs rounded bg-danger text-white hover:bg-danger/80 flex items-center gap-1.5">
            <Power size={12} /> Putus
          </button>
        )}
        {currentOlt && <span className="text-xs text-tx3">{currentOlt.vendor} • {currentOlt.ip_address}</span>}
        <span className={`text-xs px-2 py-0.5 rounded ${
          status === 'connected' ? 'bg-success/20 text-success' :
          status === 'connecting' ? 'bg-warning/20 text-warning' :
          'bg-glass text-tx3'}`}>{status}</span>
      </div>
      <div className="text-[10px] text-tx3 mb-2">
        Idle timeout: 10 menit • Max session: 60 menit • Semua command diaudit (password tidak dicatat)
      </div>
      <div ref={termRef} className="rounded-lg border border-brd overflow-hidden" style={{ minHeight: 480, background: '#0d1117' }} />
    </PageContainer>
  );
}
