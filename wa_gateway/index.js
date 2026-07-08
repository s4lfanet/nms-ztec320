/**
 * FiberNMS Native WhatsApp Gateway
 * Uses Baileys (WhatsApp Web API) to send messages without third-party services.
 *
 * Endpoints:
 *   GET  /status    — { connected, hasQR, phone }
 *   GET  /qr        — { qr: dataURL } or { qr: null }
 *   POST /send      — { phone, message } → { success }
 *   POST /logout    — disconnect and clear auth
 */

const express = require('express');
const { useMultiFileAuthState, default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.WA_GATEWAY_PORT || 3001;
const AUTH_DIR = process.env.WA_AUTH_DIR ? path.resolve(process.env.WA_AUTH_DIR) : path.join(__dirname, 'auth_state');

let sock = null;
let lastQR = null;
let connected = false;
let connecting = false;
let connectionStartTime = null;

async function connectWA() {
  if (connecting) return;
  connecting = true;

  try {
    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['FiberNMS', 'Chrome', '1.0.0'],
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        lastQR = qr;
        connected = false;
        console.log('[WA] QR code generated — scan to connect');
      }

      if (connection === 'open') {
        connected = true;
        lastQR = null;
        connectionStartTime = Date.now();
        connecting = false;
        console.log('[WA] Connected to WhatsApp');
      }

      if (connection === 'close') {
        connected = false;
        connecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (statusCode === DisconnectReason.loggedOut) {
          // User logged out — clear auth state
          console.log('[WA] Logged out — clearing auth state');
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          lastQR = null;
        }

        if (shouldReconnect) {
          console.log('[WA] Reconnecting...');
          setTimeout(() => connectWA(), 3000);
        }
      }
    });

    sock.ev.on('messages.upsert', () => {
      // We don't process incoming messages — send-only gateway
    });

  } catch (err) {
    console.error('[WA] Connection error:', err.message);
    connecting = false;
    setTimeout(() => connectWA(), 5000);
  }
}

// ─── Routes ───

app.get('/status', (req, res) => {
  res.json({
    connected,
    hasQR: !!lastQR,
    uptime: connected && connectionStartTime ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0,
  });
});

app.get('/qr', async (req, res) => {
  if (!lastQR) {
    return res.json({ qr: null, message: 'No QR available. Already connected or connecting...' });
  }
  try {
    const qrImage = await QRCode.toDataURL(lastQR, { width: 400, margin: 2 });
    res.json({ qr: qrImage });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR image' });
  }
});

app.post('/send', async (req, res) => {
  if (!connected || !sock) {
    return res.status(503).json({ error: 'WhatsApp not connected. Scan QR code first.' });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }

  try {
    // Normalize phone number to JID format
    let jid = phone.replace(/[^0-9]/g, '');
    // Indonesian: convert 08xxx → 628xxx, or 8xxx → 628xxx
    if (jid.startsWith('08')) {
      jid = '62' + jid.substring(1);
    } else if (jid.startsWith('8') && jid.length >= 9) {
      jid = '62' + jid;
    } else if (jid.startsWith('0')) {
      jid = '62' + jid.substring(1);
    }
    if (!jid.includes('@')) {
      jid = `${jid}@s.whatsapp.net`;
    }

    await sock.sendMessage(jid, { text: message });
    console.log(`[WA] Message sent to ${phone} (jid: ${jid})`);
    res.json({ success: true });
  } catch (err) {
    console.error('[WA] Send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    connected = false;
    lastQR = null;
    sock = null;
    console.log('[WA] Logged out and auth cleared');
    res.json({ success: true });
    // Reconnect to generate new QR
    setTimeout(() => connectWA(), 2000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/reconnect', (req, res) => {
  if (sock) {
    sock.end();
  }
  setTimeout(() => connectWA(), 1000);
  res.json({ success: true, message: 'Reconnecting...' });
});

// ─── Start ───

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[WA] FiberNMS WhatsApp Gateway running on port ${PORT}`);
  connectWA();
});
