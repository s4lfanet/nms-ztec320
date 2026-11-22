/**
 * Setiap t('kunci') literal di kode harus ada di file bahasa — kalau tidak,
 * i18next menampilkan kunci mentah (mis. "alertHistory.title") di layar.
 * Kunci dinamis (template string / variabel) tidak diperiksa di sini.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import id from '../i18n/locales/id.json';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p);
    return /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
}

function has(obj: unknown, key: string): boolean {
  let cur: unknown = obj;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return false;
  }
  return typeof cur === 'string';
}

describe('i18n keys used in code', () => {
  it('semua t("…") literal ada di id.json', () => {
    const missing: string[] = [];
    const re = /\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g;
    for (const f of walk(join(__dirname, '..'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(re)) {
        if (!has(id, m[1])) missing.push(`${m[1]}  (${f.split('/src/')[1]})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
