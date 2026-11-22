"""Endpoint AI agent NMS: pengaturan, tanya dari web, dan pesan masuk WhatsApp."""
import hmac
import os

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

import ai_agent
from helpers import log_action, super_admin_required

bp = Blueprint('ai', __name__)


@bp.route('/api/ai/settings', methods=['GET'])
@super_admin_required
def get_settings():
    cfg = ai_agent.get_config()
    return jsonify({'success': True, 'config': cfg,
                    'default_model': ai_agent.DEFAULT_MODEL, 'default_base': ai_agent.DEFAULT_BASE})


@bp.route('/api/ai/settings', methods=['POST'])
@super_admin_required
def save_settings():
    data = request.get_json(silent=True) or {}
    if data.get('ai_provider') and data['ai_provider'] not in ai_agent.DEFAULT_MODEL:
        return jsonify({'success': False, 'message': 'Provider tidak dikenal'}), 400
    ai_agent.save_config(data)
    log_action('ai_settings', 'settings', detail=f"provider={data.get('ai_provider')} "
                                                f"enabled={data.get('ai_enabled')}")
    return jsonify({'success': True, 'config': ai_agent.get_config()})


@bp.route('/api/ai/test', methods=['POST'])
@super_admin_required
def test_connection():
    ok, message = ai_agent.test_connection()
    return jsonify({'success': ok, 'message': message})


@bp.route('/api/ai/ask', methods=['POST'])
@login_required
def ask():
    if not (current_user.is_super_admin or current_user.has_permission(ai_agent.PERM)):
        return jsonify({'success': False, 'message': 'Tidak punya izin AI Agent'}), 403
    q = ((request.get_json(silent=True) or {}).get('question') or '').strip()
    if not q:
        return jsonify({'success': False, 'message': 'Pertanyaan kosong'}), 400
    answer = ai_agent.ask(f'web:{current_user.id}', q)
    log_action('ai_question', 'ai', target='web', detail=q[:200])
    return jsonify({'success': True, 'answer': answer})


@bp.route('/api/internal/ai/wa-inbound', methods=['POST'])
def wa_inbound():
    """Dipanggil gateway WhatsApp (lokal) untuk tiap pesan teks masuk.

    Autentikasi: header X-Internal-Key = INTERNAL_API_KEY (sama dengan env
    yang diwarisi proses gateway saat dijalankan NMS)."""
    key = os.environ.get('INTERNAL_API_KEY', '')
    got = request.headers.get('X-Internal-Key', '')
    if not key or not hmac.compare_digest(key, got):
        return jsonify({'reply': None}), 403
    data = request.get_json(silent=True) or {}
    sender, text = str(data.get('sender') or ''), str(data.get('text') or '')
    cfg = ai_agent.get_config()
    if cfg['ai_enabled'] != '1' or cfg['ai_channel_whatsapp'] != '1':
        return jsonify({'reply': None})
    if not sender or not text.strip() or not ai_agent.sender_allowed('whatsapp', sender):
        return jsonify({'reply': None})   # pengirim tak dikenal: diam (jangan bocorkan apa pun)
    reply = ai_agent.ask(f'wa:{ai_agent._norm_phone(sender)}', text)
    log_action('ai_question', 'ai', target=f'whatsapp:{ai_agent._norm_phone(sender)}', detail=text[:200])
    return jsonify({'reply': reply})
