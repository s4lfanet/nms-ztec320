"""Fase 6 — CSV/PDF reports: inventory, poor RX, long-offline, alarm summary, OLT SLA.
CSV via streaming StringIO; PDF via fpdf2 (lightweight, no system deps).
All endpoints require login + view_onus permission. Filters: olt_id, days."""
import csv
import io
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, Response, stream_with_context
from flask_login import login_required, current_user

from models import db, OLT, ONU, AlertHistory, OnuStatusHistory, OnuLinkState, SystemConfig
from helpers import permission_required, log_action, utc_iso
from extensions import logger

bp = Blueprint('reports', __name__)


def _branding():
    cfg = {c.key: c.value for c in SystemConfig.query.all()}
    return {
        'name': cfg.get('nms_name', 'Salfanet NMS'),
        'url': cfg.get('base_url', ''),
    }


def _get_olts(olt_id=None):
    """Return list of OLTs the current user can access."""
    q = OLT.query
    if olt_id:
        q = q.filter(OLT.id == int(olt_id))
    return q.order_by(OLT.name).all()


# ─── CSV helpers ───

def _csv_response(filename, headers, rows):
    """Stream a CSV response."""
    def generate():
        si = io.StringIO()
        w = csv.writer(si)
        w.writerow(headers)
        yield si.getvalue()
        si.seek(0); si.truncate(0)
        for row in rows:
            w.writerow(row)
            yield si.getvalue()
            si.seek(0); si.truncate(0)
    resp = Response(stream_with_context(generate()), mimetype='text/csv')
    resp.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp


# ─── PDF helpers ───

def _pdf_response(filename, title, headers, rows, subtitle=''):
    """Generate a simple PDF table with fpdf2."""
    from fpdf import FPDF
    brand = _branding()
    pdf = FPDF(orientation='L', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Header
    pdf.set_font('Helvetica', 'B', 14)
    pdf.cell(0, 8, brand['name'], new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 10)
    pdf.cell(0, 5, title, new_x='LMARGIN', new_y='NEXT')
    if subtitle:
        pdf.set_font('Helvetica', 'I', 8)
        pdf.cell(0, 4, subtitle, new_x='LMARGIN', new_y='NEXT')
    pdf.ln(3)

    # Table
    n_cols = len(headers)
    page_w = pdf.w - 2 * pdf.l_margin
    col_w = page_w / n_cols

    # Header row
    pdf.set_fill_color(30, 41, 59)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 7)
    for h in headers:
        pdf.cell(col_w, 6, str(h)[:30], border=1, fill=True, align='L')
    pdf.ln()

    # Data rows
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Helvetica', '', 7)
    fill = False
    for row in rows:
        if pdf.get_y() > pdf.h - 20:
            pdf.add_page()
            pdf.set_font('Helvetica', 'B', 7)
            pdf.set_fill_color(30, 41, 59)
            pdf.set_text_color(255, 255, 255)
            for h in headers:
                pdf.cell(col_w, 6, str(h)[:30], border=1, fill=True, align='L')
            pdf.ln()
            pdf.set_text_color(0, 0, 0)
            pdf.set_font('Helvetica', '', 7)
        if fill:
            pdf.set_fill_color(240, 240, 240)
        else:
            pdf.set_fill_color(255, 255, 255)
        for val in row:
            pdf.cell(col_w, 5, str(val)[:40], border=1, fill=True, align='L')
        pdf.ln()
        fill = not fill

    # Footer
    pdf.set_y(-15)
    pdf.set_font('Helvetica', 'I', 7)
    pdf.cell(0, 5, f'Dibuat: {datetime.now().strftime("%Y-%m-%d %H:%M")} | {brand["name"]}',
             align='C')

    out = pdf.output()
    resp = Response(bytes(out), mimetype='application/pdf')
    resp.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp


# ─── Report: Inventory ───

@bp.route('/api/reports/inventory.<fmt>')
@login_required
@permission_required('view_onus')
def report_inventory(fmt):
    olt_id = request.args.get('olt_id')
    olts = _get_olts(olt_id)
    olt_map = {o.id: o.name for o in olts}
    olt_ids = set(olt_map.keys())

    q = ONU.query.filter(ONU.olt_id.in_(olt_ids)) if olt_ids else ONU.query
    onus = q.order_by(ONU.olt_id, ONU.frame, ONU.slot, ONU.port, ONU.onu_id).all()

    headers = ['OLT', 'ONU ID', 'Name', 'Serial', 'Status', 'RX (dBm)', 'TX (dBm)',
               'RX ONU (dBm)', 'Distance (m)', 'Type', 'PPPoE', 'Last Seen']
    rows = []
    for o in onus:
        rows.append([
            olt_map.get(o.olt_id, ''),
            o.onu_id_str or '',
            o.name or '',
            o.serial_number or '',
            o.status or '',
            f'{o.rx_power:.2f}' if o.rx_power is not None else '',
            f'{o.tx_power:.2f}' if o.tx_power is not None else '',
            f'{o.onu_rx_power:.2f}' if o.onu_rx_power is not None else '',
            o.distance or '',
            o.actual_type or o.onu_type or '',
            o.pppoe or '',
            o.last_seen.strftime('%Y-%m-%d %H:%M') if o.last_seen else '',
        ])

    title = 'Laporan Inventaris ONU'
    subtitle = f'OLT: {olt_id or "Semua"} | Total: {len(rows)}'
    if fmt == 'csv':
        return _csv_response('inventory.csv', headers, rows)
    return _pdf_response('inventory.pdf', title, headers, rows, subtitle)


# ─── Report: Poor RX ───

@bp.route('/api/reports/poor-rx.<fmt>')
@login_required
@permission_required('view_onus')
def report_poor_rx(fmt):
    olt_id = request.args.get('olt_id')
    threshold = float(request.args.get('threshold', -28.0))
    olts = _get_olts(olt_id)
    olt_map = {o.id: o.name for o in olts}
    olt_ids = set(olt_map.keys())

    q = ONU.query.filter(ONU.olt_id.in_(olt_ids), ONU.status == 'online',
                        ONU.rx_power.isnot(None), ONU.rx_power < threshold)
    onus = q.order_by(ONU.rx_power.asc()).all()

    headers = ['OLT', 'ONU ID', 'Name', 'Serial', 'RX (dBm)', 'TX (dBm)',
               'RX ONU (dBm)', 'Distance (m)', 'PPPoE']
    rows = []
    for o in onus:
        rows.append([
            olt_map.get(o.olt_id, ''),
            o.onu_id_str or '',
            o.name or '',
            o.serial_number or '',
            f'{o.rx_power:.2f}' if o.rx_power is not None else '',
            f'{o.tx_power:.2f}' if o.tx_power is not None else '',
            f'{o.onu_rx_power:.2f}' if o.onu_rx_power is not None else '',
            o.distance or '',
            o.pppoe or '',
        ])

    title = f'Laporan RX Power Buruk (< {threshold} dBm)'
    subtitle = f'Threshold: {threshold} dBm | Total: {len(rows)}'
    if fmt == 'csv':
        return _csv_response('poor_rx.csv', headers, rows)
    return _pdf_response('poor_rx.pdf', title, headers, rows, subtitle)


# ─── Report: Long Offline ───

@bp.route('/api/reports/long-offline.<fmt>')
@login_required
@permission_required('view_onus')
def report_long_offline(fmt):
    olt_id = request.args.get('olt_id')
    days = int(request.args.get('days', 7))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    olts = _get_olts(olt_id)
    olt_map = {o.id: o.name for o in olts}
    olt_ids = set(olt_map.keys())

    q = ONU.query.filter(ONU.olt_id.in_(olt_ids),
                        ONU.status.in_(['offline', 'dyinggasp', 'los']))
    if days > 0:
        q = q.filter(ONU.last_offline.isnot(None), ONU.last_offline < cutoff)
    onus = q.order_by(ONU.last_offline.asc().nullslast()).all()

    headers = ['OLT', 'ONU ID', 'Name', 'Serial', 'Status', 'Last Online',
               'Last Offline', 'Days Offline', 'PPPoE']
    rows = []
    now = datetime.now(timezone.utc)
    for o in onus:
        days_off = ''
        if o.last_offline:
            d = o.last_offline
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            days_off = f'{(now - d).days}'
        rows.append([
            olt_map.get(o.olt_id, ''),
            o.onu_id_str or '',
            o.name or '',
            o.serial_number or '',
            o.status or '',
            o.last_online.strftime('%Y-%m-%d %H:%M') if o.last_online else '',
            o.last_offline.strftime('%Y-%m-%d %H:%M') if o.last_offline else '',
            days_off,
            o.pppoe or '',
        ])

    title = f'Laporan ONU Offline Lama (>= {days} hari)'
    subtitle = f'Periode: {days} hari | Total: {len(rows)}'
    if fmt == 'csv':
        return _csv_response('long_offline.csv', headers, rows)
    return _pdf_response('long_offline.pdf', title, headers, rows, subtitle)


# ─── Report: Alarm Summary ───

@bp.route('/api/reports/alarms.<fmt>')
@login_required
@permission_required('receive_alerts')
def report_alarms(fmt):
    olt_id = request.args.get('olt_id')
    days = int(request.args.get('days', 30))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    olts = _get_olts(olt_id)
    olt_map = {o.id: o.name for o in olts}
    olt_ids = set(olt_map.keys())

    q = AlertHistory.query.filter(AlertHistory.last_alert_at >= cutoff)
    if olt_ids:
        q = q.filter((AlertHistory.olt_id.in_(olt_ids)) |
                     (AlertHistory.olt_id.is_(None)))
    rows_db = q.order_by(AlertHistory.last_alert_at.desc()).all()

    headers = ['OLT', 'Alert Type', 'ONU ID', 'Last Value', 'Last Alert At',
               'Suppressed By']
    rows = []
    for r in rows_db:
        rows.append([
            olt_map.get(r.olt_id, '') if r.olt_id else '',
            r.alert_type or '',
            r.onu_id or '',
            r.last_value or '',
            r.last_alert_at.strftime('%Y-%m-%d %H:%M') if r.last_alert_at else '',
            r.suppressed_by or '',
        ])

    title = f'Ringkasan Alarm ({days} hari terakhir)'
    subtitle = f'Periode: {days} hari | Total: {len(rows)}'
    if fmt == 'csv':
        return _csv_response('alarms.csv', headers, rows)
    return _pdf_response('alarms.pdf', title, headers, rows, subtitle)


# ─── Report: OLT SLA / Uptime ───

@bp.route('/api/reports/olt-sla.<fmt>')
@login_required
@permission_required('view_onus')
def report_olt_sla(fmt):
    days = int(request.args.get('days', 30))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    olts = _get_olts(request.args.get('olt_id'))

    headers = ['OLT', 'IP', 'Vendor', 'Total ONUs', 'Online', 'Offline',
               'LOS', 'DyingGasp', 'Online %', 'Is Online']
    rows = []
    for olt in olts:
        onus = ONU.query.filter_by(olt_id=olt.id).all()
        total = len(onus)
        online = sum(1 for o in onus if o.status == 'online')
        offline = sum(1 for o in onus if o.status == 'offline')
        los = sum(1 for o in onus if o.status == 'los')
        dg = sum(1 for o in onus if o.status == 'dyinggasp')
        pct = f'{(online / total * 100):.1f}' if total else '0.0'
        rows.append([
            olt.name, olt.ip_address, olt.vendor or '',
            total, online, offline, los, dg, pct,
            'Yes' if olt.is_online else 'No',
        ])

    title = f'Laporan SLA/uptime OLT ({days} hari)'
    subtitle = f'Periode: {days} hari | OLT: {len(olts)}'
    if fmt == 'csv':
        return _csv_response('olt_sla.csv', headers, rows)
    return _pdf_response('olt_sla.pdf', title, headers, rows, subtitle)
