import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { Search, ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, User, Server, Radio, Shield, KeyRound, Activity } from 'lucide-react';
import { TutorialBanner } from '../components/TutorialBanner';

const categoryIcons: Record<string, React.ReactNode> = {
  auth: <KeyRound size={14} />,
  olt: <Server size={14} />,
  onu: <Radio size={14} />,
  user: <User size={14} />,
  role: <Shield size={14} />,
  general: <Activity size={14} />,
};

const categoryColors: Record<string, string> = {
  auth: 'text-accent bg-accent/10',
  olt: 'text-info bg-info/10',
  onu: 'text-success bg-success/10',
  user: 'text-warning bg-warning/10',
  role: 'text-danger bg-danger/10',
  general: 'text-tx3 bg-glass',
};

function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ActionLogs() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const perPage = 20;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['action-logs', page, category, search],
    queryFn: () => api.actionLogs({ page, per_page: perPage, category: category || undefined, search: search || undefined }),
    refetchInterval: 10000,
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const logs = data?.logs || [];
  const totalPages = data?.pages || 1;
  const total = data?.total || 0;
  const categories = data?.categories || [];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Action Logs</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">Audit trail of all user activities</p>
        </div>
        <TutorialBanner
          title="Panduan Action Logs"
          steps={[
            { title: 'Filter & Search', content: <><p>Filter log by kategori (auth, olt, onu, user, role, general) dan search by keyword. Log entries menampilkan: timestamp, user, action, target, dan detail.</p><p className="text-xs text-tx3 mt-1">Server-side pagination — 50 entries per halaman. Klik page number untuk navigasi.</p></> },
            { title: 'Log Categories', content: <><p><strong>Auth</strong>: login/logout. <strong>OLT</strong>: sync, add/edit/delete OLT. <strong>ONU</strong>: provision, edit, delete, reboot, clear-config. <strong>User</strong>: add/edit/delete user. <strong>Role</strong>: role management.</p></> },
          ]}
          tips={
            <>
              <strong className="text-tx2">Tips:</strong>
              <ul className="mt-1 ml-4 space-y-0.5">
                <li>Log tidak bisa dihapus — audit trail permanen</li>
                <li>Search by username, action type, atau target ONU/OLT</li>
              </ul>
            </>
          }
        />
      </div>

      {/* Filters */}
      <div className="glass-card p-3 md:p-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex-1 flex items-center gap-2">
          <Search size={16} className="text-tx3 flex-shrink-0" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search action, target, detail..."
            className="flex-1 bg-glass border border-brd rounded-lg px-3 py-1.5 text-sm focus:border-accent/50 outline-none"
          />
        </div>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1); }}
          className="bg-glass border border-brd rounded-lg px-3 py-1.5 text-sm focus:border-accent/50 outline-none"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || category) && (
          <button
            onClick={() => { setSearch(''); setSearchInput(''); setCategory(''); setPage(1); }}
            className="px-3 py-1.5 rounded-lg bg-glass border border-brd text-xs text-tx3 hover:text-tx1 transition-all"
          >
            Clear
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-tx3">
        <span>{isFetching && !isLoading ? 'Refreshing...' : ''} {total} log entries</span>
        <span>Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}</span>
      </div>

      {/* Desktop table */}
      <div className="glass-card overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brd bg-glass/30">
                <th className="px-3 py-3 text-center text-xs font-medium text-tx3 uppercase w-12">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Target</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Detail</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-tx3">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-tx3">No log entries found</td></tr>
              ) : logs.map((l, i) => (
                <tr key={l.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                  <td className="px-3 py-2.5 text-center text-xs text-tx3 font-mono">{(page - 1) * perPage + i + 1}</td>
                  <td className="px-4 py-2.5 text-xs text-tx3 whitespace-nowrap">{formatDate(l.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-tx2">{l.username || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', categoryColors[l.category] || categoryColors.general)}>
                      {categoryIcons[l.category] || categoryIcons.general}
                      {l.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="text-xs text-accent">{l.action}</code>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tx2 max-w-[180px] truncate" title={l.target}>{l.target || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-tx3 max-w-[300px] truncate" title={l.detail}>{l.detail || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-tx3 whitespace-nowrap">{l.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-brd/50">
          {isLoading ? (
            <div className="p-6 text-center text-tx3 text-sm">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-center text-tx3 text-sm">No log entries found</div>
          ) : logs.map((l, i) => (
            <div key={l.id} className="p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-tx3 font-mono bg-glass rounded px-1.5 py-0.5">#{(page - 1) * perPage + i + 1}</span>
                  <span className="font-medium text-sm">{l.username || '—'}</span>
                </div>
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', categoryColors[l.category] || categoryColors.general)}>
                  {categoryIcons[l.category] || categoryIcons.general}
                  {l.category}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-accent">{l.action}</code>
                <span className="text-xs text-tx3">{formatDate(l.created_at)}</span>
              </div>
              {l.target && <div className="text-xs text-tx2 truncate">Target: {l.target}</div>}
              {l.detail && <div className="text-xs text-tx3 truncate">{l.detail}</div>}
              {l.ip_address && <div className="text-xs text-tx3">IP: {l.ip_address}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-tx3">
          Page <span className="font-semibold text-tx2">{page}</span> of {totalPages}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-glass border border-brd text-sm hover:bg-glass/80 transition-all disabled:opacity-40"
            title="First page"
          >
            <ChevronFirst size={14} />
          </button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-glass border border-brd text-sm hover:bg-glass/80 transition-all disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          {(() => {
            const pages: number[] = [];
            const start = Math.max(1, page - 2);
            const end = Math.min(totalPages, page + 2);
            for (let p = start; p <= end; p++) pages.push(p);
            return pages.map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium transition-all',
                  p === page
                    ? 'bg-accent text-white'
                    : 'bg-glass border border-brd text-tx2 hover:bg-glass/80'
                )}
              >
                {p}
              </button>
            ));
          })()}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-glass border border-brd text-sm hover:bg-glass/80 transition-all disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-glass border border-brd text-sm hover:bg-glass/80 transition-all disabled:opacity-40"
            title="Last page"
          >
            <ChevronLast size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
