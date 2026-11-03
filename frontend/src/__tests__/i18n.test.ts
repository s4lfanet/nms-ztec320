/**
 * Guards for the Fase 10 i18n + theme work:
 * - id/en locale files must carry the same key set (parity)
 * - theme store resolves 'system' via matchMedia and toggles the html class
 */
import { describe, it, expect, beforeEach } from 'vitest';
import id from '../i18n/locales/id.json';
import en from '../i18n/locales/en.json';
import { resolveTheme, useTheme, initTheme } from '../stores/theme';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

describe('i18n locales', () => {
  it('id and en have identical key sets', () => {
    const idKeys = flattenKeys(id).sort();
    const enKeys = flattenKeys(en).sort();
    expect(enKeys).toEqual(idKeys);
  });

  it('no empty translation values', () => {
    for (const [k, v] of Object.entries(flattenKeys(en).map(k => [k, k]))) {
      expect(v).toBeTruthy();
    }
    const scan = (o: Record<string, unknown>) => {
      for (const v of Object.values(o)) {
        if (typeof v === 'string') expect(v.length).toBeGreaterThan(0);
        else scan(v as Record<string, unknown>);
      }
    };
    scan(id);
    scan(en);
  });
});

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light');
  });

  it('resolveTheme passes through explicit dark/light', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('resolveTheme resolves system from matchMedia', () => {
    const resolved = resolveTheme('system');
    expect(['dark', 'light']).toContain(resolved);
    expect(resolved).toBe(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  });

  it('set() applies light class to <html> and persists to localStorage', () => {
    useTheme.getState().set('light', { persist: false });
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('light');
    useTheme.getState().set('dark', { persist: false });
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('initTheme restores stored preference', () => {
    localStorage.setItem('theme', 'light');
    initTheme();
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(useTheme.getState().theme).toBe('light');
  });

  it('toggle() flips resolved theme', () => {
    useTheme.getState().set('dark', { persist: false });
    useTheme.getState().toggle();
    expect(useTheme.getState().resolved).toBe('light');
  });
});
