import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { api, type OltModelPhoto } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from './Toast';
import { confirm } from './ConfirmDialog';
import { Card } from './ui';
import { OltDeviceArt } from './OltDeviceArt';
import { OLT_MODEL_CATALOG, oltModelKey } from '../data/oltModels';

type Row = { key: string; vendor: string; model: string; label: string; olt_count: number; image_url: string | null };

/**
 * Foto asli per model OLT: unggah sekali (mis. foto ZTE C320), otomatis dipakai
 * semua OLT dengan vendor+model itu. Foto khusus satu OLT tetap menang.
 */
export function OltModelPhotos({ canManage, bare = false }: { canManage: boolean; bare?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['olt-models'], queryFn: api.oltModels });

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Row>();
    for (const m of (data?.models || []) as OltModelPhoto[]) {
      const cat = OLT_MODEL_CATALOG.find(c => oltModelKey(c.vendor, c.model) === m.key);
      byKey.set(m.key, { ...m, label: cat?.label || `${m.vendor.toUpperCase()} ${m.model}` });
    }
    for (const c of OLT_MODEL_CATALOG) {
      const key = oltModelKey(c.vendor, c.model)!;
      if (!byKey.has(key)) byKey.set(key, { key, vendor: c.vendor, model: c.model, label: c.label, olt_count: 0, image_url: null });
    }
    return [...byKey.values()];
  }, [data]);

  const primary = rows.filter(r => r.olt_count > 0 || r.image_url);
  const shown = showAll || primary.length === 0 ? rows : primary;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['olt-models'] });
    qc.invalidateQueries({ queryKey: ['olts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const upload = async (r: Row, file?: File) => {
    if (!file) return;
    setBusyKey(r.key);
    try { await api.oltModelImageUpload(r.vendor, r.model, file); toast.success(t('olts.modelPhotoSaved', { model: r.label })); refresh(); }
    catch (err) { toast.error((err as Error).message || t('oc.imageFailed')); }
    finally { setBusyKey(null); }
  };
  const remove = async (r: Row) => {
    if (!(await confirm({ title: t('olts.modelPhotoRemoveTitle', { model: r.label }), message: t('olts.modelPhotoRemoveMsg'), variant: 'danger' }))) return;
    setBusyKey(r.key);
    try { await api.oltModelImageDelete(r.key); toast.success(t('oc.imageRemoved')); refresh(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setBusyKey(null); }
  };

  const toggle = rows.length > primary.length && primary.length > 0 ? (
    <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowAll(v => !v)}>
      {showAll ? t('olts.modelPhotosInUse') : t('olts.modelPhotosAll', { n: rows.length })}
    </button>
  ) : undefined;
  const body = (
    <>
      <p className="text-xs text-tx3 mb-3 max-w-[70ch]">{t('olts.modelPhotosHint')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {shown.map(r => (
          <div key={r.key} className={cn('rounded-lg border border-brd bg-glass p-2 flex flex-col items-center gap-1.5 min-w-0', busyKey === r.key && 'opacity-60')}>
            <OltDeviceArt vendor={r.vendor} model={r.model} online imageUrl={r.image_url} className="w-full h-[64px]" title={r.label} />
            <div className="text-xs font-semibold text-tx1 truncate max-w-full">{r.label}</div>
            <div className="text-[11px] text-tx3">
              {r.olt_count > 0 ? t('olts.modelPhotoCount', { n: r.olt_count }) : t('olts.modelPhotoUnused')}
              {' · '}{r.image_url ? t('olts.modelPhotoReal') : t('olts.modelPhotoArt')}
            </div>
            {canManage && (
              <div className="flex items-center gap-3 text-[11px]">
                <label className={cn('text-accent hover:underline cursor-pointer', busyKey && 'pointer-events-none')}>
                  {r.image_url ? t('oc.imageChange') : t('oc.imageUpload')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; upload(r, f); }} />
                </label>
                {r.image_url && (
                  <button type="button" disabled={!!busyKey} onClick={() => remove(r)} className="text-tx3 hover:text-danger">{t('oc.imageRemove')}</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
  if (bare) {
    return (
      <div className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-tx1">{t('olts.modelPhotos')}</h3>
          {toggle}
        </div>
        {body}
      </div>
    );
  }
  return (
    <Card title={t('olts.modelPhotos')} icon={<ImageIcon size={16} className="text-accent" />} action={toggle}>
      {body}
    </Card>
  );
}
