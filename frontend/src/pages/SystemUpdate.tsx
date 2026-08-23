import { useState } from 'react';
import { toast } from '../components/Toast';
import {
  GitBranch, Download, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, ArrowUpCircle,
} from 'lucide-react';

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
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [applyResult, setApplyResult] = useState<UpdateApplyResult | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    setApplyResult(null);
    try {
      const r = await fetch('/api/system/update/check', { credentials: 'include' });
      const d = await r.json();
      setResult(d);
      if (!d.success) toast.error(d.message || 'Check failed');
    } catch {
      toast.error('Failed to check for updates');
    }
    setChecking(false);
  };

  const handleApply = async () => {
    if (!confirm('This will pull latest code from GitHub, rebuild the frontend, and restart the service. The app will be briefly unavailable. Continue?')) return;
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
      } else {
        toast.error(d.message || 'Update failed');
      }
    } catch {
      toast.error('Failed to apply update');
    }
    setApplying(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <GitBranch size={20} className="text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">System Update</h2>
          <p className="text-xs text-tx3">Check and apply updates from GitHub repository</p>
        </div>
      </div>

      {/* Check section */}
      <div className="p-4 md:p-5 rounded-xl bg-glass border border-brd space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Check for Updates</h3>
            <p className="text-xs text-tx3 mt-0.5">Compare local version with GitHub remote</p>
          </div>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {checking ? 'Checking...' : 'Check Now'}
          </button>
        </div>

        {/* Result */}
        {result && result.success && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary border border-brd">
              {result.up_to_date ? (
                <>
                  <CheckCircle2 size={18} className="text-success" />
                  <span className="text-sm text-success font-medium">System is up to date</span>
                </>
              ) : (
                <>
                  <AlertCircle size={18} className="text-warning" />
                  <span className="text-sm text-warning font-medium">Update available</span>
                </>
              )}
              <div className="ml-auto text-xs text-tx3 font-mono">
                {result.local_sha} → {result.remote_sha}
              </div>
            </div>

            <div className="text-xs text-tx3 flex items-center gap-2">
              <GitBranch size={12} /> Branch: <span className="font-mono text-tx2">{result.branch}</span>
            </div>

            {/* Incoming commits */}
            {!result.up_to_date && result.commits.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-tx2">Incoming commits ({result.commits.length}):</p>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-bg-secondary border border-brd p-2 space-y-1">
                  {result.commits.map((c, i) => (
                    <div key={i} className="text-xs font-mono text-tx3 px-2 py-1 rounded hover:bg-glass">
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
                {applying ? 'Applying update...' : 'Apply Update'}
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

      {/* Apply result */}
      {applyResult && (
        <div className={`p-4 rounded-xl border ${applyResult.success ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20'}`}>
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
            <pre className="text-xs font-mono text-tx3 bg-bg-secondary rounded-lg p-2 mt-2 overflow-x-auto">{applyResult.pull_output}</pre>
          )}
          {applyResult.restarted && (
            <p className="text-xs text-tx3 mt-2 flex items-center gap-1.5">
              <RefreshCw size={12} /> Service has been restarted. The page may need a manual refresh.
            </p>
          )}
        </div>
      )}

      {/* Info card */}
      <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
        <h4 className="text-xs font-semibold text-accent mb-2 flex items-center gap-1.5">
          <Download size={14} /> How It Works
        </h4>
        <ul className="text-xs text-tx3 space-y-1.5 pl-4 list-disc">
          <li><strong>Check</strong>: Fetches latest from GitHub and compares commit hashes</li>
          <li><strong>Apply</strong>: Runs <code className="text-tx2">git pull</code>, rebuilds frontend with <code className="text-tx2">pnpm build</code>, and restarts the service</li>
          <li>The app will be briefly unavailable during restart (a few seconds)</li>
          <li>Only super admin can perform updates</li>
        </ul>
      </div>
    </div>
  );
}
