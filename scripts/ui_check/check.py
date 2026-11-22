"""Uji responsif: buka setiap halaman di 6 lebar layar, gagal bila ada
halaman yang melebar keluar layar (scroll horizontal).

    pip install playwright && python -m playwright install chromium
    UI_CHECK_PASSWORD=... python scripts/ui_check/check.py [--shots DIR]

Butuh server dari serve.py dengan data dari seed.py.
"""
import argparse
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get('UI_CHECK_BASE', 'http://127.0.0.1:5055')
USER = os.environ.get('UI_CHECK_USER', 'uicheck')
PASSWORD = os.environ.get('UI_CHECK_PASSWORD', '')
if not PASSWORD:
    sys.exit('Set UI_CHECK_PASSWORD (password akun uji, bebas — mis. hasil openssl rand -hex 16)')

ROUTES = [
    '/dashboard', '/dashboard/onus', '/dashboard/onus?filter=problem', '/dashboard/onus/1',
    '/dashboard/onus/unconfigured', '/dashboard/onus/register', '/dashboard/onus/provision',
    '/dashboard/settings/olts', '/dashboard/settings/olts/1/config', '/dashboard/settings/mikrotik',
    '/dashboard/ftth', '/dashboard/traffic', '/dashboard/templates', '/dashboard/templates/tr069-profile',
    '/dashboard/settings/alerts', '/dashboard/alerts/history', '/dashboard/logs', '/dashboard/olt-logs',
    '/dashboard/reports', '/dashboard/terminal', '/dashboard/customization', '/dashboard/users',
    '/dashboard/profile', '/dashboard/settings/auto-provision', '/dashboard/settings/cloudflare',
    '/dashboard/settings/ai', '/dashboard/settings/update', '/dashboard/guide',
]
WIDTHS = [360, 390, 768, 1024, 1440, 1920]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', help='simpan tangkapan layar ke folder ini')
    ap.add_argument('--widths', default=','.join(map(str, WIDTHS)))
    args = ap.parse_args()
    widths = [int(w) for w in args.widths.split(',')]
    if args.shots:
        os.makedirs(args.shots, exist_ok=True)

    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w in widths:
            ctx = browser.new_context(viewport={'width': w, 'height': 900 if w >= 768 else 844})
            page = ctx.new_page()
            page.goto(BASE + '/login')
            page.wait_for_selector('input[type=password]')
            page.fill('input[type=text], input[name=username]', USER)
            page.fill('input[type=password]', PASSWORD)
            page.keyboard.press('Enter')
            page.wait_for_url('**/dashboard**', timeout=15000)
            # sembunyikan prompt notifikasi push supaya tidak menutupi halaman
            page.evaluate("try { localStorage.setItem('nms-push-prompt-dismissed', String(Date.now())) } catch (e) {}")
            for r in ROUTES:
                page.goto(BASE + r)
                page.wait_for_timeout(1500)
                sw = page.evaluate('document.documentElement.scrollWidth')
                cw = page.evaluate('document.documentElement.clientWidth')
                ok = sw <= cw + 1
                print(f'{"OK  " if ok else "FAIL"} {w:>4}px {r}  scrollWidth={sw} clientWidth={cw}')
                if not ok:
                    failures.append((w, r, sw, cw))
                if args.shots:
                    name = r.strip('/').replace('/', '_').replace('?', '_').replace('=', '-')
                    page.screenshot(path=os.path.join(args.shots, f'{w}_{name}.png'))
            ctx.close()
        browser.close()

    if failures:
        print(f'\n{len(failures)} halaman melebar keluar layar:')
        for w, r, sw, cw in failures:
            print(f'  {w}px {r}: {sw} > {cw}')
        sys.exit(1)
    print(f'\nSemua {len(ROUTES)} halaman muat di {len(widths)} lebar layar.')


if __name__ == '__main__':
    main()
