# Prompt Adopsi Fitur KusumaVision NMS → Salfanet NMS (nms-ztec320)

Cara pakai:
1. Jalankan **PROMPT 0 (Konteks Umum)** sekali di awal sesi AI agent.
2. Lalu jalankan **satu prompt fase per sesi/PR** (urutan = prioritas). Jangan gabung beberapa fase dalam satu run.
3. Setelah tiap fase: review diff, jalankan test, uji di OLT asli, baru merge.

Fitur yang SUDAH ada di Salfanet dan TIDAK perlu diadopsi: SSH+Telnet, EPON, replace ONU, template provisioning, FTTH OTB/ODC/ODP, traffic history, WA/Telegram alert, debounce alert, auto-backup config OLT, Leaflet map infrastruktur, MikroTik, Cloudflare Tunnel, system update dari web.

---

## PROMPT 0 — Konteks Umum (jalankan pertama)

```
Kamu bekerja di repo Salfanet NMS (https://github.com/s4lfanet/nms-ztec320).
Stack: backend Flask 3 + SQLAlchemy 2 + Flask-Migrate (Alembic) + FastAPI (WebSocket, port 8765),
pysnmp 7, paramiko SSH, raw-socket Telnet; frontend React 19 + TypeScript + Vite 8 + TailwindCSS v4,
Zustand, React Query, Recharts, Lucide. DB SQLite (dev) / PostgreSQL (prod), Redis opsional.

Referensi fitur: KusumaVision NMS (https://github.com/Masamune21-dev/KusumaVisionNMS, lisensi MIT,
Laravel 12 + Vue 3). Clone ke folder terpisah (mis. ../KusumaVisionNMS) HANYA sebagai referensi logika.

Aturan wajib:
1. Baca dulu AGENTS.md, README.md, dan CHANGELOG.md di repo Salfanet; ikuti konvensi yang ada
   (struktur blueprint routes_*.py, decorator @permission_required, has_permission(), ProtectedRoute,
   useHasPerm, TutorialBanner + guides.ts, cli_sanitize untuk semua perintah CLI).
2. JANGAN menyalin kode PHP/Vue. Tulis ulang dalam Python/React sesuai arsitektur Salfanet.
   Tambahkan atribusi di CHANGELOG: "terinspirasi dari KusumaVision NMS (MIT)".
3. JANGAN menebak OID SNMP atau sintaks CLI. Pakai yang sudah ada di Salfanet (snmp_oids.py,
   telnet_client.py) atau yang terdokumentasi di docs/ KusumaVision. Kalau ragu, buat TODO dan
   minta saya mengirim output asli dari OLT (snmpwalk / CLI).
4. Setiap perubahan skema DB lewat migrasi Alembic baru, kompatibel SQLite & PostgreSQL.
5. Semua endpoint baru wajib cek permission + akses OLT per user. Tambah permission baru ke seed role.
6. Tulis test pytest (backend) dan vitest (frontend) untuk logika baru. Semua test harus lulus.
7. Jalankan `npm run build` dan commit frontend/dist (installer butuh dist ter-commit).
8. Update README (bagian Fitur), CHANGELOG, dan guides.ts (Panduan) untuk fitur baru.
9. Kerjakan HANYA fase yang saya minta. Di akhir, beri ringkasan: file diubah, migrasi baru,
   permission baru, cara uji manual di OLT asli.
Balas "SIAP" lalu tunggu prompt fase.
```

---

## FASE 1 — Riwayat RX Power ONU (prioritas tinggi)

```
Implementasikan riwayat RX power per ONU.
Referensi: KusumaVision database/migrations/*onu_rx_samples*, *onu_rx_hourly*, dan service ZteOnuRxPowerService.

1. Model OnuRxSample (olt_id, onu_id, rx_dbm, tx_dbm nullable, polled_at) — sampel mentah, retensi 24–48 jam.
2. Model OnuRxHourly (olt_id, onu_id, hour, rx_min, rx_avg, rx_max, samples) — retensi 90 hari (configurable di SystemConfig).
3. Simpan sampel saat sync SNMP berjalan (pakai data RX yang sudah dikumpulkan, jangan polling tambahan).
   Filter nilai invalid (mis. -40 / 0 / nilai sentinel ZTE) sesuai logika yang sudah ada.
4. Job agregasi per jam + pruning (gabungkan ke auto_sync/cron yang ada). Pakai batch insert.
5. Endpoint GET /api/onu/<id>/rx-history?range=24h|7d|30d|90d (24h dari raw, sisanya dari hourly).
6. Di ViewOnu.tsx: chart Recharts (garis avg + area min/max), garis threshold critical/good dari
   pengaturan Customization, selector range.
7. Opsional: di AllOnus tambah kolom "Δ RX 24 jam" untuk mendeteksi redaman yang memburuk.
Test: agregasi min/avg/max benar, pruning, endpoint permission.
```

---

## FASE 2 — Alarm: Korelasi Root-Cause & Deep-Link Notifikasi

```
Tingkatkan alert engine (backend/alerts.py) tanpa merusak debounce 120 detik & batch per PON yang sudah ada.
Referensi: KusumaVision app/Services/Alarm/*, AlarmEvaluator.php, docs/handbook/10-alarm-telegram.md.

1. Korelasi root-cause berlapis: OLT offline → tekan semua alert PON/ONU di OLT itu;
   PON port down/LOS massal → satu alert PON, tekan alert ONU individu di port tsb;
   ODP (dari relasi FTTH ONU→ODP) → kalau ≥N ONU dalam satu ODP down bersamaan, kirim satu alert
   "kemungkinan gangguan di ODP X" (N configurable). Saat recovery, kirim recovery untuk root saja.
2. Simpan field root_cause_id / suppressed_by di AlertHistory supaya histori jelas.
3. Deep-link: setiap Notification menyimpan target (type: olt|pon|onu|odp, id). Klik bell →
   navigasi ke halaman yang tepat. Kalau ONU pindah port/terhapus, resolve via serial number.
   Link juga disertakan di pesan Telegram/WA (pakai base URL dari config).
4. Tampilkan sebab down ONU dengan label ramah: LOS, Dying Gasp (listrik mati), Offline, dll. (id/en).
Test: skenario OLT down dengan 100 ONU hanya menghasilkan 1 notifikasi; ODP grouping; deep-link.
```

---

## FASE 3 — Jembatan GenieACS (TR-069) via NBI

```
Tambahkan integrasi GenieACS opsional lewat NBI (default port 7557).
Referensi: KusumaVision app/Services/Genieacs/* dan docs/handbook/20-genieacs-tr069.md.

1. Halaman pengaturan: URL NBI, user/password (opsional, simpan terenkripsi pakai cryptography
   yang sudah ada), tombol Test Connection. Mask untuk non-admin.
2. Service genieacs_client.py (httpx, timeout, retry) — query devices dengan projection minimal.
3. Pencocokan ONU ↔ device TR-069: (a) serial number persis, (b) MAC PON toleransi ±1,
   (c) manual pin dari UI. Simpan di tabel GenieacsDeviceMap (onu_id, device_id, match_method, pinned).
4. Job sync berkala (ikut auto_sync, interval configurable) dengan cache Redis.
5. Di ViewOnu: panel TR-069 — last inform, software version, WAN IP/PPPoE username, SSID & jumlah
   client WiFi, tombol: Reboot via ACS, Refresh parameter, Ubah SSID/password WiFi (task NBI).
   Semua aksi dicatat di ActionLog dan butuh permission baru `genieacs_manage`.
6. Di AllOnus: badge "TR-069 terhubung / tidak".
Catatan: path parameter TR-098 vs TR-181 berbeda per vendor (ZTE/Huawei/FiberHome) — buat mapping
yang bisa dikonfigurasi, jangan hardcode satu path.
```

---

## FASE 4 — Peta Pelanggan (ONU Pin) + Kunci Posisi

```
Leaflet sudah ada untuk infrastruktur FTTH. Tambahkan peta sebaran ONU pelanggan.
Referensi: KusumaVision docs/handbook/16-peta-onu.md, OnuMapPayloadService.php, migrasi onu_map_pins & add_locked_*.

1. Model OnuMapPin (onu_id, lat, lng, locked bool, updated_by). Tambah juga field locked ke FTTHODP.
2. Tambah pin: klik peta, input koordinat, atau paste link Google Maps (parse @lat,lng / q=lat,lng / ?ll=).
3. Mode kunci/buka: pin terkunci tidak bisa digeser; saat dibuka, drag → simpan otomatis (debounce).
4. Warna marker sesuai status ONU (online/LOS/dying gasp/offline) + clustering (leaflet.markercluster).
5. Garis ONU → ODP (dari assignment port ODP yang ada). Filter per OLT/PON/status. Popup: nama, SN, RX, link ke ViewOnu.
6. Endpoint payload ringan (hanya field yang perlu) agar 5000+ marker tetap lancar.
```

---

## FASE 5 — REST API v1 dengan Token

```
Tambahkan REST API publik versi 1 untuk integrasi (billing salfanet-radius, bot, aplikasi mobile).
Referensi: KusumaVision docs/API.md dan app/Http/Controllers/Api/V1/*.

1. Model ApiToken (user_id, name, token_hash SHA-256, abilities JSON, last_used_at, expires_at).
   Token hanya ditampilkan sekali saat dibuat. UI kelola token di MyProfile / Settings.
2. Auth header `Authorization: Bearer <token>`; permission & akses OLT mengikuti user pemilik token.
3. Blueprint /api/v1: summary, olts, onus (filter status/olt/pon/search, pagination), onu detail,
   unconfigured onus, onu actions (reboot/enable/disable), alarms aktif, odp, search.
4. Rate limit per token (pakai helper rate limiting yang ada), response JSON konsisten {data, meta, error}.
5. Dokumentasikan di Swagger FastAPI yang sudah ada atau OpenAPI terpisah + docs/API.md dengan contoh curl & PHP.
Test: token invalid/expired/abilities, isolasi akses OLT antar user.
```

---

## FASE 6 — Laporan CSV / PDF

```
Tambahkan halaman Reports.
Referensi: KusumaVision app/Services/Report/ReportService.php.

Laporan: (1) inventaris ONU per OLT/PON, (2) ONU dengan RX buruk (di bawah threshold),
(3) ONU offline/LOS > X jam, (4) ringkasan alarm per periode, (5) uptime/SLA OLT (pakai UptimeLog).
Filter OLT + rentang tanggal. Export CSV (streaming, aman untuk data besar) dan PDF (WeasyPrint atau
ReportLab — pilih yang paling ringan dipasang via install-vps.sh, update installer & requirements.txt).
PDF memakai branding dari pengaturan (logo, nama ISP). Permission baru `reports_view`.
```

---

## FASE 7 — Terminal Telnet/SSH di Browser

```
Tambahkan terminal CLI OLT interaktif di browser (khusus admin).
Referensi: KusumaVision TelnetSessionController.php dan proses telnet-proxy-nya.

1. Frontend: xterm.js di halaman OltSettings/Detail OLT (tab "Terminal").
2. Backend: WebSocket di FastAPI (api_async.py) yang membuka sesi SSH/Telnet ke OLT sesuai setting
   OLT (pakai kelas koneksi yang sudah ada). Auth via session cookie seperti WS lain.
3. Keamanan: permission baru `olt_terminal` (default hanya super admin), idle timeout, batas
   1–2 sesi per OLT, seluruh input dicatat ke ActionLog (user, OLT, waktu, perintah per baris).
   Jangan pernah log password. Hentikan sesi saat user logout.
4. Pastikan tidak bentrok dengan sync lock: tampilkan peringatan kalau sync sedang berjalan.
```

---

## FASE 8 — Enable/Disable Port PON (ZTE C300/C320)

```
Tambahkan aksi matikan/nyalakan port GPON/EPON dari halaman port.
1. Perintah CLI ZTE: masuk `interface gpon-olt_<rack>/<slot>/<port>` lalu `shutdown` / `no shutdown`
   (EPON: prefix epon-olt_). Verifikasi dulu sintaks dengan output asli OLT saya sebelum merge.
2. JANGAN otomatis `write` — beri tahu user bahwa status kembali setelah reboot OLT kecuali disimpan,
   dan sediakan tombol "Simpan konfigurasi" terpisah.
3. Dialog konfirmasi menampilkan jumlah ONU yang akan terdampak. Permission `pon_port_control`.
4. Alert engine: port yang sengaja dimatikan tidak memicu alarm ONU massal (tipe alert baru `port_disabled`).
5. Catat ke ActionLog.
```

---

## FASE 9 — Pencarian Global

```
Tambahkan search bar global (Ctrl+K) di header.
Cari sekaligus: ONU (SN, nama, deskripsi, MAC, username PPPoE dari GenieACS bila ada), OLT (nama/IP),
ODP/ODC/OTB (nama), user. Endpoint /api/search?q= dengan hasil dikelompokkan per tipe, max 5 per tipe,
hormati akses OLT user. Frontend: command palette dengan navigasi keyboard, debounce 250 ms.
Pastikan pakai index DB pada kolom yang dicari (tambah migrasi index bila perlu).
```

---

## FASE 10 — Tema Gelap/Terang & Dwibahasa (id/en)

```
1. Tema: gelap / terang / ikuti sistem, disimpan per user (kolom baru di User) + localStorage fallback.
   Pakai CSS variables + Tailwind v4 dark variant; termasuk halaman login. Recharts & Leaflet ikut tema.
2. i18n: react-i18next, file locale id.json & en.json, bahasa per user (default id).
   Pesan error backend dikembalikan dengan kode (error_code) supaya bisa diterjemahkan di frontend.
3. Migrasi string secara bertahap: mulai dari layout, sidebar, Dashboard, AllOnus, ViewOnu, Login.
```

---

## FASE 11 — Audit Log Immutable

```
ActionLog sudah ada. Buat jadi tamper-evident:
1. Tambah kolom prev_hash & hash (SHA-256 dari isi record + prev_hash) — hash chain.
2. Larang UPDATE/DELETE via aplikasi (tidak ada endpoint hapus); untuk PostgreSQL tambah trigger
   yang menolak UPDATE/DELETE pada tabel tsb.
3. Endpoint verifikasi integritas chain (admin) + tampilkan status di ActionLogs.tsx.
4. Retensi: arsipkan ke file terkompresi, bukan hapus.
```

---

## FASE 12 — Deploy Docker

```
Tambahkan opsi deploy Docker di samping install-vps.sh.
Referensi: KusumaVision Dockerfile, docker-compose.yml, docs/DOCKER.md.
Service: app (Flask + FastAPI via run_server.py), postgres, redis, wa_gateway (Node/Baileys),
nginx (serve frontend/dist + reverse proxy /api & /ws). Volume persist untuk DB, backup, sesi WA.
.env.docker.example, healthcheck, start.sh/start.bat, docs/DOCKER.md. Image berbasis python:3.12-slim.
```

---

## FASE 13 (opsional, besar) — Dukungan Vendor C-Data

```
Tambahkan adapter OLT C-Data (GPON FD1608S/FD1601S/FD1602S, EPON FD1304E) di backend/olt_adapters/
mengikuti pola BaseOLTAdapter + registry (lihat hioso_adapter.py).
Referensi OID/CLI: KusumaVision docs/SMARTOLT_CDATA_GUIDE.md, docs/handbook/17-cdata-gpon-snmp-walk.md,
app/Services/CData/*.
Tahap 1: monitoring saja (inventaris kartu/port, daftar ONU, status, RX/TX, deteksi otomatis vendor).
Tahap 2 (terpisah): VLAN dan detail port. Provisioning C-Data JANGAN dikerjakan sebelum saya kirim
output CLI asli dari perangkat. Semua halaman yang sekarang mengasumsikan ZTE harus cek vendor dulu.
```

---

## FASE 14 (opsional) — Web Push Notification untuk PWA

```
Salfanet sudah PWA. Tambahkan Web Push (VAPID, library pywebpush) sebagai channel notifikasi baru
selain Telegram/WA/bell: subscribe dari browser/HP, simpan subscription per user, toggle per alert rule
(ikut pola per-channel toggle yang sudah ada), klik notifikasi → deep-link dari Fase 2.
```
