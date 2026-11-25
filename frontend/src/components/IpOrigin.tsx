import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Globe2, Laptop, Smartphone, Tablet, Terminal, Save, ChevronDown } from 'lucide-react';
import { api, type IpInfoData, type IpLookupConfig } from '../lib/api';
import { flag, parseUa } from '../lib/ua';
import { cn } from '../lib/utils';
import { Button, Card } from './ui';
import { toast } from './Toast';

const KIND_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Laptop, app: Terminal, bot: Terminal, unknown: Laptop };

/** Baris ISP/lokasi untuk satu IP. */
export function ipOriginText(t: (k: string, o?: Record<string, unknown>) => string, info: IpInfoData | null | undefined,
  provider: IpLookupConfig['provider'] | undefined, hasIp: boolean): { text: string; muted: boolean } {
  if (!hasIp) return { text: '', muted: true };
  if (info?.scope) return { text: t(`iplog.scope_${info.scope}`), muted: true };
  if (info && (info.as_name || info.asn)) {
    const place = [info.city, info.region && info.region !== info.city ? info.region : '', info.country].filter(Boolean).join(', ');
    const isp = [info.asn, info.as_name].filter(Boolean).join(' ');
    return { text: place ? `${isp} · ${place}` : isp, muted: false };
  }
  if (provider === 'off' || !provider) return { text: t('iplog.lookupOff'), muted: true };
  return { text: t('iplog.lookingUp'), muted: true };
}

/** Sel IP: bendera + IP (klik = saring), ISP/ASN/lokasi, perangkat. */
export function IpOrigin({ ip, country, ua, info, provider, onFilter, compact }: {
  ip: string; country?: string; ua?: string; info?: IpInfoData | null; provider?: IpLookupConfig['provider'];
  onFilter?: (ip: string) => void; compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!ip) return <span className="text-tx3">—</span>;
  const cc = info?.country_code || country || '';
  const origin = ipOriginText(t, info, provider, !!ip);
  const dev = parseUa(ua);
  const DevIcon = dev ? KIND_ICON[dev.kind] : null;
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0.5' : 'space-y-0.5')}>
      <button type="button" onClick={() => onFilter?.(ip)} title={t('iplog.filterThis')}
        className="inline-flex items-center gap-1.5 !min-h-0 !h-auto p-0 font-mono text-xs text-tx1 hover:text-accent transition-colors">
        {cc && <span aria-label={cc} className="text-sm leading-none">{flag(cc)}</span>}
        {ip}
      </button>
      {origin.text && (
        <div className={cn('text-[11px] truncate', origin.muted ? 'text-tx3' : 'text-tx2')} title={origin.text}>
          <Globe2 size={11} className="inline -mt-0.5 mr-1 opacity-70" aria-hidden="true" />{origin.text}
        </div>
      )}
      {dev && DevIcon && (
        <div className="text-[11px] text-tx3 truncate" title={ua}>
          <DevIcon size={11} className="inline -mt-0.5 mr-1 opacity-70" aria-hidden="true" />
          {[dev.browser, dev.os].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

/** Panel super admin: dari mana info ISP diambil. */
export function IpLookupPanel({ config }: { config: IpLookupConfig }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(config.provider);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setProvider(config.provider); }, [config.provider]);

  const save = async () => {
    setSaving(true);
    try {
      await api.ipLookupSave({ provider, ...(token ? { token } : {}) });
      setToken('');
      await qc.invalidateQueries({ queryKey: ['action-logs'] });
      toast.success(t('iplog.saved'));
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <Card bodyClassName="p-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 min-w-0">
          <Globe2 size={16} className="text-accent shrink-0" />
          <span className="text-sm font-medium">{t('iplog.panelTitle')}</span>
          <span className={cn('text-xs truncate', config.provider === 'off' ? 'text-accent' : 'text-tx3')}>
            · {config.provider === 'off' ? t('iplog.enableHint') : t(`iplog.prov_${config.provider.replace('-', '')}`)}
          </span>
        </span>
        <ChevronDown size={16} className={cn('text-tx3 transition-transform rotate-smooth', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 reveal border-t border-brd pt-3">
          <p className="text-xs text-tx3">{t('iplog.panelHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('iplog.provider')}</span>
              <select className="input-field w-full" value={provider} onChange={e => setProvider(e.target.value as IpLookupConfig['provider'])}>
                <option value="ipinfo">{t('iplog.prov_ipinfo')}</option>
                <option value="ip-api">{t('iplog.prov_ipapi')}</option>
                <option value="off">{t('iplog.prov_off')}</option>
              </select>
            </label>
            {provider === 'ipinfo' && (
              <label className="text-xs text-tx2 flex flex-col gap-1">
                <span>{t('iplog.token')}</span>
                <input type="password" autoComplete="off" className="input-field w-full" value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder={config.has_token ? t('iplog.tokenSaved') : t('iplog.tokenPh')} />
              </label>
            )}
          </div>
          {provider === 'ipinfo' && (
            <p className="text-[11px] text-tx3">
              {t('iplog.ipinfoNote')}{' '}
              <a href="https://ipinfo.io/signup" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">ipinfo.io/signup</a>
            </p>
          )}
          {provider === 'ip-api' && <p className="text-[11px] text-warning">{t('iplog.ipapiNote')}</p>}
          {provider === 'off' && <p className="text-[11px] text-tx3">{t('iplog.offNote')}</p>}
          <div className="flex justify-end">
            <Button variant="primary" icon={<Save size={15} />} loading={saving}
              disabled={provider === 'ipinfo' && !config.has_token && !token} onClick={save}>{t('common.save')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
