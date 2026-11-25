"""Laporan PDF mingguan pemantauan SNMP → Telegram (sendDocument) & WhatsApp bawaan NMS (/send-file).

WA gateway pihak ketiga tidak dipakai di sini (API file tiap penyedia berbeda); mereka tetap
menerima ringkasan teks dari snmp_digest. Hanya membaca data SNMP; tidak mengubah apa pun."""
import base64
import json
import logging
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from models import (SnmpDevice, SnmpEvent, SnmpPort, SnmpSensorRule, SnmpMaintenance)
from snmp_digest import downtime_seconds, _fmt_dur

logger = logging.getLogger(__name__)


def _txt(s, n=40):
    """Font inti PDF hanya latin-1: buang karakter lain (emoji, dll)."""
    return str(s if s is not None else '').encode('latin-1', 'replace').decode('latin-1')[:n]


def collect(now=None, days=7):
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    start = now - timedelta(days=days)
    devs = SnmpDevice.query.filter_by(enabled=True).order_by(SnmpDevice.name).all()
    evs = SnmpEvent.query.filter(SnmpEvent.created_at >= start).all()
    by_dev, flaps = {}, {}
    for e in evs:
        if e.kind in ('device_down', 'device_up'):
            by_dev.setdefault(e.device_id, []).append((e.kind, e.created_at))
        elif e.kind == 'port_down' and e.port_id:
            flaps[e.port_id] = flaps.get(e.port_id, 0) + 1
    span = days * 86400
    rows = []
    for d in devs:
        dev_evs = by_dev.get(d.id, [])
        down = downtime_seconds(dev_evs, start, now)
        rows.append({'name': d.name, 'host': d.host, 'status': d.status or 'unknown',
                     'downs': sum(1 for k, _ in dev_evs if k == 'device_down'),
                     'down_s': down, 'uptime': max(0.0, 100 - down / span * 100)})
    names = {d.id: d.name for d in devs}
    top_ports = []
    if flaps:
        pn = {p.id: p for p in SnmpPort.query.filter(SnmpPort.id.in_(list(flaps))).all()}
        for pid, n in sorted(flaps.items(), key=lambda kv: -kv[1])[:10]:
            p = pn.get(pid)
            if p:
                top_ports.append((names.get(p.device_id, '?'), p.name, n))
    busy = []
    for p in SnmpPort.query.filter_by(watched=True, ignored=False, deleted=False).all():
        if p.speed_mbps and p.oper_status == 'up' and p.device_id in names:
            u = max(p.in_bps or 0, p.out_bps or 0) / (p.speed_mbps * 1e6) * 100
            busy.append((u, names[p.device_id], p.name))
    busy.sort(reverse=True)
    rules = [(names.get(r.device_id, '?'), r.name or r.metric, r.status)
             for r in SnmpSensorRule.query.filter(SnmpSensorRule.enabled.is_(True),
                                                  SnmpSensorRule.status.in_(('warning', 'down'))).all()
             if r.device_id in names]
    n_maint = SnmpMaintenance.query.filter(SnmpMaintenance.end_time >= start,
                                           SnmpMaintenance.start_time <= now).count()
    avg = sum(r['uptime'] for r in rows) / len(rows) if rows else 100.0
    return {'now': now, 'start': start, 'days': days, 'rows': rows, 'avg': avg,
            'top_ports': top_ports, 'busy': busy[:10], 'rules': rules, 'maint': n_maint}


def _brand():
    try:
        from routes_reports import _branding
        return _txt(_branding().get('name') or 'Salfanet NMS', 60)
    except Exception:
        return 'Salfanet NMS'


def build_pdf(now=None, days=7):
    """→ bytes PDF, atau None bila belum ada perangkat SNMP."""
    c = collect(now, days)
    if not c['rows']:
        return None
    from fpdf import FPDF
    pdf = FPDF(orientation='P', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    W = pdf.w - pdf.l_margin - pdf.r_margin

    def h2(text):
        pdf.ln(3)
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(30, 41, 59)
        pdf.cell(0, 7, text, new_x='LMARGIN', new_y='NEXT')

    def table(head, widths, data, colors=None):
        pdf.set_font('Helvetica', 'B', 8)
        pdf.set_fill_color(30, 41, 59); pdf.set_text_color(255, 255, 255)
        for h, w in zip(head, widths):
            pdf.cell(w * W, 6, h, border=1, fill=True)
        pdf.ln()
        pdf.set_font('Helvetica', '', 8)
        for i, row in enumerate(data):
            if pdf.get_y() > pdf.h - 22:
                pdf.add_page()
            pdf.set_fill_color(*((245, 247, 250) if i % 2 else (255, 255, 255)))
            for j, (v, w) in enumerate(zip(row, widths)):
                col = (colors or {}).get((i, j))
                pdf.set_text_color(*(col or (0, 0, 0)))
                pdf.cell(w * W, 5.5, _txt(v), border=1, fill=True)
            pdf.ln()
        pdf.set_text_color(0, 0, 0)

    pdf.set_font('Helvetica', 'B', 16)
    pdf.cell(0, 9, _brand(), new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 11)
    pdf.cell(0, 6, f'Laporan Pemantauan SNMP - {days} hari', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', 'I', 8)
    pdf.cell(0, 5, f'Periode {c["start"]:%d-%m-%Y %H:%M} s/d {c["now"]:%d-%m-%Y %H:%M} (UTC)',
             new_x='LMARGIN', new_y='NEXT')

    rows = c['rows']
    n_up = sum(1 for r in rows if r['status'] == 'up')
    h2('Ringkasan')
    pdf.set_font('Helvetica', '', 10)
    for line in (f'Perangkat dipantau: {len(rows)}  (naik: {n_up}, turun/lainnya: {len(rows) - n_up})',
                 f'Rata-rata ketersediaan: {c["avg"]:.2f}%',
                 f'Sensor kustom bermasalah: {len(c["rules"])}',
                 f'Jendela pemeliharaan di periode ini: {c["maint"]}'):
        pdf.cell(0, 5.5, line, new_x='LMARGIN', new_y='NEXT')

    h2('Ketersediaan per perangkat')
    data = [(r['name'], r['host'], r['status'], f'{r["uptime"]:.2f}%', r['downs'],
             _fmt_dur(r['down_s']) if r['down_s'] else '-') for r in sorted(rows, key=lambda r: r['uptime'])]
    colors = {}
    for i, r in enumerate(sorted(rows, key=lambda r: r['uptime'])):
        if r['status'] != 'up':
            colors[(i, 2)] = (200, 30, 30)
        if r['uptime'] < 99:
            colors[(i, 3)] = (200, 30, 30)
    table(['Perangkat', 'Alamat', 'Status', 'Uptime', 'Turun', 'Total turun'],
          [0.28, 0.2, 0.12, 0.12, 0.1, 0.18], data, colors)

    if c['rules']:
        h2('Sensor kustom bermasalah saat ini')
        table(['Perangkat', 'Sensor', 'Status'], [0.35, 0.45, 0.2],
              [(a, b, s.upper()) for a, b, s in c['rules']],
              {(i, 2): ((200, 30, 30) if s == 'down' else (180, 110, 0)) for i, (_, _, s) in enumerate(c['rules'])})
    if c['top_ports']:
        h2('Port paling sering naik-turun')
        table(['Perangkat', 'Port', 'Kejadian'], [0.4, 0.4, 0.2], [(a, b, f'{n}x') for a, b, n in c['top_ports']])
    if c['busy']:
        h2('Port dipantau paling padat (saat ini)')
        table(['Perangkat', 'Port', 'Utilisasi'], [0.4, 0.4, 0.2], [(a, b, f'{u:.0f}%') for u, a, b in c['busy']])

    pdf.set_auto_page_break(False)   # footer di margin bawah tidak boleh memicu halaman kosong
    pdf.set_y(-15)
    pdf.set_font('Helvetica', 'I', 7)
    pdf.cell(0, 5, f'Dibuat otomatis oleh {_brand()}', align='C')
    return bytes(pdf.output())


# ─── pengiriman ───

def _telegram_document(config, pdf, filename, caption):
    b = uuid.uuid4().hex
    parts = []
    for k, v in (('chat_id', config.chat_id), ('caption', caption)):
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode('utf-8'))
    parts.append((f'--{b}\r\nContent-Disposition: form-data; name="document"; filename="{filename}"\r\n'
                  'Content-Type: application/pdf\r\n\r\n').encode() + pdf + b'\r\n')
    parts.append(f'--{b}--\r\n'.encode())
    req = urllib.request.Request(f'https://api.telegram.org/bot{config.bot_token}/sendDocument',
                                 data=b''.join(parts),
                                 headers={'Content-Type': f'multipart/form-data; boundary={b}'})
    return urllib.request.urlopen(req, timeout=30).status == 200


def _wa_native_document(config, pdf, filename, caption):
    payload = json.dumps({'phone': config.phone_number, 'filename': filename, 'caption': caption,
                          'mimetype': 'application/pdf',
                          'data': base64.b64encode(pdf).decode()}).encode('utf-8')
    req = urllib.request.Request('http://localhost:3000/send-file', data=payload,
                                 headers={'Content-Type': 'application/json'})
    return urllib.request.urlopen(req, timeout=60).status in (200, 201)


def send_pdf(now=None, days=7):
    """Bangun PDF & kirim ke Telegram + WA bawaan. → dict kanal→bool, atau None bila tak ada data."""
    pdf = build_pdf(now, days)
    if not pdf:
        return None
    from models import BotConfig
    stamp = (now or datetime.now(timezone.utc)).strftime('%Y%m%d')
    fn = f'laporan-snmp-{stamp}.pdf'
    cap = f'Laporan SNMP {days} hari'
    out = {}
    tg = BotConfig.query.filter_by(bot_type='telegram', enabled=True).first()
    if tg and tg.bot_token and tg.chat_id:
        try:
            out['telegram'] = _telegram_document(tg, pdf, fn, cap)
        except Exception as e:
            logger.warning('snmp report telegram failed: %s', e)
            out['telegram'] = False
    wa = BotConfig.query.filter_by(bot_type='whatsapp_native', enabled=True).first()
    if wa and wa.phone_number:
        try:
            out['whatsapp'] = _wa_native_document(wa, pdf, fn, cap)
        except Exception as e:
            logger.warning('snmp report wa failed: %s', e)
            out['whatsapp'] = False
    return out
