import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Modal } from '../ui';
import { toast } from '../Toast';
import { api, type SnmpPort, type SnmpRule } from '../../lib/api';
import { cn, timeAgo } from '../../lib/utils';

const TONE: Record<SnmpRule['status'], string> = {
  ok: 'text-success border-success/30 bg-success/10', warning: 'text-warning border-warning/40 bg-warning/10',
  down: 'text-danger border-danger/40 bg-danger/10', unknown: 'text-tx3 border-line',
};
const PORT_METRICS = ['in', 'out', 'in_err', 'out_err'] as const;
const isBps = (m: string) => m === 'in' || m === 'out';
/** Nilai tersimpan dalam bit/s untuk trafik; formulir memakai Mbps. */
const toForm = (m: string, v: number | null) => (v == null ? '' : String(isBps(m) ? v / 1e6 : v));
const fromForm = (m: string, v: string) => (v.trim() === '' ? null : Number(v) * (isBps(m) ? 1e6 : 1));
const unitOf = (m: string, sensorUnit?: string) => (isBps(m) ? 'Mbps' : m.endsWith('_err') ? 'err/s' : sensorUnit || '');
const fmtVal = (m: string, v: number | null, sensorUnit?: string) =>
  v == null ? '—' : isBps(m) ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)} Mbps` : `${Math.round(v * 100) / 100}${sensorUnit ? ` ${sensorUnit}` : ''}`;

interface FormState { source: string; name: string; op: 'gt' | 'lt'; warn: string; crit: string; minutes: string }

export function SensorRules({ deviceId, canEdit, ports }: { deviceId: number; canEdit: boolean; ports: SnmpPort[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['snmp-rules', deviceId], queryFn: () => api.snmpRules(deviceId), refetchInterval: 60_000 });
  const [edit, setEdit] = useState<{ rule: SnmpRule | null } | null>(null);
  const del = useMutation({
    mutationFn: (id: number) => api.snmpRuleDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snmp-rules', deviceId] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const sensors = data?.sensors ?? [];
  const unitFor = (r: SnmpRule) => sensors.find(s => s.metric === r.metric)?.unit;
  const label = (r: SnmpRule) => {
    const p = r.port_id ? ports.find(x => x.id === r.port_id) : null;
    return p ? `${p.name} · ${t(`snrule.m.${r.metric}`)}` : sensors.find(s => s.metric === r.metric)?.name || r.metric;
  };
  return (
    <Card title={t('snrule.title')} icon={<Gauge size={16} />}
      action={canEdit ? <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setEdit({ rule: null })}>{t('snrule.add')}</Button> : undefined}>
      <p className="text-xs text-tx3 mb-3">{t('snrule.hint')}</p>
      {!data ? <div className="h-16 skeleton-shimmer rounded" /> : data.rules.length === 0 ? (
        <p className="text-sm text-tx3">{t('snrule.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {data.rules.map(r => (
            <li key={r.id} className={cn('rounded-lg border p-2.5 flex items-center gap-3', !r.enabled && 'opacity-60', r.status === 'down' ? 'border-danger/40' : r.status === 'warning' ? 'border-warning/40' : 'border-line')}>
              <span className={cn('px-2 py-0.5 rounded border text-[11px] shrink-0', TONE[r.status])}>{t(`snrule.st.${r.status}`)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-tx1 truncate">{r.name}</div>
                <div className="text-[11px] text-tx3 truncate">
                  {label(r)} · {r.op === 'gt' ? '>' : '<'} {r.warn != null ? `W ${toForm(r.metric, r.warn)}` : ''}{r.warn != null && r.crit != null ? ' / ' : ''}{r.crit != null ? `D ${toForm(r.metric, r.crit)}` : ''} {unitOf(r.metric, unitFor(r))} · ≥ {r.minutes} {t('snrule.min')}
                </div>
              </div>
              <div className="text-right text-xs text-tx2 shrink-0">
                <div className="font-mono">{fmtVal(r.metric, r.last_value, unitFor(r))}</div>
                {r.status_since && <div className="text-[11px] text-tx3">{timeAgo(r.status_since)}</div>}
              </div>
              {canEdit && (
                <div className="flex gap-1 shrink-0">
                  <button type="button" aria-label={t('common.edit')} className="p-1.5 text-tx3 hover:text-tx1" onClick={() => setEdit({ rule: r })}><Pencil size={14} /></button>
                  <button type="button" aria-label={t('common.delete')} className="p-1.5 text-tx3 hover:text-danger" onClick={() => del.mutate(r.id)}><Trash2 size={14} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && <RuleModal deviceId={deviceId} rule={edit.rule} ports={ports} sensors={sensors} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function RuleModal({ deviceId, rule, ports, sensors, onClose }: { deviceId: number; rule: SnmpRule | null; ports: SnmpPort[]; sensors: { metric: string; name: string; unit: string }[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>({
    source: rule ? (rule.port_id ? `p:${rule.port_id}:${rule.metric}` : `s:${rule.metric}`) : (sensors[0] ? `s:${sensors[0].metric}` : ports[0] ? `p:${ports[0].id}:in` : ''),
    name: rule?.name || '', op: rule?.op || 'gt',
    warn: rule ? toForm(rule.metric, rule.warn) : '', crit: rule ? toForm(rule.metric, rule.crit) : '', minutes: String(rule?.minutes ?? 10),
  });
  const [saving, setSaving] = useState(false);
  const parts = f.source.split(':');
  const metric = parts[0] === 'p' ? parts[2] : parts.slice(1).join(':');
  const portId = parts[0] === 'p' ? Number(parts[1]) : null;
  const unit = unitOf(metric, sensors.find(s => s.metric === metric)?.unit);
  const save = async () => {
    setSaving(true);
    try {
      await api.snmpRuleSave(deviceId, rule?.id ?? null, {
        metric, port_id: portId, name: f.name, op: f.op, warn: fromForm(metric, f.warn), crit: fromForm(metric, f.crit), minutes: Number(f.minutes) || 10,
      });
      toast.success(t('snrule.saved'));
      qc.invalidateQueries({ queryKey: ['snmp-rules', deviceId] });
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={rule ? t('snrule.edit') : t('snrule.add')} icon={<Gauge size={18} />}
      footer={<Button variant="primary" onClick={save} loading={saving} disabled={!f.source}>{t('common.save')}</Button>}>
      <div className="space-y-3">
        <label className="block"><span className="label-sm">{t('snrule.source')}</span>
          <select className="input-field" value={f.source} onChange={e => setF({ ...f, source: e.target.value })}>
            {sensors.length > 0 && <optgroup label={t('snrule.devSensors')}>{sensors.map(s => <option key={s.metric} value={`s:${s.metric}`}>{s.name}{s.unit ? ` (${s.unit})` : ''}</option>)}</optgroup>}
            <optgroup label={t('snrule.portMetrics')}>
              {ports.filter(p => !p.ignored).flatMap(p => PORT_METRICS.map(m => <option key={`${p.id}${m}`} value={`p:${p.id}:${m}`}>{p.name} — {t(`snrule.m.${m}`)}</option>))}
            </optgroup>
          </select></label>
        <label className="block"><span className="label-sm">{t('snrule.name')}</span>
          <input className="input-field" value={f.name} maxLength={120} onChange={e => setF({ ...f, name: e.target.value })} placeholder={t('snrule.namePh')} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label-sm">{t('snrule.op')}</span>
            <select className="input-field" value={f.op} onChange={e => setF({ ...f, op: e.target.value as 'gt' | 'lt' })}>
              <option value="gt">{t('snrule.gt')}</option><option value="lt">{t('snrule.lt')}</option></select></label>
          <label className="block"><span className="label-sm">{t('snrule.duration')}</span>
            <input className="input-field" type="number" min={1} max={1440} value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} /></label>
          <label className="block"><span className="label-sm">{t('snrule.warn')} {unit && `(${unit})`}</span>
            <input className="input-field" type="number" inputMode="decimal" value={f.warn} onChange={e => setF({ ...f, warn: e.target.value })} /></label>
          <label className="block"><span className="label-sm">{t('snrule.crit')} {unit && `(${unit})`}</span>
            <input className="input-field" type="number" inputMode="decimal" value={f.crit} onChange={e => setF({ ...f, crit: e.target.value })} /></label>
        </div>
        <p className="text-[11px] text-tx3">{t('snrule.formHint')}</p>
      </div>
    </Modal>
  );
}
