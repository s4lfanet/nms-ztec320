import{r as e}from"./rolldown-runtime-hePW80VL.js";import{A as t,Bt as n,Zt as r,d as i,pn as a,pt as o,qt as s,tn as c}from"./vendor-icons-C1fxsslG.js";import{a as l}from"./vendor-query-D8nIN4mx.js";var u=e(a(),1),d=[`Dashboard`,`ONU Management`,`Templates`,`Traffic`,`Infrastructure`,`System`,`Activity`],f=[{id:`dashboard`,category:`Dashboard`,page:`/dashboard`,title:`Panduan Dashboard`,description:`Monitor status OLT dan ONU secara real-time`,steps:[{title:`Statistik ONU`,content:`Kartu statistik menampilkan total ONU per status: **Online**, **Offline**, **DyingGasp**, **LOS** (Loss of Signal), dan **Total**.

Klik kartu untuk filter ONU berdasarkan status di halaman All ONUs.`},{title:`OLT Cards`,content:`Setiap OLT ditampilkan sebagai kartu dengan info: status online/offline, uptime, suhu, CPU, fan, jumlah ONU online/offline, dan progress bar.

Klik **Sync** pada kartu OLT untuk sync OLT tersebut. Klik **Config** untuk ke halaman OLT Configuration.

Klik kartu OLT untuk navigasi ke All ONUs yang difilter per OLT tersebut.`},{title:`Sync All`,content:`Tombol **Sync All** di header untuk sync semua OLT sekaligus. Progress sync ditampilkan real-time per OLT.

Sync mengumpulkan data ONU via SNMP (light) atau SNMP+CLI (full). Auto-refresh setiap 30 detik.`}],tips:[`Dashboard auto-refresh setiap 30 detik — tidak perlu manual refresh`,`WebSocket aktif: alert baru akan otomatis muncul tanpa refresh`,`Klik kartu ONU untuk drill-down ke All ONUs per OLT`,`Sort OLT cards by status/name/problems/offline count`]},{id:`all-onus`,category:`ONU Management`,page:`/dashboard/onus`,title:`Panduan All ONUs`,description:`Kelola semua ONU dari semua OLT dalam satu tabel`,steps:[{title:`Stat Cards & Filter`,content:`Kartu statistik di atas tabel menampilkan jumlah ONU per kategori: **All**, **Online**, **Offline**, **DyingGasp**, **LOS**. Klik kartu untuk filter tabel.

Signal cards menampilkan distribusi RX power berdasarkan color range yang dikonfigurasi di Customization.`},{title:`Search & Filter`,content:`Gunakan search bar untuk cari ONU by name, OLT, serial number, PPPoE, atau type. Filter dropdown untuk OLT dan vendor.

Search di-debounce 400ms — otomatis trigger setelah berhenti mengetik.`},{title:`Tabel ONU`,content:`Tabel menampilkan semua ONU dengan kolom: name, OLT, SN, type, status, RX power, PPPoE, technician, ODP port, dan actions.

Klik header kolom untuk sort. Server-side pagination — 50 ONU per halaman.

Klik **View** untuk detail ONU (ViewOnu page). Klik **Edit** untuk edit inline (name, PPPoE, technician, ODP port). Klik **Delete** untuk deregister ONU dari OLT.`},{title:`Export & Signal Refresh`,content:`**Export CSV**: download semua ONU ke file CSV (semua halaman, tidak hanya halaman current).

**Signal Refresh**: kirim SNMP get RX power ke semua OLT untuk update nilai terbaru. Bisa lambat jika OLT banyak.`}],tips:[`WebSocket aktif: tabel auto-refresh saat OLT sync selesai`,`Inline edit: klik cell Technician/ODP port untuk edit langsung di tabel`,`Column visibility & order bisa diatur di Customization page`,`Export CSV include semua ONU (tidak terfilter by pagination)`]},{id:`view-onu`,category:`ONU Management`,page:`/dashboard/onus/:id`,title:`Panduan View ONU`,description:`Detail lengkap ONU termasuk config, traffic, dan actions`,steps:[{title:`ONU Info`,content:`Bagian atas menampilkan info ONU: OLT, interface (GPON/EPON), type, SN/MAC, RX power (OLT/ONU), status, online duration, name, description.

Klik field untuk edit langsung (name, description, actual type, ONU type). Perubahan disimpan ke DB dan OLT secara otomatis.`},{title:`Traffic Chart`,content:`Grafik traffic real-time menampilkan download/upload bandwidth. Update setiap 5 detik via WebSocket.

Klik **Refresh Live** untuk re-fetch data terbaru dari OLT.`},{title:`WAN Services`,content:`Menampilkan 4 WAN service slots. Klik **Edit** pada service untuk konfigurasi VLAN, mode (Router/Bridge), IP, PPPoE credentials.

Service 1 biasanya untuk internet, Service 2-4 untuk VLAN lain (IPTV, VoIP, dll).`},{title:`Actions`,content:`**Reboot**: restart ONU (ZTE: OMCI reboot, non-ZTE: shutdown/no-shutdown fallback). **Get Status**: fetch status lengkap dari OLT (interface info, optical, history, MAC table). **Show Config**: tampilkan running-config ONU. **Resync Config**: re-collect config dari OLT. **Clear Config**: hapus config ONU. **Reset WiFi**: reset WiFi SSID config. **Reset Factory**: factory reset ONU. **Delete**: deregister ONU dari OLT.

**Replace ONU (Swap SN/MAC)**: Ganti perangkat ONU rusak dengan SN/MAC baru tanpa konfigurasi ulang. Sistem akan: backup config lama → delete ONU lama → register ONU baru → re-apply config. Vendor harus sama (ZTE→ZTE, FiberHome→FiberHome).`}],tips:[`EPON ONUs memiliki keterbatasan CLI — beberapa section mungkin tidak tersedia`,`WiFi config untuk EPON diambil dari DB (tidak dari OLT running-config)`,`Save Config untuk menyimpan perubahan ke startup-config OLT`]},{id:`provision-wizard`,category:`ONU Management`,page:`/dashboard/onus/provision`,title:`Panduan Provision ONU`,description:`Provision ONU baru dengan wizard interaktif`,steps:[{title:`Pilih OLT & PON Port`,content:`Pilih OLT dari dropdown, lalu pilih PON port (frame/slot/port) tempat ONU terhubung.

Sistem akan scan ONU yang belum terdaftar (uncfg) di PON port tersebut.`},{title:`Pilih ONU & Template`,content:`Pilih ONU dari daftar uncfg. Lalu pilih template konfigurasi (ZTE Single/Dual/Multi, Huawei Full, Fiberhome VEIP).

Template menentukan VLAN, WAN mode, WiFi config, dan TR069 settings.`},{title:`WiFi & Review`,content:`Konfigurasi WiFi SSID: nama, auth type (Open/WPA/WPA2/Mixed), password, VLAN.

Review semua config sebelum provision. Script CLI preview tersedia untuk verifikasi command yang akan dikirim ke OLT.`}],tips:[`Pre-config mode: provision ONU yang sudah terdaftar tanpa re-register`,`Register Wizard: wizard lengkap dengan template selection`,`Pastikan ONU sudah online (uncfg) sebelum provision`]},{id:`register-wizard`,category:`ONU Management`,page:`/dashboard/onus/register`,title:`Panduan Register Wizard`,description:`Register ONU baru ke OLT dengan wizard multi-step`,steps:[{title:`Select OLT`,content:`Pilih OLT target dari dropdown. Hanya OLT dengan CLI enabled (SSH/Telnet) yang tersedia.

Sistem akan cek koneksi CLI ke OLT sebelum lanjut.`},{title:`Scan ONUs`,content:`Sistem scan ONU uncfg di semua PON port OLT yang dipilih.

Pilih ONU yang ingin di-register dari daftar.`},{title:`Configure`,content:`Pilih template (ZTE Single/Dual/Multi, Huawei Full, Fiberhome VEIP). Konfigurasi WiFi SSID, VLAN, WAN mode, TR069.

Fiberhome VEIP template menggunakan TR069 Profile dropdown untuk ACS config.`},{title:`Review & Register`,content:`Review semua config. Script CLI preview menampilkan exact command yang akan dikirim.

Klik **Register** untuk eksekusi. ONU akan di-register ke OLT dan config diterapkan.`}]},{id:`olt-settings`,category:`Infrastructure`,page:`/dashboard/settings/olts`,title:`Panduan OLT Settings`,description:`Kelola OLT: tambah, edit, hapus, sync`,steps:[{title:`Tambah OLT`,content:`Klik **Add OLT** untuk menambah OLT baru. Isi: name, IP address, vendor (ZTE/Huawei/Fiberhome), SNMP community, CLI credentials (SSH/Telnet).

Test koneksi SNMP dan CLI sebelum save.`},{title:`Edit & Delete OLT`,content:`Klik **Edit** pada kartu OLT untuk ubah konfigurasi. Klik **Delete** untuk hapus OLT (ONU terkait juga akan dihapus).

**Config** untuk ke halaman OLT Configuration (uplinks, PON cards, VLANs, dll).`},{title:`Sync OLT`,content:`Klik **Sync** pada kartu OLT untuk collect data ONU via SNMP/CLI. Progress ditampilkan real-time.

Sync All untuk sync semua OLT sekaligus.`}],tips:[`SNMP community default: public (read-only). Set write community untuk config via SNMP.`,`CLI credentials (SSH/Telnet) diperlukan untuk ONU provisioning dan live detail`,`Pastikan OLT reachable dari server NMS (cek firewall)`]},{id:`olt-configuration`,category:`Infrastructure`,page:`/dashboard/settings/olts/:oltId/config`,title:`Panduan OLT Configuration`,description:`Konfigurasi OLT: uplinks, PON cards, VLANs, profiles`,steps:[{title:`Uplinks Tab`,content:`Lihat dan konfigurasi port uplink OLT. Menampilkan: port, status, speed, VLAN, traffic stats.

Klik port untuk edit VLAN membership dan mode (access/trunk/hybrid).`},{title:`PON Cards Tab`,content:`Lihat status PON cards: slot, type, status, temperature, ONU count.

Enable/disable PON port, set description.`},{title:`VLANs Tab`,content:`Kelola VLAN di OLT: tambah, edit, hapus VLAN. Set VLAN name dan description.

VLAN digunakan untuk service-port ONU (internet, IPTV, VoIP).`},{title:`Speed Profiles & System`,content:`**Speed Profiles**: TCONT dan traffic profiles untuk bandwidth limit.

**System**: OLT system config (hostname, timezone, NTP, SNMP).`}]},{id:`traffic`,category:`Traffic`,page:`/dashboard/traffic`,title:`Panduan Traffic Monitoring`,description:`Monitor bandwidth usage real-time dan historical`,steps:[{title:`Pilih OLT & Port Type`,content:`Pilih OLT dari dropdown, lalu pilih port type: **Uplink** (port uplink OLT) atau **PON** (port PON GPON).

Pilih periode: **Live** (real-time, update 5 detik), **1H/6H/1D/3D/7D/30D** (historical dari database).`},{title:`Traffic Chart`,content:`Grafik menampilkan download (inbound) dan upload (outbound) bandwidth dalam Kbps/Mbps.

Live mode: auto-update setiap 5 detik. Historical: data dari traffic poller (5 menit interval).`},{title:`Port Selection`,content:`Pilih port spesifik dari dropdown untuk melihat traffic per port.

Uplink ports: ge1-4, xge1-2. PON ports: gpon-olt_0/1/1, dll.`}],tips:[`Traffic poller berjalan setiap 5 menit via cron — historical data tersimpan di DB`,`Live traffic menggunakan SNMP get real-time ke OLT`,`WebSocket aktif: chart auto-update tanpa manual refresh`]},{id:`ftth`,category:`Infrastructure`,page:`/dashboard/ftth`,title:`Panduan FTTH Infrastructure`,description:`Kelola infrastruktur FTTH: OTB, ODC, ODP, PON ports`,steps:[{title:`Overview Tab`,content:`Dashboard FTTH menampilkan summary: total OLT, PON ports, ODP, ONU per area.

Klik area untuk drill-down ke detail infrastruktur.`},{title:`PON Ports Tab`,content:`Lihat semua PON port di semua OLT. Menampilkan: OLT, slot/port, ONU count, capacity, utilization.

Klik PON port untuk lihat ONU terkait dan ODP yang terhubung.`},{title:`OTB/ODF, ODC, ODP Tabs`,content:`**OTB/ODF**: Optical Terminal Box / Optical Distribution Frame — titik koneksi fiber dari OLT.

**ODC**: Optical Distribution Cabinet — distribusi fiber ke area.

**ODP**: Optical Distribution Point — distribusi fiber ke rumah pelanggan.

Kelola (tambah/edit/hapus) dan lihat port utilization.`},{title:`FTTH Map`,content:`Peta interaktif menampilkan lokasi OLT, ODC, ODP pada peta.

Klik marker untuk detail. Garis menampilkan koneksi fiber (OLT → ODC → ODP → ONU).`}]},{id:`customization`,category:`System`,page:`/dashboard/customization`,title:`Panduan Customization`,description:`Kustomisasi tampilan: kolom, filter, RX colors`,steps:[{title:`Desktop Columns`,content:`Atur visibilitas dan urutan kolom di tabel All ONUs untuk tampilan desktop.

Drag-and-drop untuk reorder. Toggle checkbox untuk show/hide kolom.`},{title:`Mobile Columns`,content:`Atur kolom yang tampil di tampilan mobile (layar kecil).

Pilih maksimal 5 kolom untuk tampilan optimal.`},{title:`Signal Filter`,content:`Set threshold RX power untuk kategori **Good** dan **Critical**.

ONU dengan RX power di atas threshold Good = hijau. Di antara Good dan Critical = warning. Di bawah Critical = danger.`},{title:`RX Colors`,content:`Konfigurasi color range untuk RX power display.

Set range (min-max dBm) dan warna untuk setiap range. Preview tersedia untuk verifikasi.`},{title:`Timezone`,content:`Pilih timezone sistem yang digunakan untuk **auto-backup scheduling**, **UI display**, dan **logging**.

Database tetap simpan timestamp dalam UTC, hanya display yang dikonversi ke timezone yang dipilih.

**Penting**: Setting "At time" di OLT auto-backup config menggunakan timezone ini. Misal "02:00" dengan timezone Asia/Jakarta = backup jam 02:00 WIB.`}]},{id:`templates`,category:`Templates`,page:`/dashboard/templates`,title:`Panduan Templates`,description:`Kelola template konfigurasi ONU`,steps:[{title:`Template List`,content:`Lihat semua template konfigurasi ONU. Template menentukan VLAN, WAN mode, WiFi, TR069 settings.

Klik **Add Template** untuk buat template baru. Klik template untuk edit.`},{title:`Template Types`,content:`**ZTE Single**: single WAN service (internet only).

**ZTE Dual**: dual WAN service (internet + IPTV/VoIP).

**ZTE Multi**: multi WAN service (up to 4 services).

**Huawei Full**: template untuk Huawei ONU.

**Fiberhome VEIP**: template dengan TR069 profile untuk Fiberhome ONU.`}],tips:[`Template digunakan oleh Register Wizard dan Provision Wizard`,`Perubahan template tidak mempengaruhi ONU yang sudah ter-provision`,`TR069 Profile dikelola terpisah di TR069 Profile page`]},{id:`tr069`,category:`Templates`,page:`/dashboard/templates/tr069-profile`,title:`Panduan TR069 Profile`,description:`Kelola TR069/ACS profile untuk remote management ONU`,steps:[{title:`Profile List`,content:`Lihat semua TR069 profile. Setiap profile berisi: ACS URL, username, password, periodic inform interval, connection request URL.

Klik **Add Profile** untuk buat profile baru.`},{title:`Usage`,content:`TR069 profile digunakan oleh template Fiberhome VEIP dan Register/Provision Wizard.

Profile dipilih dari dropdown saat konfigurasi ONU dengan TR069 support.`}]},{id:`user-management`,category:`System`,page:`/dashboard/users`,title:`Panduan User Management`,description:`Kelola user dan permission`,steps:[{title:`User List`,content:`Lihat semua user: admin, technician, viewer. Menampilkan: username, role, status, last login.

Klik **Add User** untuk tambah user baru. Klik user untuk edit.`},{title:`Roles & Permissions`,content:`**Admin**: akses penuh ke semua fitur.

**Technician**: akses terbatas (view ONU, edit name/description, provision ONU).

**Viewer**: read-only access.

Permission per feature bisa diatur per user.`}],tips:[`Super admin tidak bisa dihapus atau diubah role-nya`,`Technician bisa di-assign ke ONU spesifik via kolom Technician di All ONUs`]},{id:`alert-settings`,category:`System`,page:`/dashboard/settings/alerts`,title:`Panduan Alert Settings`,description:`Konfigurasi notifikasi alert ONU dan OLT`,steps:[{title:`Alert Rules`,content:`Set threshold untuk alert: ONU offline, LOS, dyinggasp. OLT offline, CPU/memory/temperature tinggi.

Enable/disable alert per kategori.`},{title:`Notification Channels`,content:`Pilih channel notifikasi: **In-app** (bell icon di topbar), **WhatsApp** (via WhatsApp Gateway).

Set cooldown period untuk mencegah spam notifikasi.`},{title:`Debounce & Auto-Resolve`,content:`**Debounce**: alert ONU offline/dyinggasp/los butuh 2 deteksi konsekutif dalam 120 detik sebelum fire. Mencegah false alert dari status flap.

**Auto-Resolve**: ONU kembali online → alert lama otomatis di-resolve. OLT health normal → alert auto-resolved.`}],tips:[`Read notifications > 7 hari auto-delete saat alert check cycle`,`Bell badge count hanya include active (non-resolved) unread notifications`]},{id:`alert-history`,category:`System`,page:`/dashboard/alerts/history`,title:`Panduan Alert History`,description:`Riwayat alert yang telah terjadi`,steps:[{title:`Alert Log`,content:`Lihat riwayat alert: timestamp, type, severity, ONU/OLT, message, status (active/resolved).

Filter by date range, severity, type, OLT.`},{title:`Export`,content:`Export alert history ke CSV untuk reporting.

Filter dulu sebelum export untuk export hanya data yang relevan.`}]},{id:`action-logs`,category:`Activity`,page:`/dashboard/logs`,title:`Panduan Activity Log`,description:`Riwayat aksi user di sistem`,steps:[{title:`Log Entries`,content:`Lihat semua aksi user: login, logout, ONU provision, config change, delete, sync, dll.

Menampilkan: timestamp, user, action type, target, detail.

Filter by user, action type, date range.`},{title:`Export`,content:`Export activity log ke CSV untuk audit trail.

Gunakan filter untuk export hanya data yang relevan.`}]},{id:`cloudflare`,category:`System`,page:`/dashboard/settings/cloudflare`,title:`Panduan Cloudflare Tunnel`,description:`Kelola Cloudflare Tunnel untuk akses remote`,steps:[{title:`Tunnel Config`,content:`Lihat status Cloudflare Tunnel: tunnel ID, hostname, ingress rules.

Tambah/hapus hostname untuk subdomain tenant (SaaS mode).`},{title:`DNS Management`,content:`Sistem otomatis membuat CNAME record di Cloudflare DNS saat tenant baru terdaftar.

Ingress rule otomatis ditambahkan untuk route subdomain ke Flask app.`}],prerequisites:[`Cloudflare API Token diperlukan (set di environment variable)`,`Cloudflare Tunnel harus sudah ter-install di server`]}];function p(e){let t=e.toLowerCase().trim();return t?f.filter(e=>e.title.toLowerCase().includes(t)||e.description.toLowerCase().includes(t)||e.category.toLowerCase().includes(t)||e.steps.some(e=>e.title.toLowerCase().includes(t)||e.content.toLowerCase().includes(t))||e.tips?.some(e=>e.toLowerCase().includes(t))):f}var m=l();function h(e){return e.split(/(\*\*[^*]+\*\*|\n)/g).map((e,t)=>e===`
`?(0,m.jsx)(`br`,{},t):e.startsWith(`**`)&&e.endsWith(`**`)?(0,m.jsx)(`strong`,{className:`text-tx1 font-semibold`,children:e.slice(2,-2)},t):(0,m.jsx)(`span`,{children:e},t))}function g({guide:e,defaultOpen:t}){let[a,c]=(0,u.useState)(t??!1);return(0,m.jsxs)(`div`,{className:`glass-card overflow-hidden`,children:[(0,m.jsxs)(`button`,{onClick:()=>c(!a),className:`w-full flex items-center gap-3 p-4 text-left hover:bg-glass/50 transition-colors`,children:[(0,m.jsx)(`div`,{className:`flex-shrink-0 w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center`,children:(0,m.jsx)(n,{size:16})}),(0,m.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,m.jsx)(`h3`,{className:`text-sm font-semibold text-tx1 truncate`,children:e.title}),(0,m.jsx)(`p`,{className:`text-xs text-tx3 truncate`,children:e.description})]}),a?(0,m.jsx)(r,{size:18,className:`text-tx3 flex-shrink-0`}):(0,m.jsx)(s,{size:18,className:`text-tx3 flex-shrink-0`})]}),a&&(0,m.jsxs)(`div`,{className:`px-4 pb-4 space-y-3 animate-fade-in`,children:[e.prerequisites&&e.prerequisites.length>0&&(0,m.jsxs)(`div`,{className:`p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-tx2`,children:[(0,m.jsxs)(`div`,{className:`flex items-center gap-1.5 mb-1.5 font-semibold text-warning`,children:[(0,m.jsx)(i,{size:14}),` Prasyarat`]}),(0,m.jsx)(`ul`,{className:`ml-4 space-y-1 list-disc`,children:e.prerequisites.map((e,t)=>(0,m.jsx)(`li`,{children:h(e)},t))})]}),(0,m.jsx)(`div`,{className:`space-y-2.5`,children:e.steps.map((e,t)=>(0,m.jsxs)(`div`,{className:`flex gap-2.5`,children:[(0,m.jsx)(`span`,{className:`flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold`,children:t+1}),(0,m.jsxs)(`div`,{className:`min-w-0 flex-1`,children:[(0,m.jsx)(`strong`,{className:`text-sm text-tx1`,children:e.title}),(0,m.jsx)(`p`,{className:`text-xs text-tx2 mt-0.5 leading-relaxed`,children:h(e.content)})]})]},t))}),e.tips&&e.tips.length>0&&(0,m.jsxs)(`div`,{className:`p-3 rounded-lg bg-glass border border-brd text-xs text-tx3`,children:[(0,m.jsxs)(`div`,{className:`flex items-center gap-1.5 mb-1.5 font-semibold text-tx2`,children:[(0,m.jsx)(o,{size:14,className:`text-accent`}),` Tips`]}),(0,m.jsx)(`ul`,{className:`ml-4 space-y-1 list-disc`,children:e.tips.map((e,t)=>(0,m.jsx)(`li`,{children:h(e)},t))})]})]})]})}function _(){let[e,r]=(0,u.useState)(``),[i,a]=(0,u.useState)(`All`),o=(0,u.useMemo)(()=>{let t=e?p(e):f;return i!==`All`&&(t=t.filter(e=>e.category===i)),t},[e,i]),s=(0,u.useMemo)(()=>{let e=new Map;for(let t of o)e.has(t.category)||e.set(t.category,[]),e.get(t.category).push(t);return Array.from(e.entries()).sort((e,t)=>{let n=d.indexOf(e[0]),r=d.indexOf(t[0]);return(n===-1?99:n)-(r===-1?99:r)})},[o]),l=(0,u.useMemo)(()=>{let e=new Map;for(let t of f)e.set(t.category,(e.get(t.category)||0)+1);return Array.from(e.entries()).sort((e,t)=>{let n=d.indexOf(e[0]),r=d.indexOf(t[0]);return(n===-1?99:n)-(r===-1?99:r)})},[]),h=(0,u.useCallback)(()=>r(``),[]);return(0,m.jsxs)(`div`,{className:`space-y-4`,children:[(0,m.jsxs)(`div`,{children:[(0,m.jsxs)(`h1`,{className:`text-xl md:text-2xl font-bold flex items-center gap-2`,children:[(0,m.jsx)(c,{size:22,className:`text-accent`}),` Panduan`]}),(0,m.jsxs)(`p`,{className:`text-tx2 text-xs md:text-sm mt-1`,children:[`Pusat panduan penggunaan Salfanet NMS — `,f.length,` panduan tersedia`]})]}),(0,m.jsx)(`div`,{className:`flex flex-col md:flex-row gap-3`,children:(0,m.jsxs)(`div`,{className:`relative flex-1`,children:[(0,m.jsx)(t,{size:16,className:`absolute left-3 top-1/2 -translate-y-1/2 text-tx3`}),(0,m.jsx)(`input`,{type:`text`,value:e,onChange:e=>r(e.target.value),placeholder:`Cari panduan... (mis: ONU, VLAN, traffic, alert)`,className:`w-full pl-9 pr-9 py-2.5 rounded-xl bg-glass border border-brd text-sm text-tx1 placeholder:text-tx3 focus:outline-none focus:border-accent/30 transition-colors`}),e&&(0,m.jsx)(`button`,{onClick:h,className:`absolute right-3 top-1/2 -translate-y-1/2 text-tx3 hover:text-tx1 text-sm`,children:`✕`})]})}),(0,m.jsxs)(`div`,{className:`flex flex-wrap gap-1.5`,children:[(0,m.jsxs)(`button`,{onClick:()=>a(`All`),className:`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${i===`All`?`bg-accent/15 text-accent border border-accent/20`:`bg-glass border border-brd text-tx2 hover:text-tx1 hover:border-accent/30`}`,children:[`Semua (`,f.length,`)`]}),l.map(([e,t])=>(0,m.jsxs)(`button`,{onClick:()=>a(e),className:`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${i===e?`bg-accent/15 text-accent border border-accent/20`:`bg-glass border border-brd text-tx2 hover:text-tx1 hover:border-accent/30`}`,children:[e,` (`,t,`)`]},e))]}),o.length===0?(0,m.jsxs)(`div`,{className:`glass-card p-8 text-center`,children:[(0,m.jsx)(n,{size:32,className:`text-tx3 mx-auto mb-2`}),(0,m.jsxs)(`p`,{className:`text-tx2 text-sm`,children:[`Tidak ada panduan yang cocok dengan "`,e,`"`]}),(0,m.jsx)(`button`,{onClick:()=>{r(``),a(`All`)},className:`mt-3 text-xs text-accent hover:underline`,children:`Reset filter`})]}):(0,m.jsx)(`div`,{className:`space-y-4`,children:s.map(([e,t])=>(0,m.jsxs)(`div`,{children:[(0,m.jsx)(`h2`,{className:`text-xs font-semibold text-tx3 uppercase tracking-wider mb-2 px-1`,children:e}),(0,m.jsx)(`div`,{className:`space-y-2`,children:t.map(e=>(0,m.jsx)(g,{guide:e,defaultOpen:o.length===1},e.id))})]},e))})]})}export{_ as GuidePage};