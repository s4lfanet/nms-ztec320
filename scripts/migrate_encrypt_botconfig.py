#!/usr/bin/env python3
"""
Script migrasi one-time: Re-encrypt bot_token & api_key di tabel bot_config.

Latar belakang:
  Sebelumnya BotConfig.bot_token dan api_key disimpan sebagai plain text.
  Sekarang sudah dienkripsi menggunakan encrypt_field/decrypt_field (Fernet).
  decrypt_field() sudah punya fallback untuk plain text lama, jadi baca masih OK.
  Tapi untuk benar-benar mengamankan data, nilai lama harus di-re-encrypt.

Cara pakai:
  py -3 scripts/migrate_encrypt_botconfig.py

Aman untuk dijalankan berkali-kali (idempotent).
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import BotConfig, encrypt_field, decrypt_field


def migrate():
    with app.app_context():
        configs = BotConfig.query.all()
        if not configs:
            print("Tidak ada data BotConfig di database.")
            return

        updated = 0
        for cfg in configs:
            changed = False

            # bot_token: baca via decrypt_field (handles both plain/encrypted)
            # lalu simpan kembali via encrypt_field
            raw_token = decrypt_field(cfg._bot_token_enc)
            if raw_token:
                new_enc = encrypt_field(raw_token)
                if new_enc != cfg._bot_token_enc:
                    cfg._bot_token_enc = new_enc
                    changed = True

            # api_key: sama
            raw_key = decrypt_field(cfg._api_key_enc)
            if raw_key:
                new_enc = encrypt_field(raw_key)
                if new_enc != cfg._api_key_enc:
                    cfg._api_key_enc = new_enc
                    changed = True

            if changed:
                updated += 1
                print(f"  Re-encrypted: bot_type={cfg.bot_type} id={cfg.id}")

        if updated:
            db.session.commit()
            print(f"\nSelesai: {updated} dari {len(configs)} BotConfig berhasil di-re-encrypt.")
        else:
            print(f"Semua {len(configs)} BotConfig sudah terenkripsi atau tidak ada nilai yang perlu di-update.")


if __name__ == '__main__':
    print("=== Migrasi Enkripsi BotConfig ===")
    migrate()
