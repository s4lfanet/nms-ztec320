import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Siren, Users, Zap, Scissors, HelpCircle } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState, LoadingOverlay, StatusStrip } from '../components/ui';
import { cn, timeAgo } from '../lib/utils';
import { api, type IncidentSummary } from '../lib/api';

export const INCIDENT_STATUS_TONE: Record<string, string> = {
  open: 'bg-danger/15 text-danger border-danger/30',
  acknowledged: 'bg-warning/15 text-warning border-warning/30',
  en_route: 'bg-info/15 text-info border-info/30',
  on_site: 'bg-accent/15 text-accent border-accent/30',
  resolved: 'bg-success/15 text-success border-success/30',
  merged: 'bg-glass text-tx3 border-brd',
};

export function CauseIcon({ cause, size = 14 }: { cause: string; size?: number }) {
  if (cause === 'power') return <Zap size={size} className="text-warning" />;
  if (cause === 'fiber') return <Scissors size={size} className="text-danger" />;
  return <HelpCircle size={size} className="text-tx3" />;
}

type Filter = 'active' | 'closed' | 'all';

export function Incidents() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('active');
  const { data, isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => api.incidents(filter),
    refetchInterval: 30000,
  });
  const rows: IncidentSummary[] = data?.incidents || [];

  return (
    <PageContainer>
      <PageHeader
        title={t('pg_incidents.title')}
        description={t('pg_incidents.subtitle')}
        icon={<Siren size={22} />}
      />
      <StatusStrip
        className="mb-4"
        aria-label={t('pg_incidents.filter')}
        active={filter}
        onSelect={k => setFilter(k as Filter)}
        items={[
          { key: 'active', label: t('pg_incidents.filterActive'), count: data?.active_count ?? '–', tone: 'crit' },
          { key: 'closed', label: t('pg_incidents.filterClosed'), count: data?.closed_count ?? '–', tone: 'ok' },
          { key: 'all', label: t('pg_incidents.filterAll'), count: data ? data.active_count + data.closed_count : '–', tone: 'idle' },
        ]}
      />
      {isLoading ? <LoadingOverlay /> : rows.length === 0 ? (
        <EmptyState icon={Siren} title={t(filter === 'active' ? 'pg_incidents.emptyActive' : 'pg_incidents.empty')}
          description={t('pg_incidents.emptyHint')} />
      ) : (
        <div className="space-y-2">
          {rows.map(inc => (
            <Link key={inc.id} to={`/dashboard/incidents/${inc.id}`}
              className="block p-3.5 rounded-xl bg-surface border border-brd hover:border-accent/40 transition-colors">
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><CauseIcon cause={inc.cause} size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('px-2 py-0.5 rounded-md border text-[11px] font-semibold', INCIDENT_STATUS_TONE[inc.status])}>
                      {t(`pg_incidents.status_${inc.status}`)}
                    </span>
                    <span className="text-xs text-tx3">#{inc.id} · {timeAgo(inc.opened_at)}</span>
                  </div>
                  <div className="mt-1 font-semibold text-tx1 text-sm">
                    {inc.node_type.toUpperCase()} {inc.node_name}
                  </div>
                  <div className="mt-0.5 text-xs text-tx2">
                    {t('pg_incidents.affected', { n: inc.affected_count || inc.peak_affected })}
                    {inc.olt_name ? ` · ${inc.olt_name}` : ''}
                  </div>
                  {(inc.assigned.length > 0 || inc.acknowledged_by) && (
                    <div className="mt-1 text-xs text-tx3 flex items-center gap-1.5">
                      <Users size={12} />
                      {inc.acknowledged_by
                        ? t('pg_incidents.handledBy', { name: inc.acknowledged_by })
                        : t('pg_incidents.assignedTo', { names: inc.assigned.join(', ') })}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
