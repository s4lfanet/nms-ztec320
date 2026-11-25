/**
 * Escape HTML untuk teks dari data (nama ONU/pelanggan/titik FTTH, label garis)
 * yang masuk ke popup/tooltip Leaflet — Leaflet menerima HTML mentah.
 * Audit keamanan 2026-11: versi lama di LeafletMap mengganti '&' dengan '&'
 * (tidak meng-escape apa pun) sehingga nama berisi tag ikut dirender.
 */
const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: unknown): string {
  if (s == null || s === '') return '';
  return String(s).replace(/[&<>"']/g, c => MAP[c]);
}
