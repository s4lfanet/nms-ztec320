import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { Search, ChevronLeft, ChevronRight, User, Server, Radio, Shield, KeyRound, Activity } from 'lucide-react';

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
  const perPage = 50;

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
      <div className="text-xs text-tx3">
        {isFetching && !isLoading ? 'Refreshing...' : ''} {total} log entries
      </div>

      {/* Desktop table */}
      <div className="glass-card overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brd">
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
                <tr><td colSpan={7} className="px-4 py-8 text-center text-tx3">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-tx3">No log entries found</td></tr>
              ) : logs.map(l => (
                <tr key={l.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
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
          ) : logs.map(l => (
            <div key={l.id} className="p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{l.username || '—'}</span>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-tx3">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-glass border border-brd text-sm hover:bg-glass/80 transition-all disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-glass border border-brd text-sm hover:bg-glass/80 transition-all disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
