import { describe, it, expect } from 'vitest';
import { parseUa, flag } from '../lib/ua';

describe('parseUa', () => {
  it('Chrome Android', () => {
    expect(parseUa('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'))
      .toEqual({ browser: 'Chrome 131', os: 'Android 14', kind: 'mobile' });
  });
  it('Safari iPhone & Edge Windows', () => {
    expect(parseUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toEqual({ browser: 'Safari 17', os: 'iOS 17', kind: 'mobile' });
    expect(parseUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'))
      .toEqual({ browser: 'Edge 131', os: 'Windows', kind: 'desktop' });
  });
  it('skrip/bot', () => {
    expect(parseUa('curl/8.5.0')?.kind).toBe('app');
    expect(parseUa('')).toBeNull();
  });
  it('flag', () => {
    expect(flag('ID')).toBe('🇮🇩');
    expect(flag('X')).toBe('');
  });
});
