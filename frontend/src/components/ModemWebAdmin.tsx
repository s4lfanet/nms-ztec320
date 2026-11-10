import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Globe, X, RefreshCw, ExternalLink, AlertTriangle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { toast } from './Toast';

interface Target { ip: string; source: string; label: string }
interface Info { mikrotik_devices: number; sessions: number; errors: string[]; tr069: boolean; names: string[] }
interface Sess { name: string; caller_id: string; address: string; uptime: string; device: string }

/**
 * Browser bawaan: buka web admin modem lewat reverse proxy NMS.
 * Konten modem dimuat di iframe `sandbox` TANPA allow-same-origin, sehingga
 * skrip modem tidak bisa menyentuh sesi/API NMS.
 * IP berasal dari: link-state, TR-069, dan sesi PPPoE MikroTik (dicocokkan
 * lewat username/MAC) — atau dipilih manual dari daftar sesi MikroTik.
 */
export function ModemWebAdminButton({ onuId }: { onuId: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [ip, setIp] = useState('');
  const [fromSession, setFromSession] = useState(false);
  const [scheme, setScheme] = useState<'http' | 'https'>('http');
  const [port, setPort] = useState('');
  const [src, setSrc] = useState('');
  const [tabSrc, setTabSrc] = useState('');
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [sess, setSess] = useState<Sess[] | null>(null);
  const [sessTotal, setSessTotal] = useState(0);

  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

  const openDialog = async () => {
    setOpen(true); setSrc(''); setSess(null); setFromSession(false); setLoading(true);
    try {
      const r = await api.onuWebAdminTargets(onuId);
      setTargets(r.targets); setInfo(r.info ?? null);
      setIp(r.targets[0]?.ip ?? '');
    } catch (e) { err(e); } finally { setLoading(false); }
  };

  const searchSessions = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const r = await api.webAdminPppoeSessions(q, refresh);
      setSess(r.sessions); setSessTotal(r.total);
    } catch (e) { err(e); } finally { setLoading(false); }
  }, [q]);

  const pickSession = (s: Sess) => { setIp(s.address); setFromSession(true); setSess(null); };

  const connect = async () => {
    if (!ip) return;
    setLoading(true);
    try {
      const r = await api.onuWebAdminSession(onuId, {
        ip, scheme, port: port ? Number(port) : undefined, from_session: fromSession || undefined });
      setSrc(r.url); setTabSrc(r.tab_url || r.url); setReload(n => n + 1);
    } catch (e) { err(e); } finally { setLoading(false); }
  };

  const ipOptions = fromSession && !targets.some(x => x.ip === ip)
    ? [...targets, { ip, source: 'mikrotik', label: t('webadmin.manualPick') }] : targets;

  return (
    <>
      <button onClick={openDialog}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-brd text-tx2 hover:bg-glass hover:text-tx1 transition-all">
        <Globe size={14} /> {t('webadmin.open')}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-stretch md:items-center justify-center md:p-4">
          <div className="modal-overlay absolute inset-0" onClick={() => setOpen(false)} />
          <div className="relative bg-surface border border-brd md:rounded-2xl shadow-2xl w-full max-w-6xl h-full md:h-[90vh] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-brd space-y-2">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-accent shrink-0" />
                <span className="text-sm font-semibold text-tx1">{t('webadmin.title')}</span>
                <button onClick={() => setOpen(false)} className="ml-auto p-1.5 text-tx2 hover:text-tx1"><X size={18} /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={ip} onChange={e => { setIp(e.target.value); setFromSession(false); }}
                  className="input-field !w-full sm:!w-64 text-xs">
                  {ipOptions.length === 0 && <option value="">{t('webadmin.noTarget')}</option>}
                  {ipOptions.map(x => <option key={x.ip + x.label} value={x.ip}>{x.ip} — {x.label}</option>)}
                </select>
                <select value={scheme} onChange={e => setScheme(e.target.value as 'http' | 'https')} className="input-field !w-20 text-xs">
                  <option value="http">http</option><option value="https">https</option>
                </select>
                <input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))}
                  placeholder={scheme === 'https' ? '443' : '80'} inputMode="numeric" className="input-field !w-20 text-xs" />
                <button onClick={connect} disabled={!ip || loading} className="btn-primary text-xs disabled:opacity-50">
                  {loading ? <RefreshCw size={13} className="animate-spin" /> : t('webadmin.connect')}
                </button>
                {src && <>
                  <button onClick={() => setReload(n => n + 1)} className="p-1.5 text-tx2 hover:text-tx1" title={t('webadmin.reload')}><RefreshCw size={15} /></button>
                  <a href={tabSrc} target="_blank" rel="noreferrer" className="p-1.5 text-tx2 hover:text-tx1" title={t('webadmin.newTab')}><ExternalLink size={15} /></a>
                </>}
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-white relative">
              {src ? (
                <iframe key={reload} src={src} title="modem-webadmin"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                  referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full border-0" />
              ) : (
                <div className="absolute inset-0 overflow-y-auto bg-surface p-4 text-tx2">
                  <div className="max-w-xl mx-auto space-y-3">
                    <div className="flex gap-2 items-start text-xs">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5 text-warning" />
                      <div className="space-y-1">
                        <p>{targets.length === 0 && !loading ? t('webadmin.noTargetHint') : t('webadmin.hint')}</p>
                        {info && targets.length === 0 && (
                          <p className="text-tx3">
                            {t('webadmin.searched', { dev: info.mikrotik_devices, n: info.sessions })}
                            {info.names.length > 0 && <> {t('webadmin.names')}: <span className="font-mono">{info.names.join(', ')}</span>.</>}
                            {!info.tr069 && <> {t('webadmin.noTr069')}</>}
                            {info.errors.length > 0 && <> {t('webadmin.devErr')}: {info.errors.join('; ')}</>}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-tx1">{t('webadmin.pickTitle')}</p>
                      <div className="flex gap-2">
                        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchSessions()}
                          placeholder={t('webadmin.searchPh')} className="input-field text-xs" />
                        <button onClick={() => searchSessions()} disabled={loading} className="btn-primary text-xs flex items-center gap-1 disabled:opacity-50">
                          <Search size={13} /> {t('webadmin.search')}
                        </button>
                      </div>
                      {sess && (
                        <div className="border border-brd rounded-xl divide-y divide-brd max-h-[45vh] overflow-y-auto">
                          <p className="px-3 py-1.5 text-[11px] text-tx3">{t('webadmin.sessCount', { shown: sess.length, total: sessTotal })}</p>
                          {sess.length === 0 && <p className="px-3 py-3 text-xs text-tx3">{t('webadmin.noSess')}</p>}
                          {sess.map(s => (
                            <button key={s.address + s.name} onClick={() => pickSession(s)}
                              className="w-full text-left px-3 py-2 hover:bg-glass text-xs">
                              <span className="font-medium text-tx1 break-all">{s.name || '-'}</span>
                              <span className="block font-mono text-tx3">{s.address} · {s.caller_id || '-'} · {s.device}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
