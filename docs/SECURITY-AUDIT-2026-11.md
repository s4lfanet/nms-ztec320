# Audit Keamanan Salfanet NMS — November 2026

Tanggal: 25 November 2026 · Cakupan: backend Flask/FastAPI, frontend React, dependency,
riwayat git. Metode: pemindai otomatis + review manual terarah (kode milik sendiri,
tanpa uji serang ke server produksi).

## Ringkasan

| # | Temuan | Tingkat | Status |
|---|---|---|---|
| 1 | Injeksi perintah CLI OLT lewat baris baru di field teks | **Tinggi** | Diperbaiki |
| 2 | Injeksi HTML di popup/tooltip peta FTTH (`esc()` rusak) | Sedang | Diperbaiki |
| 3 | Akun mana pun (termasuk demo/viewer) bisa mengubah pengaturan alert & eskalasi | Sedang | Diperbaiki |
| 4 | Pillow 11.3 rentan (dekoder gambar) pada unggah logo | Sedang | Diperbaiki |
| 5 | Password ACS tersamar `***` ikut terkirim ke OLT saat provisioning dengan profil TR-069 | Sedang (fungsional) | Diperbaiki |
| 6 | `/metrics` (Prometheus) terbuka tanpa login | Rendah | Diperbaiki |
| 7 | `GET /api/system-config` mengirim ciphertext kredensial ke semua akun | Rendah | Diperbaiki |
| 8 | Tidak ada batas ukuran request (DoS unggahan) | Rendah | Diperbaiki |
| 9 | Koordinat rute OSRM tidak divalidasi sebagai angka | Rendah | Diperbaiki |
| 10 | Apply Update tidak pernah menginstal ulang paket Python | Rendah (operasional) | Diperbaiki |

## Rincian

### 1. Injeksi CLI OLT (Tinggi)
Setiap perintah ke OLT adalah satu baris. Beberapa endpoint memasukkan teks pengguna
langsung ke perintah tanpa `cli_sanitize`: deskripsi uplink, nama/deskripsi port PON,
buat/rename VLAN, tipe ONU, speed/duplex, IP uplink, update/ubah field ONU, WAN service.
Nilai berisi baris baru (mis. `PPPOE\nreload`) menjalankan perintah kedua — pengguna dengan
izin pengaturan OLT/konfigurasi ONU bisa menjalankan perintah OLT apa pun tanpa izin Terminal.

Perbaikan: pagar `before_request` (`app.py`, `_reject_cli_control_chars`) menolak 400 setiap
string JSON berisi karakter kontrol (baris baru, CR, tab, ESC, dll.) di
`/api/olt*`, `/api/onu*`, `/api/provision*`, `/api/pre-register`, `/api/scan-unconfigured`,
`/api/ztp-config`. Lapisan Telnet tidak diubah. Jalur provisioning tetap juga memakai
`cli_sanitize` (lebih ketat). Textarea VLAN di Konfigurasi OLT kini mengubah baris baru jadi koma.

### 2. Injeksi HTML di peta (Sedang)
`esc()` di `LeafletMap.tsx` mengganti `&`→`&`, `<`→`<` (tidak meng-escape apa pun); tooltip
garis ONU memakai label mentah. Nama ONU/pelanggan/titik FTTH berisi tag ikut dirender sebagai
HTML. CSP (`script-src 'self'`, tanpa `unsafe-inline`) mencegah eksekusi skrip inline, tetapi
injeksi HTML (link/tampilan palsu) tetap mungkin. Perbaikan: `lib/html.ts escapeHtml` + semua
popup/tooltip/hasil ping memakainya; tes `escapeHtml.test.ts`.

### 3. Pengaturan alert bisa diubah akun lihat-saja (Sedang)
`PUT /api/system-config` hanya butuh login untuk kunci alert/korelasi/eskalasi. Kini non-super-admin
wajib izin `customization` (sama dengan halaman Pengaturan Alert).

### 4. Pillow (Sedang)
Pillow 11.3 memiliki banyak CVE dekoder (BMP RLE alokasi memori, heap overflow libopenjp2 di wheel).
Pillow dipakai membuat ikon dari logo unggahan (super admin). Perbaikan: `Pillow>=13,<14` dan
`Image.open(..., formats=[PNG, JPEG, WEBP, GIF])` sehingga dekoder lain tidak pernah dijangkau
walau server belum memperbarui paket.

### 5. Password ACS `***` (Sedang, fungsional)
`/api/tr069` menyamarkan password ACS; wizard menyalin nilai `***` itu ke payload provisioning
dan backend mengirimnya ke OLT. Perbaikan: `_unmask_acs_password()` di `_sanitize_provisioning_input`
mengambil password tersimpan dari profil (id profil, cadangan URL+username), tidak pernah mengirim `***`.

### 6–10 (Rendah)
- `/metrics`: kini hanya `Authorization: Bearer $METRICS_TOKEN` atau sesi super admin; selain itu 404.
- `GET /api/system-config`: kunci yang mengandung `_enc`, password, secret, token, api_key, private,
  community disamarkan untuk non-super-admin.
- Batas ukuran request: 25 MB (`MAX_REQUEST_MB`), kecuali restore database (super admin).
- `/api/ftth/auto-route`: koordinat wajib angka dalam jangkauan.
- Apply Update dan `deploy/update_vps.sh` kini menjalankan `pip install -r requirements.txt`
  bila file itu berubah (gagal tidak menghentikan update).

## Diterima / dicatat (tidak diubah)

- **paramiko 3.5 (SHA-1 RSA)**: OLT lama butuh SHA-1; upgrade mayor berisiko memutus SSH ke OLT.
  `AutoAddPolicy` SSH OLT di jaringan manajemen — risiko MITM rendah di LAN.
- **RouterOS**: MD5 pada login API lama (diwajibkan protokol) dan `verify=False` untuk sertifikat
  self-signed router.
- **i18next < 26.3.4** (DoS lewat sumber terjemahan berbahaya): sumber terjemahan statis di repo;
  upgrade adalah versi mayor — dijadwalkan terpisah.
- **CSP** masih mengizinkan skrip dari `unpkg.com` — sebaiknya dibundel lokal (rencana).
- Swagger FastAPI (`/docs`) sudah mati di produksi; WebSocket memakai token HMAC 60 detik + izin per kanal.

## Yang sudah baik

CSRF via header `X-Requested-With`; cookie sesi Secure/HttpOnly/SameSite; tanpa CORS terbuka di
Flask, CORS FastAPI dibatasi; rate-limit login; kredensial integrasi terenkripsi Fernet; password v3
SNMP/ACS/CLI disamarkan di API; unggahan foto divalidasi magic bytes dan disajikan lewat
`send_from_directory`; tidak ada kredensial di riwayat git; API token di-hash; endpoint internal
`/broadcast` dan WA inbound memakai kunci internal + localhost.

Catatan: NMS saat ini satu tenant — bagian "SaaS multi-tenant" di AGENTS.md menggambarkan desain lama
(tidak ada lagi kode `tenant_id` di route); isolasi akses sepenuhnya berbasis izin role.

## Pemindai yang dijalankan

Bandit (316 temuan, mayoritas `try/except/pass` dan pola subprocess/URL yang diharapkan),
pip-audit (Pillow, paramiko), npm audit (i18next), detect-secrets + pencarian riwayat git (bersih),
analisis AST route (536 route; semua route tulis memakai dekorator izin atau pemeriksaan inline).
Semgrep registry tidak bisa diunduh dari lingkungan audit; diganti analisis AST khusus.

Tes regresi: `backend/tests/test_security_audit_2026_11.py`, `frontend/src/__tests__/escapeHtml.test.ts`.
