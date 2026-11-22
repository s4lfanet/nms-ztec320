/**
 * Komponen bersama redesign Fase 1. Yang dijaga:
 * - StatusStrip: chip = filter (aria-pressed), angka tampil.
 * - ActionMenu: aksi merusak selalu di bawah aksi biasa, dan klik menutup menu.
 * - Stepper: HP menulis "Langkah n dari total".
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../i18n';
import { StatusStrip, ActionMenu, Stepper } from '../components/ui';

describe('StatusStrip', () => {
  it('menandai chip aktif dan memanggil onSelect', () => {
    const onSelect = vi.fn();
    render(<StatusStrip active="los" onSelect={onSelect} items={[
      { key: 'all', label: 'Semua', count: 180 },
      { key: 'los', label: 'LOS', count: 12, tone: 'crit' },
    ]} />);
    const los = screen.getByRole('button', { name: /LOS/ });
    expect(los.getAttribute('aria-pressed')).toBe('true');
    expect(los.textContent).toContain('12');
    fireEvent.click(screen.getByRole('button', { name: /Semua/ }));
    expect(onSelect).toHaveBeenCalledWith('all');
  });
});

describe('ActionMenu', () => {
  it('menaruh aksi merusak paling bawah dan menutup setelah dipilih', () => {
    const reboot = vi.fn();
    render(<ActionMenu label="Lainnya" actions={[
      { key: 'del', label: 'Hapus ONU', danger: true, onClick: () => {} },
      { key: 'reboot', label: 'Reboot', onClick: reboot },
      { key: 'wifi', label: 'Ubah WiFi', onClick: () => {} },
    ]} />);
    fireEvent.click(screen.getByRole('button', { name: /Lainnya/ }));
    const items = screen.getAllByRole('menuitem').map(b => b.textContent);
    expect(items).toEqual(['Reboot', 'Ubah WiFi', 'Hapus ONU']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reboot' }));
    expect(reboot).toHaveBeenCalledOnce();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});

describe('Stepper', () => {
  it('menulis posisi langkah untuk HP', () => {
    render(<Stepper current={1} steps={[{ label: 'Pilih OLT' }, { label: 'Profil layanan' }, { label: 'Tinjau' }]} />);
    expect(screen.getByText(/2.*3/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
  });
});
