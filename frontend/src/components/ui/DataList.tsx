import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** sembunyikan kolom di bawah lebar ini (tabel tablet) */
  hideBelow?: 'lg' | 'xl';
  /** tampilkan di kartu HP (default true) */
  mobile?: boolean;
  className?: string;
}

interface DataListProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** kartu HP kustom; default: kolom pertama sebagai judul, sisanya label: nilai */
  renderCard?: (row: T) => ReactNode;
  /** aksi per baris (mis. ActionMenu iconOnly) */
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
}

const alignCls = { left: 'text-left', right: 'text-right num', center: 'text-center' };
const hideCls = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

/**
 * Tabel di desktop, daftar kartu di HP (< 768 px). Header tabel menempel,
 * kolom angka rata kanan dengan angka tabular.
 */
export function DataList<T>({ rows, columns, rowKey, onRowClick, renderCard, rowActions, empty, rowClassName, className }: DataListProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const [first, ...rest] = columns;

  return (
    <div className={className}>
      {/* HP: kartu */}
      <ul className="md:hidden flex flex-col gap-2">
        {rows.map(r => (
          <li key={rowKey(r)} className={cn('glass-card rounded-xl', rowClassName?.(r))}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={() => onRowClick?.(r)}
              onKeyDown={e => { if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(r); } }}
              className={cn('p-3 flex gap-3 items-start', onRowClick && 'cursor-pointer active:bg-glass rounded-xl')}
            >
              <div className="flex-1 min-w-0">
                {renderCard ? renderCard(r) : (
                  <>
                    <div className="font-semibold text-tx1 truncate">{first.render(r)}</div>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {rest.filter(c => c.mobile !== false).map(c => (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-tx3 truncate">{c.header}</dt>
                          <dd className={cn('text-tx1 truncate', c.align === 'right' && 'num')}>{c.render(r)}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </div>
              {rowActions && <div className="shrink-0 -mr-1" onClick={e => e.stopPropagation()}>{rowActions(r)}</div>}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop/tablet: tabel */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-brd">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1]" style={{ background: 'var(--bg-surface)' }}>
            <tr className="border-b border-brd">
              {columns.map(c => (
                <th key={c.key} scope="col" className={cn('px-3 py-2.5 font-medium text-tx3 text-xs whitespace-nowrap', alignCls[c.align || 'left'], c.hideBelow && hideCls[c.hideBelow], c.className)}>
                  {c.header}
                </th>
              ))}
              {rowActions && <th scope="col" className="w-12"><span className="sr-only">Aksi</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={rowKey(r)}
                onClick={() => onRowClick?.(r)}
                className={cn('border-b border-brd/60 last:border-0', onRowClick && 'cursor-pointer hover:bg-glass/60', rowClassName?.(r))}
              >
                {columns.map(c => (
                  <td key={c.key} className={cn('px-3 py-2.5 text-tx1', alignCls[c.align || 'left'], c.hideBelow && hideCls[c.hideBelow], c.className)}>
                    {c.render(r)}
                  </td>
                ))}
                {rowActions && <td className="px-1 py-1 text-right" onClick={e => e.stopPropagation()}>{rowActions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
