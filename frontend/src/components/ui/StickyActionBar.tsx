import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Tombol aksi utama halaman/wizard. HP & tablet: menempel di bawah layar,
 * tepat di atas navigasi bawah (ikut safe-area). Desktop: baris biasa rata kanan.
 * Spacer mencegah konten terakhir tertutup tombol di HP.
 */
export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <div className="sticky-action-spacer" aria-hidden="true" />
      <div className={cn('sticky-action-bar', className)}>{children}</div>
    </>
  );
}
