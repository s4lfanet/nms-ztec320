/**
 * Katalog model OLT (sama dengan pilihan di form Tambah OLT) untuk halaman
 * "Foto per model". vendor/model mengikuti cara form menyimpan OLT:
 * 'HIOSO-HA7304' → vendor 'hioso', model 'HA7304'.
 */
export type OltModelEntry = { vendor: string; model: string; label: string };

export const OLT_MODEL_CATALOG: OltModelEntry[] = [
  { vendor: 'zte', model: 'C320', label: 'ZTE C320' },
  { vendor: 'zte', model: 'C300', label: 'ZTE C300' },
  { vendor: 'zte', model: 'C300-M', label: 'ZTE C300 Mini' },
  { vendor: 'zte', model: 'C600', label: 'ZTE C600' },
  { vendor: 'zte', model: 'C650', label: 'ZTE C650' },
  { vendor: 'hioso', model: 'HA7302CS', label: 'HiOSO HA7302CS' },
  { vendor: 'hioso', model: 'HA7304', label: 'HiOSO HA7304' },
  { vendor: 'hioso', model: 'HA7304V', label: 'HiOSO HA7304V' },
  { vendor: 'hioso', model: 'HA7304C', label: 'HiOSO HA7304C' },
  { vendor: 'hioso', model: 'HA7308', label: 'HiOSO HA7308' },
  { vendor: 'hioso', model: 'HA7404', label: 'HiOSO HA7404' },
  { vendor: 'hioso', model: 'HA7408', label: 'HiOSO HA7408' },
  { vendor: 'hsgq', model: 'E02', label: 'HSGQ E02' },
  { vendor: 'hsgq', model: 'E04', label: 'HSGQ E04' },
  { vendor: 'hsgq', model: 'E08', label: 'HSGQ E08' },
  { vendor: 'hsgq', model: 'E16', label: 'HSGQ E16' },
  { vendor: 'hsgq', model: 'G02', label: 'HSGQ G02' },
  { vendor: 'hsgq', model: 'G04', label: 'HSGQ G04' },
  { vendor: 'hsgq', model: 'G08', label: 'HSGQ G08' },
  { vendor: 'vsol', model: 'V1600D4', label: 'VSOL V1600D4' },
  { vendor: 'vsol', model: 'V1600D8', label: 'VSOL V1600D8' },
  { vendor: 'vsol', model: 'V1600G1', label: 'VSOL V1600G1' },
  { vendor: 'cdata', model: 'FD1104', label: 'C-Data FD1104' },
  { vendor: 'cdata', model: 'FD1108', label: 'C-Data FD1108' },
  { vendor: 'cdata', model: 'FD1608GS', label: 'C-Data FD1608GS' },
  { vendor: 'bdcom', model: 'P3310C', label: 'BDCOM P3310C' },
  { vendor: 'bdcom', model: 'P3608', label: 'BDCOM P3608' },
  { vendor: 'bdcom', model: 'GP3600', label: 'BDCOM GP3600' },
  { vendor: 'huawei', model: 'MA5608T', label: 'Huawei MA5608T' },
  { vendor: 'huawei', model: 'MA5683T', label: 'Huawei MA5683T' },
  { vendor: 'fiberhome', model: 'AN5516-04', label: 'FiberHome AN5516-04' },
  { vendor: 'fiberhome', model: 'AN5516-06', label: 'FiberHome AN5516-06' },
  { vendor: 'raisecom', model: 'ISCOM6820', label: 'Raisecom ISCOM6820' },
  { vendor: 'dasan', model: 'V5824G', label: 'Dasan V5824G' },
];

/** Sama dengan olt_images.model_key() di backend. */
export function oltModelKey(vendor: string | null | undefined, model: string | null | undefined): string | null {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const v = slug(vendor || 'zte'), m = slug(model || '');
  return v && m ? `${v}--${m}` : null;
}
