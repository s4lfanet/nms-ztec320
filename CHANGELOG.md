# Changelog

Semua perubahan penting pada proyek ini akan didokumentasikan dalam file ini.

## [Unreleased]

### 2026-09-21 — Fix: bulk update ONU (All ONUs) kirim command CLI salah untuk EPON

#### Ditemukan
- Diminta bandingkan project ini dengan backup produksi `backup-nms-2026-09-03` (checkout penuh `/opt/salfanet-nms` per 3 Sept). Backup itu HEAD-nya di commit `44a1a58` (233 commit di belakang main sekarang), TAPI working tree-nya juga punya ~20 file dengan **perubahan belum commit** — artinya ada hotfix yang sempat live di produksi tapi tidak pernah ke-commit ke git sama sekali.
- Salah satunya: `update_onu_field()` (`backend/routes_onu.py`, dipakai inline-editor Name/Description di halaman View ONU) sudah benar mengirim command gabungan `property description $$Name$$Desc` untuk ONU EPON (fix ini sudah didokumentasikan di CHANGELOG 2026-08-05) — tapi endpoint bulk `update_onu()` (dipakai modal Edit di halaman **All ONUs**) **tidak pernah dapat fix yang sama**, masih kirim command `name ...`/`description ...` terpisah yang tidak didukung ONU EPON.

#### Diperbaiki
- `update_onu()` (`backend/routes_onu.py`): tambah pengecekan `is_epon` yang sama seperti `update_onu_field()` — untuk ONU EPON, perubahan name dan/atau description digabung jadi satu command `property description $$Name$$Desc`, bukan command terpisah.

#### Diverifikasi
- 3 test baru (`tests/test_onu_update_epon.py`) — ONU EPON dapat command gabungan yang benar, ONU GPON tetap dapat command terpisah seperti sebelumnya (regresi guard), edit name-saja pada ONU EPON tetap menyertakan description lama yang belum diubah. Dikonfirmasi 2 dari 3 test **gagal** terhadap kode sebelum fix ini (reproduksi bug asli) dan **lolos** sesudahnya.
- Full suite: **283 passed, 2 skipped** (baseline 280 + 3 baru, nol regresi)
- `backup-nms-2026-09-03/` ditambahkan ke `.gitignore` — folder referensi backup produksi, bukan bagian dari repo.

### 2026-09-21 — Fix: ONU Reboot masih belum benar-benar reboot (root cause kedua)

#### Ditemukan
- Setelah fix buffer-drain sebelumnya, user tes ulang reboot ONU ZTE `1/1/3:2` — status di Mikrotik tetap online, ONU tidak reboot. Didiagnosis langsung ke OLT produksi (`172.16.88.2`) lewat script diagnostik yang menjalankan urutan command `reset_onu` secara manual dan mencetak raw output tiap langkah: command `reboot` di bawah context `pon-onu-mng` pada firmware OLT ini ternyata **tidak langsung reboot** — dia menampilkan prompt interaktif `Confirm to reboot? [yes/no]:` dan menunggu jawaban. Kode lama (juga versi yang sudah di-drain-fix) langsung lanjut kirim `exit` tanpa pernah menjawab prompt itu — akibatnya OLT diam di prompt konfirmasi, `exit` ditolak (`%Error: Invalid input`), dan ONU **tidak pernah benar-benar reboot** meski response tetap dianggap sukses (tidak ada kata "error" di teks prompt-nya).
- Dikonfirmasi ulang dengan menjawab `yes` secara manual: ONU langsung `LOS` (Loss of Signal, sedang reboot) lalu kembali `working` (online) ~30 detik kemudian — membuktikan root cause dan fix ini benar.

#### Diperbaiki
- `TelnetCollector.reset_onu()` (`backend/telnet_client.py`, cabang ZTE): setelah kirim `reboot`, cek apakah responsnya mengandung prompt konfirmasi (`'confirm'` + `'yes'`, case-insensitive) — kalau ya, kirim `yes` sebelum lanjut ke urutan `exit`. Cabang non-ZTE (`shutdown`/`no shutdown`) tidak terpengaruh, tidak ada prompt konfirmasi di situ.

#### Diverifikasi
- 2 test baru di `tests/test_telnet_buffer_drain.py` (`TestResetOnuAnswersRebootConfirmation`): satu mensimulasikan OLT yang minta konfirmasi dan memverifikasi `yes` terkirim tepat setelah `reboot`; satu lagi memverifikasi tidak ada `yes` yang terkirim kalau OLT tidak minta konfirmasi (firmware lain yang langsung reboot). Dikonfirmasi test pertama **gagal** terhadap kode sebelum fix ini dan **lolos** sesudahnya.
- Diverifikasi langsung di produksi: reboot manual (via script yang menjawab `yes`) membuat ONU `1/1/3:2` beralih LOS → working, konsisten dengan reboot fisik yang sungguhan terjadi.

#### Catatan
- Pola yang sama (raw `tn.write`/`tn.read_until`, tanpa penanganan prompt konfirmasi) juga dipakai di `restore_factory_onu()` — kemungkinan rentan bug serupa (mis. command `restore factory` di bawah `pon-onu-mng` juga bisa saja minta konfirmasi di firmware ini), tapi belum dikonfirmasi live dan belum diperbaiki di sesi ini karena scope-nya lebih besar (banyak command berurutan) dan belum ada laporan bug untuk fitur itu.

### 2026-09-21 — Fix: modal footer tersembunyi di mobile & ONU Reboot tidak bereaksi

#### Ditemukan
- Di tampilan mobile (viewport sempit, bottom nav Home/ONUs/OLT/System), tombol Cancel/Save pada modal edit (contoh: Edit Service WAN di halaman View ONU) tersembunyi/terpotong. Root cause bukan sekadar kurang ruang — `Modal` (`frontend/src/components/ui/Modal.tsx`) dirender inline di dalam `<Outlet/>`, yang duduk di dalam wrapper `relative z-10` milik `AppShell`. Wrapper itu punya `position:relative` + `z-index`, jadi membentuk stacking context baru — semua z-index di dalam modal (termasuk `z-50` pada `.modal-wrapper`) jadi terjebak dan hanya dibandingkan sesama elemen di dalam wrapper itu, tidak pernah bisa mengalahkan bottom nav bar (`z-30`) yang merupakan sibling di LUAR wrapper. Akibatnya footer modal selalu tergambar di BAWAH bottom nav, seberapa pun tinggi z-index modal itu sendiri diset — dikonfirmasi visual lewat screenshot mobile-viewport sebelum & sesudah perbaikan.
- Tombol **Reboot** ONU (`View ONU` → Action Buttons) kadang tidak melakukan apa-apa tanpa pesan error. Root cause: `TelnetCollector.reset_onu()` (`backend/telnet_client.py`) adalah satu-satunya method CLI yang masih pakai `tn.write()`/`tn.read_until()` mentah, bukan `_send_command()`/`_send_cmd_check()` seperti method lain (`disable_onu`, `enable_onu`, `deregister_onu`) — artinya tidak pernah memanggil `drain()`. Bug `drain()` ini sudah pernah dikonfirmasi live di produksi sebelumnya (lihat `tests/test_telnet_buffer_drain.py`): `read_until()` bisa berhenti di karakter '#' yang muncul di TENGAH isi respons suatu command, meninggalkan sisa respons (termasuk prompt asli) masih mengendap di buffer — lalu ikut terbaca oleh command BERIKUTNYA. Untuk `reset_onu`, ini berarti command `reboot` yang sesungguhnya bisa jadi membaca sisa buffer dari langkah `pon-onu-mng` sebelumnya alih-alih respons `reboot` yang asli — tidak ada pesan error (karena sisa buffer itu juga tidak mengandung kata "error"), tapi ONU-nya sendiri tidak pernah benar-benar menerima command reboot.

#### Diperbaiki
- `Modal.tsx`: dirender lewat `createPortal(..., document.body)` — pola yang sudah dipakai di `ZteRackDiagram.tsx` — supaya modal keluar dari stacking context `AppShell`, dan `z-index`-nya benar-benar dibandingkan di level root document (menang telak atas bottom nav).
- `.modal-wrapper` (`index.css`): tambah `padding-bottom: env(safe-area-inset-bottom)` (pola yang sama seperti `.mobile-bottom-nav`) supaya footer modal tidak mepet ke area gesture-bar/home-indicator perangkat. `max-height` modal card diganti dari `vh` ke `dvh` (`max-h-[90dvh] md:max-h-[85dvh]`) supaya tidak overflow saat browser chrome mobile (address bar) sedang tampil.
- `TelnetCollector.reset_onu()`: ditulis ulang memakai `_send_command()`/`_send_cmd_check()` (otomatis `drain()` sebelum tiap command), menggantikan seluruh `tn.write()`/`tn.read_until()` manual — perilaku ZTE (OMCI reboot via `pon-onu-mng`) dan non-ZTE (`shutdown`+`no shutdown`) tetap sama persis, hanya mekanisme baca/tulis CLI-nya yang diperbaiki.

#### Diverifikasi
- Test baru `TestResetOnuDrainsBeforeEachCommand` di `tests/test_telnet_buffer_drain.py` — mensimulasikan respons `pon-onu-mng` yang menyisakan buffer, lalu memverifikasi command `reboot` tetap membaca responsnya sendiri yang asli (bukan sisa buffer). Dikonfirmasi test ini **gagal** kalau dijalankan terhadap kode lama (sebelum fix) dan **lolos** setelah fix — bukan sekadar tautologi.
- Full suite: **278 passed, 2 skipped** (baseline 277 + 1 baru, nol regresi)
- Verifikasi visual: screenshot mobile-viewport (iPhone 14 Pro emulation) sebelum fix menunjukkan tombol Save tertutup bottom nav; setelah fix, Cancel/Save tampil penuh di atas bottom nav. Desktop (viewport lebar) dicek tetap center seperti semula, tidak ada regresi.
- `tsc --noEmit` dan `vite build` bersih.

### 2026-09-17 — FTTH: ODP Berjenjang / Splitter Cascade (Fase 4 Adopsi Struktur salfanet-radius)

#### Konteks
- Fase 4, fase terakhir dan paling luas perubahannya dari rencana adopsi 4 fase. salfanet-radius memodelkan ODP berjenjang lewat istilah "core" di semua level. Di nms-ztec320 dipilih pendekatan berbeda: ODP berikutnya diberi makan lewat **port** ODP sebelumnya (bukan core mentah), karena keluaran splitter sudah berupa cahaya yang di-split — port adalah representasi yang sudah ada (`FTTHODPPort`) dan konsisten dengan model yang sudah teruji.

#### Ditambahkan
- Kolom baru di `FTTHODP` (`backend/models.py`): `parent_odp_port_id` (FK ke `FTTHODPPort.id`, nullable, `use_alter=True` karena membentuk siklus FK dua arah dengan `FTTHODPPort.odp_id`); nilai baru `'odp'` untuk `feed_source`
- Migration Alembic baru (`d4e5f6a7b8c9`) + mirror `add_col()` di `app.py:migrate_schema()`
- `_odp_creates_cycle()` di `backend/routes_ftth.py` — mirror `_jc_creates_cycle`, jalan di rantai `parent_odp_port_id`; dipasang di endpoint create/update ODP untuk menolak cascade yang membentuk siklus (self-parent maupun tidak langsung)
- `_odp_parent_port_conflict()` — validasi satu `FTTHODPPort` tidak bisa dipakai dobel: jadi feed ODP anak DAN dipasangi ONU pelanggan langsung. Dicek dua arah: saat set `feed_source='odp'` di ODP (`ftth_odp_create`/`update`) dan saat set `onu_id` di port (`ftth_odp_port_update`)
- `_build_odp_dict_full` jadi rekursif (field `odps` baru, depth guard >20 sama seperti `_build_jc_dict_full`) — tree endpoint menampilkan cascade ODP berlapis
- `climb()` di trace upstream dapat cabang `'odp'` baru; logic resolve feed satu ODP dipisah jadi helper `_climb_from_odp_feed()` supaya rantai ODP→ODP→ODC (berapa pun levelnya) ter-trace berurutan, dengan tiap ODP muncul sebagai hop `type: 'odp'` tersendiri
- `_collect_downstream_onus` dapat cabang rekursi ke ODP anak — dampak downstream terhitung benar lewat berapa pun level cascade
- `ftth_map()` emit edge baru `odp → odp` untuk garis peta (frontend `LeafletMap.tsx` sudah generik, tidak perlu diubah)
- `ftth_odp_delete` men-detach (bukan cascade-delete) ODP anak — `parent_odp_port_id` di anak jadi `NULL`, ODP anaknya sendiri tetap ada
- Frontend (`frontend/src/pages/FtthInfrastructure.tsx`): `FeedSourceToggle` dapat prop opsional `extraOptions` untuk tombol tambahan (3 pemanggil lain tidak berubah); `OdpModal` dapat opsi "ODP Lain (Cascade)" — pilih ODP parent lalu port yang tersedia; `OdpRow` jadi rekursif dengan expand/collapse dan tombol tambah cascade, seperti `OdcRow`/`JcRow`
- Update entri panduan `ftth`

#### Diperbaiki (ditemukan saat menulis test)
- Relationship `FTTHODPPort.odp` di `backend/models.py` awalnya ambigu setelah `parent_odp_port_id` ditambahkan — dua kolom FK berbeda kini menghubungkan `ftth_odp` dan `ftth_odp_port` (`ftth_odp_port.odp_id` dan `ftth_odp.parent_odp_port_id`), SQLAlchemy tidak bisa menentukan mana yang dipakai relationship `ports`. Diperbaiki dengan `foreign_keys=[odp_id]` eksplisit di relationship tersebut.

#### Diverifikasi
- 11 test baru (`tests/test_ftth_odp_cascade.py`) — cycle prevention (self-parent, tidak langsung), tree nesting + regression shape untuk ODP non-cascading, trace 2 level ODP, dampak downstream 2 level ODP, validasi konflik port dua arah, delete detach-not-cascade
- Full suite: **277 passed, 2 skipped** (baseline 266 + 11 baru, nol regresi)
- Migration diverifikasi upgrade → downgrade → upgrade bersih di scratch DB
- `tsc --noEmit` dan `vite build` bersih

### 2026-09-17 — FTTH: Status Core Individual + Riwayat Assignment (Fase 3 Adopsi Struktur salfanet-radius)

#### Konteks
- Fase 3, paling berisiko dari 4 fase yang direncanakan. salfanet-radius menormalisasi core fiber total (tiap core row FK sendiri, splice pakai FK ke core). Di nms-ztec320, integer core_number (`otb_core_number`, `odc_core_number`, `jc_core_number`, `core_in`/`core_out`) adalah tulang punggung trace/impact/tree/CSV yang sudah teruji di 38 test FTTH — mengganti jadi FK berarti menulis ulang hampir seluruh `routes_ftth.py`, risiko tinggi. Dipilih pendekatan **aditif**: tabel status+riwayat baru yang mengikuti (bukan menggantikan) integer core_number yang sudah ada.

#### Ditambahkan
- 2 tabel baru: `FTTHFiberCore` (status per core: available/used/reserved/damaged, siapa yang pakai, opsional attenuation/notes — unique constraint per owner+core_number) dan `FTTHCoreAssignmentHistory` (riwayat: aksi assigned/unassigned/status_change, status sebelum/sesudah, siapa yang melakukan, kapan). `owner_type` sengaja dibatasi `otb`/`odc`/`jc` saja — ODP tidak masuk karena sisi keluar ODP itu **port** (sudah ditrack `FTTHODPPort`), bukan core mentah
- Migration Alembic baru (`c3d4e5f6a7b8`) — `op.create_table` murni, tidak perlu `add_col()` (tabel baru otomatis tercakup `db.create_all()`)
- Helper `_touch_core()`/`_release_core()` di `backend/routes_ftth.py` — upsert status (lazy-create row kalau belum ada) + catat riwayat kalau status berubah. Dipasang di **setiap** titik yang sudah set/clear sebuah `*_core_number`: create/update/delete OTB, ODC, ODP, ODP-port, dan create/update/delete JC-splice (termasuk sisi `core_in` di parent JC-nya, bukan cuma `core_out` di JC itu sendiri)
- Endpoint baru read-only: `GET /api/ftth/cores/<owner_type>/<owner_id>` dan `GET /api/ftth/cores/<core_id>/history`
- Panel **Status Core** baru di modal Edit OTB/ODC/JC (`frontend/src/pages/FtthInfrastructure.tsx`) — grid nomor core dengan warna status, klik untuk lihat riwayat singkat. Murni tampilan status, bukan tempat mengubah assignment (assignment tetap lewat "Fed From" seperti biasa)
- Update entri panduan `ftth`

#### Batasan yang Disadari (Trade-off Sengaja, Bukan Bug)
- Saat OTB/ODC dihapus dan cascade menghapus ODC/ODP di bawahnya (sudah perilaku lama, lewat SQLAlchemy `cascade='all, delete-orphan'`), core yang dimiliki ODC/ODP yang ikut ter-cascade-delete **tidak** ikut dibersihkan dari `FTTHFiberCore` (hanya core milik node yang di-`DELETE` langsung lewat API yang dibersihkan). Baris jadi orphan tapi tidak berbahaya (bukan FK yang di-enforce ketat, tidak dibaca ulang oleh trace/impact/tree yang tetap 100% jalan dari integer core_number seperti sebelumnya) — diterima sebagai batasan lapisan tracking tambahan ini, bukan sumber kebenaran topologi.

#### Diverifikasi
- 10 test baru (`tests/test_ftth_fiber_core.py`) — core ter-assign saat ODC/JC-splice dibuat, riwayat tercatat benar (termasuk `performed_by`), core dilepas saat delete/reassign, lazy-create tidak duplikat, unique constraint DB bekerja, kedua sisi splice (core_out di JC + core_in di parent) ter-touch
- Full suite: **266 passed, 2 skipped** (baseline 256 + 10 baru, nol regresi) — 48 test FTTH semuanya hijau
- Migration diverifikasi upgrade → downgrade → upgrade bersih di scratch DB
- Verifikasi visual end-to-end: dibuat OTB+ODC nyata lewat API, dibuka modal Edit OTB — core yang dipakai ODC benar tersorot warna "used", diklik core-nya, riwayat "assigned (- → used) oleh admin" tampil benar. Nol error console
- `tsc --noEmit` dan `vite build` bersih

### 2026-09-17 — FTTH: Panjang & Redaman Kabel per Segmen (Fase 2 Adopsi Struktur salfanet-radius)

#### Konteks
- Fase 2 dari rencana adopsi bertahap struktur FTTH salfanet-radius. Alih-alih tabel `cable_segments` polimorfik terpisah (butuh CRUD API sendiri), dipilih pendekatan lebih sederhana: kolom panjang & redaman langsung di tiap node yang sudah punya konsep "feed dari parent" — merepresentasikan kabel yang masuk ke node itu.

#### Ditambahkan
- Kolom baru (nullable, opsional) di `FTTHOTB`, `FTTHODC`, `FTTHODP`, `FTTHODPPort`, `FTTHJC` (`backend/models.py`): `cable_length_meters`, `cable_attenuation_per_km` (default 0.35 dB/km, standar fiber single-mode)
- Migration Alembic baru (`a7b8c9d0e1f2`) + mirror `add_col()` di `app.py:migrate_schema()`
- Helper `_cable_fields()` di `backend/routes_ftth.py`, dipakai di semua 5 dict output — menghitung `cable_attenuation_db` on-the-fly dari panjang × redaman (tidak disimpan terpisah)
- Endpoint create/update OTB/ODC/ODP/ODP-port/JC terima field baru
- **Trace "Jalur FTTH"** (`GET /api/ftth/trace/onu/<id>`) sekarang menghitung `total_attenuation_db` — dijumlah dari setiap hop di sepanjang jalur; kalau ada satu segmen saja yang belum diisi panjangnya, total sengaja ditampilkan `null` (bukan angka yang salah/kurang)
- Form Add/Edit di kelima modal (`frontend/src/pages/FtthInfrastructure.tsx`) dapat 2 input baru opsional: Panjang Kabel Masuk (m) dan Redaman (dB/km)
- Kartu **Jalur FTTH** di halaman View ONU (`ViewOnu.tsx`) menampilkan total redaman jalur kalau data lengkap, atau pesan "data belum lengkap" kalau tidak
- Update entri panduan `ftth` dan `view-onu`

#### Diperbaiki (ditemukan saat menulis test)
- Perhitungan attenuation semula dibulatkan per-segmen sebelum dijumlahkan di trace — menyebabkan galat pembulatan terakumulasi di jalur panjang (mis. total jadi 0.629 dB alih-alih 0.63 dB yang benar). Diperbaiki: `_cable_fields()` tidak lagi membulatkan nilai per-segmen, pembulatan hanya terjadi sekali di total akhir.

#### Diverifikasi
- 5 test baru (`tests/test_ftth_cable_attenuation.py`) — round-trip save/load, default value, total attenuation benar untuk jalur lengkap, dan `null` saat satu segmen kosong
- Full suite: **256 passed, 2 skipped** (baseline 251 + 5 baru, nol regresi) — termasuk 38 test FTTH semuanya hijau
- Migration diverifikasi upgrade → downgrade → upgrade bersih di scratch DB
- `tsc --noEmit` dan `vite build` bersih

### 2026-09-17 — FTTH: Budget Optik Splitter di ODC & ODP (Fase 1 Adopsi Struktur salfanet-radius)

#### Konteks
- Dibandingkan struktur FTTH dengan repo `salfanet-radius` (platform RADIUS/billing ISP dengan model fiber lebih detail). Fase 1 dari rencana adopsi bertahap: field numerik untuk hitungan power budget splitter (setara `fbtRatioType`/`fbtTapLoss`/`fbtThroughLoss` di salfanet-radius), murni aditif — tidak menyentuh `splitter_model` (label bebas "1:8" dsb) yang sudah ada, dan tidak mengubah mekanisme referensi core/trace/impact yang sudah stabil di 32 test FTTH existing.

#### Ditambahkan
- Kolom baru (nullable, opsional) di `FTTHODC` dan `FTTHODP` (`backend/models.py`): `splitter_ratio_type` (`'even'`/`'uneven'`, default `'even'`), `splitter_tap_loss_db`, `splitter_through_loss_db`
- Migration Alembic baru (`f1a2b3c4d5e6`) + mirror `add_col()` di `app.py:migrate_schema()` untuk instalasi yang belum lewat Alembic
- Endpoint create/update ODC & ODP (`backend/routes_ftth.py`) terima & kembalikan field baru
- Form **Add/Edit ODC** dan **Add/Edit ODP** (`frontend/src/pages/FtthInfrastructure.tsx`) dapat 3 input baru: dropdown Ratio Splitter, input Tap Loss (dB), input Through Loss (dB) — semua opsional
- Update entri panduan `ftth` (`frontend/src/data/guides.ts`)

#### Diverifikasi
- 6 test baru (`tests/test_ftth_optical_budget.py`) — save/load round-trip dan default value saat field tidak diisi, untuk ODC & ODP
- Full suite: **251 passed, 2 skipped** (baseline 245 + 6 baru, nol regresi)
- Migration diverifikasi upgrade → downgrade → upgrade bersih di scratch DB
- `tsc --noEmit` dan `vite build` bersih

### 2026-09-17 — Audit & Overhaul Konten Halaman Panduan (`guides.ts`)

#### Latar Belakang
- Diminta audit menyeluruh: apakah isi halaman Panduan (in-app help center, `/dashboard/guide`) masih sesuai dengan fitur sungguhan di aplikasi. Diaudit lewat 4 agent paralel yang membaca setiap page component + backend terkait secara langsung dan membandingkan tiap klaim di `guides.ts` baris-per-baris.

#### Ditemukan
- **Ke-18 entri panduan yang ada saat itu semuanya punya minimal satu ketidaksesuaian nyata** dengan kode aktual — bukan cuma typo, beberapa di antaranya menyesatkan:
  - `cloudflare`: mendeskripsikan fitur SaaS multi-tenant (hostname per-tenant, auto CNAME, API Token via env var) yang **tidak ada sama sekali**. Kenyataan: wizard single-tunnel per-server (install cloudflared → paste tunnel token → start/stop/logs)
  - `user-management`: mengklaim sistem role tetap "Admin/Technician/Viewer" dengan super admin yang katanya "tidak bisa dihapus/diubah role-nya". Kenyataan: sistem role kustom dengan 17 permission granular (tab **Roles** tidak disebut sama sekali), role default sebenarnya "Full Access/Viewer/Limited/Technician", dan `routes_users.py` **tidak** melindungi akun super admin dari dihapus/diganti role oleh user lain yang punya permission `manage_users`
  - `provision-wizard`: isinya ternyata mendeskripsikan **Register Wizard** (konsep Template, step pilih PON port) — Provision Wizard yang asli tidak punya template sama sekali, konfigurasinya VLAN/WAN bebas
  - Klaim berulang "klik stat card untuk filter" di `dashboard` dan `all-onus` — tidak ada satupun stat card yang benar-benar clickable
  - Klaim fitur Export CSV di `alert-history` dan `action-logs` — keduanya tidak punya tombol export
  - Field TR069 Profile "periodic inform interval"/"connection request URL" — tidak ada di manapun di codebase, kemungkinan halusinasi
  - Detail teknis salah tersebar di banyak entri: vendor OLT (klaim ZTE/Huawei/Fiberhome, kenyataan ZTE-only), jumlah tab OLT Configuration (klaim 4, kenyataan 7 — "ONU Types" dan "WAN-IP Profiles" tidak disebut), satuan traffic (klaim Kbps/Mbps, kenyataan Mbps/Gbps), mekanisme update traffic chart (klaim WebSocket 5 detik, kenyataan polling 3 detik), channel notifikasi alert (klaim 2, kenyataan 4 — Telegram Bot dan WA Native terlewat), dan lainnya
- **5 halaman nyata yang reachable dari sidebar/routing tidak punya entri panduan sama sekali**: Unconfigured ONUs, My Profile, System Update, OLT Logs, dan Add ONU (yang terakhir ternyata route yatim — tidak ada link-nya di sidebar manapun, kemungkinan legacy)

#### Diperbaiki
- `frontend/src/data/guides.ts` ditulis ulang penuh: ke-18 entri lama dikoreksi sesuai temuan di atas (setiap koreksi diverifikasi ke file:baris kode sumbernya oleh agent audit sebelum ditulis ulang), ditambah 4 entri baru (`unconfigured-onus`, `my-profile`, `system-update`, `olt-logs`) — total 21 entri. `AddOnu` sengaja tidak dibuatkan panduan karena route-nya sendiri tidak reachable dari navigasi manapun saat ini
- Setiap entri baru/revisi memakai istilah dan label tombol persis seperti di UI sungguhan (bukan parafrase), termasuk kasus di mana istilah "resmi" di halaman berbeda dari nama tab internalnya (mis. FTTH "PON" vs "PON Ports")

#### Diverifikasi
- `tsc --noEmit` dan `vite build` bersih
- Script sanity-check: 21 guide, tidak ada id duplikat, semua kategori valid, semua path `page` dicocokkan satu-satu ke tabel routing `App.tsx` — semua match
- Verifikasi visual: dev server + backend dijalankan bersamaan, halaman Panduan di-screenshot (list 21 entri dengan hitungan kategori yang benar, lalu detail entri User Management di-expand) — markdown bold, step bernomor, dan kotak Tips semua render benar, tidak ada console error baru

### 2026-09-17 — Insiden: VPS Produksi Down Setelah Deploy Restrukturisasi `backend/` (Root Cause + Perbaikan)

#### Ditemukan
- Deploy commit `24b387e` (redesign frontend) ke VPS produksi via `git pull` + `systemctl restart` menyebabkan service **crash-loop total** (`can't open file '/opt/salfanet-nms/run_server.py': No such file or directory`). Situs down sepenuhnya untuk semua request
- Root cause: restrukturisasi `backend/` (PR #3, sudah di-merge sebelumnya) memperbaiki *installer scripts* (`install-vps.sh`, `deploy/vps-setup.sh`) supaya instalasi BARU menulis systemd unit/Nginx config/cron yang benar — tapi **deploy rutin (`git pull` + restart) tidak pernah menjalankan ulang installer**, sehingga systemd unit, Nginx config, dan crontab yang SUDAH TERPASANG di VPS produksi ini tetap menunjuk ke path lama (`WorkingDirectory=/opt/salfanet-nms`, bukan `/opt/salfanet-nms/backend`). Ini murni celah proses deploy yang tidak tercakup saat restrukturisasi dikerjakan (fokus waktu itu ke kebenaran struktur repo + CI, bukan ke migrasi server yang sudah berjalan)
- File live yang tidak di-track git (`.env`, `instance/` — termasuk `nms.db` produksi asli ~13.6MB, `static/uploads/company-logo.png`) juga masih di lokasi lama karena `git pull` tidak pernah menyentuh file untracked/gitignored
- Root crontab (4 job: `db_backup.py`, `auto_backup.py`, `auto_sync.py`, `traffic_poller.py`) masih `cd /opt/salfanet-nms` (path lama) — akan gagal silent di run berikutnya kalau tidak ketahuan sekarang

#### Diperbaiki
- Service dihentikan sementara, lalu `.env`/`instance/`/`static/` dipindah manual ke `backend/` di VPS (bukan lewat git, karena memang bukan file yang di-track)
- `/etc/systemd/system/salfanet-nms.service`: `WorkingDirectory` dan `EnvironmentFile` diarahkan ke `/opt/salfanet-nms/backend`
- `/etc/nginx/sites-available/salfanet-nms`: alias `/static/` diarahkan ke `backend/static/`
- Root crontab: keempat job diubah `cd /opt/salfanet-nms` → `cd /opt/salfanet-nms/backend`
- `daemon-reload` + restart service + reload Nginx
- Dibersihkan juga sisa artifak lama di root VPS yang tidak ikut ke-cleanup otomatis oleh `git pull` karena memang untracked: `nms.db` kosong (0 byte, peninggalan sebelum konvensi `instance/`), serta `__pycache__`/`migrations`/`tests` versi lama (cache bytecode Python, tidak lagi dipakai)

#### Diverifikasi
- Flask (`/`, `/login`) HTTP 200, FastAPI `/health` HTTP 200, Nginx port 80 HTTP 200, file statis (`/static/uploads/company-logo.png`) HTTP 200
- `auto_sync.py` dites langsung dari `backend/` dengan path baru — berhasil connect dan sync OLT sungguhan
- `git rev-parse HEAD` di VPS cocok dengan commit terbaru, `git status` bersih, cwd proses `run_server.py` yang berjalan dikonfirmasi `/opt/salfanet-nms/backend`, root direktori VPS sekarang persis sama strukturnya dengan repo

#### Catatan untuk Deploy Restrukturisasi Berikutnya (Pelajaran)
- Kalau ada restrukturisasi path serupa di masa depan, **checklist deploy ke server yang SUDAH terpasang** (bukan instalasi baru) harus eksplisit disiapkan sebagai bagian dari PR — bukan diasumsikan `git pull` saja cukup. Idealnya: script migrasi one-time terpisah (pindah file live + update systemd/Nginx/cron) yang dijalankan sekali saat deploy pertama pasca-restrukturisasi

### 2026-09-17 — Redesign Frontend: Depth Visual, Stat Card, Ikon FontAwesome, Animasi Login

#### Latar Belakang
- Tampilan lama flat: background solid polos, card tanpa depth (cuma border tipis), stat card cuma kotak berwarna datar, ikon seluruhnya lucide-react, dan halaman login langsung lompat ke dashboard tanpa transisi apa pun setelah submit. Diminta redesign visual — bukan perubahan fungsional/logic apa pun.

#### Diperbaiki
- **`index.css` (fondasi, otomatis berlaku di semua halaman)**:
  - `.glass-card` — dari kotak solid flat jadi layered surface: sheen tipis di atas, shadow multi-layer, dan glow bertinta warna saat hover (bukan cuma ganti warna border)
  - `.app-mesh-bg` (baru) — layer background fixed di belakang seluruh AppShell: radial gradient blob redup + dot grid halus, dipasang sekali di `AppShell.tsx` sehingga latar app tidak lagi polos di halaman manapun
  - `.icon-badge` (baru) — kotak ikon gradient+glow dengan varian warna (`data-color`), dipakai di `PageHeader` (otomatis muncul di ~20 halaman yang pakai komponen ini) dan di StatCard Dashboard
  - `.stat-tile`, `.stagger-in`, `.auth-blob`/`.auth-blob-slow`, `.auth-dot-grid`, `.signal-ring`, `.animate-check-pop`/`.animate-check-draw` (baru) — utilitas animasi untuk stat card, entrance halaman login, dan transisi sukses login. Semua menghormati `prefers-reduced-motion: reduce`
- **`Dashboard.tsx`** — StatCard didesain ulang: icon badge bergradasi per status warna, garis aksen tipis di atas card, hover lift, dan angka yang count-up halus saat data refresh (hook baru `useCountUp.ts`) alih-alih langsung loncat ke nilai baru. OltCard dapat sentuhan hover lift + shadow yang konsisten dengan card style baru
- **`PageHeader.tsx`** — ikon halaman sekarang dibungkus `.icon-badge` (kotak gradient+glow) alih-alih ikon kecil polos di sebelah judul — otomatis berlaku di semua halaman yang pakai `PageHeader`
- **`AuthLayout.tsx` + `Login.tsx`** (redesign penuh) — ikon fitur di panel hero diganti FontAwesome (`faBolt`, `faTowerBroadcast`, `faServer`, `faShieldHalved`); konten hero muncul staggered (logo → heading → paragraf → fitur satu-satu → status badge) alih-alih muncul sekaligus; background dapat blob gradient yang drift pelan + dot grid + signal-ping ring di sekitar logo (tema broadcast/network, bukan dekorasi generik); tombol Sign In sekarang menampilkan transisi checkmark sukses yang halus (~550ms) sebelum navigasi ke dashboard, alih-alih langsung lompat instan
- **`package.json`** — ditambah `@fortawesome/fontawesome-svg-core`, `@fortawesome/free-solid-svg-icons`, `@fortawesome/free-regular-svg-icons`, `@fortawesome/react-fontawesome`
- **`frontend/dist/`** — rebuild dari source baru (repo mengkomit pre-built frontend, lihat README)

#### Diverifikasi
- `tsc --noEmit`, `eslint` (file yang diubah — 0 error/warning baru; 4 lint issue yang muncul di `AppShell.tsx`/`Dashboard.tsx` sudah ada sebelumnya, tidak disentuh oleh perubahan ini), dan `vite build` semua bersih
- Diverifikasi visual langsung: dev server + backend dijalankan bersamaan, alur login penuh (idle → invalid credentials → sukses dengan checkmark → dashboard) dan halaman Dashboard (desktop + mobile) di-screenshot lewat Playwright/Edge — background mesh, icon badge, dan animasi checkmark semua tampil sesuai desain
- Regression check di halaman data-berat (`AllOnus`) — tidak ada elemen yang rusak, tidak ada error console baru (hanya warning WebSocket 404 yang sudah ada sebelumnya, murni keterbatasan proxy Vite dev server terhadap port FastAPI — tidak terjadi di production Nginx)

### 2026-09-17 — Restrukturisasi: Pisahkan `backend/` dari `frontend/` sebagai Folder Sibling

#### Latar Belakang
- Sebelumnya root repo punya ~30 file Python (`app.py`, 18 `routes_*.py`, `models.py`, `config.py`, `telnet_client.py`, dll) lepas langsung di root, bercampur dengan `migrations/`, `tests/`, `instance/`, `static/`, dokumen, dan script installer — sementara `frontend/` sudah rapi jadi satu folder sendiri. Murni penataan lokasi file, **bukan perubahan perilaku aplikasi**.
- Dikerjakan bertahap per fase (masing-masing commit terpisah, bisa di-`git revert` independen): Fase 1 pure `git mv` (riwayat file terjaga), Fase 2 perbaikan resolusi path yang rusak akibat pemindahan, Fase 3 verifikasi penuh.

#### Diperbaiki
- **Fase 1** — Semua file/folder backend Python (`app.py`, seluruh `routes_*.py`, `models.py`, `config.py`, `telnet_client.py`, `snmp_core.py`/`snmp_collector.py`, `olt_adapters/`, `migrations/`, `tests/`, `requirements.txt`, `.env.example`, dll — 75 file total) dipindah ke `backend/` via `git mv` satu-per-satu. Zero perubahan isi file (`75 files changed, 0 insertions(+), 0 deletions(-)`), 100% terdeteksi git sebagai rename murni sehingga riwayat blame/history tiap file tetap utuh.
- **Fase 2** — Titik-titik yang rusak akibat pemindahan, diperbaiki satu per satu:
  - `app.py::serve_spa_root()`/`serve_spa()` dan `routes_system.py::system_update_apply()` — keduanya resolve `frontend/dist/` relatif terhadap `os.path.dirname(__file__)`, yang sekarang jadi `backend/` (bukan lagi root), sehingga salah mengarah ke `backend/frontend/dist/` yang tidak ada. **Bug di `app.py` ini ditemukan langsung lewat verifikasi live** (menjalankan `run_server.py` manual dan memukul endpoint `/login` → `503 Frontend not built`), bukan cuma dari membaca kode — persis pola bug yang sama seperti di `routes_system.py` tapi jauh lebih kritikal karena menyangkut rute utama yang menyajikan UI aplikasi, bukan cuma fitur self-update admin. Diperbaiki dengan menghitung `repo_root = os.path.dirname(os.path.dirname(__file__))` lalu `frontend_dir = os.path.join(repo_root, 'frontend')` di ketiga tempat.
  - `install-vps.sh`, `deploy/vps-setup.sh`, `deploy/update_vps.sh`, **dan `install.sh`** (yang terakhir ini tidak disebut di brief awal, ditemukan saat grep ulang) — keempatnya masing-masing punya blok systemd unit / config Nginx / cron job / setup `.env` sendiri-sendiri (duplikat, bukan shared), dan keempatnya berasumsi `requirements.txt`, `instance/`, `static/`, `.env` ada di root. Diperbaiki konsisten di keempat script: `.venv` tetap di root repo, tapi `pip install -r backend/requirements.txt`, `WorkingDirectory=${APP_DIR}/backend` di systemd, alias Nginx `/static/` menunjuk `backend/static/`, cron job `cd` ke `backend/` dulu sebelum menjalankan `db_backup.py`/`auto_backup.py`/`auto_sync.py`/`traffic_poller.py`, dan `.env`/`.env.example`/`instance/` semua pindah ke bawah `backend/` (karena `config.py` resolve `.env` relatif terhadap lokasi filenya sendiri, yang sekarang `backend/config.py`).
  - `.github/workflows/ci.yml` — ditambah `defaults.run.working-directory: backend` di level job, jadi semua step (`pip install`, smoke test import, `pytest`) otomatis jalan dari `backend/` tanpa perlu `cd` di tiap baris `run:`.
  - `README.md` — diagram "Struktur Proyek" digambar ulang dengan `backend/` sebagai folder induk semua file Python, dan semua contoh command (Quick Start, Development Mode, VPS Management, Testing) yang tadinya berasumsi root = lokasi backend diberi `cd backend` di tempat yang sesuai.
  - `AGENTS.md` — baris instruksi `pytest tests/ -v` diberi catatan "dari `backend/`".
  - `migrations/alembic.ini` dan `migrations/env.py` — dikonfirmasi **tidak** ada `script_location` atau path lain yang di-hardcode ke lokasi lama, jadi tidak perlu diubah.

#### Diverifikasi
- Baseline sebelum restrukturisasi (dari root, sebelum Fase 1): `245 passed, 2 skipped` (209.25s)
- Setelah Fase 2 selesai, dijalankan ulang dari `backend/`: **`245 passed, 2 skipped`** (184.15s) — angka identik dengan baseline, tidak ada test yang baru gagal atau baru skip
- Smoke test import dari `backend/` (persis seperti step CI): `from app import app` → OK, `from api_async import fastapi_app` → OK
- Chain migrasi Alembic dijalankan penuh dari `backend/` terhadap database SQLite kosong (scratch) — 8 revisi (`2169e93c7970` → ... → `77cd667a1e6b`) apply bersih tanpa error, berhenti di head yang sama dengan sebelum restrukturisasi
- `run_server.py` dijalankan manual dari `backend/` (port alternatif untuk tidak bentrok dengan instance dev) — Flask `/` dan `/login` HTTP 200 menyajikan `frontend/dist/index.html` yang sesungguhnya (bukan fallback), FastAPI `/health` dan `/docs` HTTP 200 — inilah yang menangkap bug `app.py` di atas sebelum sempat lolos ke PR
- Resolusi path `frontend_dir` di `routes_system.py::system_update_apply()` diverifikasi langsung lewat script kecil yang menghitung `repo_root`/`frontend_dir` persis seperti kode aslinya dan mengonfirmasi hasilnya menunjuk ke `frontend/dist/index.html` yang benar-benar ada di disk — alur HTTP penuhnya (`POST /api/system/update/apply`) tidak dijalankan langsung karena butuh konteks systemd/produksi yang sesungguhnya (login superadmin + restart service), sesuai catatan "kalau memungkinkan di lingkungan sandbox" pada instruksi restrukturisasi ini
- `backend/instance/` dan `backend/static/uploads/` dikonfirmasi resolve benar (bukan cuma dibaca kodenya) lewat script verifikasi yang memanggil langsung `db_backup.DEFAULT_BACKUP_DIR` dan `routes_users._logo_dir()` dari dalam `backend/`
- **Tidak ada perubahan logic** di file mana pun kecuali resolusi path yang memang terbukti rusak akibat pemindahan (di atas) — murni penataan lokasi file

### 2026-09-17 — Fix: Endpoint `/broadcast` Percaya Header `X-Forwarded-For` yang Bisa Dipalsukan untuk Cek Localhost (Follow-up Audit, Ditemukan Saat Temuan 3)

#### Ditemukan
- Saat Temuan 3 (audit sebelumnya) digrep tempat lain yang baca `X-Forwarded-For` manual, ketemu satu di `api_async.py::/broadcast` dengan model trust yang berbeda dan lebih berisiko: `client_host = request_client_host or ''` (dibaca dari header `X-Forwarded-For`) lalu dicek `if client_host not in ('', '127.0.0.1', '::1', 'localhost')`. Karena header yang tidak dikirim sama sekali (`None`) jatuh ke default `''`, dan `''` termasuk dalam set yang dipercaya — endpoint ini memperlakukan **caller yang sekadar tidak mengirim header sebagai localhost tepercaya**, apapun asal koneksi TCP-nya sebenarnya. Header ini juga sepenuhnya bisa dipalsukan oleh caller (`X-Forwarded-For: 127.0.0.1`)
- Dampak nyata terbatas karena endpoint ini juga wajib mencocokkan `X-Internal-Key` (HMAC `compare_digest`) dan seharusnya hanya reachable dari `127.0.0.1:8765` — tapi cek "localhost" itu sendiri sebenarnya tidak memverifikasi apa-apa (nol nilai proteksi tambahan), karena pemanggil sah (`ws_bridge.py::_broadcast_async`) juga tidak pernah mengirim `X-Forwarded-For`, jadi cek ini "berhasil" untuk pemanggil sah murni kebetulan, bukan karena benar-benar memvalidasi asal koneksi

#### Diperbaiki
- Cek localhost diganti dari header `X-Forwarded-For` (spoofable, request-level di aplikasi) ke `request.client.host` — alamat peer ASGI sesungguhnya yang diisi oleh uvicorn dari koneksi TCP yang benar-benar terjadi, tidak bisa diatur oleh client. Import `Request` ditambahkan dari `fastapi`, handler `broadcast_message` menerima parameter `request: Request`, parameter header `request_client_host` (alias `X-Forwarded-For`) dihapus total dari signature
- Set localhost yang dipercaya juga diperketat: `''` (header kosong/tidak ada) **dihapus** dari daftar — sekarang hanya `('127.0.0.1', '::1', 'localhost')` yang diterima, karena `request.client.host` pada koneksi ASGI nyata selalu terisi

#### Diverifikasi
- 3 test baru di `TestBroadcast` (`tests/test_security.py`), memakai Starlette `TestClient` langsung ke endpoint asli (bukan replikasi logika cek secara terpisah seperti test lama), dengan `client=(peer_host, port)` untuk mengontrol alamat peer ASGI yang disimulasikan:
  - `test_spoofed_forwarded_for_does_not_bypass_localhost_check` — peer non-loopback yang mengirim `X-Forwarded-For: 127.0.0.1` tetap ditolak
  - `test_omitted_forwarded_for_no_longer_treated_as_trusted_localhost` — peer non-loopback yang sama sekali tidak mengirim header tetap ditolak
  - `test_valid_key_localhost_allowed` — diperbarui untuk memverifikasi lewat request HTTP sungguhan (peer `127.0.0.1`) alih-alih memanggil helper cek secara langsung
- Ketiga test baru dikonfirmasi **gagal dengan hasil yang sama persis seperti sebelum diperbaiki** saat dijalankan terhadap `api_async.py` versi lama (`git stash`), dan lulus di kode baru
- Full suite tetap hijau

### 2026-09-17 — Fix: `NameError` di `_provision_zte_multi` Kalau `extra.traffic_profile` Kosong (Follow-up Temuan 5)

#### Ditemukan
- Saat refactor Temuan 5 (audit sebelumnya), ditemukan tapi sengaja tidak diperbaiki: `global_download = extra.get('traffic_profile', '') or traffic_profile` di `_provision_zte_multi` — variabel `traffic_profile` di ruas kanan `or` tidak pernah didefinisikan di scope method ini. Provisioning ONU dengan template `zte_multi` akan `NameError` kalau `extra.traffic_profile` kosong/tidak dikirim

#### Diperbaiki
- Dihapus fallback `or traffic_profile` yang menunjuk ke nama tidak terdefinisi — `extra.get('traffic_profile', '')` sudah punya default `''` sendiri, jadi cukup `global_download = extra.get('traffic_profile', '')`. Kalau nanti kosong, kode di bawahnya sudah didesain untuk melewati command `traffic-limit downstream` (bukan wajib ada)

#### Diverifikasi
- 1 test baru: provisioning `zte_multi` dengan `extra.traffic_profile` dihapus dari payload — dikonfirmasi **gagal dengan `NameError` yang sama persis di kode lama**, dan **lulus di kode baru**
- Full suite tetap hijau

### 2026-09-16 — Refactor: Pisahkan Dispatch Template Vendor di `register_vendor_template` (Audit Temuan 5)

#### Latar Belakang
- `telnet_client.py` (~6.700 baris) menangani 7 template vendor/service (`bridge`, `pppoe`, `fiberhome_veip`, `zte_full`, `zte_single`, `huawei_full`, `zte_multi`) dalam satu blok `if/elif` raksasa (~500 baris) di dalam `register_vendor_template`. Bukan bug, tapi risiko regresi tinggi tiap kali menambah/mengubah template — perubahan di satu vendor gampang tidak sengaja menyenggol vendor lain di fungsi yang sama

#### Diperbaiki
- **Safety net dulu, baru refactor**: sebelum menyentuh kode, ditulis 7 test golden-snapshot (`TestVendorTemplateCommandSequences`) yang menangkap urutan PERINTAH CLI PERSIS yang dikirim tiap template (lewat koneksi Telnet yang di-mock) — diambil dari perilaku kode LAMA yang sedang berjalan, bukan dari membaca kode. Ini jadi bukti konkret "identik sebelum/sesudah", bukan cuma review manual
- Ketujuh blok `elif template == 'X':` diekstrak apa adanya (copy-paste, tidak ada perubahan logika) jadi method terpisah `_provision_bridge`, `_provision_pppoe`, `_provision_fiberhome_veip`, `_provision_zte_full`, `_provision_zte_single`, `_provision_huawei_full`, `_provision_zte_multi` — dipanggil dari satu dictionary dispatcher `provision_fn = {...}.get(template)`. Closure `sc`/`sc_warn`/`sc_tcont` (pembangun perintah CLI, tetap didefinisikan di `register_vendor_template`) diteruskan sebagai parameter, bukan diubah strukturnya
- **Test golden menangkap 1 bug ekstraksi nyata**: alias `_json_ssid` (`import json as _json_ssid`) yang tadinya berada di scope fungsi induk jadi tidak terjangkau di 2 method hasil ekstraksi (`_provision_zte_full`, `_provision_zte_multi`) — `NameError` langsung ketahuan dari test yang gagal, diperbaiki dengan `import json as _json_ssid` lokal di kedua method tersebut (mengikuti gaya lazy-import yang sudah ada di file ini)

#### Ditemukan Sekaligus (Bonus, Mendesak — Sudah Di-ship Terpisah)
- Saat menyiapkan test golden, ditemukan bug regresi AKTIF DI PRODUKSI dari Temuan 1 (lihat entri terpisah "Hotfix" di atas) — `extra.services` yang dikirim sebagai JSON string ditolak salah oleh sanitasi CLI. Sudah di-hotfix dan di-deploy sebelum melanjutkan refactor ini

#### Ditemukan Tapi SENGAJA TIDAK Diperbaiki (Di Luar Cakupan Refactor Murni)
- Bug laten di blok `zte_multi` (dipertahankan apa adanya): `global_download = extra.get('traffic_profile', '') or traffic_profile` — variabel `traffic_profile` di ruas kanan `or` **tidak pernah didefinisikan** di scope manapun. Kalau `extra.traffic_profile` kosong/tidak diisi, baris ini akan `NameError`. Test golden tidak menangkap ini karena payload uji selalu menyertakan `traffic_profile` yang truthy (jadi `or` short-circuit sebelum sempat mengevaluasi nama yang undefined). Ini bug PRA-EXISTING (sudah ada sebelum refactor), sengaja dipertahankan identik sesuai aturan "refactor murni, perilaku tidak boleh berubah" — layak jadi perbaikan terpisah kalau diminta

#### Diverifikasi
- 7 test golden-snapshot lulus, membuktikan urutan perintah CLI identik byte-per-byte untuk semua 7 template dibanding sebelum refactor
- Full suite tetap 242 passed/2 skipped (termasuk `tests/test_provisioning.py` yang juga menyentuh `register_vendor_template`)

### 2026-09-16 — Hotfix: Sanitasi CLI Salah Menolak `extra.services` yang Dikirim sebagai JSON String (Regresi dari Temuan 1)

#### Ditemukan
- Saat menyiapkan test regresi untuk refactor Temuan 5 (audit sebelumnya), ditemukan bug aktif di produksi: `RegisterWizard.tsx` mengirim `extra.services` (dan berpotensi `extra.vlans`/`extra.ssids`/`extra.lan_vlans`) sebagai **string hasil `JSON.stringify(...)`** — bukan array/objek JSON bersarang biasa — karena `telnet_client.py` memang mem-parsing-nya sendiri lewat `json.loads()`
- Sanitasi CLI dari Temuan 1 (`cli_sanitize.py::sanitize_cli_dict`) memperlakukan string ini seperti field teks bebas biasa — tanda kutip yang wajib ada di JSON kena tolak sebagai karakter berbahaya, dan payload multi-service dengan mudah melebihi batas 64 karakter. **Dikonfirmasi lewat test terhadap endpoint sungguhan**: payload `zte_multi` yang sah (persis seperti yang dikirim RegisterWizard) ditolak 400 "services: maksimal 64 karakter" — provisioning ONU dengan banyak service jadi tidak bisa dipakai sama sekali sejak Temuan 1 di-deploy

#### Diperbaiki
- `cli_sanitize.py::sanitize_cli_dict` sekarang mengenali field kontainer JSON yang dikenal (`services`, `vlans`, `ssids`, `lan_vlans`): kalau nilainya string, di-parse dulu lewat `json.loads()`, baru hasil parse-nya disanitasi secara rekursif (bukan string mentahnya) — field JSON-nya gagal parse tetap ditolak jelas, tapi field STRING DI DALAM struktur JSON itu (mis. `services[0].username`) tetap disanitasi penuh, jadi celah injeksi yang ditutup Temuan 1 tidak terbuka lagi lewat jalur ini

#### Diverifikasi
- 2 test baru: payload `extra.services` yang sah (JSON string, banyak service) sekarang lolos sanitasi; percobaan injeksi newline yang disisipkan DI DALAM salah satu field JSON tersebut tetap ditolak 400
- Dikonfirmasi kedua test **gagal di kode yang sedang live di produksi** (kode Temuan 1 sebelum hotfix ini) dan **lulus setelah fix**

### 2026-09-16 — Security Hardening: Warning Rate-Limit Login Tidak Akurat Tanpa Redis di Deployment Multi-Worker (Audit Temuan 4)

#### Latar Belakang
- `helpers.py` punya fallback in-memory (`_login_attempts` dict) kalau Redis tidak dikonfigurasi. Ini per-proses — kalau deployment production pakai gunicorn/uvicorn dengan >1 worker tanpa Redis, proteksi brute-force efektif jadi `5 × jumlah_worker` percobaan, bukan 5 seperti yang terlihat dari kode
- Dipilih Opsi B (lebih tegas) dari 2 opsi yang diajukan: warning level ERROR di startup log, bukan cuma dokumentasi pasif — supaya kelihatan jelas di log production kalau kombinasi ini terjadi

#### Diperbaiki
- `config.py`: warning ERROR di startup (mengikuti pola yang sama seperti warning `DevelopmentConfig` yang sudah ada) kalau `FLASK_ENV=production` DAN `REDIS_URL` kosong — tidak `raise` (Redis memang opsional untuk fitur lain juga), tapi cukup keras supaya tidak mudah terlewat
- `README.md`: penjelasan di tabel environment variable + catatan khusus soal implikasi `5 × N worker`

#### Diverifikasi
- 3 test baru (`TestRedisRateLimitWarning`): warning muncul saat production+tanpa Redis, TIDAK muncul saat production+dengan Redis, TIDAK muncul saat development+tanpa Redis (fallback in-memory wajar untuk server single-process) — dikonfirmasi gagal di kode lama, lulus di kode baru

### 2026-09-16 — Security Fix: Sumber IP Client yang Konsisten untuk Rate-Limit Login & Audit Log (Audit Temuan 3)

#### Ditemukan
- `app.py` sudah memasang `ProxyFix(x_for=1, ...)`, yang seharusnya membuat `request.remote_addr` otomatis berisi IP client asli (dipercaya dari SATU hop reverse proxy). Tapi `routes_auth.py::api_login` dan `helpers.py::log_action` masih membaca header `X-Forwarded-For`/`X-Real-IP` secara manual dan mengambil elemen **pertama** — nilai yang sepenuhnya dikontrol oleh pengirim request, bukan yang ditambahkan oleh proxy tepercaya
- Dikonfirmasi lewat test: kirim `X-Forwarded-For: 9.9.9.9, 127.0.0.1` (mensimulasikan attacker menaruh IP palsu di depan, nginx menambahkan IP asli di belakang) — kode lama mencatat rate-limit & audit log pakai `9.9.9.9` (bisa diganti-ganti bebas untuk lolos dari lockout 5x percobaan), bukan `127.0.0.1` yang benar

#### Diperbaiki
- `routes_auth.py::api_login` dan `helpers.py::log_action` sekarang pakai `request.remote_addr` (hasil normalisasi `ProxyFix`) alih-alih parsing header manual
- Digrep seluruh repo untuk pemakaian manual `X-Forwarded-For`/`X-Real-IP` lain — cuma 2 tempat itu yang relevan di Flask app (ada satu lagi di `api_async.py`, tapi itu proses FastAPI terpisah dengan model kepercayaan proxy yang berbeda dan sudah diuji tersendiri di `tests/test_security.py` — di luar cakupan temuan ini, dicatat terpisah kalau perlu ditinjau)
- Ditambahkan dokumentasi di `.env.example` dan `README.md`: jumlah proxy (`x_for=1`) harus disesuaikan kalau ada lebih dari satu reverse proxy di depan aplikasi (mis. load balancer + Nginx)

#### Diverifikasi
- 3 test baru (`TestTrustedClientIP`): rate-limit tercatat pakai hop tepercaya bukan header yang dispoof, attacker tidak bisa reset bucket rate-limit dengan mengganti-ganti nilai pertama XFF, audit log (`ActionLog.ip_address`) mencatat IP yang benar
- Dikonfirmasi ketiganya **GAGAL di kode lama** (rate-limit & audit log memang tercatat pakai IP yang dispoof) dan **LULUS di kode baru**

### 2026-09-16 — Security Fix: Paksa Ganti Password Default admin/admin123 (Audit Temuan 2)

#### Ditemukan
- `app.py` men-seed user `admin` dengan password `admin123` saat instalasi pertama, tanpa mekanisme apa pun yang memaksa admin menggantinya sebelum memakai aplikasi — kredensial default yang dikenal publik ini bisa tetap aktif selamanya kalau admin tidak sadar/lupa menggantinya

#### Diperbaiki
- Kolom baru `must_change_password` (Boolean, default `False`) di model `User` — migration Alembic baru (`77cd667a1e6b`) + `add_col()` di `app.py` untuk instalasi existing (default `0`/False untuk SEMUA baris lama, **tidak retroaktif** — admin yang sudah pernah ganti password tidak akan tiba-tiba diminta ganti lagi)
- Hanya user `admin` hasil seeding awal yang di-set `must_change_password=True`, dilakukan tepat di titik seeding (`app.py::seed_initial_data`)
- Response `POST /api/auth/login` dan `GET /api/auth/me` (`routes_auth.py`) sekarang menyertakan flag `must_change_password` — disertakan di KEDUA endpoint sekaligus (bukan cuma salah satu) supaya tidak mengulang bug staleness yang sebelumnya pernah ditemukan di sesi ini (nama/logo perusahaan sempat balik ke default setelah login karena cuma salah satu endpoint yang lengkap)
- `ProtectedRoute` di `App.tsx` (frontend) mengalihkan paksa ke halaman My Profile (form ganti password yang sudah ada, di-reuse) kalau `must_change_password` true — memblokir akses ke halaman lain sampai password diganti. Card banner baru di My Profile menjelaskan kenapa
- Mengganti password lewat `POST /api/profile` otomatis membersihkan flag (`routes_users.py`)

#### Bug yang Ditemukan Sekaligus Diperbaiki Saat Verifikasi
- Implementasi awal pengalihan paksa pakai `window.location.pathname` untuk mengecek path saat ini — ternyata race condition dengan siklus render React Router menyebabkan **redirect loop** (URL sempat memantul lewat `/dashboard/admin` → `/` → `/login` → `/dashboard` berkali-kali sebelum akhirnya "settle" di URL yang benar, tapi halaman tetap kosong/tidak pernah benar-benar render). Diperbaiki dengan memakai hook `useLocation()` dari React Router (reaktif terhadap render, bukan API browser mentah) — dikonfirmasi lewat browser sungguhan: sekarang halaman My Profile langsung render normal dengan banner, tanpa loop

#### Diverifikasi
- 5 test baru (`TestForcedPasswordChange`): instalasi baru (simulasi DB kosong) menghasilkan admin dengan flag true, response login menyertakan flag, user biasa (bukan hasil seed) flag-nya false, ganti password membersihkan flag, admin existing tidak ter-flag retroaktif oleh migration — full suite 227 passed/2 skipped
- Migration Alembic dites end-to-end: dari DB kosong sampai revision terbaru (termasuk migration baru ini) berhasil tanpa error, kolom baru terkonfirmasi ada dengan tipe & default yang benar
- Dites visual langsung di browser: login dengan akun ber-flag → langsung dialihkan ke My Profile dengan banner peringatan → coba pindah halaman manual → tetap dipentalkan balik ke My Profile → ganti password → berhasil pindah halaman normal

### 2026-09-16 — Security Fix: Sanitasi Input Sebelum Dikirim sebagai Perintah CLI Telnet ke OLT (Audit Temuan 1)

#### Ditemukan
- Di `telnet_client.py`, field bebas dari request provisioning — nama/password SSID WiFi, kredensial ACS TR069, username/password PPPoE, nama service, nama profile TCONT/traffic/SLA, nama/deskripsi ONU — langsung disisipkan ke perintah CLI Telnet lewat f-string (mis. `sc(f'ssid ctrl {wp} name {ssid_name} hide {hide_str}')`, `sc(f'tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}')`) tanpa sanitasi memadai
- Satu tempat (nama SSID) sempat melakukan `.replace(' ', '_')`, tapi ini **tidak menghapus karakter newline (`\n`, `\r`)**. Karena sesi Telnet ke OLT berbasis baris teks (`tn.write(command + '\n')`), user dengan izin `add_onu` saja bisa menyisipkan baris perintah CLI tambahan lewat field seperti nama SSID atau password ACS — berpotensi mengeksekusi perintah lain di sesi OLT yang sama (mis. `no onu`, reboot)
- Dikonfirmasi lewat test regresi: sebelum fix, payload provisioning dengan `wifi_config.ssids[0].name = "Evil\nno onu 1"` memang diproses sampai ke titik mencoba koneksi Telnet ke OLT dengan data yang belum tersanitasi — bukan cuma teori

#### Diperbaiki
- Modul baru `cli_sanitize.py`: `sanitize_cli_text()` (whitelist karakter aman, tolak `\n`/`\r`/karakter kontrol/metakarakter shell `;|&`$<>"'\`, batasi panjang per jenis field — SSID name 32 char, password 63 char, dll sesuai batas wajar ZTE C320), `sanitize_cli_int()` (cast angka untuk field seperti VLAN, tolak kalau bukan angka valid), dan `sanitize_cli_dict()` (jalan rekursif ke seluruh struktur `wifi_config`/`tr069_config`/`extra`/`services[]`, menyanitasi SEMUA field teks di dalamnya sekaligus, melaporkan path field yang bermasalah kalau gagal)
- Dipasang di **titik masuk HTTP** (`routes_onu.py` — endpoint `/api/provision/unified` dan `/api/pre-register`): input divalidasi sebelum diteruskan ke `telnet_client.py` sama sekali; gagal validasi → HTTP 400 dengan pesan jelas (bukan diam-diam di-strip)
- Dipasang lagi sebagai **pertahanan berlapis** di titik masuk 5 fungsi registrasi `telnet_client.py` (`register_onu`, `configure_onu_profile`, `register_and_configure`, `register_vendor_template`, `register_unified`) — supaya tetap aman kalau suatu saat ada caller lain yang tidak lewat kedua endpoint HTTP di atas

#### Diverifikasi
- 16 test baru (`TestCliSanitize`, `TestProvisioningInputSanitization`): newline/CR/karakter kontrol/metakarakter shell ditolak, input alfanumerik normal tetap lolos tanpa perubahan (no-regression, dites end-to-end sampai ke pemanggilan `telnet_client.py` yang di-mock), field kepanjangan ditolak, kedua endpoint provisioning (unified & legacy pre-register) tercakup
- Semua 16 test dikonfirmasi **GAGAL di kode lama** (payload jahat benar-benar sampai mencoba konek Telnet ke OLT palsu, bukan langsung ditolak) dan **LULUS di kode baru**

### 2026-09-16 — Fitur Baru: Alert Kalau Auto-Sync Macet/Berhenti (Follow-up Audit Interval 5 Menit)

#### Latar Belakang
- Setelah dicek: auto-sync tiap 5 menit di produksi aman (30-60 detik per run, skip cuma 7x dari 12.588 run dalam 45 hari). Tapi ditemukan histori: kalau BANYAK OLT butuh full-sync (Telnet+config) bersamaan, seluruh proses `auto_sync.py` pernah jalan ~15 menit — cukup lama untuk beberapa siklus cron ke-skip total. Auto_sync.py sendiri tidak bisa mendeteksi kalau CRON-NYA BERHENTI JALAN SAMA SEKALI (script crash, cron daemon mati, dll) — karena proses yang mati tidak bisa melaporkan ketidakhadirannya sendiri

#### Ditambahkan
- Check baru `_check_sync_staleness` di `alerts.py` (jalan di background thread yang SAMA yang sudah memonitor status ONU/OLT, terpisah dari cron auto_sync — supaya tetap bisa mendeteksi walau cron-nya sendiri yang mati): untuk tiap OLT yang SNMP-nya masih bisa dihubungi tapi `OLTSyncStatus.completed_at` sudah lebih dari 20 menit (4x interval normal — jauh di atas kasus "sekali skip" yang wajar), kirim notifikasi peringatan (severity `warning`, kategori `sync_stale`) lewat jalur yang sudah ada (bell notification, Telegram, WhatsApp — sesuai toggle di Alert Settings) — auto-resolve begitu sync berhasil lagi
- OLT yang belum pernah sync sama sekali (baru ditambahkan) TIDAK dianggap stale — itu normal, bukan tanda macet
- OLT yang SNMP-nya mati duluan tidak double-alert — sudah ada alert `olt_offline` terpisah, sync stale di situ cuma gejala, bukan masalah baru
- Kategori baru "SYNC TERTUNDA" muncul di halaman Alert History dengan ikon & warna sendiri

#### Ditemukan Sekalian (Bonus)
- `tzdata` belum terdaftar di `requirements.txt` — di Linux produksi ini nggak kelihatan masalah karena OS sudah punya tzdata sistem, tapi di Windows atau container minim (mis. Alpine) `zoneinfo.ZoneInfo('Asia/Jakarta')` yang dipakai di seluruh `alerts.py` untuk format waktu akan langsung error. Ditambahkan sebagai dependency

#### Diverifikasi
- 5 test baru: tidak alert kalau baru sync (< 20 menit), tidak alert untuk OLT yang belum pernah sync, alert kalau memang stale (> 20 menit), tidak alert untuk OLT yang SNMP-nya memang dimatikan, dan notifikasi auto-resolve begitu sync berhasil lagi — full suite tetap hijau
- Dites visual di browser: notifikasi "Auto-Sync Tertunda" muncul dengan benar di bell dropdown topbar dan di halaman Alert History dengan label/ikon/warna yang sesuai

### 2026-09-16 — Audit Toast Notification: Overflow di Mobile Sempit + Bisa Menutupi Layar Kalau Beruntun

#### Diminta User
- Audit posisi & tampilan toast notification di desktop dan mobile

#### Ditemukan Saat Audit
- **Mobile (viewport < ~375px, misal 360px — lebar Android yang sangat umum)**: kontainer toast (`Toast.tsx`) cuma di-set `right-4` (tanpa `left`) dengan lebar `w-full` dibatasi `max-w-sm` (384px) — begitu `viewport width < right offset + lebar toast`, box-nya overflow ke luar layar sebelah kiri. Dikonfirmasi lewat pengukuran geometri langsung di browser: di 360px box mulai dari `x=-15px` (kepotong 15px di kiri layar), di 320px (lebar umum lain) juga overflow. Baru "aman" mulai ~390px ke atas
- **Desktop & mobile (semua ukuran)**: kontainer toast tidak dibatasi jumlahnya — dikonfirmasi dengan menumpuk 5 toast sekaligus (skenario realistis karena app ini push notifikasi alert lewat WebSocket, beberapa ONU bisa offline bersamaan), hasilnya menutupi SELURUH kartu statistik dashboard di desktop, dan di mobile menutupi hampir seluruh konten di atas layar (judul halaman, tombol Sync All/Refresh, semua kartu status)

#### Diperbaiki
- Kontainer toast sekarang pakai `left-4` + `right-4` (margin kiri-kanan sama besar) di mobile, lalu `sm:left-auto` di layar ≥640px supaya balik ke gaya lama (nempel kanan atas, lebar dibatasi `max-w-sm`) — tidak overflow di lebar layar berapa pun, dites dari 320px sampai 1440px
- Ditambah batas maksimal 4 toast tampil bersamaan (`MAX_VISIBLE`) — toast baru yang masuk saat sudah penuh otomatis menggeser yang paling lama, supaya tumpukan alert beruntun tidak menutupi seluruh layar

#### Diverifikasi
- 2 test baru di `frontend/src/__tests__/Toast.test.tsx` (jsdom/Vitest — juga menemukan & memperbaiki gap terpisah: `jsdom` belum ter-install padahal sudah dikonfigurasi di `vitest.config.ts`, jadi test yang butuh DOM belum pernah bisa jalan sebelumnya): satu mengecek class positioning, satu mengecek logika cap 4-toast — keduanya dikonfirmasi GAGAL di kode lama dan LULUS di kode baru
- Dites visual & geometri langsung di browser (Playwright) di 5 lebar layar (320/360/375/390/1440px) — semua sekarang pas di dalam viewport, tidak ada lagi yang kepotong
- Full suite backend tetap hijau, build frontend bersih

### 2026-09-16 — Fix: Nama Perusahaan & Logo Balik ke Default Setelah Logout-Login (Harus Hard Refresh)

#### Diminta User
- Nama perusahaan & logo yang sudah disimpan balik ke default begitu logout lalu login lagi — baru muncul lagi setelah hard refresh manual

#### Ditemukan Saat Audit
- Root cause: response `POST /api/auth/login` (`routes_auth.py`) TIDAK menyertakan `sidebar_name` maupun `logo_url` — cuma id/nama/role/permission. Padahal `/api/auth/me` (yang dipakai saat app pertama kali dimuat) SUDAH menyertakan keduanya
- Setelah login berhasil, `useAuth.login()` di frontend langsung memakai data dari response login itu apa adanya (tanpa fetch ulang), lalu pindah ke `/dashboard` secara client-side (SPA navigation, bukan reload) — jadi sidebar & topbar langsung baca `sidebar_name`/`logo_url` yang `undefined` dari response login, dan jatuh ke default. `App.tsx` cuma manggil `fetchUser()` (yang datanya lengkap) sekali saat APP PERTAMA KALI di-mount — makanya cuma hard refresh yang bisa "membetulkan" karena itu me-mount ulang App dari nol
- Bonus temuan lain waktu verifikasi pakai Playwright: `ProtectedRoute` di `App.tsx` menampilkan spinner loading FULL PAGE setiap kali `fetchUser()` dipanggil di mana pun (termasuk dari tengah sesi, misal setelah upload logo di My Profile) — ini bikin seluruh `AppShell` + halaman yang lagi dibuka unmount lalu mount ulang, jadi field form yang sedang diisi (misal lagi ngetik nama brand baru) ke-reset tiba-tiba tanpa peringatan

#### Diperbaiki
- `POST /api/auth/login` sekarang menyertakan `sidebar_name` & `logo_url`, sama seperti `/api/auth/me` — jadi begitu login sukses, data branding-nya sudah lengkap dari awal, tidak perlu request tambahan atau hard refresh
- `ProtectedRoute` sekarang cuma menampilkan spinner loading kalau BELUM ada user sama sekali (`loading && !user`) — bukan setiap kali `loading` jadi `true`. Jadi `fetchUser()` yang dipanggil di tengah sesi (setelah save profile, upload logo, dll) tidak lagi bikin halaman yang sedang dibuka unmount/remount

#### Diverifikasi
- 1 test baru: login dengan `SystemConfig` custom (`nms_name`, `nms_logo_url`) terisi, response login harus langsung membawa keduanya — full suite 201 passed/2 skipped
- Dites end-to-end di browser (skenario persis laporan user): set nama brand + upload logo → logout lewat menu user asli di topbar → login lagi TANPA reload apa pun → sidebar & logo langsung tampil benar sejak render pertama, bukan setelah hard refresh

---

### 2026-09-16 — Fix: Kotak Logo Diberi Latar Putih (Logo Hitam Tidak Kelihatan di Latar Gelap)

#### Diminta User
- Logo custom yang berwarna hitam tidak kelihatan karena kotak logo di sidebar/topbar/halaman login pakai latar warna accent/gelap

#### Diperbaiki
- 6 tempat yang menampilkan logo (`AuthLayout` desktop & mobile, `Sidebar` expanded & collapsed, `Topbar` mobile, preview di `MyProfile`) sekarang pakai latar putih + sedikit padding KHUSUS saat logo custom sedang ditampilkan — supaya logo warna apa pun (termasuk hitam) tetap kontras. Kalau belum ada logo custom, kotak tetap pakai ikon & warna default seperti sebelumnya (tidak ada perubahan tampilan untuk instalasi yang belum upload logo)
- Bonus temuan waktu verifikasi: proxy Vite dev server (`vite.config.ts`) cuma meneruskan `/api` dan `/auth` ke backend, tidak `/static` — jadi logo yang baru diupload gagal tampil pas testing lokal (`pnpm dev`), padahal di produksi (Nginx) sudah benar. Ditambahkan `/static` ke proxy supaya testing lokal akurat; tidak ada dampak ke behavior produksi

#### Diverifikasi
- TypeScript build bersih, full suite tetap 200 passed/2 skipped
- Dites visual langsung di browser (logo lingkaran hitam solid): sekarang kontras jelas di halaman login, sidebar (expanded & collapsed), dan preview My Profile — dibandingkan sebelumnya yang nyaris tidak kelihatan di latar gelap

---

### 2026-09-16 — Fitur Baru: Upload Logo Perusahaan (Branding Custom, Tidak Lagi Default)

#### Diminta User
- Bisa upload logo sendiri supaya NMS tampil dengan nama & logo perusahaan masing-masing, bukan logo default aplikasi

#### Ditambahkan
- Endpoint baru `POST /api/profile/logo` (upload, super admin only — PNG/JPG/WEBP/GIF, maks 2MB, divalidasi lewat ekstensi + magic bytes supaya file yang bukan gambar asli ditolak) dan `DELETE /api/profile/logo` (reset ke logo default) — disimpan di `static/uploads/company-logo.<ext>`, URL-nya dicatat di `SystemConfig` key `nms_logo_url` (pola yang sama dengan `nms_name` yang sudah ada untuk custom brand name)
- `logo_url` sekarang ikut dikirim di `/api/public/branding` (dipakai halaman login) dan `/api/auth/me` (dipakai sidebar & topbar setelah login)
- Card "Company Logo" baru di halaman My Profile (khusus super admin) — preview logo saat ini, tombol Upload, dan tombol Reset ke Default
- Logo custom otomatis tampil menggantikan ikon default di 4 tempat: halaman login (desktop & mobile), sidebar (expanded & collapsed), dan topbar mobile — kalau belum ada logo custom, tetap tampil ikon default seperti sebelumnya (tidak ada breaking change untuk instalasi yang belum pakai fitur ini)

#### Diverifikasi
- 5 test baru: non-super-admin ditolak (403), upload valid langsung muncul di `/api/public/branding` & `/api/auth/me`, file yang menyamar (nama `.png` tapi isinya bukan gambar) ditolak, ekstensi tidak diizinkan (mis. `.svg`) ditolak, reset menghapus file & mengembalikan ke default — full suite 200 passed/2 skipped
- Dites langsung di browser (Playwright): login → My Profile → upload logo → sidebar langsung berubah tanpa perlu reload → tetap muncul setelah reload halaman → logout → halaman login menampilkan logo custom yang sama → login lagi → klik Reset ke Default → sidebar kembali ke ikon default. Nol error console di semua langkah

---

### 2026-09-10 — Audit WebSocket: 4 Koneksi Redundan ke `/ws/dashboard` Jadi 1 Koneksi Bersama

#### Ditemukan Saat Audit (Diminta User — Error di Console: "WebSocket is closed before the connection is established")
- Ditelusuri ke 4 tempat berbeda (`Topbar`, `Dashboard`, `AllOnus`, `FtthInfrastructure`) yang **masing-masing** memanggil `useWebSocket('/ws/dashboard', ...)` sendiri-sendiri — 4 koneksi WebSocket terpisah ke endpoint yang SAMA PERSIS, untuk tujuan yang sama persis (invalidate query cache saat ada event alert/onu_change)
- `Topbar` hidup di layout `AppShell` yang persisten (tidak pernah unmount), tapi 3 halaman lainnya mount/unmount setiap kali pindah halaman — jadi tiap kali pindah Dashboard ↔ All ONUs ↔ FTTH, koneksi WebSocket punya halaman itu di-tutup lalu dibuka ulang dari nol (fetch token baru, handshake baru)
- Pesan error browser "WebSocket is closed before the connection is established" muncul spesifik kalau JS kita sendiri memanggil `.close()` pada koneksi yang belum selesai handshake — cocok dengan pola 4 koneksi yang saling silang saat navigasi cepat

#### Diperbaiki
- Dibuat 1 koneksi `/ws/dashboard` yang dibagikan lewat React Context (`useDashboardWs`), dipasang sekali di level `AppShell` — Topbar dan ketiga halaman sekarang tinggal "dengar" dari context yang sama, bukan buka koneksi sendiri-sendiri
- Ditambah proteksi di `useWebSocket` sendiri: kalau `connect()` kepanggil lagi sebelum panggilan sebelumnya selesai ambil token (async), yang lama otomatis dibatalkan — supaya tidak ada 2 percobaan koneksi tabrakan biarpun cuma ada 1 instance hook

#### Diverifikasi
- Build frontend bersih, nol error TypeScript
- Dites langsung di browser (Playwright): navigasi bolak-balik Dashboard → All ONUs → FTTH → Dashboard → All ONUs (klik link asli, bukan reload halaman) — **koneksi `/ws/dashboard` sekarang tidak pernah tertutup/terbuka ulang sama sekali** selama navigasi (sebelumnya setiap pindah halaman = 1 siklus tutup-buka), nol error console

---

### 2026-09-09 — Full Sync Bisa Hapus Ratusan ONU Asli Kalau Walk-nya Cuma Kepotong Setengah Jalan

#### Ditemukan Saat Audit (Diminta User: OLT 500+ ONU, Data Kadang Tidak Lengkap Pas Auto-Sync)
- Ditelusuri ke `sync_helper.py::save_sync_result` — untuk **light sync** (tiap 5 menit) sudah ADA proteksi: kalau SNMP walk cuma berhasil ambil sebagian ONU (misal karena timeout di OLT besar), ONU yang "kelewat" TIDAK dihapus, cuma dihitung tetap di total (komentar di kode sudah eksplisit bilang ini: "SNMP walk might miss some in a single pass")
- Tapi **full sync** (sync pertama kali untuk OLT baru + tiap 6 jam) **TIDAK PUNYA proteksi yang sama** — kode-nya menghapus SEMUA ONU yang "tidak kelihatan" di hasil sync ini, tanpa cek apakah hasilnya memang cuma sebagian (partial) atau benar-benar lengkap
- **Dikonfirmasi lewat test, bukan dugaan**: 500 ONU sudah ada di DB, full sync berikutnya cuma berhasil ambil 50 (walk kepotong ~90% jalan) — kode lama **menghapus 450 ONU asli yang masih online**, bukan cuma "tidak update," benar-benar dihapus dari database

#### Diperbaiki
- Full sync sekarang pakai proteksi yang sama seperti light sync: kalau OLT punya ≥20 ONU dari sync sebelumnya, DAN hasil sync kali ini kurang dari 90% jumlah itu — dianggap partial walk, tidak ada yang dihapus (ONU yang kelewat tetap disimpan datanya, cuma dihitung tetap di total), dan dicatat WARNING di log supaya kelihatan kalau ini masih sering kejadian
- OLT kecil (<20 ONU) kehilangan sebagian unit dalam satu putaran tetap dianggap normal (misal pelanggan cabut ONU) dan tetap dihapus seperti biasa — proteksi ini cuma aktif untuk pola "kehilangan besar-besaran mendadak" yang jadi ciri khas walk yang kepotong, bukan penghapusan wajar sehari-hari

#### Diverifikasi
- 4 test baru: partial walk 500→50 tidak menghapus apa-apa (gagal di kode lama — sempat menghapus 450!), warning ter-log, OLT kecil tetap terhapus normal, OLT besar dengan penurunan wajar (500→480) tetap terhapus normal — full suite 195 passed/2 skipped

---

### 2026-09-09 — Kemungkinan Penyebab Sisa: View ONU Tidak Ikut Antre dengan Sync yang Sedang Jalan

#### Ditemukan
- Setelah 3 perbaikan sebelumnya (buffer bleed, word-wrap TR069, word-wrap interface), user masih laporkan Remote Access/VEIP sesekali tidak muncul — kali ini tidak selalu reproducible seperti 3 bug sebelumnya (data mentah di OLT terbukti lengkap saat dicek langsung, tapi endpoint kadang balikin kosong)
- Ditelusuri: `auto_sync.py` (cron tiap 5 menit — yang baru benar-benar jalan lagi setelah perbaikan cron sebelumnya) dan sync manual sama-sama pakai **sync lock per-OLT** (`sync_lock.py`) supaya tidak saling tabrakan buka sesi telnet ke OLT yang sama. Tapi halaman **View ONU** (`collect_onu_detail()`, dipakai tombol Refresh Live) **tidak pernah ikut memakai lock ini** — bisa buka sesi telnet sendiri ke OLT yang sama persis saat sync (auto atau manual) sedang jalan, tanpa koordinasi sama sekali
- Ini kandidat kuat penyebab sisa gejala yang masih sesekali muncul: dua sesi telnet terpisah aktif bersamaan ke OLT yang sama, saling mengganggu urutan/waktu respons di sisi OLT

#### Diperbaiki
- View ONU sekarang ikut memakai sync lock yang sama sebelum buka sesi telnet-nya sendiri — tunggu maksimal 5 detik kalau sync sedang jalan, baru lanjut. Kalau setelah 5 detik masih terkunci, tetap lanjut jalan (supaya halaman tidak macet nunggu sync yang bisa makan waktu 60-90 detik), tapi dicatat ke log supaya kelihatan kalau ini masih sering kejadian

#### Diverifikasi
- 3 test baru (lock diambil & dilepas dengan benar, tetap dilepas walau `collect_onu_detail` error, tetap jalan meski lock gagal diambil) — full suite 191 passed/2 skipped
- **Catatan jujur**: ini kandidat penyebab yang masuk akal dan sudah diperbaiki, tapi BEDA dengan 3 bug sebelumnya — tidak bisa direproduksi 100% secara langsung (butuh timing pas bareng sync beneran jalan). Perlu dipantau lagi setelah deploy apakah keluhan Remote Access/VEIP sesekali hilang ini benar-benar hilang atau masih ada penyebab lain.

---

### 2026-09-09 — Audit Lanjutan: Section Interface (TCONT/Gemport/Service-Port) Juga Rentan Kena Word-Wrap

#### Ditemukan Saat Audit (Diminta User Setelah Fix TR069)
- Setelah fix word-wrap TR069, diaudit lebih luas: apakah bug sejenis (baris config ke-wrap OLT lalu ke-gabung salah) ada di tempat lain
- Ditemukan **dua gap nyata**:
  1. `cfg_interface` (section tcont/gemport/service-port) tidak pernah melewati fungsi penggabung wrap sama sekali — kalau ada baris di situ yang cukup panjang (mis. nama profile custom yang panjang), bisa kena corruption yang sama seperti kasus TR069 kemarin, tapi belum pernah diperbaiki
  2. Kalaupun langsung diterapkan begitu saja, daftar kata kunci "awal baris baru" yang dipakai fungsi penggabung **tidak punya `tcont `, `gemport `, `service-port `** — dicoba langsung (dites, bukan dugaan): SEMUA baris tcont/gemport/service-port jadi tergabung jadi satu baris raksasa, sama sekali rusak

#### Diperbaiki
- `cfg_interface` sekarang ikut diproses lewat fungsi penggabung wrap yang sama, sesaat setelah diambil dari OLT — otomatis berlaku untuk semua pemakaian di bawahnya
- Kata kunci `tcont `, `gemport `, `service-port ` ditambahkan ke daftar, supaya baris-baris ini tetap dikenali sebagai baris baru masing-masing (tidak ketiban gabung ke baris sebelumnya)

#### Diverifikasi
- 2 test baru: satu membuktikan baris tcont/gemport/service-port yang terpisah TETAP terpisah (sempat gagal saat kata kuncinya belum ditambahkan — persis skenario yang ditakutkan di atas), satu lagi membuktikan baris yang sengaja dibuat panjang untuk ke-wrap tetap tergabung benar — full suite 188 passed/2 skipped
- Dites ulang ke 3 ONU asli di produksi (termasuk edisetiadi@rw03) — tcont_profiles, wan service mode, running config semua tetap benar setelah perubahan, tidak ada regresi untuk config pendek yang normal

---

### 2026-09-09 — TR069 Tidak Muncul Kalau Baris Config-nya Kena Word-Wrap OLT

#### Ditemukan
- User kirim langsung potongan running-config asli satu ONU (edisetiadi@rw03) yang TR069-nya tidak muncul di aplikasi, padahal `tr069-mgmt 1 acs ...` jelas ada di config. Baris ACS-nya kepotong OLT jadi 2 baris fisik persis di kolom ke-80: `...username acs passwo` lalu baris baru `rd ***`
- `_join_wrapped_lines()` (fungsi penggabung baris yang ke-wrap OLT) selalu menyisipkan spasi saat menggabung — cocok untuk wrap yang jatuh di antara kata, tapi salah untuk wrap yang motong DI TENGAH satu kata: "passwo" + " " + "rd ***" jadi "passwo rd ***", bukan "password ***" — sehingga regex yang mencari kata kunci literal "password" tidak pernah cocok, dan TR069 gagal ke-parse sama sekali dari config yang sebenarnya valid

#### Diperbaiki
- Baris lanjutan (wrap) sekarang digabung TANPA spasi tambahan — benar untuk kasus terpotong di tengah kata (kasus nyata di atas), dan tidak lebih buruk untuk kasus wrap di batas kata (informasi soal ada/tidaknya spasi di titik potong sudah hilang duluan sejak `.strip()`, jadi tidak ada cara sempurna tanpa tahu lebar kolom pasti — versi tanpa-spasi ini yang terbukti benar untuk kasus nyata yang dilaporkan)

#### Diverifikasi
- 2 test baru pakai persis potongan config yang dikirim user — gagal di kode lama (reproduksi identik: "passwo rd ***"), lolos di kode baru — full suite 186 passed/2 skipped
- Dites langsung ke ONU asli (edisetiadi@rw03) di OLT produksi: `tr069_entries` sekarang benar berisi ACS URL, username, VLAN 1010

---

### 2026-09-09 — Root Cause Ditemukan: Response Command Telnet Bisa "Bocor" ke Command Berikutnya

#### Ditemukan Lewat Investigasi Live di Produksi
- Setelah fix sebelumnya (di bawah) di-deploy, user laporkan justru lebih parah: PPPoE yang sebelumnya muncul jadi hilang, dan beberapa section (WAN, VEIP, TR069, WiFi, LAN) di banyak ONU (ZTE maupun Huawei) jadi tidak muncul, running config juga kelihatan tidak lengkap
- Ditelusuri LANGSUNG ke OLT produksi (bukan dugaan) — cek beberapa ONU spesifik yang dilaporkan user satu per satu lewat command manual ke OLT:
  - Satu ONU (ZTEGDD9C04FB) ternyata memang **betul-betul tidak punya section `pon-onu-mng` di running-config OLT saat ini** — dikonfirmasi 2x lewat command langsung ke OLT (bukan bug di kita; kemungkinan besar karena riwayat ONU ini sempat DyingGasp lalu beberapa kali putus-nyambung tanggal 8 Sept, config OMCI-nya belum ter-apply ulang ke OLT)
  - Dua ONU lain (HWTC2D23B69E, HWTCC890FDAA) config-nya ADA di OLT, tapi saat dites lewat `collect_onu_detail()` versi lengkap, command `show gpon remote-onu ip-host` kadang balikin **data dari command SEBELUMNYA** (`show gpon remote-onu veip`/`tr069`) — bukan data ip-host yang diminta

#### Root Cause Sesungguhnya
- `SimpleTelnet`/`SimpleSSH` di `telnet_client.py` membaca respons OLT dengan cara cari karakter prompt (`#`/`>`) di mana saja dalam buffer (`if expected in self.buffer`). Kalau karakter `#` itu muncul DI DALAM isi output suatu command (bukan prompt asli), pembacaan berhenti terlalu cepat — sisa respons command itu (termasuk prompt aslinya) **tertinggal di buffer**, lalu ke-baca ulang sebagai bagian dari respons command BERIKUTNYA, mencampur dua respons berbeda jadi satu
- Ini bug lama (bukan dari perubahan sesi ini), tapi baru ketahuan sekarang karena logging baru di fix sebelumnya membuatnya kelihatan untuk pertama kali — dan sebelumnya SELALU silently gagal (IP tidak pernah muncul untuk kasus begini, cuma tanpa jejak di log)

#### Diperbaiki
- Ditambah `drain()` di `SimpleTelnet`/`SimpleSSH`: buang semua byte sisa di buffer sebelum kirim command baru, supaya sisa respons command sebelumnya tidak pernah "bocor" mencemari command berikutnya
- Dipanggil otomatis di awal `_send_command()` — berlaku untuk SEMUA command (bukan cuma ip-host), memperbaiki reliabilitas keseluruhan komunikasi telnet/SSH ke OLT

#### Diverifikasi
- 3 test baru mensimulasikan persis skenario bocornya (satu gagal di kode lama dengan pesan error yang identik dengan gejala nyata, lolos di kode baru) — full suite 184 passed/2 skipped
- **Dites langsung ke OLT produksi** (bukan simulasi) — sebelum fix: `show gpon remote-onu ip-host` untuk ONU Huawei balikin data VEIP yang salah, field `ip` tidak pernah terisi. Setelah fix (dites pakai salinan file terpisah di server, belum di-deploy ke live saat testing): `ip: "172.16.8.22"` muncul benar, `veip_entries` yang tadinya kosong sekarang terisi data asli

---

### 2026-09-09 — WAN Service: Mode/Profile ONU Ke-2+ Bisa Salah Baca (Fallback ke Default/Bridge)

#### Ditemukan Saat Investigasi
- User laporkan: WAN IP dari DHCP tidak muncul lagi di View ONU untuk ONT Huawei (sebelumnya bisa), dan traffic/TCONT profile yang baru diubah selalu tampil balik ke default
- Ditelusuri ke `telnet_client.py` (`collect_onu_detail`, fungsi parsing config ONU dari telnet) — kode ini tidak diubah sesi ini/sebelumnya (bukan regresi baru), tapi ditemukan bug nyata yang match dengan gejalanya

#### Root Cause — Dikonfirmasi Lewat Test, Bukan Dugaan
- `wan_ip_mode` dan `pppoe_mode` adalah **satu variabel** yang di-assign ulang tiap kali baris `wan-ip N mode ...` / `pppoe N nat ...` ditemukan saat scan config ONU. Untuk ONU dengan **lebih dari satu WAN service** (umum — sampai 4 service per ONU didukung), hanya baris **terakhir** yang ke-parse yang benar; service-service lain kehilangan mode-nya secara diam-diam dan jatuh ke default "Bridge / ONU Webpage" — reproduksi test langsung menunjukkan ini (service1 seharusnya "Wan-IP - DHCP" malah jadi "Bridge / ONU Webpage" begitu ada baris `wan-ip 3 ...` lain di config yang sama)
- WAN IP dari DHCP (`show gpon remote-onu ip-host`) hanya di-assign ke service kalau ID host yang dilaporkan device **persis string `'1'`** — sebagian firmware ONT pihak ketiga (dilaporkan: sebagian unit Huawei) tidak menomori host tunggalnya sebagai "1", sehingga IP-nya gagal ditampilkan meski datanya sebenarnya ada di respons OLT

#### Diperbaiki
- `wan_ip_mode`/`pppoe_mode` diganti jadi dict yang di-key per nomor service (`wan_ip_modes`/`pppoe_modes`) — tiap service sekarang ambil entry miliknya sendiri, bukan berebut satu variabel
- Assignment WAN IP dari DHCP: kalau cuma ada **satu host** yang dilaporkan OLT sama sekali (tidak ambigu), langsung di-assign ke service Wan-IP tanpa IP — tidak lagi mensyaratkan ID-nya literal `'1'`
- Ditambah logging (`WARNING`/`DEBUG`) saat `show gpon remote-onu ip-host` balik data tapi formatnya tidak cocok label yang diharapkan, atau command-nya sendiri tidak mengembalikan data — supaya kasus yang masih gagal ke depannya bisa langsung didiagnosis dari log server, tanpa perlu akses SSH live ke OLT

#### Diverifikasi
- 3 test baru — salah satunya dikonfirmasi **gagal di kode lama** (reproduksi bug persis: service1 jadi "Bridge / ONU Webpage" padahal dikonfigurasi DHCP) dan **lolos di kode baru** — full suite 181 passed/2 skipped
- **Catatan jujur**: perbaikan ini menutup dua bug nyata yang match dengan gejala yang dilaporkan, tapi belum bisa dipastikan 100% ini akar masalah persis untuk unit Huawei spesifik user tanpa melihat raw output `show gpon remote-onu ip-host` dari perangkat itu — logging baru di atas akan menunjukkan lebih jelas kalau ternyata masih ada kasus lain yang belum tertutup

---

### 2026-09-08 — Cron Jobs (Auto-Sync/Backup) Bisa Gagal Diam-Diam Saat Install/Update

#### Ditemukan Saat Audit — Direproduksi Langsung
- User minta audit cronjob/auto-sync di VPS instalasi baru (`192.168.54.134`) — hasilnya: `crontab -l` untuk root **kosong total** (cuma header comment), padahal installer barusan selesai jalan. Semua 4 log cron (`salfanet-sync.log`, `-backup.log`, `-db-backup.log`, `-traffic.log`) 0 byte sejak dibuat — auto-sync OLT, auto-backup, DB backup, dan traffic poller **tidak pernah jalan sekali pun**
- **Root cause**: `install-vps.sh`/`deploy/vps-setup.sh`/`deploy/update_vps.sh` menulis crontab lewat `( ... ; echo "$CRON_1" ; echo "$CRON_2" ; ... ) | crontab -` — kalau subshell ini terputus di tengah jalan (mis. koneksi SSH sempat hiccup pas instalasi), `crontab -` menerima input kosong dan diam-diam menginstall crontab **kosong** tanpa satupun baris job, tanpa error apapun — installer tetap menampilkan pesan sukses ("✅ Auto-sync cron: every 5 minutes") padahal tidak benar

#### Diperbaiki
- Ketiga script sekarang menulis crontab ke file temp dulu (bukan pipe langsung), lalu **verifikasi jumlah baris job yang benar-benar masuk** (`crontab -l | grep -c ...`) — kalau kurang dari yang seharusnya, retry sekali, dan kalau tetap gagal setelah retry, tampilkan pesan **❌ FAILED** yang jelas beserta baris cron yang harus ditambahkan manual — bukan pesan sukses palsu
- `install-vps.sh`/`vps-setup.sh`: kegagalan cron sekarang juga menandai instalasi keseluruhan sebagai gagal di ringkasan akhir (bukan cuma warning yang gampang kelewat di tengah output panjang)
- VPS `192.168.54.134` yang jadi temuan awal sudah diperbaiki langsung (crontab 4 job berhasil terpasang, dikonfirmasi lewat `crontab -l`)

#### Diverifikasi
- Ketiga script di-syntax-check (`bash -n`) — lolos semua
- Logika retry+verifikasi dijalankan langsung di VPS yang bermasalah — berhasil pasang 4/4 job di percobaan pertama, dikonfirmasi via `crontab -l`

---

### 2026-09-08 — Form "Add PON Port" Bisa Pilih dari Data Sync OLT Nyata

#### Ditemukan
- User laporkan: form "Add PON Port" di tab PON Ports masih murni isian manual (ketik OLT Name/Frame/Slot/Port sendiri) — padahal sistem sudah tahu port PON asli tiap OLT dari hasil sync (SNMP/telnet), tersimpan di tabel `olt_pon_ports` (dipakai buat statistik per-PON dan diagram chassis)

#### Ditambahkan
- Endpoint baru `GET /api/ftth/pon/real/<olt_id>`: daftar PON port nyata hasil sync OLT tsb (nama port, frame/slot/port, jumlah ONU total/online), tiap port ditandai `already_mapped` kalau sudah ada entry FTTH untuk situ
- Form "Add/Edit PON Port": dropdown **OLT** (dari daftar OLT yang sudah terdaftar di sistem) — begitu dipilih, muncul dropdown **PON Port (dari OLT nyata)** berisi port hasil sync sungguhan. Pilih salah satu → PON Name/Frame/Slot/Port di bawah otomatis terisi
- Isian manual tetap tersedia sebagai fallback (OLT belum ditambahkan ke sistem, atau OLT belum pernah sync) — tidak memaksa pakai picker

#### Diverifikasi
- 4 test baru (parsing port real dari `olt_pon_ports`, penandaan `already_mapped`, OLT tidak ditemukan → 404, OLT belum pernah sync → list kosong) — full suite 178 passed/2 skipped
- Dicek langsung di browser: pilih OLT → pilih port `gpon-olt_1/1/2` dari data sync → field PON Name/Frame/Slot/Port terisi otomatis (`gpon-olt_1/1/2`, 1/1/2) sesuai data asli, nol error console

---

### 2026-09-07 — JC Fleksibel di Segmen OLT→OTB dan ODP→Pelanggan (Drop Cable)

#### Konteks
- Setelah fitur trace kabel, ditanyakan apakah JC (Joint Closure) sudah bisa disisipkan di *semua* segmen kabel (OLT→OTB, OTB→ODC, ODC→ODP, ODP→pelanggan) — sebelumnya hanya OTB→ODC dan ODC→ODP yang punya opsi "Fed From: JC" (lewat `feed_source` di `FTTHODC`/`FTTHODP`). Segmen OLT→OTB (feeder trunk) dan ODP→pelanggan (drop cable) masih kaku: harus langsung, tidak bisa dicatat kalau ada sambungan JC di tengah jalan
- User pilih implementasi di kedua segmen sekaligus

#### Ditambahkan
- Kolom baru `feed_source`/`jc_id`/`jc_core_number` di `FTTHOTB` (default `'pon'`, bisa `'jc'`) dan `FTTHODPPort` (default `'direct'`, bisa `'jc'`) — pola yang sama persis dengan yang sudah ada di ODC/ODP
- `FTTHJC.parent_type` diperluas: selain `otb`/`odc`/`jc`, sekarang juga terima `pon` (JC disambung langsung dari port PON OLT, sebelum OTB manapun ada) dan `odp_port` (JC disisipkan di kabel drop, sebelum ke pelanggan)
- Form "Edit OTB/ODF" dapat toggle "Fed From": PON Langsung (seperti biasa, diatur lewat tab PON Ports) atau JC (pilih JC + core splice, dengan preview warna core TIA-598)
- Form "Edit Port" di panel ODP dapat toggle "Kabel Drop": Langsung atau JC — port dengan drop-JC ditandai badge ungu kecil di semua tampilan (diagram, tabel, mobile)
- Form Add/Edit JC: dropdown "Fed From (parent)" sekarang punya opsi "PON Port (OLT)" dan "ODP Port (Drop Cable)" — untuk ODP Port, dipilih lewat 2 langkah (ODP dulu, baru port-nya) karena tidak ada daftar port datar per-ODP
- Tree view: baris OTB yang di-feed dari JC menampilkan anotasi "Fed by JC: <nama> (Core N)" menggantikan info OLT/PON — tree tetap berakar di OTB (bukan direstrukturisasi ke level OLT), karena OLT dan OTB biasanya satu lokasi dan segmen ini jarang dipakai
- Trace kabel (`/api/ftth/trace/onu/<id>`) dan dampak downstream (`/api/ftth/impact/...`) diperluas untuk menembus kedua segmen baru ini — satu ONU bisa lewat sampai 2 JC ekstra (feeder + drop) di luar 2 JC yang sudah ada di tengah (OTB→ODC, ODC→ODP)
- Detach otomatis saat hapus: hapus JC/splice/PON-port/ODP-port melepas (bukan cascade-delete) apa pun yang terhubung lewatnya, konsisten dengan pola yang sudah ada untuk ODC/ODP

#### Diverifikasi
- Migrasi Alembic baru dibuat & diverifikasi upgrade+downgrade+re-upgrade bersih di DB kosong; `migrate_schema()` auto-heal juga sudah menambahkan kolom yang sama di DB dev lokal
- 8 test baru (trace lewat kedua segmen baru berurutan benar, OTB dengan feed PON langsung tidak kena regresi, dampak konsisten di semua level, detach saat hapus JC/splice/PON-port/ODP-port) — full suite 174 passed/2 skipped
- Dicek langsung di browser: chain OLT→JC-feeder→OTB→ODC→ODP→JC-drop→pelanggan (7 hop) tampil benar di kartu Jalur FTTH View ONU; form Edit OTB, Edit Port ODP, dan Add JC (opsi PON Port & ODP Port) semuanya berfungsi sesuai desain, nol error console

---

### 2026-09-07 — Trace Kabel: Jalur FTTH per Pelanggan & Dampak Downstream

#### Ditemukan Saat Audit
- Diminta audit struktur FTTH supaya lebih mudah trace kabel/jalur putus (OLT → OTB → JC → ODC → ODP → pelanggan). Ditemukan: data model sudah lengkap dan Tree/Map sudah bisa di-browse, tapi ada 3 gap nyata — (1) halaman detail ONU sama sekali tidak menampilkan jalur ke atasnya, (2) tidak ada breakdown teks jalur di manapun (peta cuma highlight visual), (3) tidak ada hitung dampak downstream kalau satu titik putus

#### Ditambahkan
- **Endpoint baru** `GET /api/ftth/trace/onu/<id>`: jalur lengkap satu pelanggan dari OLT sampai ke ONU-nya (urut: OLT → PON → OTB+core → [splice JC, bisa berantai] → ODC+core → ODP+port → pelanggan). Kalau ada titik yang datanya belum lengkap (mis. ODP belum di-assign), jalur berhenti di situ dengan penanda "gap" alih-alih error — supaya langsung ketahuan bagian mana yang kurang
- **Endpoint baru** `GET /api/ftth/impact/<otb|jc|odc|odp>/<id>`: hitung rekursif semua pelanggan downstream dari satu titik (lewat berapa pun hop JC di tengahnya) — buat prioritas perbaikan kalau kabel utama putus
- **Kartu "Jalur FTTH" di halaman View ONU**: breadcrumb visual OLT→OTB→JC→ODC→ODP→pelanggan lengkap dengan nomor core/splice/port di tiap titik
- **Ikon "Dampak" (orang) di tiap baris Tree view** (OTB/JC/ODC/ODP): klik untuk modal berisi jumlah pelanggan terdampak (total/online/offline) + daftar nama
- Panduan FTTH dan View ONU diperbarui dengan langkah baru untuk kedua fitur ini
- **Diverifikasi**: 8 test baru (urutan hop benar melewati 2 JC, ONU tanpa ODP port dilaporkan incomplete, rantai putus menghasilkan gap bukan crash, dampak konsisten di semua level termasuk lewat JC berantai, node tanpa downstream = 0) — full suite 166 passed/2 skipped. Dicek langsung di browser: kartu Jalur FTTH tampil benar dengan chain OLT→OTB(core 5)→JC(5→3)→ODC(core 2)→ODP(port 1)→pelanggan, modal dampak dari Tree view menampilkan 1 pelanggan terdampak dengan benar, nol error console

---

### 2026-09-05 — Migrasi Schema Kadang Gagal Diam-Diam Saat Update (Root Cause: Lock Tanpa Retry)

#### Ditemukan Saat Investigasi — Direproduksi Langsung, Bukan Dugaan
- User laporkan: kadang setelah update, dan saat menghapus OLT, muncul error — dicurigai skema SQL "kadang belum lengkap"
- Diaudit: installer (`install-vps.sh`) tidak punya file SQL statis sama sekali — instalasi baru selalu lengkap otomatis lewat `db.create_all()` dari `models.py` saat pertama kali start. Yang jadi pertanyaan adalah jalur **update** (self-update via System Update page: `git pull` + restart service)
- **Root cause ditemukan**: `migrate_schema()`'s `add_col()` (jalan tiap server start untuk nambah kolom baru ke tabel lama) membungkus `ALTER TABLE` dalam `try/except` yang **diam total** (`logger.debug`, tanpa retry) kalau gagal. `ALTER TABLE` butuh lock eksklusif sesaat ke seluruh file SQLite — kalau pas momen itu `auto_sync.py` (cron tiap 5 menit, full sync bisa 1-2 menit) sedang nulis, `ALTER TABLE` gagal dengan "database is locked", gagalnya **tidak pernah terlihat**, dan kolom itu permanen hilang sampai restart berikutnya kebetulan tidak bentrok lock
- **Direproduksi nyata**: dibuat salinan DB dengan kolom `ftth_odc.feed_source` dihapus manual (simulasi migrasi yang gagal diam-diam), lalu diakses `/api/ftth/tree` — hasilnya betul 500 Internal Server Error (`no such column: ftth_odc.feed_source`). Ini persis kelas bug yang muncul di halaman FTTH manapun (termasuk sesaat setelah hapus OLT, kalau frontend refetch data FTTH) kalau satu kolom saja gagal ter-migrasi
- **Diperbaiki**: `add_col()` sekarang retry sampai 10x dengan backoff (~14 detik total) khusus untuk error "locked"/"busy", dan kalau tetap gagal setelah semua retry, di-log sebagai **WARNING** (bukan debug yang nyaris tidak pernah terlihat) supaya kegagalan asli langsung ketahuan di log production, bukan diam-diam dan baru ketahuan user lewat error di halaman lain
- **Status production `.131` saat ini**: dicek langsung, semua kolom FTTH/JC terkini sudah lengkap (karena selama ini di-deploy manual lewat SSH tiap fitur) — bug ini murni risiko ke depan untuk update otomatis, bukan masalah aktif sekarang
- **Diverifikasi**: 3 test baru untuk `add_col()` (nambah kolom hilang, tabel belum ada tidak error, jalan 2x tidak duplikat) — full suite 158 passed/2 skipped

---

### 2026-09-05 — Splice JC: Nama/Warna Tube Bisa Diisi Manual (Bukan Cuma Auto TIA-598)

#### Ditambahkan
- User klarifikasi: nomor tube sudah bisa ditulis bebas, tapi **nama warnanya** (mis. "Biru", "Jingga") masih dihitung otomatis dari standar TIA-598 berdasarkan nomor itu — untuk drop core/kabel non-tube, nama warna otomatis ini seringkali tidak sesuai kondisi fisik
- Kolom baru `tube_in_label`/`tube_out_label` (opsional, teks bebas) di tiap splice JC — kalau diisi, menggantikan nama warna otomatis pada tampilan (titik warna tetap dari perhitungan TIA-598 sebagai referensi visual, tapi teksnya jadi nama custom); kalau dikosongkan, tetap seperti sebelumnya (nama warna otomatis)
- Field teks "Nama/warna tube manual (opsional)" ditambahkan di bawah tiap sisi (masuk & keluar) pada form tambah/edit splice, preview langsung berubah saat diketik
- **Diverifikasi**: 1 test baru (isi custom label, update sebagian field tidak menghapus field lain) — full suite 155 passed/2 skipped. Dicek langsung di browser: isi "Drop Core" di sisi masuk dan "Tube Custom A" di sisi keluar → preview langsung berubah, tersimpan dan tampil benar di daftar splice, nol error console

---

### 2026-09-05 — Splice JC: Bisa Edit Splice yang Sudah Ada (Bukan Cuma Tambah/Hapus)

#### Ditambahkan
- User laporkan "tube masih tidak bisa tulis manual" — setelah dicek, kode di production sudah benar (input angka bebas, bukan dropdown), tapi ternyata maksud user adalah: splice yang **sudah ada** di daftar cuma bisa dihapus, tidak bisa diedit. Endpoint update splice (`ftthJcSpliceUpdate`) sudah ada di `lib/api.ts` sejak awal tapi belum pernah dipakai di UI
- Ditambahkan ikon **Edit** (pensil) di tiap baris splice, di sebelah ikon Hapus. Klik Edit akan menguraikan nomor core absolut splice itu kembali jadi (tube, posisi) — baik untuk sisi masuk maupun keluar — lalu mengisi form yang sama dipakai untuk tambah splice, sehingga tube/core bisa dikoreksi
- Saat mode edit aktif: baris splice yang sedang diedit ditandai highlight, tombol berubah jadi "Save Changes" + "Cancel", dan label form berubah jadi "Mengedit splice"
- **Diverifikasi**: dicek langsung di browser — klik edit pada splice core 3→5, form terisi otomatis (Tube 1/Core 3 → Tube 1/Core 5), ubah ke Tube 2/Core 7, simpan → toast "Splice updated", daftar splice ter-update dengan benar, form kembali ke mode tambah, nol error console

---

### 2026-09-04 — Splice JC: Nomor Tube Bisa Diisi Bebas (Custom)

#### Diubah
- Diminta agar nomor tube pada form splice JC bisa diisi bebas — sebelumnya dropdown Tube dibatasi cuma sejumlah `ceil(total_cores / fibers_per_tube)`, padahal core yang disambung di JC belum tentu bagian dari kabel bertube (mis. drop core, atau kabel lain selain ADSS yang tidak punya struktur tube standar)
- Dropdown Tube pada kedua sisi splice (Core In & Core Out) diganti jadi input angka bebas — bisa diisi nomor tube berapa saja (termasuk di luar hitungan tube normal JC), preview warna tetap dihitung otomatis dari nomor tube + posisi core yang diisi
- **Diverifikasi**: dicek langsung di browser — isi Tube 99 (di luar rentang 1 tube normal untuk JC 12 core), preview warna langsung muncul benar ("Tube 99 Hijau • Biru"), splice tersimpan dan tampil benar di daftar, nol error console

---

### 2026-09-04 — Audit & Update Panduan In-App (FTTH, Provision/Register Wizard)

#### Diperbaiki
- Diminta audit halaman Panduan karena sudah banyak fitur baru yang belum terdokumentasi. Ditemukan: panduan FTTH Infrastructure masih versi lama (sebelum JC ditambahkan) — belum menyebutkan tab **Tree**, tab **JC**, splice, toggle "Fed From", "Draw Fiber Path"/"Auto Route" sama sekali; panduan Provision Wizard & Register Wizard belum menyebutkan dropdown assign ODP opsional saat registrasi
- Panduan FTTH ditulis ulang: tambah langkah Tree Tab, JC (Joint Closure) Tab (penjelasan konsep titik sambungan, Fibers per Tube opsional, cara isi splice), Draw Fiber Path & Auto Route, serta catatan bahwa warna tube/core cuma sampai ODC (bukan ODP) dan toggle Fed From di form ODC/ODP — plus 3 tips baru soal JC
- Panduan Provision Wizard & Register Wizard: tambah catatan dropdown "— ODP (optional) —" di step Review
- **Diverifikasi**: dicek langsung di browser — halaman Panduan menampilkan 7 langkah + tips baru untuk FTTH, dan catatan ODP opsional muncul di kedua panduan wizard, nol error console

---

### 2026-09-04 — Input Splice JC: Pilih Tube + Core (Bukan Nomor Core Polos)

#### Diubah
- Diminta agar penentuan splice tidak sekadar input nomor core mentah — kalau JC punya lebih dari 1 tube, saat tambah splice harus jelas "tube berapa, warna apa" dan "core nomor berapa, warna apa" di kedua sisi (masuk maupun keluar), supaya datanya lebih lengkap dan cocok cara kerja teknisi lapangan
- Form tambah splice diganti dari 2 kolom angka polos ("Core in" / "Core out") jadi 2 picker Tube + Core-dalam-tube (dengan dropdown Tube dibatasi sesuai jumlah tube nyata: `ceil(total_cores / fibers_per_tube)`), masing-masing dengan preview warna langsung (tag Tube+Core TIA-598) — nomor core absolut dihitung otomatis di belakang layar dari (tube, posisi), backend tidak berubah karena tetap cuma perlu core_in/core_out sebagai angka
- Sisi "Core In" pakai `fibers_per_tube` milik **parent** JC (OTB/ODC/JC lain yang jadi sumbernya — bukan milik JC ini sendiri, karena kabel masuk itu fisiknya bagian dari kabel parent), sisi "Core Out" pakai `fibers_per_tube` milik JC ini sendiri (karena itu penomoran kabel yang diteruskan ke downstream)
- Daftar splice yang sudah ada juga diperbarui: sekarang tampilkan tag warna Tube+Core lengkap di kedua sisi ("In: Tube 2 Jingga • Abu-abu → Out: Tube 1 Biru • Hijau"), bukan cuma angka mentah "Core 17 → 3"
- **Diverifikasi**: dicek langsung di browser — seed OTB 24 core (2 tube), JC fed dari situ, pilih Tube 2/posisi 5 di sisi masuk dan Tube 1/posisi 3 di sisi keluar → preview warna langsung benar, setelah disimpan splice list menampilkan "In: Tube 2 Jingga • Abu-abu → Out: Tube 1 Biru • Hijau" sesuai standar TIA-598, nol error console

---

### 2026-09-04 — JC: Field "Fibers per Tube" Opsional (Bisa Lebih dari 1 Tube)

#### Ditambahkan
- Diminta agar JC juga bisa punya data tube — satu closure JC bisa terdiri dari beberapa tube (mis. 2 tube × 12 core), bukan cuma satu angka total core polos
- Field baru `fibers_per_tube` di JC (opsional, default 12, sama seperti pola yang sudah ada di OTB/ODC) — warna tube/core (standar TIA-598) pada tiap splice sekarang dihitung otomatis dari nilai ini, ditampilkan langsung di daftar splice (Core X → Y beserta tag warna tube-nya) maupun saat memilih core dari JC di form tambah ODC/ODP
- **Diverifikasi**: 1 test baru (fibers_per_tube independen dari total_cores, bisa diubah lewat update) — full suite 154 passed/2 skipped. Dicek langsung di browser: field tersimpan dan terbaca kembali dengan benar, warna tube pada splice muncul sesuai nilai fibers_per_tube JC tersebut, nol error console

---

### 2026-09-03 — Titik JC (Joint Closure / Sambungan) di Rantai FTTH

#### Ditambahkan
- Diminta agar jalur fiber tidak cuma OTB→ODC langsung, tapi bisa lewat titik sambungan (JC) di mana saja sepanjang rantai — OTB→JC→ODC, ODC→JC→ODP, bahkan JC berantai (JC→JC) — supaya data core lengkap sampai ke pelanggan, termasuk detail per-splice (core masuk disambung ke core berapa keluar)
- **Entitas baru** `FTTHJC` (nama, tipe closure inline/dome/dead-end, lokasi/koordinat, total core, dan "fed from" generik — bisa dari OTB, ODC, atau JC lain) + `FTTHJCSplice` (core_in → core_out per splice, dengan label opsional). ODC dan ODP dapat kolom baru `feed_source` ('otb'/'jc' untuk ODC, 'odc'/'jc' untuk ODP) + `jc_id`/`jc_core_number` — kolom lama (`otb_id`/`otb_core_number`, `odc_id`/`odc_core_number`) tetap dipakai persis seperti sebelumnya untuk jalur langsung (tanpa JC), jadi data production yang sudah ada otomatis tetap `feed_source='otb'/'odc'` tanpa migrasi data
- **Backend**: tab baru + CRUD penuh untuk JC dan splice-nya (`/api/ftth/jc`, `/api/ftth/jc/<id>/splice`), termasuk pencegahan siklus (JC tidak boleh jadi induk dirinya sendiri secara langsung maupun berantai) dan penghapusan yang "melepas" (bukan cascade-delete) apa pun yang tersambung ke JC yang dihapus, supaya infrastruktur riil di baliknya tidak ikut hilang. Endpoint `/api/ftth/tree` ditulis ulang jadi rekursif supaya ODC/ODP yang lewat JC tetap tampil bersarang di bawah JC-nya — untuk jalur langsung (tanpa JC), bentuk JSON-nya persis sama seperti sebelumnya sehingga Provision Wizard/Register Wizard/All ONUs (yang menjelajahi tree ini untuk pilihan assign ODP) tidak perlu berubah kecuali menambah langkah menjelajahi cabang JC — dipusatkan lewat helper `lib/ftthTree.ts` yang dipakai ulang di ketiga tempat itu
- **Frontend**: tab "JC" baru (list + form tambah/edit dengan manajemen splice inline), toggle "Fed From" (OTB/ODC vs JC) di form ODC dan ODP, Tree view menampilkan JC bersarang dengan ikon dan warna berbeda, peta FTTH menampilkan marker JC dan garis sambungannya — fitur "Draw Fiber Path" dan "Auto Route (OSRM)" yang sudah ada otomatis berfungsi untuk JC juga karena keduanya sudah generik terhadap tipe titik
- **Diverifikasi**: 9 test baru (CRUD JC, splice dengan core_out duplikat ditolak, pencegahan siklus langsung & tidak langsung, bentuk tree untuk jalur JC vs jalur langsung) — full suite 153 passed/2 skipped. Dicek langsung di browser: buat JC dari OTB, tambah splice, buat ODC yang fed dari splice itu (core dropdown otomatis terisi dari splice JC), verifikasi ODC bersarang di bawah JC (bukan di bawah OTB) baik di Tree view maupun label "From JC:" di list ODC — nol error console di setiap langkah

---

### 2026-09-03 — FTTH Map: Ganti Tile dari CartoDB (Butuh API Key) ke OpenStreetMap

#### Diperbaiki
- User laporkan peta FTTH tiba-tiba muncul watermark "API KEY REQUIRED" di seluruh tile. Ternyata bukan bug — CartoDB baru mewajibkan API key terdaftar untuk basemap gratis mereka (`basemaps.cartocdn.com`), termasuk style dark yang dipakai `LeafletMap.tsx`
- Daripada gantung ke API key pihak ketiga (dan bisa kena masalah kebijakan serupa lagi ke depannya), diganti ke tile OpenStreetMap standar (`tile.openstreetmap.org`) yang sudah dipakai duluan di `LocationPicker.tsx` — gratis permanen, tanpa registrasi/API key
- Tampilan dark dipertahankan lewat CSS filter (`invert + hue-rotate + brightness/contrast/saturate`) yang di-scope cuma ke pane tile lewat opsi `className` Leaflet — tidak menyentuh warna marker/popup/garis yang berada di pane terpisah
- **Diverifikasi**: build sukses, dicek langsung di browser (Playwright) — peta tampil gelap tanpa watermark, atribusi OSM benar, nol error console

---

### 2026-09-03 — Assign ODP Port (Opsional) Saat Registrasi ONU

#### Ditambahkan
- Diminta agar assign port ODP juga bisa dilakukan saat registrasi ONU, bukan cuma lewat "Assign ODP" manual setelahnya. Ditambahkan dropdown opsional per-ONU ("— ODP (optional) —") di step Review pada **Provision Wizard** (mode langsung & Pre-config ONT) dan **Register Wizard**, terisi dari daftar port ODP yang masih `available` (`/api/ftth/tree`)
- Backend: logika link/unlink port ODP di `update_onu` diekstrak jadi helper bersama `_link_odp_port()` (melepas port lama milik ONU jika ada, dan menggeser ONU lain yang kebetulan sudah menempati port tujuan) — dipakai ulang oleh `provision_unified` (assign langsung setelah ONU dibuat) dan `pre_register_onu` (best-effort, sama seperti penanganan `technician_id` yang sudah ada — cuma jalan kalau baris ONU sudah ada dari sync sebelumnya, karena endpoint ini tidak membuat baris ONU secara sinkron)
- **Diverifikasi**: 3 test baru (assign untuk ONU baru, tanpa odp_port_id port tidak tersentuh, port lama otomatis digeser saat port tujuan sudah terisi) — full suite 144 passed/2 skipped. Dicek langsung di browser (Playwright) pada kedua wizard — dropdown tampil dan terisi benar di step Review, nol error console

---

### 2026-09-03 — Warna Tube/Core Dihapus dari ODP, Tetap Ada di ODC/OTB

#### Diperbaiki
- Diminta hapus catatan warna tube/core (mis. "Tube 1 Biru • Hijau") khusus di level ODP — menurut praktik lapangan, penandaan warna tube/core cuma relevan sampai ODC (core dari OTB), bukan dari ODC ke ODP
- Dihapus di: list ODP, Tree view (baris ODP), dan form Tambah/Edit ODP (preview warna di bawah "Core from ODC"). Field "Fibers per Tube" di form ODC juga dihapus dari tampilan karena satu-satunya kegunaannya adalah menghitung warna yang baru saja dihapus itu
- **Tidak diubah**: ODC tetap menampilkan warna tube/core untuk core dari OTB ("From: OTB-X (Core N) • Tube ... "), dan diagram port OTB/ODF tetap penuh dengan warna per core — sesuai standar TIA-598, cuma level ODP yang disederhanakan
- **Diverifikasi**: dicek langsung di browser — ODC masih tampil warna, ODP dan form Tambah ODP sudah bersih tanpa catatan warna, nol error console

---

### 2026-09-03 — Redesign Warna: Indigo Slate (dari Teal/Navy)

#### Proses
- Diminta redesign tampilan UI/UX dan komposisi warna. Sebelum menyentuh kode, dibuatkan dulu mockup preview (Claude Design canvas, terpisah dari aplikasi) untuk 3 halaman kunci (Dashboard, All ONUs, OLT Settings), lalu 3 arah warna berbeda untuk dipilih: **A — Fiber Signal** (teal/navy + glass-blur, identitas lama), **B — Amber Ops** (charcoal + amber, kartu flat industrial), **C — Indigo Slate** (slate gelap + indigo, kartu flat + shadow, kesan SaaS modern). User pilih **C**
- Setelah dipilih, diterapkan ke kode sungguhan (bukan cuma mockup) lewat token warna terpusat di `frontend/src/index.css` — karena hampir semua halaman memakai class bersama (`.glass-card`, `.btn-primary`, `.badge-*`, dst.) yang diturunkan dari CSS custom properties, satu perubahan token merambat konsisten ke seluruh aplikasi tanpa perlu edit tiap halaman satu-satu

#### Diubah
- Palet warna: `--bg-primary` navy `#0B1426` → slate nyaris hitam `#0A0C14`; aksen `--color-accent` teal `#00D9C0` → indigo `#818CF8`; status colors (success/warning/danger) disesuaikan ke varian yang serasi dengan latar baru (`#34D399`/`#FBBF24`/`#F87171`) — tetap jelas beda dari warna aksen
- `.glass-card`: dari kartu semi-transparan dengan `backdrop-filter: blur(16px)` (glass-morphism) menjadi kartu solid flat (`#12141F`) dengan border tipis + `box-shadow`, radius 14px → 10px — lebih ringan dirender dan lebih crisp
- Signature "fiber-beam" (garis gradient animasi di atas kartu) dipensiunkan — dibuat jadi no-op CSS supaya 3 file yang masih pakai className-nya tidak perlu diedit satu-satu, tapi efeknya sudah tidak tampil, konsisten dengan arah kartu flat yang baru
- `meta theme-color` di `index.html` disesuaikan ke warna latar baru (status bar browser mobile ikut berubah)
- **Tidak diubah**: light theme (`html.light` overrides) — di luar scope, belum direview/disetujui user untuk arah indigo; token `--color-rx-purple` sengaja TIDAK disamakan dengan `--color-rx-orange` meski sempat begitu di draft mockup awal — keduanya dipakai sebagai pilihan warna independen di fitur kustomisasi RX power (`Customization.tsx`), menyamakan keduanya akan merusak fitur itu
- **Diverifikasi**: build production sukses, 0 TypeScript error (murni perubahan CSS/token, tidak menyentuh logic), dicek langsung di browser sungguhan pada 3 halaman yang sama seperti mockup — indigo konsisten di sidebar/tombol/badge/kartu, nol error console

---

### 2026-09-03 — File Lock Tadi Malah Terkunci Sendiri Antar User (root cron vs salfanet app)

#### Ditemukan Saat Verifikasi Live di Production — Bukan dari Test
- Setelah deploy fix file-lock sebelumnya, saya coba buktikan langsung: picu sync manual (via Python langsung, bukan cuma test) persis saat cron sedang jalan. Hasilnya: `Permission denied: '/tmp/salfanet_sync_lock_olt_1.lock'` — fix-nya sendiri malah gagal total, fallback ke in-memory lagi (bug yang sama, sebab berbeda)
- **Root cause**: cron `auto_sync.py` di production ternyata jalan lewat **crontab root**, sementara aplikasi web jalan sebagai user **salfanet** — dua UID Linux berbeda. Siapapun yang bikin file lock duluan, defaultnya cuma `644` (rw untuk pemilik, r saja untuk lainnya) karena umask — jadi user yang satunya tidak bisa tulis ke file itu untuk ambil lock

#### Diperbaiki
- `sync_lock.py`: file lock sekarang dibuat + `fchmod` eksplisit ke `0o666` (rw untuk semua user) setiap kali dibuka — `fchmod` tidak kena umask seperti mode di `os.open()`, jadi permission-nya konsisten world-writable siapapun yang membuatnya duluan
- Test baru `test_lock_file_is_world_writable` — pastikan file lock selalu berakhir `0o666`, bukan hanya lolos di user yang sama seperti sebelumnya
- **Diverifikasi live di production sampai tuntas** (bukan cuma test): hapus file lock lama yang kadung root-only, deploy fix, tunggu cron jalan lagi, lalu coba `acquire_sync_lock` dari proses `salfanet` terpisah persis saat cron (`root`) sedang sinkron OLT yang sama — kali ini `is_sync_locked()` benar melapor `True` dan `acquire_sync_lock()` benar ditolak (`None`), tanpa error permission. File lock dicek langsung: `-rw-rw-rw-` (0o666) sesuai harapan

---

### 2026-09-03 — Sync Lock Tidak Berfungsi Lintas Proses Tanpa Redis (Akar Masalah Race Condition)

#### Ditemukan — Bukti Nyata dari Log Production, Bukan Dugaan
- Diminta cek ulang log karena dicurigai masih ada race condition antara sync manual dan otomatis. Dicek `ActionLog` + `journalctl` production: sync manual jam **15:25:35** diterima (`200 OK`) — padahal cron `auto_sync.py` **masih jalan** sinkron OLT yang sama sejak 15:25:02 (baru selesai 15:26:15). Seharusnya lock menolak ini
- **Root cause**: production **tidak punya Redis aktif** (`REDIS_URL` di-comment di `.env`, `redis-server` tidak jalan). `sync_lock.py` didesain fallback ke lock in-memory (`threading.Lock`) kalau Redis tidak ada — tapi lock in-memory itu **cuma berlaku dalam satu proses Python**. `auto_sync.py` (cron, proses baru tiap 5 menit) dan aplikasi web `salfanet-nms` (proses long-running terpisah) adalah **dua proses yang berbeda** — lock mereka tidak pernah saling melihat. Hasilnya: sync manual dari web UI bisa nyelonong nembak SNMP/CLI ke OLT yang sama persis saat cron sedang melakukan hal yang sama — dua sesi SNMP konkuren ke satu OLT dari proses berbeda, kemungkinan besar penyebab anomali "cuma 66 dari 157 ONU" dan `Segmentation fault` yang ditemukan sebelumnya

#### Diperbaiki
- `sync_lock.py`: fallback tanpa Redis sekarang pakai **file lock (`flock`)** di POSIX/Linux — ini bekerja lintas proses (beda dari `threading.Lock`), memakai teknik yang sama seperti yang sudah dipakai `auto_sync.py` sendiri untuk cegah tumpang-tindih antar cron run. Tidak perlu install Redis untuk memperbaiki ini
- Windows (dev lokal, tidak ada `fcntl`) tetap pakai lock in-memory lama — tidak ada perubahan perilaku di lokal
- Lock file otomatis lepas kalau proses pemegangnya mati/crash (bawaan OS untuk `flock`, tidak perlu logic TTL manual seperti fallback in-memory)
- **Diverifikasi**: test baru `test_lock_blocks_across_separate_processes` — betul-betul spawn proses OS terpisah (bukan cuma thread) dan pastikan proses kedua **gagal** ambil lock yang sudah dipegang proses pertama. Jalan di CI Linux (skip otomatis di Windows dev, sesuai platform lock yang dipakai). 141 test lain tetap lolos (perilaku Windows dev tidak berubah)

---

### 2026-09-03 — Total ONU di Dashboard Sempat Salah Setelah Auto-Sync yang Terpotong Sebagian

#### Ditemukan Saat Live-Monitoring Production — Bukan dari Audit Kode
- User lapor "auto sync seperti tidak update". Cek langsung log production (`/var/log/salfanet-sync.log`): satu siklus cron (5-menitan) yang biasanya dapat 156-157 ONU tiba-tiba cuma dapat **66**, langsung diikuti `Segmentation fault` di proses Python-nya. Siklus berikutnya pulih sendiri (157/157)
- **Root cause count drop**: `_collect_onus_light_async` (`snmp_core.py`) jalankan 8 SNMP bulk-walk konkuren (`asyncio.gather`) untuk kolom berbeda (name, serial, oper-state, dereg-reason, rx, tx, olt-rx, description). Pada siklus bermasalah, walk `serial`/`name`/`desc`/`rx` cuma dapat sebagian (66/23) sementara walk lain dapat penuh (157) — OLT/jaringan sesaat tidak sanggup layani 8 walk sekaligus. Kode sudah benar skip ONU tanpa serial number (`if not sn: continue`), jadi 91 ONU yang datanya cuma separuh otomatis tidak diproses siklus itu — ini sudah benar, mencegah data korup
- **Bug yang baru ketemu**: `sync_helper.py` sudah punya proteksi "jangan hapus ONU yang hilang dari sync light" (baris tidak dihapus dari database) — TAPI counter agregat OLT (`total_onu`, `online_onu`, dst — yang muncul di tile Dashboard) tetap ditimpa pakai `len(onus_data)` dari hasil parsial itu. Jadi walau data detail 91 ONU yang "hilang" tetap aman di database, tile ringkasan di Dashboard sempat menampilkan angka yang salah/rendah selama ~5 menit sampai siklus berikutnya berhasil penuh dan mengoreksi sendiri
- **Segmentation fault**: muncul di **setiap** siklus cron (baik yang lengkap maupun parsial), selalu setelah "Auto-sync complete" ter-log — artinya crash terjadi saat proses Python exit, setelah semua kerja nyata (collect + simpan DB) sudah selesai. Tidak ditemukan proses yang macet/zombie. Kemungkinan besar terkait pysnmp async (`Slim` v1arch) yang tidak bersih saat cleanup, tapi tanpa traceback C-level, ini baru dugaan

#### Diperbaiki
- `sync_helper.py`: counter agregat OLT (`total_onu` dan status breakdown) di mode light sekarang ikut menghitung ONU yang "terlewat" di siklus itu pakai status terakhir yang diketahui — bukan cuma `len(hasil-parsial)`. Tile Dashboard tidak akan lagi salah lapor angka rendah gara-gara satu siklus SNMP yang kebetulan tidak lengkap
- `auto_sync.py`: aktifkan `faulthandler` (bawaan Python) supaya kalau segfault terjadi lagi, log cron akan berisi traceback C-level yang sesungguhnya alih-alih cuma baris "Segmentation fault" tanpa info — diagnostik murni, tidak mengubah perilaku sync
- **Diverifikasi**: 2 test baru mensimulasikan persis skenario ini (3 ONU di DB, hasil sync light cuma laporkan 1) — pastikan 2 ONU yang "hilang" tidak terhapus DAN `total_onu` tetap 3 (bukan 1). Test full-sync (`light=False`) dipastikan masih menghapus ONU basi seperti sebelumnya (tidak ada regresi). 141/141 test lolos total
- **Belum diperbaiki** (butuh traceback dulu dari `faulthandler`): akar penyebab segfault itu sendiri — akan ditelusuri begitu traceback pertama tertangkap di production

---

### 2026-09-03 — Progress Bar Sync Macet Selamanya Kalau Kalah Race dengan Auto-Sync

#### Diaudit — Live Status Sync di Semua Halaman
- Diminta audit ulang menyeluruh: apakah live status auto-sync dan tombol Sync di semua halaman (OLT Settings, Dashboard, All ONUs, FTTH Infrastructure, OLT Logs, wizard registrasi ONU) sudah benar
- **Backend**: WebSocket broadcast cuma pakai 2 event nyata di channel `/ws/dashboard` — `onu_change` dan `alert`. Event `sync_complete` sebagai nama event **tidak pernah** dikirim (yang ada `onu_change` dengan `data.action = 'sync_complete'`)
- **Ditemukan bug nyata**: tombol "Sync" per-OLT di **OLT Settings** dan **Dashboard** melakukan polling status tiap 2 detik, tapi cuma berhenti kalau status `'completed'` atau `'error'`. Ada status ketiga, `'skipped'` — dikirim backend kalau sync manual kalah race lock dengan cron `auto_sync.py` (jalan tiap 5 menit) yang kebetulan mulai sync OLT yang sama nyaris bersamaan. Kalau ini terjadi, progress bar/spinner **macet selamanya** di halaman itu (tidak pernah hilang) sampai user pindah halaman — padahal sync-nya sendiri tidak pernah error, cuma di-skip
- Ditemukan juga: kode cek `event === 'sync_complete'` di 4 file (Dashboard, All ONUs, FTTH Infrastructure, Topbar) itu mati/tidak pernah kena karena event itu memang tidak pernah dikirim — tidak berbahaya (kondisi `onu_change` yang asli tetap jalan), tapi menyesatkan dibaca
- Halaman lain (All ONUs, FTTH Infrastructure, Topbar) sudah benar — subscribe ke event WebSocket yang sungguhan dikirim backend, invalidate query key yang tepat

#### Diperbaiki
- `OltSettings.tsx` dan `Dashboard.tsx`: polling status sekarang juga berhenti pada status `'skipped'`, dengan toast info yang jelas ("Sync already in progress — skipped") alih-alih progress bar macet tanpa penjelasan
- Hapus pengecekan `event === 'sync_complete'` yang mati di 4 file (Dashboard, All ONUs, FTTH Infrastructure, Topbar) — event asli yang dipakai (`onu_change`) tetap dipertahankan
- **Diverifikasi**: dites di browser sungguhan dengan network mocking (simulasi race: response sync-status langsung `status: 'skipped'`) di kedua halaman — sebelum fix, progress bar akan macet selamanya; sekarang toast info muncul dan tampilan langsung kembali normal dalam &lt;3 detik (satu siklus poll)

---

### 2026-09-03 — "Refresh Live" di View ONU Kadang Menghapus Service Config yang Sudah Tampil

#### Diaudit & Ditemukan — Root Cause: Koneksi CLI Sibuk Dikira "Berhasil, Tapi Kosong"
- **Dilaporkan**: data service (WAN, TCONT, GEM Port, VLAN, dst) di halaman View ONU kadang muncul normal, tapi setelah klik "Refresh Live" kadang malah hilang
- **Root cause**: `collect_onu_detail()` di `telnet_client.py` mengembalikan dict kosong `{}` kalau koneksi Telnet/SSH ke OLT gagal connect (session sibuk/timeout — umum terjadi di ZTE C320 yang cuma punya slot session CLI terbatas). Endpoint `/api/onu/<id>/live-detail` (`routes_onu.py`) meneruskan hasil kosong ini sebagai `success: true` tanpa pembeda — frontend tidak bisa tahu ini "refresh gagal" vs "ONU ini memang tidak ada service apa-apa", jadi tampilan lama langsung ditimpa jadi kosong

#### Diperbaiki
- **Backend**: endpoint sekarang membedakan collect yang gagal (koneksi CLI sibuk/timeout, atau exception) dari collect yang sukses-tapi-kosong. Field baru `live_detail_error` diisi pesan jelas kalau refresh gagal; `live_detail` tetap `null` di kasus itu (bukan dict kosong yang menyesatkan)
- **Frontend**: `ViewOnu.tsx` sekarang menyimpan data live terakhir yang berhasil (`lastGoodLiveDetail`) — hanya di-update kalau fetch baru benar-benar membawa data. Kalau refresh gagal, tampilan **tetap menunjukkan data terakhir yang valid**, sambil toast merah muncul menjelaskan kenapa ("OLT CLI not responding... — showing last known data")
- **Diverifikasi**: 3 test backend baru (collect sukses, collect gagal karena `{}`, collect exception) — 139/139 total lolos. Dites juga di browser sungguhan dengan network mocking: load pertama sukses (tabel VLAN/TCONT/GEM terisi) → klik "Refresh Live" dengan response gagal yang disimulasikan → toast error muncul, dan tabel-tabel tadi **tetap terisi**, tidak kosong — persis skenario yang dilaporkan, sekarang tidak terjadi lagi

---

### 2026-09-03 — OLT Baru Langsung Full-Sync, Tidak Nunggu Cron

#### Diaudit — Peran Redis dan Sync Pertama untuk OLT Baru
- **Konteks**: ditanya apakah masalah sync OLT (khususnya OLT yang pertama kali ditambahkan) berhubungan dengan Redis, karena "harusnya semua data OLT masuk ke Redis". Setelah ditelusuri: **Redis di sistem ini sama sekali tidak menyimpan data OLT/ONU** — grep ke seluruh kode cuma nemu Redis dipakai untuk 2 hal: distributed lock (`sync_lock.py`, cegah 2 proses sync bentrok di OLT yang sama) dan cache pendek (`cache.py`, TTL 15 detik untuk dashboard). Semua data ONU/card/port tetap ke database SQL, bukan Redis
- **Ditemukan**: `create_olt()` (`routes_olt_settings.py`) cuma insert row OLT ke DB, tidak trigger sync apapun. OLT baru jadi kosong sampai admin klik "Sync" manual, atau nunggu cron 5-menitan (`auto_sync.py`) — yang untungnya sudah benar akan langsung full-sync (bukan light/SNMP-only) untuk OLT yang belum pernah `last_full_sync`, jadi gap-nya cuma maksimal ~5 menit, bukan 6 jam seperti dugaan awal

#### Ditambahkan — Auto Full-Sync Begitu OLT Baru Disimpan
- `create_olt()` sekarang langsung memanggil `start_single_sync(..., light=False)` setelah OLT tersimpan — data ONU/card/port/uplink langsung mulai ditarik saat itu juga, tidak perlu nunggu cron atau klik manual
- Kalau trigger sync-nya sendiri gagal (exception), pembuatan OLT tetap sukses — sync awal ini kemudahan tambahan, bukan syarat OLT bisa dibuat
- **Diverifikasi**: 2 test baru (trigger terpanggil dengan `light=False` + argumen olt_id yang benar; kegagalan trigger tidak menggagalkan pembuatan OLT) — 136/136 total lolos. Dites juga langsung ke server dev sungguhan (bukan cuma mock): buat OLT baru via API, cek record `OLTSyncStatus` — status langsung `running` dengan pesan "Connecting SNMP..." dalam hitungan detik, tanpa nunggu cron

---

### 2026-09-03 — Audit & Perbaikan Multi-Registrasi ONU (Tipe Modem Sama)

#### Diaudit — Registrasi Banyak ONU Sekaligus Punya 3 Celah
- **Mode "Auto (next available)" di ONU Wizard ternyata palsu**: apapun yang dipilih user, payload yang dikirim ke backend selalu `onu_id: 1` (`OnuWizard.tsx:520` sebelum fix) — tidak pernah benar-benar mengecek ID mana yang kosong di port itu. Daftarkan 2 ONU tipe sama di port yang sama pakai mode Auto → keduanya coba pakai ID 1
- **Tabrakan ID di-skip diam-diam**: kalau slot `olt/frame/slot/port/onu_id` itu ternyata sudah ada row di DB, perintah registrasi tetap dikirim ke OLT dan sukses — tapi baris DB baru tidak pernah ditulis, tanpa pesan error apapun ke user. OLT dan database jadi tidak sinkron
- **Tidak ada pengecekan serial number duplikat sama sekali** — modem fisik yang sama (SN sama) bisa didaftarkan berkali-kali di port/OLT berbeda, `serial_number` di model cuma punya index biasa bukan constraint unik
- RegisterWizard (alur registrasi massal yang sebenarnya) dicek terpisah dan **aman** — loop registrasi sekuensial tanpa bug shared-state, alokasi ID di `scan-unconfigured` sudah query live ke OLT/DB per-port (bukan counter global)

#### Diperbaiki
- **API baru** `GET /api/onu/next-id` — resolusi ID kosong sungguhan: coba live-query ke OLT dulu (`get_next_available_onu_id`), fallback ke cek ID terpakai di DB kalau OLT tidak bisa diakses. Dipakai OnuWizard saat mode "Auto" dipilih — radio button sekarang menampilkan angka ID yang benar-benar akan dipakai (`Auto (next available: 2)`), bukan cuma label statis. Submit diblokir dengan pesan jelas kalau resolusi ID gagal, alih-alih diam-diam jatuh balik ke ID 1
- **Tabrakan slot sekarang di-update, bukan di-skip**: kalau `provision_unified` menemukan row lama di slot yang sama, baris itu di-update mengikuti registrasi baru (serial/nama/tipe/teknisi) plus dicatat sebagai warning di log — DB tidak lagi diam-diam ketinggalan dari kondisi OLT sungguhan
- **Penolakan serial number duplikat**: registrasi ditolak (`409`) kalau serial itu sudah terdaftar di slot lain manapun (OLT/frame/slot/port/onu_id berbeda), dengan pesan yang menyebutkan lokasi lama supaya user bisa deregister dulu. Re-register ke slot yang sama persis (mis. re-flash modem) tetap diizinkan
- **Diverifikasi**: 5 test baru (resolusi ID via CLI live-query, fallback ke DB, tolak SN duplikat di slot lain, izinkan re-register slot sama, update-in-place saat tabrakan slot) — 134/134 test lolos total. Dites juga di browser sungguhan: seed ONU di port 1/1/1, buka Pre-config Wizard, isi serial baru di port yang sama → radio "Auto" benar menampilkan "next available: 2", nol error console

---

### 2026-09-03 — Warna Tube/Core Otomatis (Standar TIA-598) di Diagram OTB/ODC/ODP

#### Ditambahkan — Penentuan Warna Core Ala NetBox Custom Field, Dihitung Otomatis dari Nomor Core
- **Konteks**: ditanya apakah NetBox punya cara menandai core berdasarkan warna tube — jawabannya NetBox sendiri tidak punya field warna tube/core bawaan (cuma rear-port position + naming manual), jadi fitur ini melangkah lebih jauh dari NetBox: warna dihitung otomatis mengikuti standar industri TIA-598 (12 warna: Biru, Jingga, Hijau, Coklat, Abu-abu, Putih, Merah, Hitam, Kuning, Ungu, Merah Muda, Aqua — berulang tiap tube berikutnya), bukan diketik manual
- **Backend**: kolom baru `fibers_per_tube` (default 12) di `FTTHOTB` dan `FTTHODC` — masing-masing menyimpan berapa fiber per tube untuk kabel keluarnya sendiri (kabel trunk OTB beda fisik dari kabel distribusi ODC, jadi nilainya independen). Tidak ada logika warna di backend — cuma menyimpan konfigurasi, supaya satu-satunya sumber kebenaran perhitungan warna ada di satu tempat (frontend)
- **Frontend**: `lib/fiberColor.ts` — fungsi `coreColorInfo(coreNumber, fibersPerTube)` murni (tube number = `ceil(core/fibersPerTube)`, warna tube & warna core dari tabel 12-warna TIA-598, berulang). Dipakai di:
  - Diagram port OTB/ODF — tiap kotak core sekarang ada 2 titik warna kecil (tube + core) di pojok, plus tooltip
  - List ODC, List ODP, List PON, dan Tree view — badge "Tube N Warna • Warna" di sebelah info "Core X from Y"
  - Form tambah/edit ODC, ODP, PON Port — preview warna langsung muncul begitu core number/parent dipilih, sebelum disimpan
  - Field baru "Fibers per Tube" di form OTB dan ODC (default 12, jarang perlu diubah)
- **Migration**: `3c4612c99cab_add_fibers_per_tube_to_ftth_otb_and_.py` — nullable=False dengan `server_default='12'` supaya baris existing (termasuk 48 core OTB yang sudah ada di production) otomatis dapat nilai 12 tanpa perlu backfill manual
- **Diverifikasi**: 129/129 test backend tetap lolos (perubahan schema backward-compatible). Dites sungguhan di browser: seed OTB 15-core (melewati batas tube 12→13) → core #13 tampil warna tube berbeda dari core #1 (Jingga vs Biru) tapi warna core sama (Biru, karena posisi-1-dalam-tube) → dicek ulang di ODC list, ODC edit form (live preview), ODP list, dan Tree view — semua konsisten menampilkan "Tube 2 Jingga • Biru" untuk core yang sama, nol error console
- **Catatan deploy**: DB production ternyata tidak di-track Alembic sama sekali (tidak ada tabel `alembic_version`) — skema selama ini terbentuk murni dari `db.create_all()` saat startup, yang cuma bikin tabel baru dan **tidak** menambah kolom ke tabel lama. Kolom `fibers_per_tube` di production ditambahkan manual lewat `ALTER TABLE ... ADD COLUMN ... DEFAULT 12` sebelum restart, supaya baris OTB/ODC yang sudah ada tidak pecah. Migration Alembic di repo tetap dipertahankan untuk dev lokal/fresh install (yang memang jalan lewat `flask db upgrade`)

---

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

