import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../components/Toast';
import {
  GitBranch, Download, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, ArrowUpCircle,
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card } from '../components/ui';
import { refreshAfterServerUpdate, type RefreshPhase } from '../lib/swUpdate';
import { confirm as confirmDialog } from '../components/ConfirmDialog';

interface UpdateCheckResult {
  success: boolean;
  up_to_date: boolean;
  local_sha: string;
  remote_sha: string;
  branch: string;
  commits: string[];
  message?: string;
}

interface UpdateApplyResult {
  success: boolean;
  message: string;
  restarted: boolean;
  pull_output?: string;
}

export function SystemUpdate() {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [applyResult, setApplyResult] = useState<UpdateApplyResult | null>(null);
  const [reloadPhase, setReloadPhase] = useState<RefreshPhase | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    setApplyResult(null);
    try {
      const r = await fetch('/api/system/update/check', { credentials: 'include' });
      const d = await r.json();
      setResult(d);
      if (!d.success) toast.error(d.message || 'Check failed');
    } catch {
      toast.error(t('pg_sysupdate.failedToCheckFor'));
    }
    setChecking(false);
  };

  const handleApply = async () => {
    if (!(await confirmDialog({ title: t('ui.applyConfirmTitle'), message: t('ui.applyConfirmMsg'), confirmLabel: t('ui.applyUpdate'), variant: 'warning' }))) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const r = await fetch('/api/system/update/apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const d = await r.json();
      setApplyResult(d);
      if (d.success) {
        toast.success(d.message);
        setResult(null);
        if (d.restarted) {
          // Langsung muat ulang tampilan begitu service hidup & versi baru terunduh.
          setReloadPhase('server');
          refreshAfterServerUpdate({ waitServer: true, onPhase: setReloadPhase });
        }
      } else {
        toast.error(d.message || 'Update failed');
      }
    } catch {
      toast.error(t('pg_sysupdate.failedToApplyUpdate'));
    }
    setApplying(false);
  };

  return (
    <PageContainer className="p-4 md:p-6 max-w-3xl">
      <PageHeader
        icon={
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <GitBranch size={20} className="text-accent" />
          </div>
        }
        title={t('pg_sysupdate.systemUpdate')}
        description={t('pg_sysupdate.checkAndApplyUpdates')}
      />

      {/* Check section */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t('pg_sysupdate.checkForUpdates')}</h3>
              <p className="text-xs text-tx3 mt-0.5">{t('pg_sysupdate.compareLocalVersionWith')}</p>
            </div>
            <Button
              variant="primary"
              icon={checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              onClick={handleCheck}
              disabled={checking}
            >
              {checking ? t('ui.checking') : t('ui.checkNow')}
            </Button>
          </div>

          {/* Result */}
          {result && result.success && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-glass border border-brd">
                {result.up_to_date ? (
                  <>
                    <CheckCircle2 size={18} className="text-success" />
                    <span className="text-sm text-success font-medium">{t('pg_sysupdate.systemIsUpTo')}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={18} className="text-warning" />
                    <span className="text-sm text-warning font-medium">{t('pg_sysupdate.updateAvailable')}</span>
                  </>
                )}
                <div className="ml-auto text-xs text-tx3 font-mono">
                  {result.local_sha} → {result.remote_sha}
                </div>
              </div>

              <div className="text-xs text-tx3 flex items-center gap-2">
                <GitBranch size={12} /> Branch: <span className="font-mono text-tx2">{result.branch}</span>
              </div>

              {result.up_to_date && (
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
                  <span className="flex-1 min-w-[12rem]">{t('pg_sysupdate.staleUiHint')}</span>
                  <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => refreshAfterServerUpdate()}>
                    {t('pg_sysupdate.reloadUi')}
                  </Button>
                </div>
              )}

              {/* Incoming commits */}
              {!result.up_to_date && result.commits.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-tx2">Incoming commits ({result.commits.length}):</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-glass border border-brd p-2 space-y-1">
                    {result.commits.map((c, i) => (
                      <div key={i} className="text-xs font-mono text-tx3 px-2 py-1 rounded hover:bg-glass-hover">
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply button */}
              {!result.up_to_date && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 transition-colors w-full justify-center"
                >
                  {applying ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpCircle size={16} />}
                  {applying ? t('ui.applying') : t('ui.applyUpdate')}
                </button>
              )}
            </div>
          )}

          {result && !result.success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
              <AlertCircle size={18} className="text-danger" />
              <span className="text-sm text-danger">{result.message}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Apply result */}
      {applyResult && (
        <Card className={applyResult.success ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'}>
          <div className="flex items-center gap-2 mb-2">
            {applyResult.success ? (
              <CheckCircle2 size={18} className="text-success" />
            ) : (
              <AlertCircle size={18} className="text-danger" />
            )}
            <span className={`text-sm font-medium ${applyResult.success ? 'text-success' : 'text-danger'}`}>
              {applyResult.message}
            </span>
          </div>
          {applyResult.pull_output && (
            <pre className="text-xs font-mono text-tx3 bg-black/30 rounded-lg p-2 mt-2 overflow-x-auto">{applyResult.pull_output}</pre>
          )}
          {applyResult.success && applyResult.restarted && (
            <div className="mt-3 flex flex-wrap items-center gap-2 p-3 rounded-lg bg-glass border border-brd">
              <Loader2 size={14} className="animate-spin text-accent flex-shrink-0" />
              <span className="flex-1 min-w-[12rem] text-xs text-tx2">
                {reloadPhase === 'download' ? t('cmp_update.downloadingUi') : reloadPhase === 'reload' ? t('cmp_update.reloading') : t('cmp_update.restarting')}
              </span>
              <Button variant="primary" icon={<RefreshCw size={14} />} onClick={() => refreshAfterServerUpdate()}>
                {t('pg_sysupdate.reloadUi')}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Info card */}
      <Card className="border-accent/20 bg-accent/5">
        <h4 className="text-xs font-semibold text-accent mb-2 flex items-center gap-1.5">
          <Download size={14} /> {t('ui.howItWorks')}
        </h4>
        <ul className="text-xs text-tx3 space-y-1.5 pl-4 list-disc">
          <li><strong>{t('pg_sysupdate.check')}</strong>{t('pg_sysupdate.fetchesLatestFromGithub')}</li>
          <li>{t('ui.applyExplain')}</li>
          <li>{t('pg_sysupdate.theAppWillBe')}</li>
          <li>{t('pg_sysupdate.onlySuperAdminCan')}</li>
        </ul>
      </Card>
    </PageContainer>
  );
}
