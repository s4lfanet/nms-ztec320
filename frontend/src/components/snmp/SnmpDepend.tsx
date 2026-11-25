import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Send, Trash2, Wrench } from 'lucide-react';
import { Button, Card } from '../ui';
import { toast } from '../Toast';
import { api, type SnmpDevice } from '../../lib/api';
import { cn } from '../../lib/utils';

/** Pilih perangkat induk: induk turun → alert anak ditahan. */
export function ParentSelect({ value, selfId, onChange }: { value: number | null | undefined; selfId?: number; onChange: (v: number | null) => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['snmp-devices'], queryFn: api.snmpDevices, staleTime: 30_000 });
  const opts: SnmpDevice[] = (data?.devices ?? []).filter(d => d.id !== selfId);
  return (
    <label className="block"><span className="label-sm inline-flex items-center gap-1"><Network size={12} />{t('snmpdep.parent')}</span>
      <select className="input-field" value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{t('snmpdep.noParent')}</option>
        {opts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.host})</option>)}
      </select>
      <span className="text-[11px] text-tx3">{t('snmpdep.parentHint')}</span>
    </label>
  );
}

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Jadwal pemeliharaan satu perangkat: alert ditahan selama jendela aktif. */
export function MaintenancePanel({ deviceId }: { deviceId: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['snmp-maint', deviceId], queryFn: () => api.snmpMaintenance(deviceId) });
  const [hours, setHours] = useState('2');
  const [reason, setReason] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['snmp-maint'] }); qc.invalidateQueries({ queryKey: ['snmp-devices'] }); };
  const add = useMutation({
    mutationFn: () => {
      const h = Math.min(Math.max(Number(hours) || 1, 0.25), 720);
      const now = new Date();
      return api.snmpMaintenanceCreate({ device_id: deviceId, start: now.toISOString(), end: new Date(now.getTime() + h * 3600_000).toISOString(), reason });
    },
    onSuccess: () => { toast.success(t('snmpdep.maintAdded')); setReason(''); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.snmpMaintenanceDelete(id),
    onSuccess: refresh, onError: (e) => toast.error((e as Error).message),
  });
  const fmt = (iso: string | null) => (iso ? toLocalInput(new Date(iso)).replace('T', ' ') : '-');
  return (
    <div className="rounded-lg border border-line p-3 space-y-2">
      <div className="text-xs font-medium text-tx1 inline-flex items-center gap-1.5"><Wrench size={13} />{t('snmpdep.maint')}</div>
      <p className="text-[11px] text-tx3">{t('snmpdep.maintHint')}</p>
      {(data?.items ?? []).map(m => (
        <div key={m.id} className={cn('flex items-center justify-between gap-2 text-xs rounded border px-2 py-1.5', m.active ? 'border-warning/40 bg-warning/10' : 'border-line')}>
          <span className="min-w-0 truncate">
            {m.active && <b className="text-warning">{t('snmpdep.active')} · </b>}
            {fmt(m.start)} → {fmt(m.end)}{m.reason ? ` · ${m.reason}` : ''}
          </span>
          <button type="button" aria-label={t('common.delete')} className="text-tx3 hover:text-danger shrink-0" onClick={() => del.mutate(m.id)}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="grid grid-cols-[5rem_1fr_auto] gap-2 items-end">
        <label className="block"><span className="label-sm">{t('snmpdep.hours')}</span>
          <input className="input-field" type="number" min={0.25} step={0.5} value={hours} onChange={e => setHours(e.target.value)} /></label>
        <label className="block"><span className="label-sm">{t('snmpdep.reason')}</span>
          <input className="input-field" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder={t('snmpdep.reasonPh')} /></label>
        <Button variant="secondary" onClick={() => add.mutate()} loading={add.isPending}>{t('snmpdep.start')}</Button>
      </div>
    </div>
  );
}

const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Ringkasan mingguan SNMP ke Telegram/WhatsApp. */
export function DigestCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['snmp-settings'], queryFn: api.snmpSettings });
  const cur = data?.digest;
  const [form, setForm] = useState<{ on?: boolean; day?: number; hour?: number }>({});
  const on = form.on ?? !!cur?.snmp_digest_enabled;
  const day = form.day ?? cur?.snmp_digest_day ?? 0;
  const hour = form.hour ?? cur?.snmp_digest_hour ?? 7;
  const save = useMutation({
    mutationFn: () => api.snmpSettingsSave({ snmp_digest_enabled: on ? 1 : 0, snmp_digest_day: day, snmp_digest_hour: hour }),
    onSuccess: () => { toast.success(t('snmpdep.saved')); setForm({}); qc.invalidateQueries({ queryKey: ['snmp-settings'] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const send = useMutation({
    mutationFn: api.snmpDigestSend,
    onSuccess: (r) => (r.success ? toast.success(r.message) : toast.error(r.message)),
    onError: (e) => toast.error((e as Error).message),
  });
  if (!cur) return null;
  return (
    <Card title={t('snmpdep.digest')} icon={<Send size={16} />}>
      <p className="text-xs text-tx3 mb-3">{t('snmpdep.digestHint')}</p>
      <label className="flex items-center gap-2 text-sm text-tx2 mb-3">
        <input type="checkbox" checked={on} onChange={e => setForm(f => ({ ...f, on: e.target.checked }))} /> {t('snmpdep.digestOn')}
      </label>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <label className="block"><span className="label-sm">{t('snmpdep.day')}</span>
          <select className="input-field" value={day} onChange={e => setForm(f => ({ ...f, day: Number(e.target.value) }))}>
            {DAYS.map(d => <option key={d} value={d}>{t(`snmpdep.d${d}`)}</option>)}
          </select></label>
        <label className="block"><span className="label-sm">{t('snmpdep.hour')}</span>
          <select className="input-field" value={hour} onChange={e => setForm(f => ({ ...f, hour: Number(e.target.value) }))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select></label>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!Object.keys(form).length}>{t('common.save')}</Button>
        <Button variant="secondary" onClick={() => send.mutate()} loading={send.isPending}>{t('snmpdep.sendNow')}</Button>
      </div>
    </Card>
  );
}
