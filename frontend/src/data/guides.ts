export interface GuideStep {
  title: string;
  content: string;
}

export interface Guide {
  id: string;
  category: string;
  page: string;
  title: string;
  description: string;
  steps: GuideStep[];
  tips?: string[];
  prerequisites?: string[];
}

export const guideCategories = [
  'Dashboard',
  'ONU Management',
  'Templates',
  'Traffic',
  'Infrastructure',
  'System',
  'Activity',
] as const;

export const guides: Guide[] = [
  {
    id: 'dashboard',
    category: 'Dashboard',
    page: '/dashboard',
    title: 'Panduan Dashboard',
    description: 'Monitor status OLT dan ONU secara real-time',
    steps: [
      {
        title: 'Statistik ONU',
        content: 'Kartu statistik menampilkan total ONU per status: **Online**, **Offline**, **DyingGasp**, **LOS** (Loss of Signal), dan **Total**.\n\nKlik kartu untuk filter ONU berdasarkan status di halaman All ONUs.',
      },
      {
        title: 'OLT Cards',
        content: 'Setiap OLT ditampilkan sebagai kartu dengan info: status online/offline, uptime, suhu, CPU, fan, jumlah ONU online/offline, dan progress bar.\n\nKlik **Sync** pada kartu OLT untuk sync OLT tersebut. Klik **Config** untuk ke halaman OLT Configuration.\n\nKlik kartu OLT untuk navigasi ke All ONUs yang difilter per OLT tersebut.',
      },
      {
        title: 'Sync All',
        content: 'Tombol **Sync All** di header untuk sync semua OLT sekaligus. Progress sync ditampilkan real-time per OLT.\n\nSync mengumpulkan data ONU via SNMP (light) atau SNMP+CLI (full). Auto-refresh setiap 30 detik.',
      },
    ],
    tips: [
      'Dashboard auto-refresh setiap 30 detik — tidak perlu manual refresh',
      'WebSocket aktif: alert baru akan otomatis muncul tanpa refresh',
      'Klik kartu ONU untuk drill-down ke All ONUs per OLT',
      'Sort OLT cards by status/name/problems/offline count',
    ],
  },
  {
    id: 'all-onus',
    category: 'ONU Management',
    page: '/dashboard/onus',
    title: 'Panduan All ONUs',
    description: 'Kelola semua ONU dari semua OLT dalam satu tabel',
    steps: [
      {
        title: 'Stat Cards & Filter',
        content: 'Kartu statistik di atas tabel menampilkan jumlah ONU per kategori: **All**, **Online**, **Offline**, **DyingGasp**, **LOS**. Klik kartu untuk filter tabel.\n\nSignal cards menampilkan distribusi RX power berdasarkan color range yang dikonfigurasi di Customization.',
      },
      {
        title: 'Search & Filter',
        content: 'Gunakan search bar untuk cari ONU by name, OLT, serial number, PPPoE, atau type. Filter dropdown untuk OLT dan vendor.\n\nSearch di-debounce 400ms — otomatis trigger setelah berhenti mengetik.',
      },
      {
        title: 'Tabel ONU',
        content: 'Tabel menampilkan semua ONU dengan kolom: name, OLT, SN, type, status, RX power, PPPoE, technician, ODP port, dan actions.\n\nKlik header kolom untuk sort. Server-side pagination — 50 ONU per halaman.\n\nKlik **View** untuk detail ONU (ViewOnu page). Klik **Edit** untuk edit inline (name, PPPoE, technician, ODP port). Klik **Delete** untuk deregister ONU dari OLT.',
      },
      {
        title: 'Export & Signal Refresh',
        content: '**Export CSV**: download semua ONU ke file CSV (semua halaman, tidak hanya halaman current).\n\n**Signal Refresh**: kirim SNMP get RX power ke semua OLT untuk update nilai terbaru. Bisa lambat jika OLT banyak.',
      },
    ],
    tips: [
      'WebSocket aktif: tabel auto-refresh saat OLT sync selesai',
      'Inline edit: klik cell Technician/ODP port untuk edit langsung di tabel',
      'Column visibility & order bisa diatur di Customization page',
      'Export CSV include semua ONU (tidak terfilter by pagination)',
    ],
  },
  {
    id: 'view-onu',
    category: 'ONU Management',
    page: '/dashboard/onus/:id',
    title: 'Panduan View ONU',
    description: 'Detail lengkap ONU termasuk config, traffic, dan actions',
    steps: [
      {
        title: 'ONU Info',
        content: 'Bagian atas menampilkan info ONU: OLT, interface (GPON/EPON), type, SN/MAC, RX power (OLT/ONU), status, online duration, name, description.\n\nKlik field untuk edit langsung (name, description, actual type, ONU type). Perubahan disimpan ke DB dan OLT secara otomatis.',
      },
      {
        title: 'Traffic Chart',
        content: 'Grafik traffic real-time menampilkan download/upload bandwidth. Update setiap 5 detik via WebSocket.\n\nKlik **Refresh Live** untuk re-fetch data terbaru dari OLT.',
      },
      {
        title: 'WAN Services',
        content: 'Menampilkan 4 WAN service slots. Klik **Edit** pada service untuk konfigurasi VLAN, mode (Router/Bridge), IP, PPPoE credentials.\n\nService 1 biasanya untuk internet, Service 2-4 untuk VLAN lain (IPTV, VoIP, dll).',
      },
      {
        title: 'Actions',
        content: '**Reboot**: restart ONU (ZTE: OMCI reboot, non-ZTE: shutdown/no-shutdown fallback). **Get Status**: fetch status lengkap dari OLT (interface info, optical, history, MAC table). **Show Config**: tampilkan running-config ONU. **Resync Config**: re-collect config dari OLT. **Clear Config**: hapus config ONU. **Reset WiFi**: reset WiFi SSID config. **Reset Factory**: factory reset ONU. **Delete**: deregister ONU dari OLT.\n\n**Replace ONU (Swap SN/MAC)**: Ganti perangkat ONU rusak dengan SN/MAC baru tanpa konfigurasi ulang. Sistem akan: backup config lama → delete ONU lama → register ONU baru → re-apply config. Vendor harus sama (ZTE→ZTE, FiberHome→FiberHome).',
      },
    ],
    tips: [
      'EPON ONUs memiliki keterbatasan CLI — beberapa section mungkin tidak tersedia',
      'WiFi config untuk EPON diambil dari DB (tidak dari OLT running-config)',
      'Save Config untuk menyimpan perubahan ke startup-config OLT',
    ],
  },
  {
    id: 'provision-wizard',
    category: 'ONU Management',
    page: '/dashboard/onus/provision',
    title: 'Panduan Provision ONU',
    description: 'Provision ONU baru dengan wizard interaktif',
    steps: [
      {
        title: 'Pilih OLT & PON Port',
        content: 'Pilih OLT dari dropdown, lalu pilih PON port (frame/slot/port) tempat ONU terhubung.\n\nSistem akan scan ONU yang belum terdaftar (uncfg) di PON port tersebut.',
      },
      {
        title: 'Pilih ONU & Template',
        content: 'Pilih ONU dari daftar uncfg. Lalu pilih template konfigurasi (ZTE Single/Dual/Multi, Huawei Full, Fiberhome VEIP).\n\nTemplate menentukan VLAN, WAN mode, WiFi config, dan TR069 settings.',
      },
      {
        title: 'WiFi & Review',
        content: 'Konfigurasi WiFi SSID: nama, auth type (Open/WPA/WPA2/Mixed), password, VLAN.\n\nReview semua config sebelum provision. Script CLI preview tersedia untuk verifikasi command yang akan dikirim ke OLT.',
      },
    ],
    tips: [
      'Pre-config mode: provision ONU yang sudah terdaftar tanpa re-register',
      'Register Wizard: wizard lengkap dengan template selection',
      'Pastikan ONU sudah online (uncfg) sebelum provision',
    ],
  },
  {
    id: 'register-wizard',
    category: 'ONU Management',
    page: '/dashboard/onus/register',
    title: 'Panduan Register Wizard',
    description: 'Register ONU baru ke OLT dengan wizard multi-step',
    steps: [
      {
        title: 'Select OLT',
        content: 'Pilih OLT target dari dropdown. Hanya OLT dengan CLI enabled (SSH/Telnet) yang tersedia.\n\nSistem akan cek koneksi CLI ke OLT sebelum lanjut.',
      },
      {
        title: 'Scan ONUs',
        content: 'Sistem scan ONU uncfg di semua PON port OLT yang dipilih.\n\nPilih ONU yang ingin di-register dari daftar.',
      },
      {
        title: 'Configure',
        content: 'Pilih template (ZTE Single/Dual/Multi, Huawei Full, Fiberhome VEIP). Konfigurasi WiFi SSID, VLAN, WAN mode, TR069.\n\nFiberhome VEIP template menggunakan TR069 Profile dropdown untuk ACS config.',
      },
      {
        title: 'Review & Register',
        content: 'Review semua config. Script CLI preview menampilkan exact command yang akan dikirim.\n\nKlik **Register** untuk eksekusi. ONU akan di-register ke OLT dan config diterapkan.',
      },
    ],
  },
  {
    id: 'olt-settings',
    category: 'Infrastructure',
    page: '/dashboard/settings/olts',
    title: 'Panduan OLT Settings',
    description: 'Kelola OLT: tambah, edit, hapus, sync',
    steps: [
      {
        title: 'Tambah OLT',
        content: 'Klik **Add OLT** untuk menambah OLT baru. Isi: name, IP address, vendor (ZTE/Huawei/Fiberhome), SNMP community, CLI credentials (SSH/Telnet).\n\nTest koneksi SNMP dan CLI sebelum save.',
      },
      {
        title: 'Edit & Delete OLT',
        content: 'Klik **Edit** pada kartu OLT untuk ubah konfigurasi. Klik **Delete** untuk hapus OLT (ONU terkait juga akan dihapus).\n\n**Config** untuk ke halaman OLT Configuration (uplinks, PON cards, VLANs, dll).',
      },
      {
        title: 'Sync OLT',
        content: 'Klik **Sync** pada kartu OLT untuk collect data ONU via SNMP/CLI. Progress ditampilkan real-time.\n\nSync All untuk sync semua OLT sekaligus.',
      },
    ],
    tips: [
      'SNMP community default: public (read-only). Set write community untuk config via SNMP.',
      'CLI credentials (SSH/Telnet) diperlukan untuk ONU provisioning dan live detail',
      'Pastikan OLT reachable dari server NMS (cek firewall)',
    ],
  },
  {
    id: 'olt-configuration',
    category: 'Infrastructure',
    page: '/dashboard/settings/olts/:oltId/config',
    title: 'Panduan OLT Configuration',
    description: 'Konfigurasi OLT: uplinks, PON cards, VLANs, profiles',
    steps: [
      {
        title: 'Uplinks Tab',
        content: 'Lihat dan konfigurasi port uplink OLT. Menampilkan: port, status, speed, VLAN, traffic stats.\n\nKlik port untuk edit VLAN membership dan mode (access/trunk/hybrid).',
      },
      {
        title: 'PON Cards Tab',
        content: 'Lihat status PON cards: slot, type, status, temperature, ONU count.\n\nEnable/disable PON port, set description.',
      },
      {
        title: 'VLANs Tab',
        content: 'Kelola VLAN di OLT: tambah, edit, hapus VLAN. Set VLAN name dan description.\n\nVLAN digunakan untuk service-port ONU (internet, IPTV, VoIP).',
      },
      {
        title: 'Speed Profiles & System',
        content: '**Speed Profiles**: TCONT dan traffic profiles untuk bandwidth limit.\n\n**System**: OLT system config (hostname, timezone, NTP, SNMP).',
      },
    ],
  },
  {
    id: 'traffic',
    category: 'Traffic',
    page: '/dashboard/traffic',
    title: 'Panduan Traffic Monitoring',
    description: 'Monitor bandwidth usage real-time dan historical',
    steps: [
      {
        title: 'Pilih OLT & Port Type',
        content: 'Pilih OLT dari dropdown, lalu pilih port type: **Uplink** (port uplink OLT) atau **PON** (port PON GPON).\n\nPilih periode: **Live** (real-time, update 5 detik), **1H/6H/1D/3D/7D/30D** (historical dari database).',
      },
      {
        title: 'Traffic Chart',
        content: 'Grafik menampilkan download (inbound) dan upload (outbound) bandwidth dalam Kbps/Mbps.\n\nLive mode: auto-update setiap 5 detik. Historical: data dari traffic poller (5 menit interval).',
      },
      {
        title: 'Port Selection',
        content: 'Pilih port spesifik dari dropdown untuk melihat traffic per port.\n\nUplink ports: ge1-4, xge1-2. PON ports: gpon-olt_0/1/1, dll.',
      },
    ],
    tips: [
      'Traffic poller berjalan setiap 5 menit via cron — historical data tersimpan di DB',
      'Live traffic menggunakan SNMP get real-time ke OLT',
      'WebSocket aktif: chart auto-update tanpa manual refresh',
    ],
  },
  {
    id: 'ftth',
    category: 'Infrastructure',
    page: '/dashboard/ftth',
    title: 'Panduan FTTH Infrastructure',
    description: 'Kelola infrastruktur FTTH: OTB, ODC, ODP, PON ports',
    steps: [
      {
        title: 'Overview Tab',
        content: 'Dashboard FTTH menampilkan summary: total OLT, PON ports, ODP, ONU per area.\n\nKlik area untuk drill-down ke detail infrastruktur.',
      },
      {
        title: 'PON Ports Tab',
        content: 'Lihat semua PON port di semua OLT. Menampilkan: OLT, slot/port, ONU count, capacity, utilization.\n\nKlik PON port untuk lihat ONU terkait dan ODP yang terhubung.',
      },
      {
        title: 'OTB/ODF, ODC, ODP Tabs',
        content: '**OTB/ODF**: Optical Terminal Box / Optical Distribution Frame — titik koneksi fiber dari OLT.\n\n**ODC**: Optical Distribution Cabinet — distribusi fiber ke area.\n\n**ODP**: Optical Distribution Point — distribusi fiber ke rumah pelanggan.\n\nKelola (tambah/edit/hapus) dan lihat port utilization.',
      },
      {
        title: 'FTTH Map',
        content: 'Peta interaktif menampilkan lokasi OLT, ODC, ODP pada peta.\n\nKlik marker untuk detail. Garis menampilkan koneksi fiber (OLT → ODC → ODP → ONU).',
      },
    ],
  },
  {
    id: 'customization',
    category: 'System',
    page: '/dashboard/customization',
    title: 'Panduan Customization',
    description: 'Kustomisasi tampilan: kolom, filter, RX colors',
    steps: [
      {
        title: 'Desktop Columns',
        content: 'Atur visibilitas dan urutan kolom di tabel All ONUs untuk tampilan desktop.\n\nDrag-and-drop untuk reorder. Toggle checkbox untuk show/hide kolom.',
      },
      {
        title: 'Mobile Columns',
        content: 'Atur kolom yang tampil di tampilan mobile (layar kecil).\n\nPilih maksimal 5 kolom untuk tampilan optimal.',
      },
      {
        title: 'Signal Filter',
        content: 'Set threshold RX power untuk kategori **Good** dan **Critical**.\n\nONU dengan RX power di atas threshold Good = hijau. Di antara Good dan Critical = warning. Di bawah Critical = danger.',
      },
      {
        title: 'RX Colors',
        content: 'Konfigurasi color range untuk RX power display.\n\nSet range (min-max dBm) dan warna untuk setiap range. Preview tersedia untuk verifikasi.',
      },
      {
        title: 'Timezone',
        content: 'Pilih timezone sistem yang digunakan untuk **auto-backup scheduling**, **UI display**, dan **logging**.\n\nDatabase tetap simpan timestamp dalam UTC, hanya display yang dikonversi ke timezone yang dipilih.\n\n**Penting**: Setting "At time" di OLT auto-backup config menggunakan timezone ini. Misal "02:00" dengan timezone Asia/Jakarta = backup jam 02:00 WIB.',
      },
    ],
  },
  {
    id: 'templates',
    category: 'Templates',
    page: '/dashboard/templates',
    title: 'Panduan Templates',
    description: 'Kelola template konfigurasi ONU',
    steps: [
      {
        title: 'Template List',
        content: 'Lihat semua template konfigurasi ONU. Template menentukan VLAN, WAN mode, WiFi, TR069 settings.\n\nKlik **Add Template** untuk buat template baru. Klik template untuk edit.',
      },
      {
        title: 'Template Types',
        content: '**ZTE Single**: single WAN service (internet only).\n\n**ZTE Dual**: dual WAN service (internet + IPTV/VoIP).\n\n**ZTE Multi**: multi WAN service (up to 4 services).\n\n**Huawei Full**: template untuk Huawei ONU.\n\n**Fiberhome VEIP**: template dengan TR069 profile untuk Fiberhome ONU.',
      },
    ],
    tips: [
      'Template digunakan oleh Register Wizard dan Provision Wizard',
      'Perubahan template tidak mempengaruhi ONU yang sudah ter-provision',
      'TR069 Profile dikelola terpisah di TR069 Profile page',
    ],
  },
  {
    id: 'tr069',
    category: 'Templates',
    page: '/dashboard/templates/tr069-profile',
    title: 'Panduan TR069 Profile',
    description: 'Kelola TR069/ACS profile untuk remote management ONU',
    steps: [
      {
        title: 'Profile List',
        content: 'Lihat semua TR069 profile. Setiap profile berisi: ACS URL, username, password, periodic inform interval, connection request URL.\n\nKlik **Add Profile** untuk buat profile baru.',
      },
      {
        title: 'Usage',
        content: 'TR069 profile digunakan oleh template Fiberhome VEIP dan Register/Provision Wizard.\n\nProfile dipilih dari dropdown saat konfigurasi ONU dengan TR069 support.',
      },
    ],
  },
  {
    id: 'user-management',
    category: 'System',
    page: '/dashboard/users',
    title: 'Panduan User Management',
    description: 'Kelola user dan permission',
    steps: [
      {
        title: 'User List',
        content: 'Lihat semua user: admin, technician, viewer. Menampilkan: username, role, status, last login.\n\nKlik **Add User** untuk tambah user baru. Klik user untuk edit.',
      },
      {
        title: 'Roles & Permissions',
        content: '**Admin**: akses penuh ke semua fitur.\n\n**Technician**: akses terbatas (view ONU, edit name/description, provision ONU).\n\n**Viewer**: read-only access.\n\nPermission per feature bisa diatur per user.',
      },
    ],
    tips: [
      'Super admin tidak bisa dihapus atau diubah role-nya',
      'Technician bisa di-assign ke ONU spesifik via kolom Technician di All ONUs',
    ],
  },
  {
    id: 'alert-settings',
    category: 'System',
    page: '/dashboard/settings/alerts',
    title: 'Panduan Alert Settings',
    description: 'Konfigurasi notifikasi alert ONU dan OLT',
    steps: [
      {
        title: 'Alert Rules',
        content: 'Set threshold untuk alert: ONU offline, LOS, dyinggasp. OLT offline, CPU/memory/temperature tinggi.\n\nEnable/disable alert per kategori.',
      },
      {
        title: 'Notification Channels',
        content: 'Pilih channel notifikasi: **In-app** (bell icon di topbar), **WhatsApp** (via WhatsApp Gateway).\n\nSet cooldown period untuk mencegah spam notifikasi.',
      },
      {
        title: 'Debounce & Auto-Resolve',
        content: '**Debounce**: alert ONU offline/dyinggasp/los butuh 2 deteksi konsekutif dalam 120 detik sebelum fire. Mencegah false alert dari status flap.\n\n**Auto-Resolve**: ONU kembali online → alert lama otomatis di-resolve. OLT health normal → alert auto-resolved.',
      },
    ],
    tips: [
      'Read notifications > 7 hari auto-delete saat alert check cycle',
      'Bell badge count hanya include active (non-resolved) unread notifications',
    ],
  },
  {
    id: 'alert-history',
    category: 'System',
    page: '/dashboard/alerts/history',
    title: 'Panduan Alert History',
    description: 'Riwayat alert yang telah terjadi',
    steps: [
      {
        title: 'Alert Log',
        content: 'Lihat riwayat alert: timestamp, type, severity, ONU/OLT, message, status (active/resolved).\n\nFilter by date range, severity, type, OLT.',
      },
      {
        title: 'Export',
        content: 'Export alert history ke CSV untuk reporting.\n\nFilter dulu sebelum export untuk export hanya data yang relevan.',
      },
    ],
  },
  {
    id: 'action-logs',
    category: 'Activity',
    page: '/dashboard/logs',
    title: 'Panduan Activity Log',
    description: 'Riwayat aksi user di sistem',
    steps: [
      {
        title: 'Log Entries',
        content: 'Lihat semua aksi user: login, logout, ONU provision, config change, delete, sync, dll.\n\nMenampilkan: timestamp, user, action type, target, detail.\n\nFilter by user, action type, date range.',
      },
      {
        title: 'Export',
        content: 'Export activity log ke CSV untuk audit trail.\n\nGunakan filter untuk export hanya data yang relevan.',
      },
    ],
  },
  {
    id: 'cloudflare',
    category: 'System',
    page: '/dashboard/settings/cloudflare',
    title: 'Panduan Cloudflare Tunnel',
    description: 'Kelola Cloudflare Tunnel untuk akses remote',
    steps: [
      {
        title: 'Tunnel Config',
        content: 'Lihat status Cloudflare Tunnel: tunnel ID, hostname, ingress rules.\n\nTambah/hapus hostname untuk subdomain tenant (SaaS mode).',
      },
      {
        title: 'DNS Management',
        content: 'Sistem otomatis membuat CNAME record di Cloudflare DNS saat tenant baru terdaftar.\n\nIngress rule otomatis ditambahkan untuk route subdomain ke Flask app.',
      },
    ],
    prerequisites: [
      'Cloudflare API Token diperlukan (set di environment variable)',
      'Cloudflare Tunnel harus sudah ter-install di server',
    ],
  },
];

export function getGuideById(id: string): Guide | undefined {
  return guides.find(g => g.id === id);
}

export function getGuidesByCategory(category: string): Guide[] {
  return guides.filter(g => g.category === category);
}

export function searchGuides(query: string): Guide[] {
  const q = query.toLowerCase().trim();
  if (!q) return guides;
  return guides.filter(g =>
    g.title.toLowerCase().includes(q) ||
    g.description.toLowerCase().includes(q) ||
    g.category.toLowerCase().includes(q) ||
    g.steps.some(s =>
      s.title.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q),
    ) ||
    g.tips?.some(t => t.toLowerCase().includes(q)),
  );
}
