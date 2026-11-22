#!/bin/bash
# Pasang helper rute (salfanet-route) + izin sudo khusus untuk user aplikasi.
# Jalankan SEKALI sebagai root:  bash /opt/salfanet-nms/deploy/setup_routes.sh
# Setelah itu rute server NMS → jaringan pelanggan PPPoE diatur dari web
# (halaman MikroTik → "Rute server NMS ke pelanggan").
#
# Helper disalin ke /usr/local/sbin (milik root) — sudoers TIDAK menunjuk ke file
# di repo, karena repo dimiliki user aplikasi dan bisa diubah olehnya.
set -e
APP_NAME="${APP_NAME:-salfanet-nms}"
APP_USER="${APP_USER:-salfanet}"
SRC="$(cd "$(dirname "$0")" && pwd)/salfanet-route"

if [ "$(id -u)" != "0" ]; then
    echo "Jalankan sebagai root." >&2
    exit 1
fi
command -v python3 >/dev/null || { echo "python3 tidak ditemukan" >&2; exit 1; }

install -o root -g root -m 0755 "$SRC" /usr/local/sbin/salfanet-route
cat > /etc/sudoers.d/${APP_NAME}-routes << EOF
${APP_USER} ALL=(root) NOPASSWD: /usr/local/sbin/salfanet-route
EOF
chmod 440 /etc/sudoers.d/${APP_NAME}-routes
if ! visudo -cf /etc/sudoers.d/${APP_NAME}-routes > /dev/null; then
    rm -f /etc/sudoers.d/${APP_NAME}-routes
    echo "sudoers tidak valid — dibatalkan" >&2
    exit 1
fi
sudo -u "${APP_USER}" sudo -n /usr/local/sbin/salfanet-route check >/dev/null && \
    echo "OK: helper rute terpasang. Atur rute dari web NMS → MikroTik → Rute server NMS ke pelanggan."
