import { describe, it, expect } from 'vitest';
import { portKind, countKinds } from '../lib/portKind';

describe('portKind', () => {
  it('memakai ifType IANA lebih dulu', () => {
    expect(portKind({ name: 'ether1', if_type: 6 })).toBe('ethernet');
    expect(portKind({ name: 'sfp-sfpplus1', if_type: 117 })).toBe('ethernet');
    expect(portKind({ name: 'VLAN-100-PPPOE', if_type: 135 })).toBe('vlan');   // nama tak berawalan vlan, tipe yang menentukan
    expect(portKind({ name: 'bridge-lan', if_type: 209 })).toBe('bridge');
    expect(portKind({ name: 'bonding1', if_type: 161 })).toBe('bond');
    expect(portKind({ name: '<pppoe-budi>', if_type: 23 })).toBe('tunnel');
    expect(portKind({ name: 'wlan1', if_type: 71 })).toBe('wifi');
    expect(portKind({ name: 'lo', if_type: 24 })).toBe('loopback');
  });
  it('menebak dari nama bila tipe kosong / other / propVirtual', () => {
    expect(portKind({ name: 'ether5' })).toBe('ethernet');
    expect(portKind({ name: 'Gi1/0/24', if_type: 1 })).toBe('ethernet');
    expect(portKind({ name: 'vlan200', if_type: 53 })).toBe('vlan');
    expect(portKind({ name: 'ether1.300' })).toBe('vlan');
    expect(portKind({ name: 'bridge1', if_type: null })).toBe('bridge');
    expect(portKind({ name: 'pppoe-out1' })).toBe('tunnel');
    expect(portKind({ name: 'l2tp-out1' })).toBe('tunnel');
    expect(portKind({ name: 'Port-Channel1' })).toBe('bond');
    expect(portKind({ name: 'misterius' })).toBe('other');
    expect(portKind({})).toBe('other');
  });
  it('menghitung per jenis', () => {
    expect(countKinds([{ name: 'ether1', if_type: 6 }, { name: 'ether2', if_type: 6 }, { name: 'v10', if_type: 135 }])).toEqual({ ethernet: 2, vlan: 1 });
  });
});
