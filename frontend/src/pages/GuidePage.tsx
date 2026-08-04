import { useState, useMemo, useCallback } from 'react';
import { Search, HelpCircle, ChevronDown, ChevronRight, Lightbulb, AlertTriangle, BookOpen } from 'lucide-react';
import { guides, guideCategories, searchGuides, type Guide } from '../data/guides';

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return parts.map((part, i) => {
    if (part === '\n') return <br key={i} />;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-tx1 font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function GuideAccordion({ guide, defaultOpen }: { guide: Guide; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-glass/50 transition-colors"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
          <HelpCircle size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-tx1 truncate">{guide.title}</h3>
          <p className="text-xs text-tx3 truncate">{guide.description}</p>
        </div>
        {open ? <ChevronDown size={18} className="text-tx3 flex-shrink-0" /> : <ChevronRight size={18} className="text-tx3 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 animate-fade-in">
          {guide.prerequisites && guide.prerequisites.length > 0 && (
            <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-tx2">
              <div className="flex items-center gap-1.5 mb-1.5 font-semibold text-warning">
                <AlertTriangle size={14} /> Prasyarat
              </div>
              <ul className="ml-4 space-y-1 list-disc">
                {guide.prerequisites.map((p, i) => <li key={i}>{renderRichText(p)}</li>)}
              </ul>
            </div>
          )}
          <div className="space-y-2.5">
            {guide.steps.map((step, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm text-tx1">{step.title}</strong>
                  <p className="text-xs text-tx2 mt-0.5 leading-relaxed">{renderRichText(step.content)}</p>
                </div>
              </div>
            ))}
          </div>
          {guide.tips && guide.tips.length > 0 && (
            <div className="p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
              <div className="flex items-center gap-1.5 mb-1.5 font-semibold text-tx2">
                <Lightbulb size={14} className="text-accent" /> Tips
              </div>
              <ul className="ml-4 space-y-1 list-disc">
                {guide.tips.map((t, i) => <li key={i}>{renderRichText(t)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GuidePage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filtered = useMemo(() => {
    let result = query ? searchGuides(query) : guides;
    if (activeCategory !== 'All') {
      result = result.filter(g => g.category === activeCategory);
    }
    return result;
  }, [query, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, Guide[]>();
    for (const g of filtered) {
      if (!map.has(g.category)) map.set(g.category, []);
      map.get(g.category)!.push(g);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const ia = guideCategories.indexOf(a[0] as typeof guideCategories[number]);
      const ib = guideCategories.indexOf(b[0] as typeof guideCategories[number]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [filtered]);

  const categoriesWithCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of guides) {
      counts.set(g.category, (counts.get(g.category) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => {
      const ia = guideCategories.indexOf(a[0] as typeof guideCategories[number]);
      const ib = guideCategories.indexOf(b[0] as typeof guideCategories[number]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, []);

  const clearSearch = useCallback(() => setQuery(''), []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <BookOpen size={22} className="text-accent" /> Panduan
        </h1>
        <p className="text-tx2 text-xs md:text-sm mt-1">
          Pusat panduan penggunaan Salfanet NMS — {guides.length} panduan tersedia
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cari panduan... (mis: ONU, VLAN, traffic, alert)"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-glass border border-brd text-sm text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/30 transition-colors"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1 text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('All')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeCategory === 'All'
              ? 'bg-accent/15 text-accent border border-accent/20'
              : 'bg-glass border border-brd text-tx2 hover:text-tx1 hover:border-accent/30'
          }`}
        >
          Semua ({guides.length})
        </button>
        {categoriesWithCount.map(([cat, count]) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeCategory === cat
                ? 'bg-accent/15 text-accent border border-accent/20'
                : 'bg-glass border border-brd text-tx2 hover:text-tx1 hover:border-accent/30'
            }`}
          >
            {cat} ({count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <HelpCircle size={32} className="text-tx3 mx-auto mb-2" />
          <p className="text-tx2 text-sm">Tidak ada panduan yang cocok dengan "{query}"</p>
          <button onClick={() => { setQuery(''); setActiveCategory('All'); }} className="mt-3 text-xs text-accent hover:underline">
            Reset filter
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xs font-semibold text-tx3 uppercase tracking-wider mb-2 px-1">
                {category}
              </h2>
              <div className="space-y-2">
                {items.map(g => (
                  <GuideAccordion key={g.id} guide={g} defaultOpen={filtered.length === 1} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
