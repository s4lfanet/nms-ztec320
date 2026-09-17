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
        content: 'Kartu statistik menampilkan total: **OLT** (online/offline), **Total ONU** (dengan % online), **ONU Online**, dan **ONU Problem** (gabungan offline + dyinggasp + LOS).\n\nKartu ini bersifat ringkasan saja — belum bisa diklik untuk filter. Untuk filter ONU per status, buka halaman All ONUs.',
      },
      {
        title: 'OLT Cards',
        content: 'Setiap OLT ditampilkan sebagai kartu dengan info: status online/offline, jumlah ONU online/offline dengan progress bar, **Model**, **Suhu**, dan **Uptime**.\n\nKlik tombol **Sync** pada kartu untuk sync OLT tersebut. Klik tombol **Config** untuk ke halaman OLT Configuration — ini yang jadi cara utama drill-down dari sebuah OLT card, karena body kartunya sendiri belum clickable.',
      },
      {
        title: 'Sync All',
        content: 'Tombol **Sync All** di header untuk sync semua OLT sekaligus. Progress sync ditampilkan real-time per OLT.\n\nSync mengumpulkan data ONU via SNMP (light) atau SNMP+CLI (full). Auto-refresh setiap 30 detik.',
      },
    ],
    tips: [
      'Dashboard auto-refresh setiap 30 detik — tidak perlu manual refresh',
      'WebSocket aktif: alert baru dan hasil sync akan otomatis muncul tanpa refresh',
      'Sort OLT cards by status/name/problems/offline count lewat dropdown di atas grid',
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
        content: 'Kartu statistik di atas tabel menampilkan **Total ONU**, **Online**, **LOS**, dan **DyingGasp** (bukan Offline — Offline hanya bisa dilihat lewat filter status di bawah). Kartu ini ringkasan saja, belum bisa diklik untuk filter tabel.\n\nSignal cards di sampingnya menampilkan distribusi RX power berdasarkan color range yang dikonfigurasi di Customization.',
      },
      {
        title: 'Search & Filter',
        content: 'Gunakan search bar untuk cari ONU by name, OLT, serial number, PPPoE, atau type. Filter OLT berupa deretan tombol pill (bukan dropdown) di bawah search bar — belum ada filter vendor.\n\nSearch di-debounce 400ms — otomatis trigger setelah berhenti mengetik.',
      },
      {
        title: 'Tabel ONU',
        content: 'Tabel menampilkan: OLT, Name, Status, RX ONU, SN/MAC, Type, Distance, Technician, ODP, ID, dan Actions (tidak ada kolom PPPoE terpisah di tabel utama). Klik header kolom untuk sort. Server-side pagination — default 20 ONU per halaman, bisa diganti ke 10/50/100.\n\nKlik **View** untuk detail ONU (ViewOnu page). Klik **Delete** untuk deregister ONU dari OLT.\n\n**Inline edit** (langsung di tabel, tanpa buka modal) hanya untuk kolom **Technician** dan **ODP port** — klik cell-nya langsung. Untuk edit field lain (name, description, ONU ID, actual type/model, lokasi di peta) klik **Edit**, yang membuka modal terpisah, bukan inline.',
      },
      {
        title: 'Export & Signal Refresh',
        content: '**Export CSV**: download semua ONU ke file CSV (semua halaman, tidak hanya halaman current).\n\n**Signal Refresh**: kirim SNMP get RX power ke semua OLT untuk update nilai terbaru. Bisa lambat jika OLT banyak.',
      },
    ],
    tips: [
      'WebSocket aktif: tabel auto-refresh saat OLT sync selesai',
      'Inline edit langsung di tabel hanya untuk Technician & ODP port — field lainnya lewat modal Edit',
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
        content: 'Grafik traffic menampilkan download/upload bandwidth, di-polling setiap 3 detik.\n\nKlik **Refresh Live** untuk re-fetch data terbaru dari OLT.',
      },
      {
        title: 'WAN Services',
        content: 'Menampilkan 4 WAN service slots. Klik **Edit** pada service untuk konfigurasi VLAN, mode (**PPPoE NAT** / **Wan-IP** / **Bridge - ONU Webpage**), IP, PPPoE credentials.\n\nService 1 biasanya untuk internet, Service 2-4 untuk VLAN lain (IPTV, VoIP, dll).',
      },
      {
        title: 'Actions',
        content: '**Reboot**: restart ONU (ZTE: OMCI reboot, non-ZTE: shutdown/no-shutdown fallback). **Get Status**: fetch status lengkap dari OLT (interface info, optical, history, MAC table). **Show Config**: tampilkan running-config ONU. **Resync Config**: re-collect config dari OLT. **Clear Config**: hapus config ONU. **Disable/Enable ONU**: nonaktifkan/aktifkan port ONU tanpa deregister (perlu permission tersendiri). **Reset WiFi**: reset WiFi SSID config. **Reset Factory**: factory reset ONU. **Delete**: deregister ONU dari OLT.\n\n**Replace ONU (Swap SN/MAC)**: Ganti perangkat ONU rusak dengan SN/MAC baru tanpa konfigurasi ulang. Sistem akan: backup config lama → delete ONU lama → register ONU baru → re-apply config. Vendor harus sama (ZTE→ZTE, FiberHome→FiberHome).',
      },
      {
        title: 'Jalur FTTH (Trace Kabel ke Pelanggan)',
        content: 'Kartu **Jalur FTTH** menampilkan rute lengkap dari OLT sampai ke ONU ini: OLT → PON → OTB (core) → JC (splice, kalau ada) → ODC (core) → ODP (port) → pelanggan.\n\nBerguna saat ada komplain pelanggan — langsung kelihatan titik fisik mana saja yang dilewati tanpa perlu buka Tree view manual.\n\nKalau ada bagian rantai yang belum lengkap datanya (mis. ODP belum di-assign ke ODC/JC), muncul kotak merah menandai persis di titik mana data yang kurang.\n\nKalau semua titik di jalur ini sudah diisi **Panjang Kabel** (di FTTH Infrastructure), total redaman jalur (dB) otomatis ditampilkan di bawah kartu ini.',
      },
    ],
    tips: [
      'EPON ONUs memiliki keterbatasan CLI — Remote Access, VEIP, TR069, dan Ethernet section mungkin tidak tersedia',
      'WiFi config untuk EPON diambil dari DB (tidak dari OLT running-config)',
      'Save Config untuk menyimpan perubahan ke startup-config OLT',
      'Kalau ONU belum di-assign ke ODP manapun, kartu Jalur FTTH akan bilang begitu — assign lewat halaman FTTH Infrastructure',
    ],
  },
  {
    id: 'provision-wizard',
    category: 'ONU Management',
    page: '/dashboard/onus/provision',
    title: 'Panduan Provision ONU',
    description: 'Provision ONU dengan konfigurasi VLAN/WAN bebas (tanpa template tetap)',
    steps: [
      {
        title: 'Pilih OLT',
        content: 'Pilih OLT dari dropdown dan mode registrasi (**CLI** atau **SNMP**). Sistem akan scan seluruh ONU yang belum terdaftar (uncfg) di OLT tersebut — belum ada pemilihan PON port spesifik di step ini, scan langsung jalan untuk semua PON port OLT.',
      },
      {
        title: 'Pilih ONU',
        content: 'Pilih ONU dari daftar hasil scan. Untuk mode **Pre-config ONT** (`/dashboard/onus/pre-config`), step ini diganti input **Serial Number manual** — dipakai kalau mau skip proses scan OLT, bukan untuk provision ulang ONU yang sudah terdaftar.',
      },
      {
        title: 'VLAN & WAN (bebas, bukan template)',
        content: 'Berbeda dari Register Wizard, wizard ini **tidak punya konsep Template**. Anda menambahkan sendiri satu-per-satu entry VLAN/WAN yang dibutuhkan: mode (Bridge / DHCP / PPPoE / PPPoE-NAT), tag/untag/Q-in-Q, dan VLAN ID — bisa lebih dari satu service sesuai kebutuhan.',
      },
      {
        title: 'WiFi, TR069 & Review',
        content: 'Konfigurasi WiFi SSID: nama, auth type (Open/WPA/WPA2/Mixed), password, VLAN, plus TR069 profile kalau perlu remote management.\n\nReview semua config sebelum provision. Script CLI preview tersedia untuk verifikasi command yang akan dikirim ke OLT.\n\nDi step Review, tiap ONU punya dropdown **"— ODP (optional) —"** untuk langsung assign ONU tersebut ke port ODP pelanggan saat provisioning — tidak wajib diisi, bisa juga di-assign belakangan lewat menu Assign ODP di FTTH Infrastructure.',
      },
    ],
    tips: [
      'Pakai wizard ini kalau kebutuhan VLAN/WAN tidak cocok dengan template baku manapun — kalau cocok, Register Wizard (dengan Template) biasanya lebih cepat',
      'Pre-config ONT: masukkan Serial Number manual untuk skip scan OLT, bukan untuk provision ulang ONU yang sudah terdaftar',
      'Pastikan ONU sudah online (uncfg) sebelum provision',
      'Assign ODP port saat provisioning bersifat opsional — dropdown hanya menampilkan port yang masih available',
    ],
  },
  {
    id: 'register-wizard',
    category: 'ONU Management',
    page: '/dashboard/onus/register',
    title: 'Panduan Register Wizard',
    description: 'Register ONU baru ke OLT dengan template konfigurasi siap pakai',
    steps: [
      {
        title: 'Select OLT',
        content: 'Pilih OLT target dari dropdown dan mode registrasi (CLI/SNMP).\n\nSistem akan cek koneksi CLI ke OLT sebelum lanjut.',
      },
      {
        title: 'Scan ONUs',
        content: 'Sistem scan ONU uncfg di semua PON port OLT yang dipilih.\n\nPilih ONU yang ingin di-register dari daftar.',
      },
      {
        title: 'Configure — 7 Service Template',
        content: 'Pilih salah satu dari 7 template: **Bridge** (transparent bridge mode), **PPPoE** (PPPoE dial-up internet), **ZTE Single** (single SSID + VLAN), **ZTE Dual Band** (dual SSID, dual VLAN, TR069), **ZTE Multi-Service** (1-4 service termasuk IPTV, TR069), **Huawei Full** (multi VLAN, WAN DHCP), **Fiberhome VEIP** (TR069 + Internet + VoIP).\n\nDropdown **TR069 Profile** tersedia bukan cuma untuk Fiberhome VEIP — ZTE Single, ZTE Dual Band, dan ZTE Multi-Service juga punya opsi TR069 yang otomatis mengisi ACS URL/credentials/VLAN dari profile yang dipilih.',
      },
      {
        title: 'Review & Register',
        content: 'Review semua config. Script CLI preview menampilkan exact command yang akan dikirim.\n\nSetiap ONU di daftar punya dropdown **"— ODP (optional) —"** untuk langsung assign ke port ODP pelanggan saat registrasi — opsional, bisa di-assign belakangan juga.\n\nKlik **Register** untuk eksekusi. ONU akan di-register ke OLT dan config diterapkan.',
      },
    ],
    tips: [
      'Assign ODP port saat registrasi bersifat opsional — dropdown hanya menampilkan port yang masih available',
      'Kalau kebutuhan VLAN/WAN tidak cocok dengan 7 template ini, pakai Provision Wizard yang konfigurasinya bebas',
    ],
  },
  {
    id: 'unconfigured-onus',
    category: 'ONU Management',
    page: '/dashboard/onus/unconfigured',
    title: 'Panduan Unconfigured ONUs',
    description: 'Scan dan lihat ONU yang terdeteksi tapi belum terdaftar di sistem',
    steps: [
      {
        title: 'Scan',
        content: 'Scan semua OLT sekaligus, atau pilih satu OLT tertentu. Ada toggle mode scan **CLI** atau **SNMP** — pilih sesuai OLT yang reachable lewat CLI atau tidak.',
      },
      {
        title: 'Hasil Scan',
        content: 'ONU yang ditemukan dikelompokkan per OLT, menampilkan serial number, model, tipe yang cocok (matched type), dan PON port-nya. Ada tombol copy untuk serial number.',
      },
      {
        title: 'Register / Pre-Register',
        content: 'Klik **Register** untuk lanjut ke Register Wizard dengan OLT dan ONU sudah terisi otomatis. Klik **Pre-Register** untuk lanjut ke mode Pre-config ONT (Provision Wizard) dengan serial number sudah terisi.',
      },
    ],
    tips: [
      'Gunakan halaman ini sebagai titik awal saat mau tahu ONU baru apa saja yang siap di-provision, tanpa perlu ingat OLT dan PON port-nya satu-satu',
    ],
  },
  {
    id: 'olt-settings',
    category: 'Infrastructure',
    page: '/dashboard/settings/olts',
    title: 'Panduan OLT Settings',
    description: 'Kelola OLT: tambah, edit, hapus, sync, backup, migrasi',
    steps: [
      {
        title: 'Tambah OLT',
        content: 'Klik **Add OLT** untuk menambah OLT baru. Isi: name, IP address, model (saat ini hanya ZTE — C320/C300/C300-M/C600/C650), SNMP community, CLI credentials (SSH/Telnet).\n\nTest koneksi SNMP dan CLI sebelum save.',
      },
      {
        title: 'Edit, Sync & Config',
        content: 'Klik **Edit** pada kartu OLT untuk ubah konfigurasi. Klik **Sync** untuk collect data ONU via SNMP/CLI (progress real-time). Klik **Config** untuk ke halaman OLT Configuration (uplinks, PON cards, VLANs, dll). Klik **Delete** untuk hapus OLT (ONU terkait juga akan dihapus).\n\nSync All di bagian atas halaman untuk sync semua OLT sekaligus.',
      },
      {
        title: 'Backup & Config Tools',
        content: '**Save Config**: tulis running-config ke startup-config OLT (permanen). **Export**: download file backup-config OLT. **Backup**: lihat riwayat backup config yang tersimpan.\n\n**Discover**: auto-discover PON slot yang terpasang di OLT.',
      },
      {
        title: 'Migrasi ONU',
        content: '**Migrate PON**: pindahkan ONU antar PON port dalam satu OLT yang sama.\n\n**Cross-OLT Migrate**: pindahkan ONU (beserta config-nya) ke OLT yang berbeda — berguna saat mengganti/mengganti unit OLT.',
      },
    ],
    tips: [
      'SNMP community default: public (read-only). Set write community untuk config via SNMP.',
      'CLI credentials (SSH/Telnet) diperlukan untuk ONU provisioning dan live detail',
      'Pastikan OLT reachable dari server NMS (cek firewall)',
      'Model OLT saat ini terbatas ZTE saja — belum ada pilihan vendor lain di form Add/Edit OLT',
    ],
  },
  {
    id: 'olt-configuration',
    category: 'Infrastructure',
    page: '/dashboard/settings/olts/:oltId/config',
    title: 'Panduan OLT Configuration',
    description: 'Konfigurasi OLT: uplinks, PON cards, VLAN, ONU types, WAN-IP, speed profile, system',
    steps: [
      {
        title: 'Ringkasan & Port Map',
        content: 'Di atas tab-tab konfigurasi, ada baris statistik (Uplink/GPON/EPON/Fan/Total/Online/LOS/DyingGasp/Offline) dan diagram rack (Port Map) yang menampilkan posisi fisik slot/port OLT.',
      },
      {
        title: 'Uplinks Tab',
        content: 'Lihat dan konfigurasi port uplink OLT: status, speed, VLAN, traffic stats, data optical module/SFP (suhu, voltage, TX/RX power, bias), error counter (CRC/dropped).\n\nKlik port untuk buka Port Config (speed, duplex, negotiation, flow control, admin enable/disable), edit VLAN membership/mode (access/trunk/hybrid), atau atur IP Network (assign IP ke VLAN interface).',
      },
      {
        title: 'PON Cards Tab',
        content: 'Lihat status PON cards: slot, type, status, temperature, ONU count.\n\nEnable/disable PON port, set description.',
      },
      {
        title: 'VLANs Tab',
        content: 'Kelola VLAN di OLT: tambah, rename, hapus VLAN (ID + Name saja — belum ada field description tersendiri untuk VLAN).\n\nVLAN digunakan untuk service-port ONU (internet, IPTV, VoIP).',
      },
      {
        title: 'ONU Types & WAN-IP Profiles Tab',
        content: '**ONU Types**: kelola profil tipe/kapabilitas ONU yang dikenali OLT.\n\n**WAN-IP Profiles**: kelola profil IP statis untuk WAN ONU.',
      },
      {
        title: 'Speed Profiles Tab',
        content: '**TCONT/Traffic profiles**: bandwidth limit untuk ONU GPON.\n\n**EPON SLA Profiles**: profil CIR/PIR upstream-downstream khusus untuk ONU EPON — bagian terpisah dari profile GPON di atas.',
      },
      {
        title: 'System Tab',
        content: 'Menampilkan Device info, Chassis info, Connection Status, Fan Status, dan Card Slots — bukan pengaturan hostname/timezone/NTP.\n\nDi sini juga ada pengelolaan **SNMP community** dan **CLI user** langsung di sisi OLT (tambah/hapus).',
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
        content: 'Pilih OLT dari dropdown, lalu pilih port type: **Uplink** (port uplink OLT) atau **PON** (port PON GPON).\n\nPilih periode: **Live** (grid utama refresh tiap 10 detik), atau historical **1H/6H/1D/3D/7D/30D** dari database. Ada juga search box untuk cari interface tertentu di grid port.',
      },
      {
        title: 'Traffic Chart',
        content: 'Port ditampilkan sebagai grid kartu yang bisa diklik (bukan dropdown) — klik satu kartu untuk buka detail traffic port tersebut. Grafik menampilkan download (inbound) dan upload (outbound) bandwidth dalam **Mbps/Gbps**.\n\nDi dalam modal detail per-port, ada mode Live tersendiri yang update tiap 5 detik. Historical: data dari traffic poller (interval 5 menit).',
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
    description: 'Kelola infrastruktur FTTH: OTB, JC, ODC, ODP, PON ports, dan peta',
    steps: [
      {
        title: 'Overview Tab',
        content: 'Menampilkan kartu ringkasan OTB/ODF, ODC, ODP, dan ODP-Port terpakai — bukan hitungan "total OLT" atau "total PON port" tersendiri. Di bawahnya ada breakdown **Per OLT** dan **Per PON Port**.\n\nKlik baris di breakdown untuk pindah ke tab Tree (belum otomatis memfilter ke OLT/PON port yang diklik, sekadar shortcut pindah tab).',
      },
      {
        title: 'Tree Tab',
        content: 'Tampilan pohon (hierarki) dari seluruh rantai fiber: OLT/PON → (opsional lewat JC) → OTB/ODF → (opsional lewat JC) → ODC → (opsional lewat JC) → ODP → (opsional lewat JC) → port pelanggan. Setiap segmen bisa punya JC di tengahnya, termasuk sebelum OTB (feeder trunk) dan sebelum pelanggan (kabel drop).\n\nKlik panah untuk expand/collapse tiap node. Ikon di setiap baris untuk tambah ODC, tambah JC, tambah ODP, edit, atau hapus — tergantung jenis node-nya. Node JC ditandai warna ungu dengan ikon sambungan. Baris OTB yang di-feed dari JC (bukan langsung dari PON) menampilkan anotasi "Fed by JC" menggantikan info OLT.',
      },
      {
        title: 'PON Ports Tab',
        content: 'Lihat semua PON port di semua OLT sebagai kartu: OLT, slot/port, ONU count, capacity, utilization. Kartu ini belum bisa diklik untuk buka detail ONU/ODP terkait — untuk itu, cek tab PON Cards di halaman OLT Configuration.\n\nSaat **Add PON Port**: pilih dulu **OLT**-nya (dari OLT yang sudah terdaftar) — muncul dropdown **PON Port (dari OLT nyata)** berisi port asli hasil sync OLT tersebut (bukan ketik manual), lengkap dengan jumlah ONU di tiap port. Pilih salah satu untuk isi otomatis PON Name/Frame/Slot/Port. Kalau OLT-nya belum terdaftar atau belum pernah sync, tetap bisa isi manual seperti biasa.',
      },
      {
        title: 'OTB/ODF, ODC, ODP Tabs',
        content: '**OTB/ODF**: Optical Terminal Box / Optical Distribution Frame — titik koneksi fiber dari OLT.\n\n**ODC**: Optical Distribution Cabinet — distribusi fiber ke area.\n\n**ODP**: Optical Distribution Point — distribusi fiber ke rumah pelanggan.\n\nKelola (tambah/edit/hapus) dan lihat port utilization. Warna tube/core (standar TIA-598) ditampilkan sampai level ODC secara langsung; di level ODP warna ini hanya muncul kalau ODP tersebut di-feed lewat JC (feed langsung dari ODC tidak menampilkan warna tube/core lagi karena sudah dianggap satu core utuh).\n\nSaat tambah/edit OTB, ODC, atau ODP, ada toggle **"Fed From"**: pilih apakah node ini disambung langsung (OTB dari PON, ODC dari OTB, ODP dari ODC), atau lewat titik sambungan **JC** (lihat langkah berikutnya).',
      },
      {
        title: 'Budget Optik Splitter (ODC & ODP, opsional)',
        content: 'Selain **Splitter Model** (label bebas seperti "1:8"), ODC dan ODP juga punya field angka untuk hitungan power budget: **Ratio Splitter** (Even/Uneven — rata atau tidak rata antar output), **Tap Loss** dan **Through Loss** (dB). Semua opsional — kosongkan kalau belum punya data spec splitter-nya.',
      },
      {
        title: 'Panjang & Redaman Kabel (opsional)',
        content: 'Tiap node (OTB, ODC, ODP, port ODP, JC) punya field **Panjang Kabel Masuk (m)** dan **Redaman (dB/km)** — merepresentasikan kabel yang masuk ke node itu dari parent-nya. Default redaman 0.35 dB/km (standar fiber single-mode).\n\nKalau semua node di satu jalur pelanggan sudah diisi panjangnya, total redaman jalur otomatis dihitung dan ditampilkan di kartu **Jalur FTTH** pada halaman View ONU pelanggan tersebut. Kalau ada satu saja yang kosong, total tidak ditampilkan (bukan menampilkan angka yang salah).',
      },
      {
        title: 'JC (Joint Closure / Titik Sambungan) Tab',
        content: 'JC adalah titik sambungan (closure) di sepanjang jalur fiber — dipakai kalau kabel di segmen manapun (OLT/PON→OTB, OTB→ODC, ODC→ODP, atau ODP→pelanggan) melewati titik splice di lapangan, bukan sambungan langsung.\n\nJC bisa diletakkan di mana saja: PON→JC→OTB, OTB→JC→ODC, ODC→JC→ODP, ODP→JC→pelanggan (kabel drop), bahkan JC berantai (JC→JC). Setiap JC punya "Fed From (parent)" sendiri (PON Port, OTB, ODC, ODP Port, atau JC lain) — untuk "ODP Port (Drop Cable)", parent dipilih 2 langkah: ODP dulu, baru port pelanggannya.\n\n**Fibers per Tube** (opsional): isi kalau closure ini terdiri dari lebih dari 1 tube (mis. 2 tube × 12 core) — dipakai untuk menghitung warna tube/core TIA-598 pada splice.\n\n**Splices**: setelah JC tersimpan, buka **Edit / Manage Splices** untuk mencatat sambungan core — pilih Tube + posisi core di sisi masuk (dari parent) dan sisi keluar (ke downstream), warna tube/core langsung ditampilkan di kedua sisi. Core keluar inilah yang muncul sebagai pilihan saat mengatur "Fed From" = JC di OTB/ODC/ODP/port pelanggan.',
      },
      {
        title: 'Draw Fiber Path & Auto Route',
        content: 'Di tab **Map**, tombol **Draw Fiber Path** untuk menggambar jalur kabel manual di peta (klik titik demi titik, lalu Save Path) — bisa untuk jalur apa saja termasuk yang melewati JC.\n\nTombol **Auto Route (OSRM)** untuk membuat jalur otomatis mengikuti jalan antara dua titik: klik titik awal lalu titik akhir pada marker di peta.',
      },
      {
        title: 'FTTH Map',
        content: 'Peta interaktif (OpenStreetMap) menampilkan lokasi OLT, JC, ODC, ODP pada peta dengan warna berbeda per jenis (lihat legenda di atas peta).\n\nKlik marker untuk detail dan highlight jalur koneksinya. Garis menampilkan koneksi fiber (OLT → [JC] → ODC → [JC] → ODP → ONU).',
      },
      {
        title: 'Dampak Downstream (Trace Kabel Putus)',
        content: 'Di Tree view, tiap baris OTB/JC/ODC/ODP punya ikon **orang (Users)** — klik untuk lihat berapa pelanggan yang terdampak kalau titik itu putus/bermasalah, lengkap dengan daftar nama dan status online/offline mereka.\n\nBerguna untuk prioritas perbaikan: kalau kabel utama (OTB atau JC awal) putus, langsung kelihatan berapa banyak pelanggan yang kena dibanding kalau cuma satu ODC/ODP yang bermasalah.\n\nUntuk trace jalur satu pelanggan spesifik (bukan sebaliknya), buka halaman **View ONU** pelanggan tersebut — ada kartu **Jalur FTTH** yang menampilkan rute lengkap dari OLT sampai ke pelanggan itu.',
      },
      {
        title: 'Export & Import',
        content: 'Tombol **Export/Import CSV** di header halaman untuk backup atau migrasi data infrastruktur FTTH secara massal.',
      },
    ],
    tips: [
      'JC bersifat opsional — kalau jalur fiber memang langsung tanpa titik sambungan, tidak perlu dibuat JC sama sekali, cukup OTB → ODC → ODP seperti biasa',
      'JC di segmen OLT→OTB dan ODP→pelanggan jarang dipakai (biasanya OLT-OTB satu lokasi, drop cable langsung) — tapi kalau memang ada sambungan fisik di situ, sekarang bisa dicatat juga, bukan cuma di OTB→ODC / ODC→ODP',
      'Menghapus JC tidak menghapus OTB/ODC/ODP/port pelanggan/JC lain yang tersambung ke situ — mereka cuma "dilepas" (feed source-nya jadi kosong), supaya data infrastruktur riil tidak ikut hilang',
      'Nomor core "in" pada splice pakai penomoran tube milik parent (OTB/ODC/JC sumbernya), nomor core "out" pakai penomoran tube milik JC itu sendiri',
      'Dampak downstream dan Jalur FTTH sama-sama jalan lewat berapa pun hop JC di tengahnya, tidak terbatas satu tingkat saja',
    ],
  },
  {
    id: 'customization',
    category: 'System',
    page: '/dashboard/customization',
    title: 'Panduan Customization',
    description: 'Kustomisasi tampilan: kolom, filter, RX colors, timezone',
    steps: [
      {
        title: 'Desktop & Mobile',
        content: 'Tab **Desktop**: atur visibilitas dan urutan kolom di tabel All ONUs untuk tampilan desktop (drag-and-drop untuk reorder, toggle checkbox untuk show/hide).\n\nTab **Mobile**: atur kolom yang tampil di tampilan mobile (layar kecil) — tidak ada batas jumlah kolom yang dipaksakan sistem, tapi disarankan dipilih secukupnya saja untuk tampilan optimal.',
      },
      {
        title: 'Signal Filter',
        content: 'Set threshold RX power untuk kategori **Good** dan **Critical**.\n\nONU dengan RX power di atas threshold Good = hijau. Di antara Good dan Critical = warning. Di bawah Critical = danger.',
      },
      {
        title: 'RX Colors',
        content: 'Konfigurasi color range untuk RX power display.\n\nSet range (min-max dBm), label, dan warna untuk setiap range. Preview tersedia untuk verifikasi.',
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
        content: 'Lihat semua template konfigurasi ONU — 7 template bawaan (built-in) ditambah template kustom yang tersimpan di database.\n\nTemplate **bawaan** (Bridge, PPPoE, ZTE Single, ZTE Dual Band, ZTE Multi-Service, Huawei Full, Fiberhome VEIP) bersifat read-only — klik untuk lihat detail konfigurasinya saja, tidak bisa diedit dari sini.\n\nTemplate **kustom** (dibuat sendiri lewat **Add Template**, tersimpan di database) punya ikon pensil untuk Edit.',
      },
      {
        title: 'Template Types',
        content: '**Bridge**: transparent bridge mode.\n\n**PPPoE**: PPPoE dial-up internet.\n\n**ZTE Single**: single SSID + VLAN.\n\n**ZTE Dual Band**: dual SSID (2.4GHz + 5GHz), dual VLAN, TR069.\n\n**ZTE Multi-Service**: 1-4 service sekaligus, termasuk IPTV, TR069.\n\n**Huawei Full**: multi VLAN, WAN DHCP, untuk Huawei ONU.\n\n**Fiberhome VEIP**: TR069 + Internet + VoIP, untuk Fiberhome ONU.',
      },
    ],
    tips: [
      'Template digunakan oleh Register Wizard (dan bisa jadi acuan konfigurasi manual di Provision Wizard)',
      'Perubahan template kustom tidak mempengaruhi ONU yang sudah ter-provision',
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
        content: 'Lihat semua TR069 profile. Setiap profile berisi: ACS URL, username, password, VLAN, dan mode VLAN (Tag/Untag).\n\nKlik **Add Profile** untuk buat profile baru (perlu permission `manage_tr069`).',
      },
      {
        title: 'Default OLT (auto-apply)',
        content: 'Profile bisa ditandai sebagai **Default OLT** — kalau diisi, profile ini otomatis dipakai setiap kali registrasi ONT baru di OLT tersebut, tanpa perlu pilih manual satu-satu.',
      },
      {
        title: 'Usage',
        content: 'TR069 profile dipakai oleh 4 template: ZTE Single, ZTE Dual Band, ZTE Multi-Service, dan Fiberhome VEIP — dipilih dari dropdown saat konfigurasi ONU di Register/Provision Wizard.',
      },
    ],
  },
  {
    id: 'user-management',
    category: 'System',
    page: '/dashboard/users',
    title: 'Panduan User Management',
    description: 'Kelola user dan role dengan permission granular',
    steps: [
      {
        title: 'User List',
        content: 'Lihat semua user beserta role-nya, status, dan last login.\n\nKlik **Add User** untuk tambah user baru. Klik user untuk edit atau ganti role-nya.',
      },
      {
        title: 'Roles — permission granular, bukan tier tetap',
        content: 'Buka tab **Roles** untuk kelola role. Role di sistem ini **bukan** tiga tingkat tetap "Admin/Technician/Viewer" — tiap role adalah kumpulan permission granular yang bisa dikustomisasi sendiri (17 permission tersedia: akses semua OLT, tambah/konfigurasi/hapus/reboot/reset/clear-config/disable ONU, edit name/description ONU, settings OLT, kelola template, kelola user, kelola TR069, customization, view dashboard, view ONU, terima alert).\n\nRole bawaan sistem: **Full Access** (semua permission), **Viewer** (view-only), **Limited**, dan **Technician** (akses lapangan). Admin bisa membuat role kustom baru dengan kombinasi permission apapun lewat tab Roles.',
      },
    ],
    tips: [
      'Technician bisa di-assign ke ONU spesifik via kolom Technician di All ONUs',
      'Berhati-hati memberi permission "Kelola User" ke role kustom — user dengan permission ini bisa mengubah role atau menghapus akun manapun termasuk akun super admin, sistem saat ini tidak mengecualikan akun super admin dari itu',
    ],
  },
  {
    id: 'my-profile',
    category: 'System',
    page: '/dashboard/profile',
    title: 'Panduan My Profile',
    description: 'Ubah profil, password, dan (khusus super admin) branding sistem',
    steps: [
      {
        title: 'Profil & Password',
        content: 'Ubah nama lengkap, atau ganti password (perlu konfirmasi password baru). Kalau muncul banner paksa ganti password (biasanya untuk akun admin bawaan yang baru pertama kali dipakai), password harus diganti dulu sebelum lanjut pakai sistem.',
      },
      {
        title: 'Branding (Super Admin)',
        content: 'Khusus akun super admin: bisa ubah **Sidebar/Brand Name** dan upload logo perusahaan (PNG/JPG/WEBP/GIF, maksimal 2MB) — dipakai di halaman login, sidebar, dan topbar.',
      },
      {
        title: 'Permission (Read-only)',
        content: 'Halaman ini juga menampilkan daftar permission yang dimiliki akun Anda saat ini — read-only, untuk referensi kalau ada fitur yang tidak muncul/tidak bisa diakses.',
      },
    ],
    tips: [
      'Halaman ini hanya bisa diakses lewat menu avatar user di topbar — belum ada link-nya di sidebar',
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
        content: 'Set threshold untuk alert: ONU offline, LOS, dyinggasp, RX power rendah/berubah, ONU unconfigured. OLT offline, CPU/memory/temperature tinggi.\n\nEnable/disable alert per kategori, dan pilih channel notifikasi per rule.',
      },
      {
        title: 'Notification Channels — 4 tab',
        content: 'Ada 4 channel notifikasi, masing-masing tab sendiri: **In-App** (bell icon di topbar), **Telegram Bot**, **WhatsApp** (gateway pihak ketiga), dan **WA Native** (gateway WhatsApp self-hosted, khusus super admin).\n\nCooldown/dedup antar notifikasi sudah diatur otomatis oleh sistem (tidak ada input manual untuk itu di halaman ini) — bervariasi 1-6 jam tergantung jenis alert.',
      },
      {
        title: 'Debounce & Auto-Resolve',
        content: '**Debounce**: alert ONU offline/dyinggasp/los baru fire setelah kondisi tersebut bertahan kurang lebih 120 detik sejak pertama kali terdeteksi (berapa kali "cek" yang dilewati tergantung interval cron yang dikonfigurasi di tab Cron Job). Mencegah false alert dari status flap sesaat.\n\n**Auto-Resolve**: ONU kembali online → alert lama otomatis di-resolve. OLT health normal → alert auto-resolved.',
      },
      {
        title: 'Cron Job (Super Admin)',
        content: 'Tab khusus super admin untuk atur interval pengecekan alert (10-3600 detik, ada shortcut 30/60/120/300/600s), timezone sistem, dan tombol **Re-check Now** untuk trigger pengecekan manual di luar jadwal.',
      },
    ],
    tips: [
      'Read notifications > 7 hari auto-delete saat alert check cycle',
      'Bell badge count hanya include active (non-resolved) unread notifications',
      'Tab WA Native dan Cron Job hanya terlihat untuk akun super admin',
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
        content: 'Lihat riwayat alert dengan kolom: Tipe, OLT, ONU, Value, dan Waktu.\n\nFilter tersedia berdasarkan **tipe alert** saja (tombol pilihan tipe + "Semua") — belum ada filter date range, severity, atau OLT terpisah di halaman ini.',
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
        content: 'Lihat semua aksi user: login, logout, ONU provision, config change, delete, sync, dll.\n\nMenampilkan: timestamp, user, category, action, target, detail, dan IP address.\n\nFilter tersedia lewat search box (bebas ketik, cari di action/target/detail) dan dropdown **category** (auth/olt/onu/user/role/general) — belum ada filter per user atau date range di UI.',
      },
    ],
  },
  {
    id: 'olt-logs',
    category: 'Activity',
    page: '/dashboard/olt-logs',
    title: 'Panduan OLT Logs',
    description: 'Riwayat status, alarm, dan command log dari OLT',
    steps: [
      {
        title: '5 Tab Log',
        content: '**ONU Status History**: setiap perubahan status ONU (online/offline/dll) lengkap dengan RX power, alasan, dan sumber datanya — bisa difilter by status.\n\n**Alarm Log**, **Command Log**, **SNMP Log**, **NMS Sync Log**: masing-masing punya tab sendiri untuk troubleshooting di levelnya masing-masing.',
      },
      {
        title: 'Pilih OLT & Jumlah Baris',
        content: 'Tiap tab punya selector OLT dan selector jumlah baris yang ditampilkan (100/200/500/1000), plus tombol refresh manual.',
      },
    ],
    tips: [
      'Gunakan Command Log kalau perlu lihat persis command CLI apa yang dikirim sistem ke OLT — berguna saat troubleshooting provisioning yang gagal',
    ],
  },
  {
    id: 'system-update',
    category: 'System',
    page: '/dashboard/settings/update',
    title: 'Panduan System Update',
    description: 'Update aplikasi dari GitHub — khusus super admin',
    steps: [
      {
        title: 'Check Now',
        content: 'Bandingkan versi lokal dengan versi terbaru di GitHub, menampilkan daftar commit yang belum masuk kalau ada update.',
      },
      {
        title: 'Apply Update',
        content: 'Jalankan `git pull` + build ulang frontend + restart service secara otomatis. Aplikasi akan sempat tidak bisa diakses beberapa detik selama restart.',
      },
    ],
    prerequisites: [
      'Hanya bisa diakses oleh akun dengan permission manage_users (super admin)',
    ],
    tips: [
      'Pastikan tidak ada proses provisioning/sync yang sedang berjalan sebelum Apply Update, karena service akan restart',
    ],
  },
  {
    id: 'cloudflare',
    category: 'System',
    page: '/dashboard/settings/cloudflare',
    title: 'Panduan Cloudflare Tunnel',
    description: 'Setup Cloudflare Tunnel supaya NMS bisa diakses dari internet tanpa IP publik',
    steps: [
      {
        title: 'Install cloudflared',
        content: 'Klik tombol **Install** untuk pasang aplikasi `cloudflared` di server (download & install paket .deb secara otomatis) — sekali saja per server.',
      },
      {
        title: 'Configure Tunnel',
        content: 'Buat tunnel dulu di dashboard Cloudflare Zero Trust (Networks → Tunnels → Create Tunnel), lalu salin **tunnel token**-nya ke sini bersama domain dan nama tunnel yang diinginkan. Sistem akan menyimpan config ini dan menyiapkan service tunnel-nya.',
      },
      {
        title: 'Start / Stop / View Logs',
        content: 'Setelah dikonfigurasi, kelola tunnel-nya langsung dari halaman ini: **Start** untuk mengaktifkan koneksi ke Cloudflare, **Stop** untuk memutus, dan **View Logs** untuk lihat status koneksi/troubleshooting.',
      },
    ],
    prerequisites: [
      'Akun Cloudflare dengan domain yang sudah terdaftar',
      'Tunnel token dari dashboard Cloudflare Zero Trust (bukan API Token) — dibuat manual di sisi Cloudflare, lalu ditempel ke form Configure Tunnel',
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
