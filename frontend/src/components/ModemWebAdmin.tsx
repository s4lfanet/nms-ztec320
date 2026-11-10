import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, X, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { toast } from './Toast';

interface Target { ip: string; source: string; label: string }

/**
 * Browser bawaan: buka web admin modem lewat reverse proxy NMS.
 * Konten modem dimuat di iframe `sandbox` TANPA allow-same-origin, sehingga
 * skrip modem tidak bisa menyentuh sesi/API NMS.
 */
export function ModemWebAdminButton({ onuId, className }: { onuId: number; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [ip, setIp] = useState('');
  const [scheme, setScheme] = useState<'http' | 'https'>('http');
  const [port, setPort] = useState('');
  const [src, setSrc] = useState('');
  const [reload, setReload] = useState(0);

  const openDialog = async () => {
    setOpen(true); setSrc(''); setLoading(true);
    try {
      const r = await api.onuWebAdminTargets(onuId);
      setTargets(r.targets);
      setIp(r.targets[0]?.ip ?? '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const connect = async () => {
    if (!ip) return;
    setLoading(true);
    try {
      const r = await api.onuWebAdminSession(onuId, { ip, scheme, port: port ? Number(port) : undefined });
      setSrc(r.url); setReload(n => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  return (
    <>
      <button onClick={openDialog}
        className={className ?? 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-brd text-tx2 hover:bg-glass hover:text-tx1 transition-all'}>
        <Globe size={14} /> {t('webadmin.open')}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={() => setOpen(false)}>
          <div className="glass-card w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-brd">
              <Globe size={16} className="text-accent" />
              <span className="text-sm font-semibold text-tx1 mr-2">{t('webadmin.title')}</span>
              <select value={ip} onChange={e => setIp(e.target.value)} className="input text-xs py-1.5 w-48">
                {targets.length === 0 && <option value="">{t('webadmin.noTarget')}</option>}
                {targets.map(x => <option key={x.ip + x.label} value={x.ip}>{x.ip} — {x.label}</option>)}
              </select>
              <select value={scheme} onChange={e => setScheme(e.target.value as 'http' | 'https')} className="input text-xs py-1.5 w-24">
                <option value="http">http</option><option value="https">https</option>
              </select>
              <input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} placeholder={scheme === 'https' ? '443' : '80'}
                className="input text-xs py-1.5 w-20" />
              <button onClick={connect} disabled={!ip || loading} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                {loading ? <RefreshCw size={13} className="animate-spin" /> : t('webadmin.connect')}
              </button>
              {src && <>
                <button onClick={() => setReload(n => n + 1)} className="p-1.5 text-tx2 hover:text-tx1" title={t('webadmin.reload')}><RefreshCw size={14} /></button>
                <a href={src} target="_blank" rel="noreferrer" className="p-1.5 text-tx2 hover:text-tx1" title={t('webadmin.newTab')}><ExternalLink size={14} /></a>
              </>}
              <button onClick={() => setOpen(false)} className="ml-auto p-1.5 text-tx2 hover:text-tx1"><X size={16} /></button>
            </div>
            <div className="flex-1 bg-white relative">
              {src ? (
                <iframe key={reload} src={src} title="modem-webadmin"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                  referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full border-0" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-tx3 bg-bg1 p-6">
                  <AlertTriangle size={22} />
                  <p className="text-sm max-w-md">{targets.length === 0 && !loading ? t('webadmin.noTargetHint') : t('webadmin.hint')}</p>
                </div>
              )}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
