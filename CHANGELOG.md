# Changelog

Semua perubahan penting pada proyek ini akan didokumentasikan dalam file ini.

## [Unreleased]

### 2026-09-02 — Diagram Port Visual untuk ODP Juga (Menyamakan dengan OTB/ODF)

#### Ditambahkan — Toggle Diagram/List di Port Management ODP
- Follow-up dari entri di bawah: ODP (`FTTHODPPort`) sekarang punya pilihan tampilan diagram grid ala NetBox yang sama persis dengan OTB/ODF, di samping tabel detail yang sudah ada (nomor telepon customer, serial ONU) — bisa toggle bolak-balik lewat ikon di header modal "Port Management"
- Klik kotak port → modal edit customer name/phone/description (sama seperti sebelumnya). Ikon kecil di pojok kotak → link/unlink ONU cepat tanpa buka modal
- Tidak ada perubahan backend/API — murni penambahan komponen frontend (`OdpPortPanel` di `FtthInfrastructure.tsx`) yang reuse data `ftthOdpPorts` yang sudah ada
- **Diverifikasi langsung di browser** (Playwright, bukan cuma asumsi): seed 1 OTB → 1 ODC → 1 ODP (8 port) di DB dev lokal, buka Port Management → diagram muncul 8 kotak "Available" → klik kotak #3 → isi nama "Budi Santoso" → toast "Port updated" → kotak #3 langsung tampil nama tebal → toggle ke List view → baris Port 3 juga menampilkan nama yang sama, nol error console di seluruh alur

---

### 2026-09-02 — Diagram Port Visual untuk OTB/ODF (ala NetBox)

#### Diaudit — OTB/ODF Belum Punya Entitas Per-Port Sama Sekali
- Beda dari ODP yang sudah punya tabel `FTTHODPPort` per-port (list biasa, belum diagram visual), OTB/ODF cuma punya field `total_cores` (angka doang) — tidak ada cara memberi nama masing-masing core/port

#### Ditambahkan — Model, API, dan Diagram Visual Baru untuk Port OTB/ODF
- **Backend**: tabel baru `FTTHOTBPort` (mirip pola `FTTHODPPort`) — tiap core OTB dapat baris sendiri dengan `label` (nama custom) + `description`. Status "connected/available" dihitung otomatis dari relasi `FTTHODC.otb_id`+`otb_core_number` yang sudah ada (tidak duplikasi data). Port otomatis dibuat sejumlah `total_cores` saat OTB dibuat, dan otomatis nambah kalau `total_cores` di-update lebih besar (tanpa menghapus nama yang sudah diisi). Self-healing: OTB lama yang dibuat sebelum fitur ini otomatis dapat port row saat pertama kali dibuka
- **API baru**: `GET /api/ftth/otb/<id>/ports`, `PUT /api/ftth/otb-port/<id>`
- **Frontend**: komponen `OtbPortDiagram` — grid visual ala NetBox (bukan tabel), tiap core jadi kotak dengan nomor + nama, warna beda untuk yang sudah connect ke ODC vs masih kosong. Klik kotak → beri nama. Tombol "Port Diagram" baru di kartu OTB/ODF
- **Migration**: `89a0f326f24c_add_ftth_otb_port_table.py`, diverifikasi apply bersih dari baseline
- **Diverifikasi**: 6 test backend baru (auto-create sesuai jumlah port, rename port, nambah port saat resize tanpa menghapus nama lama, backfill OTB lama, status ikut ODC yang connect, permission viewer ditolak) — semua lolos, plus **dites sungguhan di browser** (Playwright): tambah OTB 8 core → diagram muncul 8 kotak sesuai jumlah → klik core #1 → kasih nama "Ruko Blok A" → tersimpan dan tampil di kotak, tanpa error console
- **Catatan**: ODP (`FTTHODPPort`) sudah menyusul dapat diagram yang sama — lihat entri di atas

---

### 2026-09-02 — CI GitHub Actions Gagal Sejak Awal Sesi — Ketahuan Saat Audit Local

#### Diperbaiki — `/api/system/backup-db` 500 Error karena Kehilangan Fallback URL Database
- **Ditemukan lewat**: audit "production ready" untuk kondisi lokal — cek status CI di GitHub, ternyata **gagal di setiap commit sejak `d32d720`** (commit pertama hari ini), padahal semua test lokal (123/123) selalu lolos. Reproduksi pakai Python 3.10 asli (persis versi CI, beda dari Python 3.14 yang saya pakai sepanjang hari) — langsung ketemu 2 test gagal
- **Root cause**: saat refactor `backup_database()` untuk pakai `db_backup.py` (commit `2589abd`), fallback lama "kalau `app.config['SQLALCHEMY_DATABASE_URI']` nunjuk ke `:memory:` tapi engine sungguhan sudah di-swap ke file nyata, pakai URL engine yang asli" **hilang tanpa sengaja** — cuma `restore_database()` (fungsi sebelahnya) yang masih punya fallback ini
- **Fix**: `backup_database()` sekarang pakai pola yang sama persis dengan `restore_database()` — coba `str(db.engine.url)` dulu (URL sungguhan), baru fallback ke `app.config` kalau itu gagal
- **Diverifikasi**: install Python 3.10 asli secara lokal, jalankan test suite persis seperti CI (`FLASK_ENV=testing INTERNAL_API_KEY=... SECRET_KEY=... pytest`) — 123/123 lolos, dan Python 3.14 lokal tetap lolos juga (tidak ada regresi)
- **Pelajaran**: cuma andalkan test lokal di satu versi Python tidak cukup — perlu cek status CI aktual secara rutin, bukan asumsi "test lolos lokal = aman"

---

### 2026-09-02 — "Apply Update" Gagal di Step Restart: `salfanet` Tidak Punya Izin Restart Service Sendiri

#### Diperbaiki — Restart Service Setelah Update Gagal "Interactive authentication required"
- **Ditemukan setelah fix pnpm-skip di atas** — begitu step pull+frontend berhasil cepat, proses baru sampai sejauh step restart, dan ternyata **selalu gagal** di situ: user `salfanet` (non-root, yang menjalankan service) tidak pernah diberi izin restart service systemd miliknya sendiri. Kemungkinan besar fitur "Apply Update" belum pernah benar-benar sukses sampai tuntas sebelumnya — selalu gagal duluan di step lain (build frontend) sebelum sempat ketahuan step restart-nya juga bermasalah
- **Fix**: `install-vps.sh`/`deploy/vps-setup.sh` sekarang bikin rule sudoers sempit (`/etc/sudoers.d/salfanet-nms-restart`) — user `salfanet` cuma diizinkan `sudo systemctl restart salfanet-nms`, tidak ada akses sudo lain apa pun. `routes_system.py` sekarang panggil restart lewat `sudo -n systemctl restart ...` (non-interactive, gagal cepat dengan pesan jelas kalau rule belum ada, bukan hang)
- **Diverifikasi, dan ketemu masalah kedua**: setelah rule sudoers aktif, tes lewat API sungguhan (bukan SSH manual) tetap lapor "gagal" — ternyata proses yang menjalankan command restart itu **ikut mati di tengah eksekusi** karena dia sendiri adalah child process dari service yang lagi di-restart (systemd mematikan seluruh process tree service saat restart). Dibuktikan lewat `journalctl`/`systemctl show ActiveEnterTimestamp` — restart-nya **sungguhan sukses**, cuma respons API-nya yang salah lapor gagal
- **Fix kedua**: command restart sekarang dijalankan lewat `systemd-run --no-block` — bikin scope systemd terpisah yang tidak ikut mati saat service utama di-restart, dan `--no-block` supaya request API langsung selesai begitu restart di-antrikan (tidak nunggu proses lama yang mati di tengah jalan). Sudoers rule disesuaikan mengikuti command persis ini
- **Diverifikasi final**: command persis dites manual (exit 0, "Running as unit: salfanet-nms-restart.service"), service tetap aktif+sehat setelahnya

---

### 2026-09-02 — Fitur "System Update" di Web App Ikut Disesuaikan dengan `frontend/dist/` yang Di-commit

#### Diperbaiki — `/api/system/update/apply` Masih Selalu Jalankan `pnpm install`/`build` Meski Tidak Perlu
- Setelah `frontend/dist/` di-commit ke repo, tombol "Apply Update" di web app (`system_update_apply()`) ternyata **masih selalu** jalankan `pnpm install --no-frozen-lockfile` + `pnpm build` setelah `git pull` — padahal `git pull` sudah bawa `dist/` yang benar. Ini kerjaan sia-sia (buang waktu sampai 240 detik) dan berisiko kena masalah interactive-prompt corepack yang sama di jalur kode ini (beda dari installer bash, `_run_cmd()` di sini tidak set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`)
- **Fix**: sekarang cek `frontend/dist/index.html` setelah pull — kalau sudah ada (akan selalu ada, karena ikut ke-pull dari git), **skip pnpm sepenuhnya**. Fallback ke build manual (dengan `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` + timeout, untuk jaga-jaga) cuma kalau `dist/` somehow tidak ada
- **Diverifikasi**: full test suite 123/123 lolos, plus dites langsung via API `/api/system/update/apply` di VPS — update kembali sukses dalam hitungan detik, bukan puluhan detik

---

### 2026-09-02 — Commit `frontend/dist/` — Install VPS Tidak Perlu Node/pnpm/Registry Sama Sekali

#### Ditambahkan — Frontend Pre-built Ikut Di-commit ke Repo
- Atas permintaan user: install package dari registry npm kadang lambat/stuck di koneksi tertentu. Solusinya bukan "masukkan registry ke repo" (tidak praktis — registry itu bukan 1 file, tapi jutaan versi package yang terus berubah), tapi **commit hasil build (`frontend/dist/`, ~2.1MB, 47 file) langsung ke repo** — installer tinggal pakai file itu, tidak perlu compile ulang di VPS
- `install-vps.sh` & `install.sh`: kalau `frontend/dist/index.html` sudah ada dari `git clone` (akan selalu ada sekarang), **skip total** langkah `pnpm install`/`pnpm build` — bahkan `install.sh` skip cek Node.js/pnpm sama sekali kalau tidak diperlukan
- `deploy/vps-setup.sh` sudah otomatis kompatibel — script itu sudah lama punya logic "pakai dist yang ada di source checkout kalau ada", tidak perlu diubah
- `.gitattributes` baru: `frontend/dist/** -text` — supaya git tidak mengonversi line ending file build (CRLF/LF) yang bisa merusak minified JS
- **Trade-off yang harus diingat**: setiap ada perubahan kode frontend, `frontend/dist/` harus di-rebuild (`cd frontend && pnpm build`) dan di-commit ulang manual — kalau lupa, VPS baru akan pasang frontend versi lama yang tidak sinkron dengan kode sumber. Belum diotomasi lewat CI (opsi itu ditawarkan tapi belum dipilih)

---

### 2026-09-02 — Installer: Corepack Minta Konfirmasi Interaktif, Bikin Installer Stuck

#### Diperbaiki — `corepack enable pnpm` Hang Menunggu Input yang Tidak Akan Pernah Datang
- **Root cause**: Saat `pnpm` belum pernah dipakai di mesin itu, `corepack` (yang menginstall `pnpm` itu sendiri, terpisah dari `pnpm install` untuk package project) minta konfirmasi interaktif `[Y/n]` sebelum download. Dikonfirmasi langsung dari source code shim-nya: `process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT ??= '1'` — default-nya memang nanya
- **Dampak**: di sesi terminal interaktif, installer diam menunggu user ketik `y` — kalau tidak sadar ada prompt tersembunyi di tengah output, kelihatan seperti "stuck" total (persis yang dilaporkan, sampai user coba `Ctrl+C` berkali-kali)
- **Fix**: `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0` sebelum panggil `corepack enable pnpm` di ketiga installer (`install-vps.sh`, `deploy/vps-setup.sh`, `install.sh`), plus `timeout 60` sebagai jaring pengaman tambahan
- **Diverifikasi**: reproduksi langsung di VPS — pnpm versi yang belum pernah di-cache, dengan prompt aktif vs dimatikan, dikonfirmasi env var ini yang menentukan apakah prompt muncul atau tidak

---

### 2026-09-02 — CRITICAL: Fix Sebelumnya (FLASK_ENV=production) Merusak Login Tanpa HTTPS

#### Diperbaiki — Login Rusak Total di Instalasi IP-based Tanpa HTTPS (Regresi dari Fix Sebelumnya)
- **Root cause**: Fix `FLASK_ENV=production` di commit sebelumnya otomatis mengaktifkan `SESSION_COOKIE_SECURE=1`. Browser (dan curl) **menolak menyimpan cookie ber-flag `Secure` yang diterima lewat HTTP biasa** — installer `install-vps.sh` cuma setup HTTP (port 80) secara default, HTTPS harus disetup manual via certbot dan butuh domain (Let's Encrypt tidak bisa terbitkan sertifikat untuk bare IP)
- **Dampak nyata**: login `POST /api/auth/login` sukses (200) tapi cookie sesi tidak pernah tersimpan browser → request berikutnya langsung 401. Login rusak total untuk mode IP-based (default paling umum, tanpa domain)
- **Ditemukan lewat**: pertanyaan user soal dampak HTTPS manual — langsung dites di VPS asli pakai cookie jar curl (yang meniru perilaku Secure-flag browser), terbukti cookie jar kosong setelah login meski response 200
- **Fix**: installer sekarang set `SESSION_COOKIE_SECURE=0` secara eksplisit saat generate `.env` baru (bukan ikut default `.env.example` yang jadi `1` sejak fix production-mode kemarin), dengan instruksi jelas di pesan penyelesaian instalasi: aktifkan `SESSION_COOKIE_SECURE=1` manual di `.env` + restart **setelah** HTTPS benar-benar jalan
- **Pelajaran**: setiap fix keamanan yang mengubah behavior harus dites end-to-end sampai ke level "bisa login beneran", bukan cuma cek config value-nya benar

---

### 2026-09-02 — Production Readiness Pass: Izin Backup, Log Rotation, Cron Konsisten

#### Diperbaiki — Download Backup Config OLT Bisa Diakses User Mana Pun (MEDIUM, dari audit lama)
- `download_olt_backup` (`/api/olt/<id>/backup/<id>/download`) sebelumnya cuma `@login_required` — user role apa pun bisa unduh isi lengkap running-config OLT (VLAN plan, topologi WAN, URL ACS). Sekarang `@permission_required('settings_ip_olts')`, konsisten dengan route OLT sensitif lainnya
- `list_olt_backups` (cuma metadata: id/status/size/timestamp, bukan isi config) sengaja dibiarkan `@login_required` — risikonya rendah
- Test baru: `tests/test_provisioning.py::TestOltBackupDownloadPermission` (2 test)

#### Ditambahkan — Log Rotation untuk Cron Logs
- `/var/log/salfanet-*.log` (db-backup, backup, sync, traffic) sebelumnya numpuk tanpa batas — cron jalan tiap jam/5 menit selamanya tanpa rotation. Sekarang ada `/etc/logrotate.d/salfanet-nms` (daily, 14 hari retensi, compress) yang dibuat installer
- **Diverifikasi nyata**: dry-run `logrotate -d` di VPS asli — ternyata `/var/log` di Ubuntu default group-writable (`root:syslog`), logrotate menolak rotate tanpa directive `su`. Ditambahkan `su salfanet salfanet` di config, dry-run ulang berhasil bersih tanpa error

#### Diperbaiki — `deploy/vps-setup.sh` Ketinggalan Cron `db_backup.py`
- Saat cron `db_backup.py` ditambahkan ke `install-vps.sh` sebelumnya, `deploy/vps-setup.sh` (jalur deploy alternatif) tidak ikut ter-update — sekarang disamakan

---

### 2026-09-02 — CRITICAL: Installer Tidak Pernah Set Production Mode

#### Diperbaiki — Semua Instalasi via `install-vps.sh` Diam-diam Jalan Mode Development
- **Root cause #1**: `install-vps.sh`/`deploy/vps-setup.sh` copy `.env.example` → `.env` tapi tidak pernah override `FLASK_ENV=development` (default di `.env.example`) jadi `production`. Akibatnya **setiap instalasi VPS via installer resmi berjalan mode development** — Werkzeug debugger aktif, cookie session tidak `Secure`. Ini persis peringatan yang muncul di semua log test hari ini (`Starting with DevelopmentConfig...`) yang belum sempat ditandai sebagai bug installer
- **Root cause #2** (baru ketemu saat verifikasi fix #1): bahkan setelah `.env` diset `FLASK_ENV=production`, `run_server.py` mengecek `FLASK_ENV`/`INTERNAL_API_KEY` di baris paling atas file — **sebelum** file `.env` sempat dibaca (baru dibaca belakangan lewat `config.py`, dipicu saat `app.py` di-import di dalam `start_servers()`). Akibatnya: proteksi fail-closed "`INTERNAL_API_KEY` wajib eksplisit di production" **tidak pernah aktif** lewat jalur deploy normal, dan `INTERNAL_API_KEY` asli dari `.env` diam-diam diabaikan, diganti key ephemeral yang di-generate ulang tiap restart
- **Fix**:
  1. `install-vps.sh`/`deploy/vps-setup.sh` sekarang generate & set `FLASK_ENV=production`, `INTERNAL_API_KEY`, dan `CREDENTIAL_ENCRYPTION_KEY` (terpisah dari `SECRET_KEY`) saat bikin `.env` baru — bukan cuma `SECRET_KEY` seperti sebelumnya. Kalau `.env` sudah ada dan masih `FLASK_ENV=development`, installer sekarang kasih warning eksplisit
  2. `run_server.py` sekarang load `.env` di baris paling atas file (sebelum cek `FLASK_ENV`/`INTERNAL_API_KEY`), jadi urutan pembacaan config benar dan proteksi fail-closed-nya beneran aktif
- **Diverifikasi**: full test suite lokal 121/121 tetap lolos setelah perubahan; verifikasi end-to-end di VPS asli menyusul di commit ini

---

### 2026-09-02 — Installer: Dukungan Mirror Registry npm (Opsional)

#### Ditambahkan — `PNPM_REGISTRY` Env Var untuk Ganti Mirror npm
- Installer (`install-vps.sh`, `deploy/vps-setup.sh`, `install.sh`) sekarang terima env var opsional `PNPM_REGISTRY` untuk override registry npm yang dipakai `pnpm install` — default tetap `registry.npmjs.org` kalau tidak di-set (tidak ada perubahan perilaku untuk yang tidak butuh)
- Contoh: `PNPM_REGISTRY=https://registry.npmmirror.com bash install-vps.sh`
- **Catatan jujur dari testing**: di VM test saya, mirror `npmmirror.com` justru **lebih lambat** dari registry default (11.3s vs 7.3s) — karena jaringan ke npmjs.org di situ sudah bagus. Manfaatnya baru terasa kalau jaringan VPS memang lambat/terbatas ke registry default; hasilnya tergantung jalur network masing-masing, coba dua-duanya dan pakai yang lebih cepat

---

### 2026-09-02 — Installer: `pnpm install` Bisa Hang Tanpa Batas di Koneksi Lambat

#### Diperbaiki — Frontend Build Bisa Stuck Selamanya Kalau Koneksi Lambat/Putus
- **Root cause**: `pnpm install`/`pnpm build` di installer (`install-vps.sh`, `deploy/vps-setup.sh`, `install.sh`) dijalankan tanpa timeout — di koneksi lambat/tidak stabil, proses bisa menggantung tanpa batas waktu dan tanpa pesan apa pun
- **Fix**: Dibungkus `timeout` (180s per percobaan) + retry otomatis 3x dengan jeda, baru keluar dengan pesan error jelas kalau tetap gagal setelah 3x. `pnpm build` juga dikasih timeout (300s) sebagai jaring pengaman
- **Diverifikasi**: logika retry dites terpisah (simulasi selalu timeout) — benar mencoba 3x lalu keluar exit 1 dengan pesan jelas dalam 12 detik. Jalur normal (koneksi bagus) dites ulang end-to-end di VPS asli — tetap `EXIT_CODE=0`, 43 detik, tidak ada regresi

---

### 2026-09-02 — Installer: Fix dpkg Lock Contention (unattended-upgrades)

#### Diperbaiki — Installer Gagal Diam-diam Kalau `unattended-upgrades` Lagi Jalan
- **Root cause**: VPS fresh boot sering langsung menjalankan `unattended-upgrades` otomatis di background, memegang dpkg lock. `apt-get install` di installer langsung gagal saat itu (output-nya di-redirect ke `/dev/null` + `set -e` aktif), jadi installer "berhenti" tanpa pesan error sama sekali — persis gejala yang dilaporkan (macet di "[1/9] Installing system packages..." tanpa lanjut)
- **Fix**: Semua pemanggilan `apt-get` di `install-vps.sh` dan `deploy/vps-setup.sh` sekarang lewat wrapper `apt_get()` yang pakai `-o DPkg::Lock::Timeout=300` — apt jadi **menunggu** sampai 5 menit kalau lock lagi dipegang proses lain, bukan langsung gagal
- **Diverifikasi**: simulasi lock ditahan proses lain selama 25 detik lewat `flock` di VPS asli, lalu installer dijalankan bersamaan — instalasi menunggu lock lepas lalu lanjut normal sampai selesai (`EXIT_CODE=0`, service aktif, health check 200)

---

### 2026-09-02 — Installer: Fix Python Version Terlalu Lama di Fresh VPS

#### Diperbaiki — `install-vps.sh`/`deploy/vps-setup.sh` Gagal di VPS dengan Python < 3.10
- **Root cause #1**: Installer `apt-get install python3 python3-venv python3-pip` lalu `python3 -m venv .venv` blind mengikuti versi `python3` default distro. Di VPS dengan Python 3.8.10 (mis. image Ubuntu 20.04 atau image lama), `pip install -r requirements.txt` gagal total: `uvicorn>=0.34.0`/`fastapi>=0.115.0` tidak punya rilis yang mendukung Python 3.8
- **Root cause #2** (ditemukan saat testing fix #1 di VPS baru): fallback awal pakai `add-apt-repository -y ppa:deadsnakes/ppa` — ini fetch GPG key lewat protokol keyserver klasik (port 11371), yang di banyak jaringan/firewall VPS **diblokir**, dan `add-apt-repository` hang tanpa pesan error apa pun (persis gejala yang dilaporkan: installer "berhenti" tanpa clone repo)
- **Fix**: Installer sekarang cari `python3.10`/`3.11`/`3.12`/`3.13` yang sudah terpasang; kalau tidak ada, pasang Python 3.12 dari PPA `deadsnakes` dengan fetch GPG key lewat **HTTPS biasa** (port 443, `keyserver.ubuntu.com/pks/lookup?op=get`) plus `signed-by` di `sources.list.d`, bukan `add-apt-repository` — dilindungi `timeout` dan pesan error jelas kalau tetap gagal. Diterapkan ke `install-vps.sh` dan `deploy/vps-setup.sh`
- **Diverifikasi**: direproduksi persis (hang, exit 124 dengan timeout guard) di VPS fresh, lalu fix di-test end-to-end 2x — sekali dengan Python 3.10 tersedia langsung (skip fallback), sekali dengan `python3.10` sengaja disembunyikan untuk memaksa jalur fallback deadsnakes. Keduanya selesai `EXIT_CODE=0`, service aktif, health check 200, venv aplikasi terkonfirmasi pakai Python 3.12.13 dari fallback

---

### 2026-09-02 — Audit Keamanan & Arsitektur: Perbaikan Critical/High + Refactor app.py

Hasil audit menyeluruh (security, backend, database/dependencies, frontend) — perbaikan berikut dikerjakan dengan test regresi baru untuk tiap fix dan tanpa mengubah bagian yang sudah berfungsi baik (CSRF, CORS, auth, enkripsi kredensial, dll tetap utuh).

#### Diperbaiki — CLI Command Injection ke OLT (CRITICAL)
- **Root cause**: `telnet_client.py` mengirim command CLI ke OLT dengan `tn.write(command + '\n')` tanpa sanitasi — nilai user (nama/deskripsi ONU, dll) yang mengandung `\n`/`\r` bisa menyisipkan command CLI tambahan ke sesi yang sudah privileged (termasuk berpotensi bikin akun admin OLT baru)
- **Fix**: `SimpleTelnet.write()` dan `SimpleSSH.write()` — satu-satunya titik keluar semua command ke OLT — sekarang strip semua CR/LF/control byte dari body command sebelum dikirim, menutup celah ini di seluruh codebase sekaligus (bukan per call-site)
- **File**: `telnet_client.py`. Test baru: `tests/test_provisioning.py::TestCLIInjectionPrevention` (4 test)

#### Diperbaiki — Password PPPoE/ACS Ter-log Plaintext (HIGH)
- **Fix**: Tambah `_mask_cli_secrets()` di `telnet_client.py`, redact nilai setelah keyword `password`/`secret` sebelum di-log (pola yang sebelumnya sudah dipakai untuk WiFi password, sekarang konsisten di semua path registrasi ONU)
- Test baru: `tests/test_provisioning.py::TestCLISecretMaskingHelper` (4 test)

#### Diperbaiki — Server Diam-diam Jalan Mode Development (HIGH)
- **Root cause**: Kalau `FLASK_ENV` lupa di-set, `SECRET_KEY` auto-generate diam-diam dan `SESSION_COOKIE_SECURE=False` — tanpa warning
- **Fix**: `config.py` — `SECRET_KEY` wajib eksplisit di production (fail closed, sama seperti `INTERNAL_API_KEY`), dan warning jelas di log saat start dengan `DevelopmentConfig`

#### Diperbaiki — Orphan Rows Saat Hapus OLT/User (HIGH)
- **Root cause**: SQLite FK enforcement tidak aktif; `delete_olt()` tidak membersihkan `OLTConfigBackup`, `TrafficLogHourly`, `MetricHistory`, `MaintenanceWindow`; `delete_user()` tidak clear `ONU.technician_id`
- **Fix**: Lengkapi cleanup list di `delete_olt()`/`delete_user()` (`app.py` → sekarang di `routes_olt_settings.py`/`routes_users.py`)
- Test baru: `tests/test_provisioning.py::TestOrphanCleanupOnDelete` (2 test)

#### Diperbaiki — Notifikasi Kegagalan Auto-Backup Selalu Error Diam-diam (HIGH)
- **Root cause**: `auto_backup.py` bikin `Notification(user_id=..., type=..., icon_type=...)` — field yang tidak ada di model `Notification`, selalu `TypeError`, ditangkap `except: pass`
- **Fix**: Sesuaikan dengan skema `Notification` asli (dedup by `olt_id`+`category`, bukan per-user)

#### Diperbaiki — Lockfile Frontend Konflik (HIGH)
- `frontend/package-lock.json` (npm, basi sejak proyek pindah ke pnpm) dihapus — `pnpm-lock.yaml` satu-satunya sumber kebenaran

#### Diperbaiki — Frontend: Halaman System Update Tanpa Route Guard (HIGH)
- `App.tsx` — `routePermissions` sekarang menyertakan `/dashboard/settings/update` (permission `manage_users`), konsisten dengan Sidebar. Backend sudah benar dari awal (super-admin only)

#### Ditambahkan — Backup Database Aplikasi Otomatis (CRITICAL)
- **Root cause**: Cron backup DB aplikasi (`db_backup.py`, `db_backup_offsite.py`) sempat terhapus di commit sebelumnya dan tidak diganti — hanya ada backup config OLT, bukan database NMS sendiri. Endpoint manual `/api/system/backup-db` juga ternyata **selalu menghapus file backup setelah dibuat** kalau remote SCP tidak dikonfigurasi
- **Fix**: `db_backup.py` baru — cron per jam, dukung SQLite (online backup API) & PostgreSQL (`pg_dump`), retensi 24 hourly + 7 daily, simpan ke `instance/backups/`. Endpoint manual dan cron sekarang pakai logic yang sama (`create_db_backup()`/`prune_old_db_backups()`), backup lokal selalu disimpan (upload SCP remote jadi tambahan opsional, bukan pengganti)
- Cron baru didaftarkan di `install-vps.sh`

#### Ditambahkan — Baseline Migrasi Skema (Alembic)
- **Root cause**: History Alembic/Flask-Migrate terhapus total di masa lalu; `migrate_schema()` (raw `ALTER TABLE`, silent-fail) jadi satu-satunya mekanisme migrasi, tanpa version tracking
- **Fix**: `migrations/` di-restore dengan baseline migration dari schema `models.py` saat ini — **diverifikasi**: schema hasil `flask db upgrade` dibandingkan byte-per-byte dengan `db.create_all()`, 59/59 tabel & index cocok. `migrate_schema()` **tidak dihapus**, tetap jalan sebagai safety net — murni tooling baru untuk perubahan schema ke depannya. Deployment existing perlu `flask db stamp head` sekali (lihat `migrations/README`)

#### Diubah — `app.py` Dipecah dari Monolith 9.908 Baris → 517 Baris + 15 Blueprint
- **Root cause**: 201 route dalam 1 file menyulitkan maintenance dan code review
- **Fix**: Route dipisah ke `routes_onu.py`, `routes_olt_ports.py`, `routes_olt_settings.py`, `routes_olt_sync.py`, `routes_olt_spa_data.py`, `routes_ftth.py`, `routes_notifications.py`, `routes_system.py`, `routes_users.py`, `routes_templates.py`, `routes_traffic.py`, `routes_dashboard.py`, `routes_public.py`, `routes_whatsapp.py`, `routes_cloudflare.py` — berdasarkan domain URL, bukan cuma judul section (beberapa route ternyata salah section di file asli)
- **Verifikasi**: 206 route (rule+method) sebelum vs sesudah split — cocok 100%. Server dinyalakan sungguhan dan 13 endpoint lintas semua blueprint di-curl langsung — semua respons sesuai ekspektasi. Full test suite (121 test) lolos
- **Tidak ada logic yang berubah** — murni pemindahan kode, endpoint/URL/permission/behavior identik

---

### 2026-08-31 — ONU Status Classification Fix (DyingGasp vs Online)

#### Diperbaiki — oper_state=5 Salah Diklasifikasi sebagai 'online' (CRITICAL)
- **Root cause**: Pada ZTE C320 V2.1.0, `oper_state=5` berarti "registered" — SEMUA ONU (online maupun dyinggasp) melaporkan nilai yang sama. Pemetaan lama `5: 'online'` menyebabkan ONU dyinggasp tampil sebagai online di NMS
- **Bukti audit**: Semua 65 ONU punya `oper_state=5, dereg_reason=9 (PowerOff)`. ONU 1/1/1:39 (DyingGasp di CLI) punya `rx_raw=65535, olt_rx_raw=0` (tidak ada sinyal), sementara ONU online punya RX valid
- **Fix**: `classify_onu_status()` sekarang cek RX power saat `oper_state` memetakan ke 'online'. Jika `olt_rx is None AND onu_rx is None` → gunakan `dereg_reason` untuk klasifikasi (PowerOff→dyinggasp, LOS→los, lain→offline). Jika ada sinyal → online
- **File**: `snmp_core.py` — `classify_onu_status()` function
- **Dampak**: ONU dyinggasp sekarang tampil dengan status benar di refresh-signal dan light sync (SNMP-only paths). Full sync (CLI primary) tidak terdampak karena CLI sudah parse phase state dengan benar

---

### 2026-08-30 — ONU Status History & OLT Logs Page

#### Ditambahkan — ONU Status History Tracking
- **`OnuStatusHistory` model** di `models.py`: Catat setiap perubahan status ONU dengan timestamp, old/new status, dereg_reason, RX power, dan source (sync/refresh/action)
- **Recording di sync_helper.py**: Setiap perubahan status ONU saat sync disimpan ke history table
- **Recording di app.py refresh-signal**: Perubahan status dari SNMP refresh juga dicatat
- **API endpoint** `/api/olt/<id>/onu-status-history`: Filter by ONU name, serial, status, date range. Pagination support
- **Frontend**: Tab "ONU Status History" di halaman OLT Logs dengan tabel, filter, dan pagination

#### Ditambahkan — OLT Logs Page
- **Halaman OLT Logs** (`/dashboard/logs`): View OLT device logs (show log) dan NMS sync logs dari satu halaman
- **Tab**: Device Logs, NMS Logs, ONU Status History
- **Fitur**: OLT selector, line limit, auto-refresh, filter status untuk history

---

### 2026-08-29 — Distance, actual_type & ONU Detail Fixes

#### Diperbaiki — ONU dengan onu_id > 60 Skipped untuk Detail/Equip/Power (HIGH)
- **Root cause**: `[:60]` slice di `collect_all_onus()` menyebabkan ONU dengan ID > 60 tidak diambil detail-info, equipment, dan power data
- **Fix**: Ubah `[:60]` → `[:128]` (ZTE C320 GPON max 128 ONUs per port)

#### Diperbaiki — Distance Tidak Terpopulate di ONU Data (MEDIUM)
- **Root cause**: `OID_DISTANCE` tidak ditambahkan ke semua SNMP collection paths
- **Fix**: Tambah `OID_DISTANCE` ke `collect_onus_light()`, `collect_onus()`, dan `collect_onu_detail_batch()`

#### Diperbaiki — actual_type Menampilkan Vendor Names (MEDIUM)
- **Root cause**: Field `actual_type` terisi nama vendor (mis. 'Huawei') alih-alih model ONU yang sebenarnya
- **Fix**: Filter vendor names dari actual_type, clear stale values dari DB

#### Diperbaiki — ONU Status Tidak Update, Refresh-signal Incomplete (HIGH)
- **Root cause**: Refresh-signal endpoint tidak mengupdate status ONU dengan benar, cache invalidation tidak lengkap
- **Fix**: Lengkapi refresh-signal logic, pastikan cache di-invalidate setelah update

---

### 2026-08-28 — LOS Misclassification & Multi-Vendor Cleanup

#### Diperbaiki — ONU Status Misclassification: LOS Terdeteksi sebagai DyingGasp (HIGH)
- **Root cause**: `classify_onu_status()` tidak cek `dereg_reason` untuk LOS dengan benar
- **Fix**: Tambah LOS detection di `classify_onu_status()` menggunakan `dereg_reason` values 2/3

#### Diperbaiki — Hapus Referensi Multi-Vendor (CLEANUP)
- **Root cause**: Sistem adalah ZTE-only, tetapi masih ada referensi ke vendor lain (HSGQ, Raisecom, dll.)
- **Fix**: Hapus semua referensi multi-vendor dari README, CHANGELOG, dan code comments

#### Diperbaiki — Revert oper_state=5 ke 'online' (REVERTED)
- **Catatan**: Commit `45fff03` revert `oper_state=5` dari 'dyinggasp' kembali ke 'online' karena semua ONU tampil dyinggasp setelah sync. Fix final dilakukan di 2026-08-31 dengan RX power check

---

### 2026-08-27 — Registration Error Fix & React Error #31

#### Diperbaiki — ETH Port VLAN Menyebabkan Registrasi Terlihat Gagal (HIGH)
- **Root cause**: Template `zte_full`/`fiberhome_veip`/`pppoe`/`zte_single` mengirim `vlan port eth_0/1` sampai `eth_0/4`. ONU dengan <4 ETH port (mis. F670L punya 2) menyebabkan `%Code 63990-GPONRM` pada `eth_0/3` dan `eth_0/4`. Helper `sc()` menyetel `last_err` saat gagal, sehingga `register_vendor_template()`/`register_unified()` mengembalikan `False` meskipun registrasi sebenarnya berhasil
- **Fix**: Ubah `sc()` → `sc_warn()` untuk semua ETH port VLAN commands di 6 template (register_vendor_template + register_unified). `sc_warn()` mencatat warning tapi tidak menyetel `last_err`
- **Bukti VPS log**: `CMD FAILED: 'vlan port eth_0/3 mode tag vlan 30' -> %Code 63990-GPONRM` tapi `POST /api/pre-register` tetap 200

#### Diperbaiki — React Error #31 di View ONU & Templates (HIGH)
- **Root cause**: API `/api/olt/<id>/onu-types` mengembalikan array of objects `[{type_name, pon_type}, ...]` tapi `OnuTypeModal` di `ViewOnu.tsx` dan `Templates.tsx` menganggap sebagai array of strings. React crash #31 saat render object sebagai child
- **Fix**: Extract `type_name` dari setiap object sebelum set state. Backward compat dengan format string lama

#### Diperbaiki — Frontend Sync Error Display (MEDIUM)
- `OltSettings.tsx`: Error message dari backend (mis. "Sync already in progress") sekarang ditampilkan ke user, bukan generic "Sync failed"
- `OltSettings.tsx`: Deteksi sync yang sedang berjalan saat page load (cek sync status semua OLT on mount)

#### Diubah — CLI Terminology Audit
- Semua referensi "Telnet" di docstrings, error messages, dan comments diubah ke "CLI" atau "CLI (SSH or Telnet)" untuk mencerminkan abstraksi `create_cli_collector`
- `olt.telnet_status` → `olt.cli_status` di API list dan auto-sync

#### Ditambahkan — OLT Connection Mode Hints
- `OltSettings.tsx`: Tooltip dan label hints untuk Telnet "(faster)" dan SSH "(secure)" di Connection Mode selector

---

### 2026-08-24 — SSH Support, SNMP-Only Mode & ONU Registration Overhaul

#### Ditambahkan — SSH Support untuk ZTE C320 OLT
- **`SimpleSSH` class** di `telnet_client.py`: Koneksi SSH ke ZTE C320 menggunakan paramiko dengan legacy algorithm patch (ssh-rsa, ssh-dss, group14-sha256). Interface sama dengan `SimpleTelnet` (read_until, write, close)
- **`create_cli_collector(olt)`** di `snmp_collector.py`: Dispatch SSH atau Telnet berdasarkan `olt.ssh_enabled`. Port dari `olt.ssh_port`
- **`TelnetCollector._connect()`**: Dispatch ke `_connect_ssh()` atau `_connect_telnet()` berdasarkan flag `use_ssh`
- **Test connection endpoints**: Kedua endpoint `test-connection` di `app.py` sekarang test SSH saat `ssh_enabled=True`
- **`requirements.txt`**: Ditambahkan `paramiko>=3.0,<4.0` (v5.0 menghapus ssh-rsa)
- **Frontend**: `OltSettings.tsx` toggle SSH/Telnet, `OltInfo` interface ditambah `ssh_enabled` dan `ssh_port`

#### Ditambahkan — SNMP-Only Mode
- **CLI optional**: OLT dengan empty Telnet username auto-disables CLI. SNMP tetap berfungsi untuk sync dasar
- **`cli_enabled` property** di model OLT: Derived dari `telnet_enabled OR ssh_enabled`
- **SNMP-based profile/VLAN collection**: `collect_profiles_snmp()` dan `collect_vlans_snmp()` untuk mode SNMP-only
- **SNMP ONU collection**: `collect_onus_light()` untuk full sync tanpa Telnet
- **Seed default ONU types**: 36 tipe ZTE default (GPON + EPON) saat tidak ada Telnet dan DB kosong
- **Frontend**: OLT settings form, CLI fields optional

#### Ditambahkan — SNMP ONU Registration
- **SNMP-based registration** untuk ZTE C320: Register ONU via SNMP SET (createAndGo) ke `onuMgmtTable`
- **Multi-varbind SET**: Single SNMP packet dengan semua field (type, slot, port, onu_id, serial)
- **Auto-cleanup stale entry**: Hapus SNMP entry sebelum retry registrasi
- **SNMP+Telnet hybrid**: SNMP untuk registrasi, Telnet/SSH untuk service config (TCONT/GEM/VLAN)
- **`skip_registration` parameter**: `configure_onu_profile()` melewati re-registrasi jika ONU sudah terdaftar
- **`register_mode`**: Pilihan registrasi (SNMP, Telnet, Auto) di wizard UI

#### Diperbaiki — TCONT Profile Fallback
- **Default profile**: Ubah dari `1G` ke `default` (profile yang pasti ada di OLT)
- **Fallback chain**: specified profile → without name → `default` profile
- **`sc_tcont()` helper** di `register_vendor_template` dan `register_unified`: Auto-fallback dengan logging

#### Diperbaiki — ONU Registration & Deregister
- **`cli_enabled` property**: Cek sebelum mencoba koneksi CLI
- **SSH port in sync**: `services_sync.py` meneruskan `ssh_port` ke `poll_olt`
- **Deregister**: Gunakan `delete gpon onu` alih-alih `no onu N` (lebih reliable)
- **SNMP+Telnet flow**: `/api/pre-register` SNMP path menggunakan `configure_onu_profile` (bukan `register_vendor_template` yang mencoba re-register)

#### Ditambahkan — ONU Types via SNMP
- **`collect_onu_types_snmp()`**: Koleksi tipe ONU dari registered ONUs via SNMP
- **GPON/EPON separation**: Tipe ZTEG-* = GPON, ZTE-* = EPON
- **Save to DB**: Tipe ONU disimpan meskipun Telnet disabled/fails

#### Diperbaiki — FiberHome VEIP WAN Config
- **WAN service add/edit/delete** di ViewOnu untuk FiberHome VEIP ONUs
- **PPPoE NAT mode**: `wan-ip pppoe` alih-alih legacy `pppoe` command
- **VEIP and iphost mutually exclusive**: Remove VEIP untuk PPPoE/Wan-IP modes
- **VLAN empty string fix**: Handle empty VLAN di fiberhome_veip template
- **wan-ip host conflict**: Fix conflict antara wan-ip 1 dan wan-ip 2 di host yang sama

#### Diperbaiki — Sync & Delete
- **Sync after delete/clear-config**: Full sync + delay untuk mencegah ghost ONUs
- **`telnet_status` fix**: Light sync tanpa EPON ONUs tidak lagi set disconnected
- **Sync error logging**: Improved error logging di `services_sync.py`

---

### 2026-08-20 — Security Hardening, Sync Concurrency & Template Editor

#### Ditambahkan — Security Hardening (Phase 1-11)
- **WebSocket auth**: WS connection memerlukan session cookie, `/broadcast` endpoint memerlukan internal API key
- **OLT access control**: User hanya bisa akses OLT yang assigned (kecuali super admin dengan `all_olt`)
- **CORS hardening**: Non-wildcard origin check, separate `SECRET_KEY` dan `INTERNAL_API_KEY`
- **Internal API auth**: Heartbeat verify, internal endpoints memerlukan `X-Internal-Key` header
- **Sensitive config masking**: SystemConfig keys seperti password, token di-mask untuk non-admin
- **CSRF protection**: SameSite cookie + X-Requested-With header check
- **FastAPI docs disabled in production**: Swagger/ReDoc hanya di mode development
- **DB backup with remote SCP**: Auto-backup database ke remote server via SCP
- **Restore endpoint**: Restore database dari backup dengan auto-rollback on failure
- **Docker non-root user**: Container berjalan sebagai non-root user
- **CSP tightened**: Strict Content-Security-Policy, external scripts di external file
- **Port security**: Internal ports (8765) tidak exposed ke publik

#### Ditambahkan — Sync Concurrency Lock
- **`sync_lock.py`**: Distributed lock menggunakan Redis SET NX EX (dengan in-memory fallback)
- **409 Conflict**: Sync request saat sync berjalan mengembalikan 409 dengan pesan "Sync already in progress"
- **Job lifecycle**: Sync job tracking dengan status (running, completed, failed)

#### Ditambahkan — Performance Optimization
- **DB indexes**: `olt_sync_status`, `sync_jobs` indexes ditambah via `ensure_index()` di `migrate_schema()`
- **N+1 query fix**: Batch query untuk ONU data di dashboard
- **Cache LRU eviction**: In-memory cache dengan LRU eviction
- **Redis SCAN**: Non-blocking scan untuk cache invalidation
- **SQLite WAL**: Write-Ahead Logging untuk concurrent read/write
- **Graceful shutdown**: Proper cleanup pada SIGTERM/SIGINT

#### Ditambahkan — Template Editor
- **Template CRUD**: Create, read, update, delete template di Templates page
- **Full template editor**: Form dengan OLT data integration (ONU types, speed profiles, VLANs, TR069 profiles)
- **RegisterWizard template loading**: Load template config dari DB ke wizard
- **Service config editor**: Edit service config per template

#### Ditambahkan — Cross-OLT Migration
- **ONU migration**: Pindah ONU antar OLT dengan config copy
- **OLT config copy**: Copy ONU types, speed profiles, VLANs, WAN-IP profiles antar OLT
- **API endpoints**: `/api/olt/<id>/migrate-onu`, `/api/olt/<id>/copy-config`

#### Ditambahkan — System Update from Web UI
- **Check updates**: Cek update terbaru dari GitHub via web UI
- **Apply updates**: Pull, rebuild, restart dari System Update page
- **Git fetch fix**: Extend PATH untuk systemd context, add X-Requested-With header

#### Ditambahkan — SNMP Community & CLI User Management
- **SNMP community CRUD**: Add/edit/delete SNMP community strings di OLT device
- **CLI user CRUD**: Add/edit/delete CLI users di OLT device
- **API endpoints**: `/api/olt/<id>/snmp-community`, `/api/olt/<id>/cli-user`

#### Ditambahkan — Provisioning Tests
- **26 automated tests**: Dead endpoints, templates, SNMP/Telnet, read-back verification, secret masking, DB save, SNMP+Telnet fallback
- **Dead endpoint removal**: Hapus `ont_provisioner` endpoints yang tidak digunakan

#### Diperbaiki — WiFi OMCI Auth
- **Auth type not fully applied**: Add delay + reentry before SSID config
- **Retry mechanism**: Retry auth commands if first attempt fails
- **Comprehensive logging**: WiFi payload logging di API dan telnet layers

#### Diperbaiki — Lain-lain
- **3 log noise/error issues** dari VPS audit
- **Duitku remnants removal**: Hapus sisa code Duitku payment gateway
- **Deprecation warnings fix**
- **OLT status badges**: Show correct SNMP/Telnet status
- **Template modal responsive**: Bottom-sheet on mobile, sticky header/footer
- **SNMP add form layout**: Responsive grid columns

#### Dihapus
- `test_ssh_conn.py` dan test scripts lainnya (dev artifacts)
- `ont_provisioner` dead endpoints
- Duitku payment integration remnants

---

### 2026-08-07 — EPON SLA Profile Management & Timezone Sync Fix

#### Ditambahkan — EPON SLA Profile Management
- **Auto-sync SLA profiles**: `auto_backup.py` dan `app.py` sekarang auto-sync SLA profiles dari OLT via `show onu-profile sla` saat fetch speed profiles
- **API endpoints**: `POST /api/olt/<id>/sla/add` dan `POST /api/olt/<id>/sla/<id>/delete` untuk manage SLA profiles
- **Telnet CLI**: `sla_profile` parameter ditambahkan ke `register_and_configure`, `register_unified`, dan `configure_onu_profile` di `telnet_client.py`. Mengirim `sla-profile {name} vport 1` untuk EPON ONUs
- **ProvisionWizard.tsx**: SLA profile dropdown untuk EPON ONUs (menggantikan TCONT/Traffic profiles untuk GPON)
- **RegisterWizard.tsx**: SLA profile dropdown untuk EPON ONUs, `sla_profile` termasuk dalam pre-register payload
- **OltConfiguration.tsx**: SLA profile management section di Speed Profiles tab — form add (name, up/down CIR/PIR) + table list dengan delete button

#### Diperbaiki — Timezone Tidak Sinkron pada Auto-Backup (HIGH)
- **Root cause**: `auto_backup.py` line 157 menggunakan `datetime.now()` (server local = UTC) untuk time-of-day matching, tetapi user set `auto_backup_time` dalam timezone lokal (mis. "02:00" Jakarta). Backup 02:00 WIB sebenarnya trigger di 02:00 UTC = 09:00 WIB — 7 jam selisih
- **Fix**: `auto_backup.py` sekarang menggunakan `get_system_timezone()` dari SystemConfig + `get_local_now(tz_name)` dengan `zoneinfo.ZoneInfo` untuk time-of-day matching. Log sekarang menampilkan kedua timezone: `[16:27:30 UTC / 23:27:30 Asia/Jakarta]`
- **`helpers.py`**: Ditambahkan `get_system_timezone()` shared helper (reads SystemConfig, defaults Asia/Jakarta)
- **`app.py`**: `/api/public/branding` sekarang include `timezone` field untuk frontend

#### Ditambahkan — System Timezone Setting UI
- **Customization.tsx**: Tab baru "Timezone" (icon jam) dengan:
  - Dropdown 16 timezone umum (WIB, WITA, WIT, SGT, JST, UTC, dll)
  - Live clock preview (selected timezone vs VPS UTC)
  - Save button yang update SystemConfig + apply langsung ke frontend
  - Info panel: cara timezone mempengaruhi auto-backup, UI, database
- **`utils.ts`**: `formatDate()` sekarang menggunakan `timeZone` option dengan system timezone. Ditambahkan `setSystemTimezone()`/`getSystemTimezone()`
- **`App.tsx`**: Fetch timezone dari branding API on startup, set globally

#### Diperbaiki — VPS Timezone & NTP
- VPS timezone diubah dari UTC ke `Asia/Jakarta` via `timedatectl set-timezone`
- NTP sync diaktifkan via `chrony` (systemd-timesyncd tidak berfungsi di LXC container)
- Clock synced: `System clock synchronized: yes`, `NTP service: active`

#### Diperbaiki — Geolocation Permissions Policy
- **`app.py`**: `Permissions-Policy` header diubah dari `geolocation=()` ke `geolocation=(self)` untuk mengizinkan LocationPicker GPS access

---

### 2026-08-07 — Audit & Perbaikan Alert Settings

#### Diperbaiki — OLT Health Fields Tidak Disimpan oleh Backend (HIGH)
- **GET `/api/alert-rules`**: Response sebelumnya tidak mengembalikan 7 field OLT health (`check_olt_offline`, `check_olt_cpu`, `check_olt_memory`, `check_olt_temperature`, `olt_cpu_threshold`, `olt_memory_threshold`, `olt_temp_threshold`). Frontend form selalu menampilkan default values (80%, 60°C) alih-alih nilai yang tersimpan. Sekarang semua field dikembalikan
- **PUT `/api/alert-rules/<id>`**: Whitelist field update sebelumnya tidak menyertakan 7 field OLT health. Saat user edit OLT health settings dan klik Save, data dikirim tapi backend silently ignored. Sekarang semua field dipersisten
- **Migration**: Ditambahkan `migrate_schema()` entries untuk auto-add 7 kolom OLT health + `notify_whatsapp_native` ke existing database

#### Diperbaiki — `visibleTabs` Mengabaikan Flag `superAdmin` (MEDIUM)
- **AlertSettings.tsx**: `visibleTabs` sebelumnya `= allTabs` (tidak filter). Tab "WA Native" dan "Cron Job" yang ditandai `superAdmin: true` tampil untuk semua user. Sekarang difilter dengan `allTabs.filter(tab => !tab.superAdmin || isSuperAdmin)`. Non-super-admin tidak lagi melihat tab admin-only

#### Diperbaiki — Notification Channel Flags Tidak Dihormati (LOW)
- **`notify_whatsapp_native`**: Field baru ditambahkan ke `AlertRule` model, API endpoints (GET/PUT), dan frontend RuleCard form. Sebelumnya hanya ada `notify_whatsapp` (third-party gateway) tanpa toggle untuk WA Native
- **`_send_external_alerts()`** di `alerts.py`: Sebelumnya mengirim ke semua channel yang dikonfigurasi terlepas dari flag `rule.notify_telegram`/`notify_whatsapp`. Sekarang menerima parameter `rule` dan memeriksa setiap flag sebelum mengirim:
  - `rule.notify_telegram` → kontrol Telegram
  - `rule.notify_whatsapp` → kontrol WhatsApp third-party
  - `rule.notify_whatsapp_native` → kontrol WA Native
- **`rule.notify_bell`**: In-app bell notifications sebelumnya selalu dibuat. Sekarang hanya dibuat jika `notify_bell=True`
- **Frontend**: Toggle "WA Native" ditambahkan ke section Notification Channels di RuleCard

---

### 2026-08-06 — Audit & Perbaikan Role Permission (RBAC)

#### Diperbaiki — Endpoint Admin Tanpa Permission Check (HIGH)
- **Alert rules update** (`PUT /api/alert-rules/<id>`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any logged-in user bisa mengubah threshold alert, enable/disable rules, dan notification channels
- **Bot config update** (`PUT /api/bot-config/<bot_type>`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any user bisa mengubah token Telegram/WA, chat ID, API keys
- **Alert recheck** (`POST /api/alert-rules/recheck`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any user bisa trigger alert check dan spam notification channels
- **Bot test endpoints** (`POST /api/bot-config/telegram/test`, `/whatsapp/test`, `/whatsapp-native/test`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any user bisa mengirim test message ke Telegram/WA
- **WA native manage** (`logout`, `reconnect`, `start`, `stop`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any user bisa manage PM2 process WA gateway

#### Diperbaiki — Notification Management Tanpa Permission Check (HIGH)
- **Acknowledge all** (`POST /api/notifications/acknowledge-all`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any user bisa bulk-acknowledge semua notifikasi global
- **Delete notification** (`DELETE /api/notifications/<id>`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any user bisa hapus notifikasi manapun
- **Clear notifications** (`POST /api/notifications/clear`): Sebelumnya hanya `@login_required`, sekarang memerlukan `@permission_required('customization')`. Sebelumnya any user bisa clear semua read notifications

#### Diperbaiki — ONU Update Field Permission (MEDIUM)
- **Field `technician_id`, `latitude`, `longitude`, `odp_port_id`** di endpoint `/api/onu/<id>/update`: Sebelumnya tidak ada permission check (any logged-in user bisa ubah). Sekarang memerlukan `configure_onu`. Field lain di endpoint yang sama sudah punya granular permission check (`edit_onu_name`, `edit_onu_description`, `configure_onu`)

#### Diperbaiki — Frontend Route Protection (LOW)
- **OLT Configuration sub-route** (`/dashboard/settings/olts/:oltId/config`): Sebelumnya tidak ada di `routePermissions` di `App.tsx`. Ditambahkan `routePatterns` dengan regex matching untuk proteksi `settings_ip_olts`. Backend sudah diproteksi, tetapi frontend page bisa render tanpa permission check
- **Alert History sidebar item**: Sebelumnya tidak ada `permission` di `Sidebar.tsx`. Ditambahkan `view_dashboard` permission filter

#### Audit Summary
- **18 permissions** didefinisikan di `AVAILABLE_PERMISSIONS` (models.py)
- **4 default roles**: Full Access, Viewer, Limited, Technician
- **Super admin bypass**: `User.has_permission()` cek `is_super_admin` → `all_olt` → specific perm
- **Frontend-backend alignment**: `useHasPerm` hook dan `ProtectedRoute` mirror backend logic
- Total **15 endpoint backend** diperbaiki, **2 item frontend** diperbaiki

---

### 2026-08-06 — Penyederhanaan Menu Sidebar ONU

#### Diubah — Sidebar Menu
- **Menu ONU disederhanakan dari 8 ke 5 item**: Hapus 3 item "Wizard:" (Wizard: Register, Wizard: Provision, Wizard: Pre-config) dari sidebar. Item ini adalah versi baru (`OnuWizard`) yang duplikat dengan item legacy (Register Wizard, Provision ONU, Pre-config ONT). Fungsi wizard tetap tersedia — halaman Unconfigured sudah punya tombol "Register" per ONU yang navigasi ke route wizard. Route wizard (`/wizard/register`, `/wizard/provision`, `/wizard/preconfig`) tetap aktif, hanya tidak ditampilkan di sidebar
- **5 item tersisa**: All ONUs, Unconfigured, Provision ONU, Pre-config ONT, Register Wizard

---

### 2026-08-06 — Perbaikan Reboot ONU Non-ZTE & Replace ONU (Swap SN/MAC)

#### Diperbaiki — Reboot ONU Non-ZTE
- **Metode reboot berbasis vendor**: `reset_onu()` di `telnet_client.py` sekarang mendeteksi vendor ONU dari prefix serial number. ONU ZTE menggunakan OMCI reboot (`pon-onu-mng > reboot`), ONU non-ZTE (FiberHome, Huawei, dll.) menggunakan `shutdown` + delay 2 detik + `no shutdown` pada interface ONU — memaksa re-registrasi sebagai reboot efektif. Sebelumnya, ONU FiberHome/Huawei tidak merespons command OMCI reboot, sehingga reboot dari View ONU tidak berfungsi
- **Penerusan serial number**: Endpoint `onu_action` di `app.py` sekarang meneruskan `serial_number` ke `reset_onu()` untuk deteksi vendor
- **Auto-sync setelah reboot/reset**: Auto-sync OLT dipicu setelah aksi reboot/reset untuk menyegarkan DB dengan status ONU yang sebenarnya

#### Ditambahkan — Replace ONU (Swap SN/MAC)
- **Fitur Replace ONU**: Tombol aksi baru di halaman View ONU untuk mengganti ONU rusak dengan perangkat baru sambil mempertahankan semua konfigurasi. Alur: backup running-config → hapus ONU lama → registrasi ONU baru dengan SN baru → re-apply semua config (service-ports, interface, pon-onu-mng)
- **Method `replace_onu()`** di `telnet_client.py`: Swap otomatis penuh dengan mekanisme retry (3x registrasi, 5x cek interface siap), diferensiasi GPON/EPON, progress callback untuk logging per langkah
- **Endpoint `/api/onu/<id>/replace`** di `app.py`: Validasi vendor via prefix SN (ZTE/FHT/HW — blok jika tidak cocok), cek permission, logging komprehensif, update serial di DB, auto-sync, audit log
- **ReplaceOnuModal** di `ViewOnu.tsx`: Pesan peringatan ("Pergantian ONU akan menghapus ONU lama dan mengganti dengan perangkat baru menggunakan konfigurasi yang sama"), checkbox konfirmasi, field input SN, tampilan progress steps saat loading, delayed re-fetch setelah selesai
- **`api.onuReplace()`** di `api.ts`: API call baru untuk endpoint replace
- **Aksi CLI**: reboot, reset, delete, clear config, enable/disable, restore factory, restore WiFi, **replace ONU (swap SN/MAC)**

#### Diperbaiki — Audit Aksi ONU (dari sesi sebelumnya)
- **EPON get-status**: Mengembalikan key `status` bukan `data` untuk mencocokkan ekspektasi frontend dan path GPON
- **restore_factory_onu & restore_wifi_onu**: Ditambahkan dukungan `is_epon` — menggunakan prefix dinamis alih-alih hardcoded `gpon-onu`
- **Resync config**: Mempertahankan name/description yang sudah di-set user (hanya update jika kosong), menggabungkan WiFi SSIDs dari DB dengan read-back
- **Frontend get-status**: Menangani baik key `status` maupun `data` untuk kompatibilitas EPON
- **Frontend reboot/reset**: Delayed re-fetch (15-30 detik) setelah reboot untuk memberi waktu ONU kembali online

---

### 2026-08-05 — Perbaikan Registrasi EPON ONU & Sistem Panduan Terpusat

#### Diperbaiki — Registrasi EPON
- **Format MAC address untuk EPON CLI**: Ditambahkan helper `_format_epon_mac()` di `telnet_client.py` — memformat MAC hex 12-karakter menjadi dotted `xxxx.xxxx.xxxx` (syarat CLI EPON ZTE). Sebelumnya hex mentah dikirim, menyebabkan error `Invalid parameter`
- **Auto-koreksi tipe ONU**: `/api/pre-register` dan `/api/provision/unified` sekarang auto-koreksi tipe universal `All` → `ALL-EPON` untuk ONU EPON. Sebelumnya tipe GPON `All` dikirim untuk EPON, menyebabkan kegagalan registrasi
- **Command registrasi EPON**: Semua 4 method registrasi (`register_onu`, `register_and_configure`, `register_vendor_template`, `register_unified`) sekarang menggunakan keyword `mac` dengan format MAC dotted untuk EPON (contoh `onu 1 type ALL-EPON mac 7488.2a70.7346`) alih-alih keyword `sn`
- **Deteksi is_epon di frontend**: `RegisterWizard.tsx` dan `ProvisionWizard.tsx` sekarang mendeteksi `is_epon` dengan benar dari flag `onu.is_epon` dan prefix `pon_port`, serta mengirim `onu_type` yang benar dalam payload API
- **Short-circuit template EPON**: Setelah registrasi ONU EPON, command GPON-only (tcont/gemport/name) dilewati. Basic bridge service (`service-port`) di-apply sebagai gantinya, karena ONU EPON menggunakan ZTE ExtOAM (`pon-onu-mng`) bukan GPON OMCI
- **Enrichment MAC via SNMP untuk EPON unconfigured**: `collect_unregistered_onus()` sekarang mengambil MAC address dari ZTE private MIB table (`.1.3.6.1.4.1.3902.1015.1010.1.7.14`) untuk ONU EPON yang menampilkan serial N/A di output CLI uncfg

#### Ditambahkan — Sistem Panduan Terpusat

#### Ditambahkan
- **Data panduan terpusat** (`frontend/src/data/guides.ts`): Semua 17 panduan halaman dikonsolidasikan ke dalam satu file TypeScript terstruktur dengan interface `Guide` dan `GuideStep`, grouping kategori, dan helper functions (`getGuideById`, `searchGuides`, `getGuidesByCategory`)
- **Halaman Panduan** (`frontend/src/pages/GuidePage.tsx`): Halaman "Panduan" khusus di `/dashboard/guide` dengan:
  - Search bar (mencari judul, deskripsi, langkah, tips)
  - Tombol filter kategori dengan jumlah
  - Layout accordion dikelompokkan dalam 7 kategori (Dashboard, ONU Management, Templates, Traffic, Infrastructure, System, Activity)
  - Rich text rendering (dukungan **bold** via `renderRichText`)
  - Section Prasyarat dan Tips per panduan
- **Menu sidebar**: Item menu "Panduan" dengan ikon BookOpen, terlihat oleh semua user
- **Prop `guideId` di TutorialBanner**: Jika di-set, TutorialBanner mengambil konten dari `guides.ts` terpusat alih-alih inline JSX. Menambahkan tombol link "Panduan" yang navigasi ke `/dashboard/guide`
- Semua 17 halaman diupdate dengan prop `guideId`: Dashboard, AllOnus, ViewOnu, AddOnu, ProvisionWizard, RegisterWizard, OltSettings, OltConfiguration, Traffic, FtthInfrastructure, Customization, Templates, Tr069Profile, UserManagement, AlertSettings, AlertHistory, ActionLogs

#### Diubah
- `TutorialBanner.tsx`: Di-refactor untuk mendukung inline JSX (fallback) dan data terpusat (guideId). Ditambahkan header section Prasyarat/Tips dengan ikon. Ditambahkan tombol link "Panduan" saat guideId di-set
- Data panduan di-code-split ke chunk terpisah (~16KB gzipped) — tidak berdampak pada ukuran bundle awal

#### Diperbaiki
- Edit name/description ONU EPON: Menggunakan format CLI `property description $$name$$description` untuk ONU EPON alih-alih command `name`/`description` terpisah
- Perubahan tipe ONU EPON: Menggunakan keyword `mac` alih-alih `sn` untuk re-registrasi ONU EPON
- Crash ViewOnu GetStatusModal: Ditambahkan null guard untuk data status yang undefined
- `sync_helper.py`: Sekarang menyimpan `onu_type` dari data ONU saat sync

---

### 2026-08-04 — Audit & Perbaikan Auto-Backup

#### Diperbaiki
- Endpoint download `backup_olt_config()`: Ditambahkan `write memory` sebelum `show running-config` — config yang didownload bisa kehilangan perubahan yang belum disimpan
- Endpoint download `backup_olt_config()`: Timeout ditingkatkan dari 30s ke 60s untuk mencocokkan endpoint auto-backup dan backup-save (mencegah truncation pada config besar)
- `_auto_write_config()`: Mengganti pengecekan error `'%' in out` yang terlalu luas dengan pola error CLI ZTE spesifik (`%error`, `% invalid`, `%code`, `incomplete command`, `ambiguous command`, `return error`) — output legitimate yang mengandung `%` (nama VLAN, deskripsi) sebelumnya menyebabkan false warning "write failed"
- `auto_backup.py`: Backup yang gagal tidak lagi mengupdate `last_backup_at` — sebelumnya backup gagal akan set `last_backup_at = now`, mencegah retry hingga interval penuh berlalu lagi. Sekarang backup gagal retry pada cron run per jam berikutnya

#### Ditambahkan
- `auto_backup.py`: Function `notify_backup_failure()` membuat notifikasi in-app untuk super admin saat auto-backup gagal (type=`olt_offline`, icon=`warning`)

---

### 2026-08-04 — Dukungan EPON ONU (Register/Provision/Pre-Config + Scan Unconfigured)

#### Ditambahkan
- **Dukungan EPON di registrasi ONU**: Semua method registrasi (`register_onu`, `configure_onu_profile`, `register_and_configure`, `register_vendor_template`, `register_unified`) sekarang menerima parameter `is_epon` dan menggunakan prefix CLI `epon-olt_`/`epon-onu_` saat true
- **Scan ONU unconfigured EPON**: `collect_unregistered_onus()` sekarang memparsing pola `epon-olt_` dan `epon-onu_` dari output `show pon onu uncfg`, termasuk fallback MAC-as-SN (12 hex chars untuk ONU EPON tanpa prefix vendor)
- **Deteksi EPON di endpoint API**: `/api/pre-register` dan `/api/provision/unified` mendeteksi EPON dari prefix `pon_port` atau flag `is_epon` eksplisit di request body
- **Hitung kartu EPON di OltConfiguration**: Baris stats sekarang menghitung jumlah kartu EPON dinamis dari prefix `ETG` alih-alih hardcoded `"0"`
- Interface frontend `UnconfiguredOnu`: Ditambahkan field `is_epon` di `RegisterWizard.tsx` dan `ProvisionWizard.tsx`
- Wizard frontend: API call sekarang mengirim `pon_port` dan `is_epon` di request body

#### Diubah
- **Preview script Register/Provision**: `RegisterWizard.tsx` dan `ProvisionWizard.tsx` sekarang menggunakan prefix dinamis `epon-onu_`/`epon-olt_` atau `gpon-onu_`/`gpon-olt_` berdasarkan deteksi `is_epon` dari prefix `pon_port`
- **Migrate ONU**: `migrate_onu()` dan batch migrate sekarang membaca `onu.card` untuk menentukan `is_epon` dan meneruskan ke `deregister_onu`/`register_onu`/`configure_onu_profile`
- **Re-register update ONU**: `update_onu` dan `update_onu_type` inline edit sekarang menggunakan prefix dinamis `epon-olt_`/`gpon-olt_` berdasarkan field `onu.card`
- **Endpoint traffic ONU**: `onu_traffic` sekarang menggunakan prefix dinamis `epon-onu_`/`gpon-onu_` untuk command `show interface`
- **Simpan DB provision**: `/api/provision/unified` sekarang menyimpan `card='epon'` ke record ONU saat sukses untuk ONU EPON
- **Prefix log action**: Target `log_action` sekarang menggunakan prefix `epon-onu_` atau `gpon-onu_` berdasarkan `is_epon`

---

### 2026-08-03 — Dukungan EPON ONU (Sync, Actions, Live Data, Rack Diagram)

#### Ditambahkan
- Method `_collect_epon_onus_fast()` di `telnet_client.py` untuk koleksi ONU EPON ringan saat light sync (berbasis Telnet, tanpa SNMP)
- Deteksi kartu EPON (prefix ETG) di `collect_pon_port_stats` — menggunakan prefix `epon-olt` dan command `show epon onu state`
- Parsing state ONU khusus EPON — EPON menggunakan prefix `epon-onu_` dan keyword status berbeda
- Dukungan parameter `is_epon` di `reset_onu`, `deregister_onu`, `disable_onu`, `enable_onu`, `clear_onu_config`, `get_onu_live_data`, `collect_onu_detail`
- Early return untuk ONU EPON di `get_onu_live_data` dan `collect_onu_detail` (EPON tidak mendukung command GPON-specific seperti `detail-info` atau `pon power attenuation`)
- Early return EPON di endpoint `onu_get_status` — ONU EPON tidak mendukung `detail-info` atau `pon power attenuation`
- Events kosong untuk ONU EPON di `collect_onu_history` (command GPON-specific tidak didukung)
- Deteksi prefix ETG di `slot_type_for()` agar kartu EPON tampil sebagai service slot di rack diagram
- `sync_helper.py`: `sync_onus` sekarang menyimpan `card_type` ('epon' atau 'gpon') dari data ONU ke field `card` model ONU
- `snmp_collector.py`: Light sync sekarang termasuk koleksi ONU EPON via Telnet setelah koleksi SNMP
- `snmp_collector.py`: Koleksi PON port sekarang termasuk kartu EPON (prefix ETG) bersama GPON (prefix GTG)

#### Diubah
- `enrich_onus_via_telnet` sekarang melewatkan ONU EPON (enrichment GPON-specific tidak berlaku)
- `app.py`: Semua endpoint aksi ONU meneruskan flag `is_epon` ke method TelnetCollector berdasarkan field `onu.card`
- `app.py`: Endpoint `/api/onu/<id>/detail` dan `/api/onu/<id>/live-detail` meneruskan `is_epon` ke `collect_onu_detail` dan `get_onu_live_data`

---

### 2026-08-01 — Audit & Perbaikan Sistem Notifikasi

#### Ditambahkan
- Kolom `Notification.resolved` dan `Notification.resolved_at` untuk tracking lifecycle notifikasi (Active → Resolved)
- Kolom `AlertHistory.first_seen_at` untuk tracking debounce (deteksi pertama vs alert fire sebenarnya)
- **Mekanisme debounce**: Alert ONU offline/dyinggasp/los memerlukan 2 deteksi berturut-turut dalam 120 detik sebelum fire — mencegah false alert dari status flap transient
- **Auto-resolve**: Saat ONU kembali online, semua notifikasi offline/dyinggasp/los lama otomatis ditandai RESOLVED
- **Auto-resolve OLT**: Notifikasi OLT offline auto-resolved saat OLT kembali reachable
- **Auto-resolve OLT health**: Alert CPU/memory/temperature auto-resolve saat nilai turun di bawah threshold
- **Dedup notifikasi recovery**: Cek notifikasi recovery unread yang ada sebelum membuat baru (update jika ada)
- **Dedup recovery OLT**: Dedup yang sama untuk notifikasi recovery OLT
- **Auto-cleanup**: Notifikasi yang sudah dibaca berusia >7 hari otomatis dihapus di setiap siklus pengecekan alert
- **Cleanup debounce stale**: Jika ONU pulih selama window debounce, `first_seen_at` AlertHistory di-reset (tidak ada alert yang fire)
- Frontend: Notifikasi resolved ditampilkan di section terpisah dengan badge `RESOLVED` dan title strikethrough
- Frontend: Count badge bell hanya termasuk notifikasi unread aktif (non-resolved)
- Migrasi database: Auto-tambah kolom baru saat startup via `migrate_schema()`

#### Diubah
- `alerts.py`: Deteksi ONU offline ditulis ulang dengan logika debounce (first_seen_at → tunggu 120s → fire pada deteksi kedua)
- `alerts.py`: Section recovery sekarang auto-resolve notifikasi lama alih-alih hanya menandai `is_read=True`
- `alerts.py`: Section recovery OLT sekarang dedup dan auto-resolve notifikasi offline lama
- `alerts.py`: Alert OLT health (CPU/mem/temp) auto-resolve saat kondisi cleared
- `app.py`: Count unread API notifikasi sekarang filter `resolved=False` (hanya alert aktif yang dihitung)
- `app.py`: Response API notifikasi sekarang termasuk field `resolved` dan `resolved_at`
- `frontend/Topbar.tsx`: List notifikasi dipisah menjadi section Active dan Resolved
- `frontend/Topbar.tsx`: Dihapus UI subscription SaaS (badge status subscription di topbar)

#### Diperbaiki
- False alert dari status flap ONU transient (offline → online dalam 1 polling cycle)
- Akumulasi notifikasi — notifikasi offline lama tidak lagi menumpuk saat ONU pulih
- Notifikasi recovery duplikat untuk OLT/PON yang sama
- Alert OLT health stale yang tetap aktif setelah kondisi cleared
- Bell icon menampilkan notifikasi resolved di count unread

---

### 2026-08-01 — VPS Installer, Uninstaller & Penghapusan SaaS

#### Ditambahkan
- `install-vps.sh`: Installer VPS one-click lengkap untuk server Ubuntu 22.04/24.04 fresh
  - Install Python 3, Node.js 22, nginx, git
  - Clone repo, buat venv, build frontend
  - Setup systemd service (`salfanet-nms`)
  - Konfigurasi Nginx reverse proxy (port 80 → Flask 5000 + WebSocket 8765)
  - Auto-generate `SECRET_KEY`
- `uninstall-vps.sh`: Uninstaller VPS lengkap
  - Stop & hapus systemd service
  - Hapus konfigurasi Nginx
  - Hapus redirect iptables port
  - Hapus file aplikasi (`/opt/salfanet-nms/` termasuk database)
  - Hapus user aplikasi (`salfanet`)
- `deploy/update_vps.sh`: Script update cepat (pull + rebuild + restart)
- `deploy/test_uninstall.sh`: Script verifikasi uninstaller
- `deploy/test_uninstall_reinstall.sh`: Siklus test uninstall → reinstall lengkap
- Flag `install.sh --start`: Auto-start server setelah instalasi lokal
- README: Dokumentasi VPS installer, uninstaller, update, dan service management

#### Diubah
- `deploy/vps-setup.sh`: Diupdate untuk menggunakan `run_server.py` (Flask + FastAPI), fix proxy WebSocket ke port 8765, rename ke `salfanet-nms`
- `frontend/App.tsx`: Root route `/` sekarang redirect langsung ke `/login` (hapus SaaS landing page)
- `frontend/App.tsx`: Dihapus semua halaman publik SaaS (LandingPage, RegisterPage, PaymentResultPage, RenewalPage, TenantNotFound)
- `frontend/Dashboard.tsx`: Dihapus rendering `SuperAdminDashboard` untuk super admin
- `app.py`: CSP `connect-src` sekarang termasuk `ws:` untuk koneksi WebSocket plain
- `frontend/useWebSocket.ts`: Fix URL WebSocket untuk menggunakan WS_PORT (8765) alih-alih port host halaman

#### Diperbaiki
- Kegagalan koneksi WebSocket pada deployment HTTP (CSP memblokir protokol `ws:`)
- Error 404 `/api/admin/dashboard` (SuperAdminDashboard dihapus)
- SaaS landing page masih muncul setelah penghapusan SaaS (`/api/public/packages` 404)
- `git pull` di VPS gagal dengan error "dubious ownership"
- Halaman settings OLT tidak auto-reload setelah add/edit OLT

---

### 2026-07-31 — Redis Caching & Penghapusan UI SaaS

#### Ditambahkan
- Redis caching dengan fallback ke in-memory cache
- Cache TTL: 300s (static), 60s (semi-static), 30s (chassis/PON), 15s (dashboard)
- Cache invalidation saat sync dan perubahan config
- Cache key di-prefix dengan `olt:<olt_id>:<datatype>`

#### Dihapus
- Fitur multi-tenancy SaaS dari admin panel
- UI manajemen subscription SaaS
- Alur registrasi dan pembayaran tenant SaaS

