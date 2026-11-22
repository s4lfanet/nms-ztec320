import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Siren, MapPin, Users, Camera, CheckCircle2, Navigation, Hand, Flag, Send, Radio, MessageCircle, Copy,
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, LoadingOverlay, Sheet, StickyActionBar, Textarea, Notice } from '../components/ui';
import { toast } from '../components/Toast';
import { cn, formatDate, timeAgo } from '../lib/utils';
import { api, ApiError } from '../lib/api';
import { CauseIcon, INCIDENT_STATUS_TONE } from './Incidents';

const NEXT: Record<string, { status: string; labelKey: string; icon: React.ReactNode } | undefined> = {
  open: { status: 'acknowledged', labelKey: 'pg_incidents.actAck', icon: <Hand size={16} /> },
  acknowledged: { status: 'en_route', labelKey: 'pg_incidents.actEnRoute', icon: <Navigation size={16} /> },
  en_route: { status: 'on_site', labelKey: 'pg_incidents.actOnSite', icon: <Flag size={16} /> },
};
const ACTIVE = ['open', 'acknowledged', 'en_route', 'on_site'];
const QUICK_CAUSES = ['causeFiberSpliced', 'causePower', 'causeAdaptor', 'causeSplitter', 'causeConnector', 'causeSelf'];

export function IncidentDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const incId = Number(id);
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['incident', incId],
    queryFn: () => api.incident(incId),
    enabled: incId > 0,
    refetchInterval: 30000,
  });
  const inc = data?.incident;
  const [busy, setBusy] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeText, setNoticeText] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['incident', incId] });
    qc.invalidateQueries({ queryKey: ['incidents'] });
  };
  const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : t('pg_incidents.failed'));

  const setStatus = async (status: string, n = '') => {
    setBusy(true);
    try {
      await api.incidentStatus(incId, status, n);
      toast.success(t(`pg_incidents.status_${status}`));
      setResolveOpen(false); setResolveNote('');
      refresh();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  const sendNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try { await api.incidentNote(incId, note.trim()); setNote(''); refresh(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  const sendPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { await api.incidentPhoto(incId, file, note.trim()); setNote(''); toast.success(t('pg_incidents.photoSaved')); refresh(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (isLoading) return <PageContainer><LoadingOverlay /></PageContainer>;
  if (isError || !inc) {
    return (
      <PageContainer>
        <EmptyState icon={Siren} title={t('pg_incidents.notFound')} description={t('pg_incidents.notFoundHint')} />
      </PageContainer>
    );
  }

  const active = ACTIVE.includes(inc.status);
  const next = NEXT[inc.status];
  const canAct = inc.can_handle && active;
  const impactLink = `/dashboard/ftth?tab=${inc.node_type}&${inc.node_type}=${inc.node_id}`;
  const timeline: Array<[string, string | null]> = [
    ['opened', inc.opened_at], ['acknowledged', inc.acknowledged_at], ['en_route', inc.en_route_at],
    ['on_site', inc.on_site_at], ['resolved', inc.resolved_at],
  ];

  return (
    <PageContainer>
      <PageHeader
        title={`${inc.node_type.toUpperCase()} ${inc.node_name}`}
        description={t('pg_incidents.detailSubtitle', { id: inc.id })}
        icon={<Siren size={22} />}
        breadcrumbs={[{ label: t('pg_incidents.title'), path: '/dashboard/incidents' }, { label: `#${inc.id}` }]}
      />

      {inc.merged_into_id && (
        <Notice className="mb-4" tone="info">
          <Link className="underline" to={`/dashboard/incidents/${inc.merged_into_id}`}>
            {t('pg_incidents.mergedInto', { id: inc.merged_into_id })}
          </Link>
        </Notice>
      )}
      {active && inc.recovered_at && (
        <Notice className="mb-4" tone="ok">{t('pg_incidents.recoveredHint')}</Notice>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('px-2 py-0.5 rounded-md border text-xs font-semibold', INCIDENT_STATUS_TONE[inc.status])}>
                {t(`pg_incidents.status_${inc.status}`)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-tx2">
                <CauseIcon cause={inc.cause} /> {t(`pg_incidents.cause_${inc.cause || 'mixed'}`)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-sm">
              <div><div className="text-[11px] text-tx3">{t('pg_incidents.affectedLabel')}</div>
                <div className="font-semibold text-tx1">{inc.affected_count} <span className="text-xs text-tx3">/ {t('pg_incidents.peak', { n: inc.peak_affected })}</span></div></div>
              <div><div className="text-[11px] text-tx3">{t('pg_incidents.onlineNow')}</div>
                <div className="font-semibold text-success">{inc.online_now} / {inc.onus.length}</div></div>
              <div><div className="text-[11px] text-tx3">OLT</div><div className="font-semibold text-tx1 truncate">{inc.olt_name || '–'}</div></div>
              <div><div className="text-[11px] text-tx3">{t('pg_incidents.openedLabel')}</div>
                <div className="text-tx1">{timeAgo(inc.opened_at)}</div></div>
              <div className="col-span-2"><div className="text-[11px] text-tx3">{t('pg_incidents.assignedLabel')}</div>
                <div className="text-tx1 flex items-center gap-1.5"><Users size={13} />{inc.assigned.join(', ') || t('pg_incidents.noAssignee')}</div></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {inc.maps_url && (
                <a href={inc.maps_url} target="_blank" rel="noopener noreferrer" className="btn-cancel border border-brd inline-flex items-center gap-2 text-sm">
                  <MapPin size={15} /> {t('pg_incidents.openMaps')}
                </a>
              )}
              <Link to={impactLink} className="btn-cancel border border-brd inline-flex items-center gap-2 text-sm">
                <Radio size={15} /> {t('pg_incidents.openImpact')}
              </Link>
              {active && (
                <button type="button" className="btn-cancel border border-brd inline-flex items-center gap-2 text-sm"
                  onClick={() => { setNoticeText(t('pg_incidents.noticeTemplate', { area: `${inc.node_type.toUpperCase()} ${inc.node_name}` })); setNoticeOpen(true); }}>
                  <MessageCircle size={15} /> {t('pg_incidents.customerNotice')}
                </button>
              )}
            </div>
            {inc.resolution_note && (
              <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/25 text-sm">
                <div className="text-[11px] text-tx3 mb-1">{t('pg_incidents.resolutionLabel')} {inc.resolved_by && `· ${inc.resolved_by}`}</div>
                {inc.resolution_note}
              </div>
            )}
          </Card>

          <Card title={t('pg_incidents.progress')}>
            <ol className="space-y-2">
              {timeline.map(([key, at]) => (
                <li key={key} className="flex items-center gap-3 text-sm">
                  <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', at ? 'bg-accent' : 'bg-brd')} />
                  <span className={cn('flex-1', at ? 'text-tx1' : 'text-tx3')}>{t(`pg_incidents.step_${key}`)}</span>
                  <span className="text-xs text-tx3">{at ? formatDate(at) : '–'}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={t('pg_incidents.activity')}>
            {canAct && (
              <div className="space-y-2 mb-4">
                <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={t('pg_incidents.notePlaceholder')} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<Send size={15} />} loading={busy} disabled={!note.trim()} onClick={sendNote}>
                    {t('pg_incidents.addNote')}
                  </Button>
                  <Button variant="secondary" icon={<Camera size={15} />} disabled={busy} onClick={() => fileRef.current?.click()}>
                    {t('pg_incidents.addPhoto')}
                  </Button>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
                    onChange={e => sendPhoto(e.target.files?.[0])} />
                </div>
              </div>
            )}
            <ul className="space-y-3">
              {[...inc.logs].reverse().map(lg => (
                <li key={lg.id} className="text-sm border-l-2 border-brd pl-3">
                  <div className="text-[11px] text-tx3">
                    {formatDate(lg.at)} · {lg.username || t('pg_incidents.system')}
                    {lg.status && ` · ${t(`pg_incidents.status_${lg.status}`)}`}
                  </div>
                  {lg.note && <div className="text-tx1 whitespace-pre-wrap break-words">{lg.note}</div>}
                  {lg.photo && (
                    <a href={`/api/incidents/${inc.id}/photos/${lg.photo}`} target="_blank" rel="noopener noreferrer">
                      <img src={`/api/incidents/${inc.id}/photos/${lg.photo}`} alt={t('pg_incidents.photoAlt')}
                        className="mt-1.5 max-h-48 rounded-lg border border-brd" loading="lazy" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="lg:col-span-5" title={t('pg_incidents.affectedList', { n: inc.onus.length })}>
          <div className="space-y-1 max-h-[28rem] overflow-y-auto">
            {inc.onus.map(o => (
              <Link key={o.id} to={`/dashboard/onus/${o.id}`} className="flex items-center gap-2 p-2 rounded-lg bg-glass text-xs hover:bg-accent/10">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', o.status === 'online' ? 'bg-success' : o.status === 'dyinggasp' ? 'bg-warning' : 'bg-danger')} />
                <span className="font-medium truncate flex-1">{o.name}</span>
                <span className="text-tx3 font-mono">{o.status}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {canAct && (
        <StickyActionBar>
          {next && (
            <Button variant="primary" icon={next.icon} loading={busy} onClick={() => setStatus(next.status)}>
              {t(next.labelKey)}
            </Button>
          )}
          <Button variant={next ? 'secondary' : 'primary'} icon={<CheckCircle2 size={16} />} disabled={busy} onClick={() => setResolveOpen(true)}>
            {t('pg_incidents.actResolve')}
          </Button>
        </StickyActionBar>
      )}

      <Sheet
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        title={t('pg_incidents.customerNotice')}
        description={t('pg_incidents.noticeDesc')}
        footer={
          <Button variant="primary" icon={<Copy size={16} />} onClick={async () => {
            try { await navigator.clipboard.writeText(noticeText); toast.success(t('pg_incidents.copied')); }
            catch { toast.error(t('pg_incidents.copyFailed')); }
          }}>{t('pg_incidents.copyText')}</Button>
        }
      >
        <Textarea rows={6} value={noticeText} onChange={e => setNoticeText(e.target.value)} />
        {(() => {
          const withPhone = inc.onus.filter(o => o.phone);
          return (
            <div className="mt-4">
              <div className="text-xs text-tx3 mb-2">{t('pg_incidents.noticeCustomers', { n: withPhone.length, total: inc.onus.length })}</div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {withPhone.map(o => {
                  const digits = o.phone.replace(/\D/g, '').replace(/^0/, '62');
                  return (
                    <a key={o.id} href={`https://wa.me/${digits}?text=${encodeURIComponent(noticeText)}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg bg-glass text-xs hover:bg-accent/10">
                      <MessageCircle size={13} className="text-success" />
                      <span className="flex-1 truncate">{o.customer || o.name}</span>
                      <span className="font-mono text-tx3">{o.phone}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Sheet>

      <Sheet
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title={t('pg_incidents.resolveTitle')}
        description={t('pg_incidents.resolveDesc')}
        footer={
          <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={busy} disabled={resolveNote.trim().length < 3}
            onClick={() => setStatus('resolved', resolveNote.trim())}>
            {t('pg_incidents.actResolve')}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_CAUSES.map(k => (
            <button key={k} type="button" onClick={() => setResolveNote(t(`pg_incidents.${k}`))}
              className="px-2.5 py-1 rounded-md border border-brd bg-glass text-xs text-tx2 hover:border-accent/40">
              {t(`pg_incidents.${k}`)}
            </button>
          ))}
        </div>
        <Textarea rows={4} value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder={t('pg_incidents.resolvePlaceholder')} />
      </Sheet>
    </PageContainer>
  );
}
