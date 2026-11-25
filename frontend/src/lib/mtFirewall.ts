/** Generator script firewall MikroTik (RouterOS v6.45+/v7) — dijalankan admin sendiri di terminal router.
 *  Semua address-list memakai awalan `nms-` supaya dibaca tab Keamanan (daftar yang dipantau). */

export interface FwOptions {
  wan: string[];            // interface internet (masuk list WAN)
  admins: string[];         // IP/CIDR admin & server NMS (selalu lolos)
  portscanWan: boolean;     // port scan dari internet → blokir 1 hari
  portscanLan: boolean;     // port scan dari lokal → hanya dicatat
  bruteforce: boolean;      // koneksi bertubi-tubi ke layanan manajemen dari internet → blokir 1 hari
  dnsWan: boolean;          // tutup DNS router dari internet
  synflood: boolean;        // catat IP yang membuka koneksi berlebihan
  services: boolean;        // matikan telnet/ftp/www, batasi winbox/ssh/api ke IP admin
  proxySocks: boolean;      // matikan web proxy & SOCKS
  dropWan: boolean;         // drop koneksi baru dari internet ke router selain yang diizinkan
}

export const DEFAULT_FW: FwOptions = {
  wan: ['ether1'], admins: [], portscanWan: true, portscanLan: true, bruteforce: true, dnsWan: true,
  synflood: true, services: true, proxySocks: true, dropWan: false,
};

const IFACE = /^[A-Za-z0-9_.@<>+-]{1,64}$/;
const IPCIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-fA-F:]+(\/\d{1,3})?$/;

export function validIface(s: string) { return IFACE.test(s); }
export function validAddr(s: string) {
  if (!IPCIDR.test(s)) return false;
  const [ip, len] = s.split('/');
  if (ip.includes('.')) {
    if (ip.split('.').some(x => Number(x) > 255)) return false;
    if (len !== undefined && Number(len) > 32) return false;
  }
  return true;
}

export function splitList(text: string) {
  return Array.from(new Set(text.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)));
}

const MGMT = '21,22,23,8291,8728,8729';

/** → { script, invalid } — entri yang tidak valid dibuang (tidak pernah masuk script). */
export function buildFirewallScript(o: FwOptions): { script: string; invalid: string[] } {
  const invalid: string[] = [];
  const wan = o.wan.filter(w => validIface(w) || (invalid.push(w), false));
  const admins = o.admins.filter(a => validAddr(a) || (invalid.push(a), false));
  const L: string[] = [];
  const rules: string[] = [];
  const c = (t: string) => `comment="NMS: ${t}"`;

  L.push('# Firewall Salfanet NMS — jalankan di Terminal (sebaiknya aktifkan Safe Mode: Ctrl+X)');
  L.push('# Aturan dipasang DI ATAS aturan filter yang sudah ada. Address-list nms-* dibaca NMS (tab Keamanan).');
  L.push('');
  if (wan.length) {
    L.push('/interface list');
    L.push(':if ([:len [find name=WAN]] = 0) do={ add name=WAN comment="NMS" }');
    L.push('/interface list member');
    for (const w of wan) L.push(`:if ([:len [find list=WAN interface=${w}]] = 0) do={ add list=WAN interface=${w} }`);
    L.push('');
  }
  if (admins.length) {
    L.push('/ip firewall address-list');
    for (const a of admins) L.push(`:if ([:len [find list=nms-admin address=${a}]] = 0) do={ add list=nms-admin address=${a} comment="NMS: admin" }`);
    L.push('');
  }

  // Urutan aturan (atas → bawah)
  rules.push(`chain=input connection-state=established,related action=accept ${c('established')}`);
  if (admins.length) rules.push(`chain=input src-address-list=nms-admin action=accept ${c('admin selalu lolos')}`);
  if (o.portscanWan) {
    rules.push(`chain=input in-interface-list=WAN protocol=tcp psd=21,3s,3,1 action=add-src-to-address-list address-list=nms-portscan address-list-timeout=1d ${c('port scan WAN')}`);
    rules.push(`chain=input src-address-list=nms-portscan action=drop ${c('drop port scanner')}`);
  }
  if (o.portscanLan) {
    rules.push(`chain=input in-interface-list=!WAN protocol=tcp psd=21,3s,3,1 action=add-src-to-address-list address-list=nms-portscan-lan address-list-timeout=1d ${c('port scan LAN (dicatat)')}`);
  }
  if (o.bruteforce) {
    rules.push(`chain=input src-address-list=nms-bruteforce action=drop ${c('drop brute force')}`);
    rules.push(`chain=input in-interface-list=WAN protocol=tcp dst-port=${MGMT} connection-state=new src-address-list=nms-bf-3 action=add-src-to-address-list address-list=nms-bruteforce address-list-timeout=1d ${c('brute force tahap 4')}`);
    rules.push(`chain=input in-interface-list=WAN protocol=tcp dst-port=${MGMT} connection-state=new src-address-list=nms-bf-2 action=add-src-to-address-list address-list=nms-bf-3 address-list-timeout=1m ${c('brute force tahap 3')}`);
    rules.push(`chain=input in-interface-list=WAN protocol=tcp dst-port=${MGMT} connection-state=new src-address-list=nms-bf-1 action=add-src-to-address-list address-list=nms-bf-2 address-list-timeout=1m ${c('brute force tahap 2')}`);
    rules.push(`chain=input in-interface-list=WAN protocol=tcp dst-port=${MGMT} connection-state=new action=add-src-to-address-list address-list=nms-bf-1 address-list-timeout=1m ${c('brute force tahap 1')}`);
  }
  if (o.synflood) {
    rules.push(`chain=input protocol=tcp tcp-flags=syn connection-state=new connection-limit=100,32 action=add-src-to-address-list address-list=nms-synflood address-list-timeout=1h ${c('SYN flood (dicatat)')}`);
  }
  if (o.dnsWan) {
    rules.push(`chain=input in-interface-list=WAN protocol=udp dst-port=53 action=drop ${c('tutup DNS dari internet')}`);
    rules.push(`chain=input in-interface-list=WAN protocol=tcp dst-port=53 action=drop ${c('tutup DNS dari internet')}`);
  }
  if (o.dropWan) {
    rules.push(`chain=input in-interface-list=WAN protocol=icmp action=accept ${c('ping')}`);
    rules.push(`chain=input in-interface-list=WAN action=drop ${c('drop sisa dari internet')}`);
  }

  L.push('# Aturan filter — disisipkan di atas aturan pertama (urutan tetap)');
  L.push('{');
  L.push('  :local pos [/ip firewall filter find where dynamic=no]');
  L.push('  :if ([:len $pos] = 0) do={');
  L.push('    /ip firewall filter add chain=input action=passthrough comment="NMS: penanda"');
  L.push('    :set pos [/ip firewall filter find where comment="NMS: penanda"]');
  L.push('  }');
  L.push('  :set pos ($pos->0)');
  for (const r of rules) L.push(`  /ip firewall filter add ${r} place-before=$pos`);
  L.push('}');
  L.push('');

  if (o.services) {
    L.push('/ip service');
    L.push('set telnet disabled=yes');
    L.push('set ftp disabled=yes');
    L.push('set www disabled=yes');
    if (admins.length) L.push(`set winbox,ssh,api,api-ssl address=${admins.join(',')}`);
    L.push('');
  }
  if (o.proxySocks) {
    L.push('/ip proxy set enabled=no');
    L.push('/ip socks set enabled=no');
    L.push('');
  }
  L.push('# Cek: /ip firewall filter print where comment~"NMS"   ·   /ip firewall address-list print where list~"nms-"');
  return { script: L.join('\n'), invalid };
}
