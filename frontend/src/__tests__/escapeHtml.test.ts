import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../lib/html';

describe('escapeHtml (popup peta)', () => {
  it('meng-escape tag dan atribut', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml(`a"b'c&d`)).toBe('a&quot;b&#39;c&amp;d');
  });
  it('kosong / null', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(12)).toBe('12');
  });
});
