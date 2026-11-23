import { describe, it, expect } from 'vitest';
import { oltDeviceClass, oltPonCount } from '../components/OltDeviceArt';

describe('oltDeviceClass', () => {
  it('memetakan model sasis besar', () => {
    expect(oltDeviceClass('zte', 'ZXA10 C300')).toBe('chassis-large');
    expect(oltDeviceClass('zte', 'C600')).toBe('chassis-large');
    expect(oltDeviceClass('huawei', 'MA5800-X7')).toBe('chassis-large');
    expect(oltDeviceClass('huawei', 'MA5683T')).toBe('chassis-large');
    expect(oltDeviceClass('fiberhome', 'AN5516-06')).toBe('chassis-large');
  });
  it('memetakan model sasis mini', () => {
    expect(oltDeviceClass('zte', 'ZTE C320')).toBe('chassis-mini');
    expect(oltDeviceClass('huawei', 'MA5608T')).toBe('chassis-mini');
    expect(oltDeviceClass('fiberhome', 'AN5516-04')).toBe('chassis-mini');
    expect(oltDeviceClass('zte', '')).toBe('chassis-mini');
  });
  it('vendor box 1U jatuh ke box', () => {
    expect(oltDeviceClass('hsgq', 'HSGQ-E04')).toBe('box');
    expect(oltDeviceClass('vsol', 'V1600G1')).toBe('box');
    expect(oltDeviceClass('cdata', 'FD1608S')).toBe('box');
  });
});

describe('oltPonCount', () => {
  it('membaca angka di akhir model', () => {
    expect(oltPonCount('HSGQ-E04')).toBe(4);
    expect(oltPonCount('V1600G-16')).toBe(16);
  });
  it('fallback ke kartu lalu 8', () => {
    expect(oltPonCount('XYZ', [{ total_ports: 4 }])).toBe(4);
    expect(oltPonCount('')).toBe(8);
  });
});
