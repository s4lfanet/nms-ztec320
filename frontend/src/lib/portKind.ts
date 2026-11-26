/** Jenis port/antarmuka untuk filter daftar port SNMP (mis. MikroTik dengan ratusan VLAN & PPPoE).
 *  Utama: ifType IANA dari perangkat; bila tak dikenal (kosong/other/propVirtual) → tebak dari nama. */
export type PortKind = 'ethernet' | 'vlan' | 'bridge' | 'bond' | 'tunnel' | 'wifi' | 'loopback' | 'other';

export const PORT_KINDS: PortKind[] = ['ethernet', 'vlan', 'bridge', 'bond', 'tunnel', 'wifi', 'loopback', 'other'];

const BY_TYPE: Record<number, PortKind> = {
  6: 'ethernet', 62: 'ethernet', 69: 'ethernet', 117: 'ethernet', 26: 'ethernet', 169: 'ethernet',
  135: 'vlan', 136: 'vlan',
  209: 'bridge',
  161: 'bond',
  23: 'tunnel', 131: 'tunnel', 108: 'tunnel', 150: 'tunnel',
  71: 'wifi',
  24: 'loopback',
};

const BY_NAME: [RegExp, PortKind][] = [
  [/^(vlan|.*\.\d{1,4}$)/, 'vlan'],
  [/^(bridge|br\d|br-)/, 'bridge'],
  [/^(bond|lag|po\d|port-channel|trunk)/, 'bond'],
  [/^(<?pppoe|<?pptp|<?l2tp|<?sstp|<?ovpn|ppp|gre|ipip|eoip|wg|wireguard|tun|tunnel|zerotier)/, 'tunnel'],
  [/^(wlan|wifi|wi-fi|ath|ra\d)/, 'wifi'],
  [/^(lo|loopback)/, 'loopback'],
  [/^(ether|eth|sfp|qsfp|combo|gi|ge|te|xe|fa|ten|forty|fastethernet|gigabit|port\d|\d+\/\d+)/, 'ethernet'],
];

export function portKind(p: { name?: string; if_type?: number | null }): PortKind {
  if (p.if_type != null && BY_TYPE[p.if_type]) return BY_TYPE[p.if_type];
  const n = (p.name || '').trim().toLowerCase();
  for (const [re, k] of BY_NAME) if (re.test(n)) return k;
  return 'other';
}

/** Jumlah port per jenis (hanya jenis yang ada). */
export function countKinds(ports: { name?: string; if_type?: number | null }[]): Partial<Record<PortKind, number>> {
  const out: Partial<Record<PortKind, number>> = {};
  for (const p of ports) { const k = portKind(p); out[k] = (out[k] || 0) + 1; }
  return out;
}
