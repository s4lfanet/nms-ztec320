import type { KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Kolom pencarian. Ikon & tombol hapus diletakkan berdampingan (flex), bukan
 * melayang (absolute) di atas input — sehingga teks tidak pernah tertimpa ikon
 * walau padding input diubah oleh CSS lain (versi HP, skala teks Android, dll).
 */
export function SearchBar({ value, onChange, placeholder = 'Search...', className, onKeyDown }: SearchBarProps) {
  return (
    <div
      className={cn(
        'input-field search-bar !flex items-center gap-2 !px-3 cursor-text',
        className,
      )}
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
    >
      <Search size={15} className="text-tx3 shrink-0 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="search-bar-input flex-1 min-w-0 h-full !p-0 bg-transparent border-0 outline-none text-tx1 placeholder:text-tx3"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="touch-sm shrink-0 !min-h-0 !min-w-0 p-0.5 text-tx3 hover:text-tx1 transition-colors"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
