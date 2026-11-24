import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Gauge } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../Toast';
import { Button } from '../ui';

const FIELDS = [
  { key: 'ftth_connector_loss_db', unit: 'dB', step: 0.1 },
  { key: 'ftth_splice_loss_db', unit: 'dB', step: 0.05 },
  { key: 'ftth_olt_tx_dbm', unit: 'dBm', step: 0.5 },
  { key: 'ftth_budget_tolerance_db', unit: 'dB', step: 0.5 },
] as const;

/** Nilai standar untuk anggaran redaman (dipakai bila data jalur tidak mengisinya). */
export function BudgetSettings({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({ queryKey: ['ftth-budget-settings'], queryFn: api.ftthBudgetSettings, enabled: open });

  useEffect(() => {
    if (data?.settings) setForm(Object.fromEntries(Object.entries(data.settings).map(([k, v]) => [k, String(v)])));
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)]));
      await api.ftthBudgetSettingsSave(body);
      toast.success(t('lossb.settingsSaved'));
      qc.invalidateQueries({ queryKey: ['ftth-budget-settings'] });
      qc.invalidateQueries({ queryKey: ['ftth-trace-onu'] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <section className="glass-card p-3 md:p-4">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full flex items-center gap-2 text-left">
        <Gauge size={18} className="text-accent shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-tx1">{t('lossb.settingsTitle')}</span>
          <span className="block text-xs text-tx3">{t('lossb.settingsHint')}</span>
        </span>
        {open ? <ChevronDown size={16} className="text-tx3" /> : <ChevronRight size={16} className="text-tx3" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <label key={f.key} className="block">
                <span className="block text-xs text-tx2 mb-1">{t(`lossb.f.${f.key}`)}</span>
                <span className="flex items-center gap-2">
                  <input type="number" inputMode="decimal" step={f.step} disabled={!canManage}
                    value={form[f.key] ?? ''} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                    className="input-field w-full" />
                  <span className="text-xs text-tx3 w-9">{f.unit}</span>
                </span>
              </label>
            ))}
          </div>
          {data?.splitter_loss && (
            <p className="text-[11px] text-tx3">
              {t('lossb.splitterTable')} {Object.entries(data.splitter_loss).map(([r, v]) => `1:${r} ${v} dB`).join(', ')}
            </p>
          )}
          {canManage && <Button variant="primary" onClick={save} loading={saving}>{t('lossb.save')}</Button>}
        </div>
      )}
    </section>
  );
}
