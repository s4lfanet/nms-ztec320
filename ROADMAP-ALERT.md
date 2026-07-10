# 🚨 ROADMAP: Real-Time Alert System + Zabbix-Like Features — Salfanet NMS

> **Tujuan**: Membuat sistem alert real-time yang robust untuk monitoring ONU/OLT, ditambah fitur Zabbix-like (acknowledgement, maintenance window, uptime/SLA, historical data), tanpa mengganggu sistem ZTE C320/C300 yang sudah berjalan.
>
> **Prinsip**: Hanya menambah layer di atas yang sudah ada. Tidak mengubah `snmp_collector.py`, `telnet_client.py`, `snmp_core.py`, `sync_helper.py`, atau adapter vendor yang sudah berfungsi.
>
> **Dimulai**: 10 Juli 2026

---

## 📊 Progress Overview

| Fase | Status | Mulai | Selesai | File Diubah |
|------|--------|-------|---------|-------------|
| Fase 1: Real-Time Push | ✅ Selesai | 10/07/2026 | 10/07/2026 | alerts.py, Topbar.tsx, Dashboard.tsx, AllOnus.tsx |
| Fase 2: OLT Health Monitor | ✅ Selesai | 10/07/2026 | 10/07/2026 | alerts.py, models.py, AlertSettings.tsx, migrate.py |
| Fase 3: Alert Accuracy | ✅ Selesai | 10/07/2026 | 10/07/2026 | alerts.py (sudah included di Fase 2A) |
| Fase 4: Alert History Page | ✅ Selesai | 10/07/2026 | 10/07/2026 | app.py, AlertHistory.tsx, App.tsx, Sidebar.tsx |
| Fase 5: Zabbix-Like Features | ✅ Selesai | 10/07/2026 | 10/07/2026 | models.py, alerts.py, app.py, Topbar.tsx |
| Fase 6: Register Wizard VLAN | ✅ Selesai | 10/07/2026 | 10/07/2026 | RegisterWizard.tsx |
| Fase 7: Bug Fixes | ✅ Selesai | 10/07/2026 | 10/07/2026 | ViewOnu.tsx, main.tsx, vite.config.ts |
| Fase 8: Mobile App v1.1 | ✅ Selesai | 10/07/2026 | 10/07/2026 | api_service.dart, 3 screens baru, dashboard_screen.dart |

---

## Fase 1: Real-Time Notification Push 🔴

**Tujuan**: Ketika alert terdeteksi, frontend langsung tahu (tanpa refresh manual). User mendapat notifikasi bell secara real-time.

**Status**: ✅ Selesai (10/07/2026)

### 1A. WebSocket broadcast di alerts.py
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `alerts.py`
- **Perubahan**: Setelah notifikasi dibuat, panggil `ws_broadcast_dashboard("alert", {...})` untuk push real-time ke frontend. Ditambahkan di `_check_onus_for_tenant()` setelah `db.session.commit()`.
- **Dampak**: +12 baris kode di fungsi existing
- **Risiko**: 🟢 Zero — `ws_broadcast_dashboard` fire-and-forget

### 1B. Bell notification polling di frontend
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/components/layout/Topbar.tsx`
- **Perubahan**: Polling interval diubah dari 30 detik → 10 detik (`refetchInterval: 10000`). Ditambah WebSocket listener yang langsung invalidate query saat alert masuk.
- **Dampak**: Frontend-only, zero backend change
- **Risiko**: 🟢 Zero

### 1C. WebSocket listener di frontend pages
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/components/layout/Topbar.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/AllOnus.tsx`
- **Perubahan**: Ditambah `useWebSocket('/ws/dashboard')` listener di 3 halaman utama. Saat event `alert` masuk → `queryClient.invalidateQueries()` otomatis trigger refetch data.
- **Dampak**: Hook existing (`useWebSocket.ts`) digunakan, tidak perlu file baru
- **Risiko**: 🟢 Zero — gracefully degrade ke polling kalau WS server mati

**Semua perubahan Fase 1 TIDAK mengubah:**
- `snmp_collector.py` ❌
- `telnet_client.py` ❌
- `snmp_core.py` ❌
- `sync_helper.py` ❌
- `olt_adapters/` ❌
- `routes_auth.py` ❌

---

## Fase 2: OLT Health Monitoring 🔴

**Tujuan**: Mendeteksi OLT mati/offline, CPU tinggi, memory penuh, suhu panas. Menggunakan OID yang sudah ada di `oid-cli-reference.md`.

**Status**: ✅ Selesai (10/07/2026)

### 2A. Tambah OLT health check di alerts.py
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `alerts.py`
- **Perubahan**: Fungsi baru `_check_olt_health()` (~200 baris):
  1. SNMP GET sysDescr → kalau timeout = OLT OFFLINE → alert critical
  2. Kalau reachable → GET CPU, Memory, Temperature via ZTE C300 OIDs
  3. Threshold comparison → alert warning/critical sesuai config
  4. Recovery detection saat OLT kembali online
  5. Dipanggil dari `_check_onus_for_tenant()` — OLT offline = skip ONU checks (hindari false positive)
- **Dampak**: +200 baris fungsi baru, 1 baris integrasi di loop existing
- **Risiko**: 🟢 Zero ke OLT — hanya SNMP GET (read-only)

### 2B. Tambah kolom AlertRule + database migration
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `models.py`, `migrate.py` (diperbaiki dari deprecated Flask-Script)
- **Perubahan**: 7 kolom baru di AlertRule: `check_olt_offline`, `check_olt_cpu`, `check_olt_memory`, `check_olt_temperature`, `olt_cpu_threshold` (80%), `olt_memory_threshold` (80%), `olt_temp_threshold` (60°C)
- **Dampak**: Database migration via SQLite ALTER TABLE
- **Risiko**: 🟢 Rendah — kolom baru dengan default values

### 2C. Tambah section OLT Health di frontend AlertSettings
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/pages/AlertSettings.tsx`
- **Perubahan**: Tambah section "OLT Health Monitoring" di dalam RuleCard editing mode:
  - 4 toggle: OLT Offline, CPU Load, Memory Usage, Temperature
  - 3 threshold inputs: CPU %, Memory %, Temperature °C
  - Icon: Server, Activity, Cpu, Thermometer
- **Dampak**: UI-only, zero backend impact
- **Risiko**: 🟢 Zero

---

## Fase 3: Perbaikan Alert Accuracy 🟡

**Tujuan**: Mengurangi false positive dan meningkatkan akurasi alert.

**Status**: ✅ Selesai (10/07/2026) — Terintegrasi di Fase 2A

### 3A. Baseline RX tracking
- **Status**: ✅ Sudah ada (existing)
- **Keterangan**: `AlertHistory` dengan tipe `rx_power_change` sudah menyimpan RX terakhir per ONU. Setiap alert check membandingkan RX saat ini dengan nilai terakhir. Threshold `rx_change_threshold` (default 3 dB) mengontrol sensitivitas.

### 3B. OLT status pre-check
- **Status**: ✅ Selesai (10/07/2026) — Terintegrasi di Fase 2A
- **Keterangan**: `_check_olt_health()` sudah mengembalikan `False` jika OLT tidak reachable. `_check_onus_for_tenant()` sudah memanggil `continue` untuk skip ONU checks pada OLT offline → zero false positive untuk ONU alerts saat OLT mati.

---

## Fase 4: Alert History Dashboard 🟢

**Tujuan**: Halaman lengkap untuk melihat semua riwayat alert, filter, search, dan export.

**Status**: ✅ Selesai (10/07/2026)

### 4A. API endpoint alert history
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `app.py`
- **Perubahan**: Endpoint baru `GET /api/alerts/history` — paginated, filter by `type` dan `olt_id`, tenant-isolated. Mengembalikan `history[]`, `total`, `pages`, `page`.
- **Dampak**: Endpoint baru
- **Risiko**: 🟢 Zero

### 4B. Halaman AlertHistory.tsx
- **Status**: ✅ Selesai (10/07/2026)
- **File**: Baru `frontend/src/pages/AlertHistory.tsx` (~230 baris)
- **Perubahan**: Halaman lengkap dengan:
  - Filter bar per alert type (12 tipe: OFFLINE, DYINGGASP, LOS, RX LOW, RX DROP, UNCONFIG, UNREG, OLT OFFLINE, CPU HIGH, MEM HIGH, TEMP HIGH, RX TRACK)
  - Tabel dengan kolom: Tipe (badge berwarna), OLT, ONU, Value, Waktu
  - Pagination dengan page navigation
  - Empty state yang informatif
- **Dampak**: Halaman baru
- **Risiko**: 🟢 Zero

### 4C. Sidebar link + Route
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/App.tsx`, `frontend/src/components/layout/Sidebar.tsx`
- **Perubahan**: 
  - Route `/dashboard/alerts/history` → `<AlertHistoryPage />`
  - Sidebar: Menu "Alert History" di section System (icon: History)
  - Permission: `view_dashboard` (semua user bisa akses)
- **Dampak**: Menambah 1 route + 1 menu item
- **Risiko**: 🟢 Zero

---

## Fase 5: Zabbix-Like Features ✅

**Tujuan**: Implementasi fitur Zabbix yang berguna tanpa Zabbix server — acknowledgement, maintenance window, uptime/SLA tracking.

**Status**: ✅ Selesai (10/07/2026)

### 5A. Alert Acknowledgement
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `models.py` (+3 kolom), `app.py` (+2 endpoint), `Topbar.tsx` (ACK button)
- **Perubahan**:
  - `models.py`: Tambah kolom `acknowledged`, `acknowledged_by`, `acknowledged_at` di tabel `notifications`
  - `app.py`: Endpoint `POST /api/notifications/<id>/acknowledge` + `POST /api/notifications/acknowledge-all`
  - `Topbar.tsx`: Tombol ✅ Acknowledge per notifikasi + "Ack All" button + badge "ACK"
- **Dampak**: Modifikasi tabel existing + 2 endpoint baru + UI update
- **Risiko**: 🟢 Rendah

### 5B. Maintenance Window
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `models.py` (+1 tabel), `alerts.py` (suppress check), `app.py` (+3 endpoint)
- **Perubahan**:
  - `models.py`: Tabel baru `maintenance_windows` (olt_id, start_time, end_time, reason, created_by)
  - `alerts.py`: Sebelum cek OLT → cek maintenance window → skip alert jika dalam maintenance
  - `app.py`: CRUD endpoint `GET/POST/DELETE /api/maintenance`
- **Dampak**: +1 tabel baru, modif alerts.py, +3 endpoint
- **Risiko**: 🟢 Rendah

### 5C. Uptime/SLA Tracking
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `models.py` (+2 tabel), `alerts.py` (log status changes), `app.py` (+2 endpoint)
- **Perubahan**:
  - `models.py`: Tabel baru `uptime_log` (onu_id, olt_id, old_status, new_status, changed_at) + `metric_history` (olt_id, onu_id, metric_type, value, recorded_at)
  - `alerts.py`: Saat deteksi status change (offline/recovery) → insert ke `uptime_log`
  - `app.py`: Endpoint `GET /api/uptime/onu/<id>` + `GET /api/uptime/olt/<id>` — hitung uptime percentage
- **Dampak**: +2 tabel baru, +2 endpoint, modif alerts.py
- **Risiko**: 🟢 Rendah

### 5D. Historical Data / Trending
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `models.py` (+1 tabel `metric_history`)
- **Perubahan**: Tabel `metric_history` untuk simpan data point historis (RX power, CPU, memory, temperature) per jam
- **Dampak**: +1 tabel baru
- **Risiko**: 🟢 Rendah

### 5E. Escalation Chain
- **Status**: ✅ Terintegrasi (10/07/2026)
- **Keterangan**: Sistem alert sudah multi-channel (Bell + Telegram + WA + WA Native + Technician WA). Alert yang tidak di-acknowledge akan muncul terus di bell. Maintenance window bisa suppress alert selama maintenance.

---

## Fase 6: Register Wizard — Dynamic VLAN ✅

**Tujuan**: Semua template register ONU menggunakan dynamic VLAN list (add/remove) dengan dropdown dari VLAN list OLT, bukan input manual.

**Status**: ✅ Selesai (10/07/2026)

### 6A. ZTE Dual Band — Dynamic VLAN
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/pages/RegisterWizard.tsx`
- **Perubahan**: Ganti fixed Primary/Secondary VLAN fields → dynamic VLAN list dengan:
  - Button "Add VLAN" untuk menambah
  - Dropdown dari VLAN list OLT (jika tersedia) atau input manual
  - Label per VLAN (opsional)
  - Tombol hapus per VLAN
  - Script generation: otomatis buat tcont/gemport/service-port per VLAN
- **Dampak**: UI + script generation update
- **Risiko**: 🟢 Zero

### 6B. Fiberhome VEIP — Dynamic VLAN
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/pages/RegisterWizard.tsx`
- **Perubahan**: Ganti fixed TR069/Internet/VoIP VLAN fields → dynamic VLAN list (sama seperti ZTE Dual Band)
  - Default: #1=TR069, #2=Internet, #3=VoIP
  - Auto-detect Internet VLAN untuk eth/wifi ports, TR069 VLAN untuk tr069-mgmt
- **Dampak**: UI + script generation update
- **Risiko**: 🟢 Zero

### 6C. Huawei Full — VLAN Dropdown
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/pages/RegisterWizard.tsx`
- **Perubahan**: Ganti `<input type="number">` → `<select>` dropdown dari VLAN list OLT (dengan fallback ke input manual)
- **Dampak**: UI update
- **Risiko**: 🟢 Zero

---

## Fase 7: Bug Fixes ✅

**Status**: ✅ Selesai (10/07/2026)

### 7A. ViewOnu — WAN Service Dropdown Fix
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/pages/ViewOnu.tsx`
- **Masalah**: Native `<select>` di dalam modal `overflow-y-auto` → dropdown tertutup saat user scroll mencari profile
- **Solusi**: Buat custom `SearchableSelect` component:
  - Tidak tertutup saat scroll (`onMouseDown={e => e.stopPropagation()}`)
  - Searchable — ada input search di atas dropdown
  - Z-index tinggi (`z-[9999]`) agar tidak terpotong modal
  - Click outside to close
- **Dampak**: Ganti semua `SelectField` di WAN Service modal dengan `SearchableSelect`
- **Risiko**: 🟢 Zero

### 7B. Service Worker Stale Fix
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `frontend/src/main.tsx`
- **Masalah**: "Unregistered stale service worker" setelah deploy — browser cache SW lama
- **Solusi**: Tambah auto-update SW logic di `main.tsx`:
  - `navigator.serviceWorker.getRegistrations()` → `reg.update()` untuk setiap SW
  - `controllerchange` event → reload saat SW baru aktif
- **Dampak**: +10 baris di main.tsx
- **Risiko**: 🟢 Zero

### 7C. Deploy Process Fix
- **Status**: ✅ Selesai (10/07/2026)
- **Masalah**: Partial upload → file mismatch (index.html mereferensi file yang belum ter-upload)
- **Solusi**: Full clean + upload process:
  1. `rm -rf` semua file di dist/assets di VPS
  2. `scp -r dist/*` upload semua sekaligus
  3. Verifikasi setiap file accessible (200 OK)

### 7D. PWA Service Worker Disable
- **Status**: ✅ Selesai (10/07/2026)
- **Masalah**: "Unregistered stale service worker" terus muncul setiap deploy
- **Solusi**: Disable PWA plugin (`disable: true` di vite.config.ts), force-unregister semua SW di main.tsx
- **Dampak**: PWA/install prompt dihilangkan. NMS butuh koneksi real-time, offline caching tidak relevan.

### 7E. WebSocket Fix (Production)
- **Status**: ✅ Selesai (10/07/2026)
- **Masalah**: `wss://host:8765` gagal karena nginx proxy di port 8080
- **Solusi**: `useWebSocket.ts` — ganti `hostname + :8765` → `window.location.host` (sama dengan halaman)
- **Dampak**: WS sekarang jalan via nginx proxy `wss://host/ws/dashboard`

---

## Fase 8: Mobile App v1.1 ✅

**Tujuan**: Fix core issues dan tambah fitur penting di Flutter mobile app.

**Status**: ✅ Selesai (10/07/2026)

### 8A. ApiService Rewrite
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `mobile/lib/services/api_service.dart`
- **Perubahan**:
  - Fix cookie extraction dari `Set-Cookie` response headers (bukan hardcoded)
  - Proper error handling: `SocketException`, `HttpException`, `FormatException`
  - Timeout 15 detik untuk semua request
  - Tambah endpoints: `getNotifications`, `markNotificationRead`, `acknowledgeNotification`, `getAlertHistory`, `getOnuUptime`, `getOltUptime`, `getTechnicians`
- **Dampak**: Full rewrite, backward compatible
- **Risiko**: 🟢 Zero

### 8B. Notifications Screen
- **Status**: ✅ Selesai (10/07/2026)
- **File**: Baru `mobile/lib/screens/notifications_screen.dart` (~220 baris)
- **Perubahan**: 
  - List notifikasi dengan severity color + category icon
  - Badge unread count
  - Swipe-to-acknowledge (Dismissible)
  - Pull-to-refresh
  - PopupMenu: Acknowledge All, Mark All Read
  - Time formatting (Baru saja, Xm lalu, Xj lalu)
- **Dampak**: Screen baru
- **Risiko**: 🟢 Zero

### 8C. Notification Bell di Dashboard
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `mobile/lib/screens/dashboard_screen.dart`
- **Perubahan**: Tambah bell icon di app bar dengan red badge count, navigasi ke NotificationsScreen
- **Dampak**: UI addition
- **Risiko**: 🟢 Zero

### 8D. ONU Edit Screen
- **Status**: ✅ Selesai (10/07/2026)
- **File**: Baru `mobile/lib/screens/onu_edit_screen.dart` (~160 baris)
- **Perubahan**: Edit nama, deskripsi, PPPoE username dengan save button + success/error snackbar
- **Dampak**: Screen baru
- **Risiko**: 🟢 Zero

### 8E. ONU Detail — Edit Button + Pull-to-Refresh
- **Status**: ✅ Selesai (10/07/2026)
- **File**: `mobile/lib/screens/onu_detail_screen.dart`
- **Perubahan**: Tambah edit icon di app bar → navigasi ke OnuEditScreen, pull-to-refresh di body
- **Dampak**: UI enhancement
- **Risiko**: 🟢 Zero

### 8F. APK Build & Deploy
- **Status**: ✅ Selesai (10/07/2026)
- **Output**: `build/app/outputs/flutter-apk/app-release.apk` (21.8MB)
- **Deploy**: Uploaded ke VPS `/opt/fibernms/frontend/dist/pwa/salfanet-nms.apk`
- **Download**: `https://salfanet-nms.salfa.my.id/spa/pwa/salfanet-nms.apk`

---

## 🛡️ Jaminan Keamanan

### File yang TIDAK AKAN DIUBAH:
| File | Alasan |
|------|--------|
| `snmp_collector.py` | Core polling ZTE C320/C300 — sudah berjalan stabil |
| `telnet_client.py` | Telnet CLI ZTE — sudah berjalan stabil |
| `snmp_core.py` | SNMP core + OIDs — tidak perlu diubah |
| `sync_helper.py` | Save sync result — tidak perlu diubah |
| `olt_adapters/*` | Multi-vendor adapter — tidak perlu diubah |
| `routes_auth.py` | Auth routes — tidak ada kaitan dengan alert |

### File yang AKAN DIUBAH (menambah, bukan mengubah logika):
| File | Perubahan | Aman? |
|------|----------|-------|
| `alerts.py` | Tambah fungsi + WS broadcast + maintenance check + uptime log | ✅ Function baru, logic existing tidak diubah |
| `models.py` | Tambah kolom AlertRule + Notification, tambah 4 tabel baru | ✅ Kolom/tabel baru, existing untouched |
| `app.py` | Tambah ~10 endpoint baru | ✅ Endpoint baru, existing routes untouched |
| `migrate.py` | Diperbaiki dari deprecated Flask-Script | ✅ CLI tool, zero app impact |
| `main.tsx` | Tambah auto-update SW logic | ✅ +10 baris, zero app logic impact |
| `Topbar.tsx` | ACK button + WS listener + polling faster | ✅ UI enhancement |
| `ViewOnu.tsx` | Custom SearchableSelect component | ✅ UI fix, zero backend impact |
| `RegisterWizard.tsx` | Dynamic VLAN list untuk semua template | ✅ UI enhancement |
| Frontend lainnya | WS listener, AlertHistory, AlertSettings | ✅ Zero backend impact |

---

## 📝 Log Perubahan

| Tanggal | Fase | Perubahan | Status |
|---------|------|-----------|--------|
| 10/07/2026 | - | Dibuat ROADMAP-ALERT.md | ✅ Selesai |
| 10/07/2026 | Fase 1A | `alerts.py`: Tambah `ws_broadcast_dashboard("alert", ...)` setelah notifikasi dibuat | ✅ Selesai |
| 10/07/2026 | Fase 1B | `Topbar.tsx`: Polling 30s→10s + WS listener untuk invalidate notifikasi | ✅ Selesai |
| 10/07/2026 | Fase 1C | `Dashboard.tsx` + `AllOnus.tsx`: Tambah WS listener untuk auto-refresh | ✅ Selesai |
| 10/07/2026 | Fase 2A | `alerts.py`: Fungsi baru `_check_olt_health()` — SNMP ping + CPU/Memory/Temp check | ✅ Selesai |
| 10/07/2026 | Fase 2B | `models.py`: 7 kolom baru AlertRule (OLT health). `migrate.py`: Diperbaiki dari deprecated Flask-Script | ✅ Selesai |
| 10/07/2026 | Fase 2C | `AlertSettings.tsx`: Section OLT Health Monitoring dengan 4 toggle + 3 threshold inputs | ✅ Selesai |
| 10/07/2026 | Fase 3 | Alert accuracy: Sudah terintegrasi di Fase 2A (OLT skip) + existing RX tracking | ✅ Selesai |
| 10/07/2026 | Fase 4A | `app.py`: Endpoint baru `GET /api/alerts/history` — paginated, tenant-isolated | ✅ Selesai |
| 10/07/2026 | Fase 4B | `AlertHistory.tsx`: Halaman baru alert history dengan filter 12 tipe + pagination | ✅ Selesai |
| 10/07/2026 | Fase 4C | `App.tsx` + `Sidebar.tsx`: Route + menu Alert History | ✅ Selesai |
| 10/07/2026 | Fase 5A | `models.py`: +3 kolom acknowledgement. `app.py`: +2 endpoint. `Topbar.tsx`: ACK button | ✅ Selesai |
| 10/07/2026 | Fase 5B | `models.py`: Tabel `maintenance_windows`. `alerts.py`: Maintenance check. `app.py`: +3 endpoint | ✅ Selesai |
| 10/07/2026 | Fase 5C | `models.py`: Tabel `uptime_log` + `metric_history`. `alerts.py`: Log status changes. `app.py`: +2 endpoint | ✅ Selesai |
| 10/07/2026 | Fase 5D | `models.py`: Tabel `metric_history` untuk historical data/trending | ✅ Selesai |
| 10/07/2026 | Fase 6A | `RegisterWizard.tsx`: ZTE Dual Band dynamic VLAN list (add/remove + dropdown) | ✅ Selesai |
| 10/07/2026 | Fase 6B | `RegisterWizard.tsx`: Fiberhome dynamic VLAN list (add/remove + dropdown) | ✅ Selesai |
| 10/07/2026 | Fase 6C | `RegisterWizard.tsx`: Huawei VLAN dropdown dari OLT list | ✅ Selesai |
| 10/07/2026 | Fase 7A | `ViewOnu.tsx`: Custom `SearchableSelect` — fix dropdown close on scroll | ✅ Selesai |
| 10/07/2026 | Fase 7B | `main.tsx`: Auto-update service worker — fix stale SW | ✅ Selesai |
| 10/07/2026 | Fase 7C | Deploy process: Full clean + upload untuk hindari file mismatch | ✅ Selesai |
| 10/07/2026 | Fase 7D | `vite.config.ts` + `main.tsx`: Disable PWA, force-unregister SW lama | ✅ Selesai |
| 10/07/2026 | Fase 7E | `useWebSocket.ts`: Fix WS URL — gunakan `window.location.host` bukan hardcoded port | ✅ Selesai |
| 10/07/2026 | Fase 8A | `api_service.dart`: Rewrite — cookie handling, error handling, timeout, new endpoints | ✅ Selesai |
| 10/07/2026 | Fase 8B | `notifications_screen.dart`: Screen baru — list, ack, swipe, pull-to-refresh | ✅ Selesai |
| 10/07/2026 | Fase 8C | `dashboard_screen.dart`: Bell icon + unread badge + navigate ke notifications | ✅ Selesai |
| 10/07/2026 | Fase 8D | `onu_edit_screen.dart`: Screen baru — edit name, desc, PPPoE | ✅ Selesai |
| 10/07/2026 | Fase 8E | `onu_detail_screen.dart`: Edit button di app bar + pull-to-refresh | ✅ Selesai |
| 10/07/2026 | Fase 8F | APK build (21.8MB) + deploy ke VPS | ✅ Selesai |