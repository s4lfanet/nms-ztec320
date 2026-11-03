import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Server, Radio, Box, Package, Grid, User } from 'lucide-react';
import { cn } from '../lib/utils';

interface SearchItem {
  id: number; name: string; type: string;
  serial?: string; status?: string; olt?: string;
  ip?: string; location?: string; username?: string;
}

const TYPE_ICONS: Record<string, any> = {
  olt: Server, onu: Radio, odp: Box, odc: Package, otb: Grid, user: User,
};
const TYPE_ROUTES: Record<string, string> = {
  olt: '/dashboard/olt-settings', onu: '/dashboard/onu',
  odp: '/dashboard/ftth', odc: '/dashboard/ftth', otb: '/dashboard/ftth',
  user: '/dashboard/users',
};
const TYPE_LABELS: Record<string, string> = {
  olt: 'OLT', onu: 'ONU', odp: 'ODP', odc: 'ODC', otb: 'OTB', user: 'User',
};

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        setQuery(''); setResults({}); setSelected(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults({}); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
        const d = await r.json();
        setResults(d.results || {});
        setSelected(0);
      } catch { setResults({}); }
      finally { setLoading(false); }
    }, 250);
  }, [query]);

  // Flatten all items for keyboard nav
  const items: SearchItem[] = [];
  for (const [type, arr] of Object.entries(results)) {
    for (const item of arr) items.push({ ...item, type });
  }

  const select = useCallback((item: SearchItem) => {
    setOpen(false);
    const base = TYPE_ROUTES[item.type] || '/dashboard';
    navigate(item.type === 'onu' ? `${base}/${item.id}` :
             item.type === 'odp' || item.type === 'odc' || item.type === 'otb' ? `${base}?${item.type}=${item.id}` :
             base);
  }, [navigate]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && items[selected]) { select(items[selected]); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg mx-4 bg-surface border border-brd rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-brd">
          <Search size={16} className="text-tx3 flex-shrink-0" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown} placeholder="Cari ONU, OLT, ODP, ODC, user…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-tx3" />
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-glass text-tx3 font-mono">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {query.length < 2 && (
            <div className="px-4 py-6 text-center text-xs text-tx3">Ketik minimal 2 karakter…</div>
          )}
          {loading && <div className="px-4 py-4 text-center text-xs text-tx3">Mencari…</div>}
          {!loading && query.length >= 2 && items.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-tx3">Tidak ditemukan.</div>
          )}
          {!loading && items.map((item, i) => {
            const Icon = TYPE_ICONS[item.type] || Radio;
            return (
              <button key={`${item.type}-${item.id}`} onClick={() => select(item)}
                className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  i === selected ? 'bg-accent/10 text-accent' : 'hover:bg-glass text-tx2')}
                onMouseEnter={() => setSelected(i)}>
                <Icon size={15} className={i === selected ? 'text-accent' : 'text-tx3'} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  <div className="text-[10px] text-tx3 truncate">
                    {TYPE_LABELS[item.type]}{item.serial ? ` • ${item.serial}` : ''}{item.ip ? ` • ${item.ip}` : ''}{item.olt ? ` • ${item.olt}` : ''}{item.status ? ` • ${item.status}` : ''}
                  </div>
                </div>
                <span className="text-[10px] text-tx3 uppercase flex-shrink-0">{item.type}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-brd flex items-center gap-3 text-[10px] text-tx3">
          <span><kbd className="px-1 py-0.5 bg-glass rounded font-mono">↑↓</kbd> navigasi</span>
          <span><kbd className="px-1 py-0.5 bg-glass rounded font-mono">Enter</kbd> buka</span>
          <span><kbd className="px-1 py-0.5 bg-glass rounded font-mono">Ctrl+K</kbd> tutup</span>
        </div>
      </div>
    </div>
  );
}
