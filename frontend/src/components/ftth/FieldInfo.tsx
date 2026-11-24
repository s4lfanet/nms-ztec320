import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, X } from 'lucide-react';
import { api, type FTTHFieldInfo } from '../../lib/api';
import { cn } from '../../lib/utils';
import { toast } from '../Toast';
import { confirm } from '../ConfirmDialog';
import { useHasPerm } from '../../hooks/useHasPerm';

export const NODE_STATUSES = ['planned', 'active', 'maintenance', 'retired'] as const;
export const CABLE_TYPES = ['', 'adss', 'figure8', 'duct', 'drop', 'indoor', 'other'] as const;

/** Nilai awal form untuk keterangan lapangan (dipakai modal OTB/ODC/ODP/JC). */
export function fieldInfoInit(item: Partial<FTTHFieldInfo> | null | undefined) {
  return {
    cable_label: item?.cable_label || '',
    cable_type: item?.cable_type || '',
    cable_cores: item?.cable_cores ?? ('' as number | ''),
    cable_route: item?.cable_route || '',
    node_status: (item?.node_status || 'active') as string,
    installed_at: item?.installed_at || '',
  };
}

type FieldInfoForm = ReturnType<typeof fieldInfoInit>;

const STATUS_TONE: Record<string, string> = {
  planned: 'bg-info/15 text-info border-info/30',
  active: 'bg-success/15 text-success border-success/30',
  maintenance: 'bg-warning/15 text-warning border-warning/30',
  retired: 'bg-glass text-tx3 border-brd',
};

export function NodeStatusBadge({ status }: { status?: string | null }) {
  const { t } = useTranslation();
  const s = status || 'active';
  if (s === 'active') return null; // normal → tidak perlu label
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium', STATUS_TONE[s] || STATUS_TONE.retired)}>
      {t(`ftthf.status.${s}`)}
    </span>
  );
}

/** Bagian form: identitas kabel masuk + status & tanggal pasang node. */
export function FieldInfoSection<T extends FieldInfoForm>({ form, setForm }: { form: T; setForm: (f: T) => void }) {
  const { t } = useTranslation();
  const set = (patch: Partial<FieldInfoForm>) => setForm({ ...form, ...patch });
  return (
    <fieldset className="rounded-lg border border-brd p-3 space-y-3">
      <legend className="px-1 text-xs font-semibold text-tx2">{t('ftthf.section')}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="label-sm">{t('ftthf.nodeStatus')}</span>
          <select className="input-field" value={form.node_status} onChange={e => set({ node_status: e.target.value })}>
            {NODE_STATUSES.map(s => <option key={s} value={s}>{t(`ftthf.status.${s}`)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label-sm">{t('ftthf.installedAt')}</span>
          <input type="date" className="input-field" value={form.installed_at || ''} onChange={e => set({ installed_at: e.target.value })} />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-1">
          <span className="label-sm">{t('ftthf.cableLabel')}</span>
          <input className="input-field" value={form.cable_label} onChange={e => set({ cable_label: e.target.value })} placeholder="FO-FEEDER-01" />
        </label>
        <label className="block">
          <span className="label-sm">{t('ftthf.cableType')}</span>
          <select className="input-field" value={form.cable_type} onChange={e => set({ cable_type: e.target.value })}>
            {CABLE_TYPES.map(c => <option key={c} value={c}>{t(`ftthf.cable.${c || 'none'}`)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label-sm">{t('ftthf.cableCores')}</span>
          <input type="number" min={1} className="input-field" value={form.cable_cores}
            onChange={e => set({ cable_cores: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="24" />
        </label>
      </div>
      <label className="block">
        <span className="label-sm">{t('ftthf.cableRoute')}</span>
        <textarea className="input-field" rows={2} value={form.cable_route} onChange={e => set({ cable_route: e.target.value })}
          placeholder={t('ftthf.cableRoutePh')} />
      </label>
    </fieldset>
  );
}

/** Perkecil foto kamera HP sebelum diunggah (maks sisi 1600 px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>(res => canvas.toBlob(b => res(b || file), 'image/jpeg', 0.82));
  } catch {
    return file;
  }
}

/** Galeri foto node (kotak sambungan, label, kondisi lapangan). */
export function NodePhotos({ kind, id }: { kind: 'otb' | 'odc' | 'odp' | 'jc'; id: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canEdit = useHasPerm()('settings_ip_olts');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const key = ['ftth-photos', kind, id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.ftthPhotos(kind, id) });
  const photos = data?.photos || [];

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await api.ftthPhotoUpload(kind, id, await shrink(f));
      toast.success(t('ftthf.photoSaved'));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: key }); }
  };
  const remove = async (name: string) => {
    if (!(await confirm({ title: t('ftthf.photoRemoveTitle'), message: t('ftthf.photoRemoveMsg'), variant: 'danger' }))) return;
    try { await api.ftthPhotoDelete(kind, id, name); qc.invalidateQueries({ queryKey: key }); setView(null); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label-sm">{t('ftthf.photos')} {photos.length > 0 && <span className="text-tx3">({photos.length}/{data?.max ?? 12})</span>}</span>
        {canEdit && (
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50">
            <Camera size={13} /> {busy ? t('ftthf.uploading') : t('ftthf.addPhoto')}
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only"
          onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      {photos.length === 0 ? (
        <p className="text-[11px] text-tx3">{t('ftthf.noPhotos')}</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
          {photos.map(p => (
            <button key={p.name} type="button" onClick={() => setView(p.name)}
              className="aspect-square rounded-md overflow-hidden border border-brd bg-glass">
              <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true" onClick={() => setView(null)}>
          <img src={photos.find(p => p.name === view)?.url} alt="" className="max-w-full max-h-[80vh] rounded-lg" onClick={e => e.stopPropagation()} />
          <div className="mt-3 flex gap-3" onClick={e => e.stopPropagation()}>
            {canEdit && (
              <button type="button" onClick={() => remove(view)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-danger/20 text-danger text-sm">
                <Trash2 size={14} /> {t('ftthf.deletePhoto')}
              </button>
            )}
            <button type="button" onClick={() => setView(null)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white text-sm">
              <X size={14} /> {t('ftthf.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
