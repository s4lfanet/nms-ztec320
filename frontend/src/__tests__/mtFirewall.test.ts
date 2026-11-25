import { describe, expect, it } from 'vitest';
import { buildFirewallScript, DEFAULT_FW, splitList, validAddr } from '../lib/mtFirewall';

describe('generator script firewall MikroTik', () => {
  it('memvalidasi IP/CIDR dan membuang entri berbahaya', () => {
    expect(validAddr('203.0.113.10')).toBe(true);
    expect(validAddr('10.0.0.0/8')).toBe(true);
    expect(validAddr('300.1.1.1')).toBe(false);
    expect(validAddr('1.2.3.4; /system reset')).toBe(false);
    const { script, invalid } = buildFirewallScript({ ...DEFAULT_FW, wan: ['ether1', 'x;y'], admins: ['1.2.3.4', 'evil"'] });
    expect(invalid).toEqual(['x;y', 'evil"']);
    expect(script).not.toContain('evil');
    expect(script).not.toContain('x;y');
  });

  it('aturan admin di atas, tahap brute force dari tahap akhir ke awal, semua disisipkan di atas', () => {
    const { script } = buildFirewallScript({ ...DEFAULT_FW, admins: ['10.10.0.250'] });
    const idx = (s: string) => script.indexOf(s);
    expect(idx('admin selalu lolos')).toBeLessThan(idx('port scan WAN'));
    expect(idx('brute force tahap 4')).toBeLessThan(idx('brute force tahap 1'));
    expect(script).toContain('address-list=nms-portscan-lan');
    expect(script).toContain('set winbox,ssh,api,api-ssl address=10.10.0.250');
    const adds = script.split('\n').filter(l => l.includes('/ip firewall filter add chain=input') && !l.includes('penanda'));
    expect(adds.every(l => l.endsWith('place-before=$pos'))).toBe(true);
    expect(script).not.toContain('drop sisa dari internet');   // dropWan bawaan mati
  });

  it('tanpa IP admin tidak membatasi layanan (tidak mengunci admin)', () => {
    const { script } = buildFirewallScript({ ...DEFAULT_FW, admins: [] });
    expect(script).not.toContain('nms-admin');
    expect(script).not.toMatch(/set winbox.*address=/);
    expect(splitList('1.1.1.1, 2.2.2.2\n1.1.1.1')).toEqual(['1.1.1.1', '2.2.2.2']);
  });
});
