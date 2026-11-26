import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, DatabaseBackup, Download, RotateCcw, TriangleAlert, Upload } from 'lucide-react';
import { Badge, Button, Card, Modal } from './ui';
import { toast } from './Toast';
import { api } from '../lib/api';

function age(sec: number | null | undefined, t: (k: string) => string) {
  if (sec == null) return '—';
  if (sec < 90) return `${sec} ${t('syshealth.sec')}`;
  if (sec < 5400) return `${Math.round(sec / 60)} ${t('syshealth.min')}`;
  if (sec < 172800) return `${Math.round(sec / 3600)} ${t('syshealth.hour')}`;
  return `${Math.round(sec / 86400)} ${t('syshealth.day')}`;
}
const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

type Target = { kind: 'server'; name: string } | { kind: 'upload'; file: File };

/** Pemulihan database: wajib ketik RESTORE. Salinan pengaman dibuat otomatis; layanan restart setelahnya. */
function RestoreDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [word, setWord] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => (target!.kind === 'server' ? api.systemRestoreFromBackup(target!.name) : api.systemRestoreUpload(target!.file)),
    onSuccess: (r) => {
      setDone(r.restarting ? t('syshealth.restoreDoneRestart') : t('syshealth.restoreDoneManual'));
      if (r.restarting) setTimeout(() => window.location.reload(), 15_000);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const close = () => { if (!run.isPending) { setWord(''); setDone(null); onClose(); } };
  const label = target ? (target.kind === 'server' ? target.name : target.file.name) : '';
  return (
    <Modal open={!!target} onClose={close} title={t('syshealth.restoreTitle')} icon={<TriangleAlert size={18} className="text-danger" />} size="sm"
      footer={done ? <Button variant="primary" onClick={() => window.location.reload()}>{t('syshealth.reload')}</Button> : (
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={close} disabled={run.isPending}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => run.mutate()} loading={run.isPending} disabled={word !== 'RESTORE'}>{t('syshealth.restoreGo')}</Button>
        </div>)}>
      {done ? <p className="text-sm">{done}</p> : (
        <div className="space-y-3 text-sm">
          <p className="font-mono text-xs break-all">{label}</p>
          <p className="text-tx2">{t('syshealth.restoreWarn')}</p>
          <label className="block"><span className="label-sm">{t('syshealth.restoreType')}</span>
            <input className="input-field" value={word} onChange={e => setWord(e.target.value)} autoComplete="off" /></label>
        </div>)}
    </Modal>
  );
}

/** Status job latar belakang + backup (DB, salinan luar server, konfigurasi OLT). Hanya super admin. */
export function SystemHealth() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ['system-health'], queryFn: api.systemHealth, refetchInterval: 60_000 });
  const backup = useMutation({
    mutationFn: api.systemBackupDb,
    onSuccess: (r) => {
      toast.success(r.remote_uploaded ? t('syshealth.backupOkRemote') : t('syshealth.backupOk'));
      qc.invalidateQueries({ queryKey: ['system-health'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!data?.success) return null;
  const { jobs, backup: b } = data;
  const remote = b.remote;
  return (
    <>
      <Card title={t('syshealth.jobs')} icon={<Activity size={16} />}>
        <p className="text-xs text-tx3 mb-3">{t('syshealth.jobsHint')}</p>
        <div className="divide-y divide-brd">
          {jobs.map(j => (
            <div key={j.name} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{j.title}</span>
              <span className="flex items-center gap-2 shrink-0 text-xs text-tx3">
                {j.age_seconds == null ? <Badge>{t('syshealth.noBeat')}</Badge>
                  : <><span>{age(j.age_seconds, t)}</span><Badge variant={j.ok ? 'success' : 'danger'}>{j.ok ? t('syshealth.running') : t('syshealth.stale')}</Badge></>}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('syshealth.backup')} icon={<DatabaseBackup size={16} />}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="text-sm">
            {b.db.latest
              ? <>{t('syshealth.latest')}: <strong>{age(b.db.latest.age_seconds, t)}</strong> {t('syshealth.ago')} ({mb(b.db.latest.size)}) · {b.db.count} {t('syshealth.files')}</>
              : <span className="text-danger">{t('syshealth.noBackup')}</span>}
            {b.disk && <span className="text-xs text-tx3 ml-2">{t('syshealth.diskFree')} {b.disk.free_pct}%</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => backup.mutate()} loading={backup.isPending}>{t('syshealth.backupNow')}</Button>
            <Button variant="secondary" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>{t('syshealth.restoreUpload')}</Button>
            <input ref={fileRef} type="file" accept=".db" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setTarget({ kind: 'upload', file: f }); e.target.value = ''; }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
          <span className="text-tx2">{t('syshealth.offsite')}:</span>
          {!remote.configured ? <Badge variant="warning">{t('syshealth.offsiteOff')}</Badge>
            : remote.status === 'failed' ? <Badge variant="danger">{t('syshealth.offsiteFail')}</Badge>
            : <Badge variant="success">{remote.last_ok ? `${t('syshealth.offsiteOk')} ${remote.last_ok}` : t('syshealth.offsiteWait')}</Badge>}
          {remote.configured && <span className="text-xs text-tx3">{remote.target}</span>}
        </div>
        {!remote.configured && <p className="text-xs text-tx3 mb-3">{t('syshealth.offsiteHint')}</p>}
        {remote.status === 'failed' && remote.error && <p className="text-xs text-danger mb-3 break-all">{remote.error}</p>}

        {b.db.files.length > 0 && (
          <div className="divide-y divide-brd mb-3">
            {b.db.files.slice(0, 5).map(f => (
              <div key={f.name} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="min-w-0 truncate font-mono">{f.name}</span>
                <span className="flex items-center gap-3 shrink-0 text-tx3">
                  {mb(f.size)}
                  <a className="text-accent inline-flex items-center gap-1" href={`/api/system/backups/${encodeURIComponent(f.name)}`} download><Download size={12} />{t('syshealth.download')}</a>
                  {f.name.endsWith('.db') && <button type="button" className="text-danger inline-flex items-center gap-1" onClick={() => setTarget({ kind: 'server', name: f.name })}><RotateCcw size={12} />{t('syshealth.restore')}</button>}
                </span>
              </div>
            ))}
          </div>
        )}

        {b.olt.length > 0 && (
          <>
            <h4 className="text-xs font-semibold text-tx2 mb-1">{t('syshealth.oltBackup')}</h4>
            <div className="divide-y divide-brd">
              {b.olt.map(o => (
                <div key={o.olt_id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate">{o.name}</span>
                  <span className="flex items-center gap-2 shrink-0 text-tx3">
                    {o.age_hours == null ? t('syshealth.never') : `${age(Math.round(o.age_hours * 3600), t)} ${t('syshealth.ago')}`}
                    <Badge variant={o.stale ? 'danger' : 'success'}>{o.stale ? t('syshealth.stale') : t('syshealth.running')}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      <RestoreDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
