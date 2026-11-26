"""Hapus latar foto OLT → objek saja (PNG transparan, dipotong rapat).

Utama: model segmentasi `silueta` (ONNX, ±43 MB) lewat onnxruntime — diunduh sekali ke
instance/models/ saat pertama dipakai. Tanpa onnxruntime/model (mis. server offline) dipakai
cadangan: latar polos dari tepi gambar. Hasil yang tidak masuk akal (objek hilang / seluruh gambar)
dibuang dan foto asli dipakai apa adanya — fungsi ini tidak pernah membuat unggahan gagal."""
import hashlib
import logging
import os
import threading
import time
import urllib.request

logger = logging.getLogger(__name__)

MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx'
MODEL_SHA256 = '75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb'
MODEL_NAME = 'silueta.onnx'
SIZE = 320                      # sisi input model
MIN_COVER, MAX_COVER = 0.04, 0.97   # luas objek wajar terhadap seluruh gambar
PAD = 0.03                      # ruang di sekeliling objek saat dipotong

_lock = threading.Lock()
_session = None
_retry_after = 0.0              # setelah gagal muat/unduh model, jangan coba lagi sampai waktu ini


def _model_path():
    from flask import current_app
    d = os.path.join(current_app.instance_path, 'models')
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, MODEL_NAME)


def _download(path):
    tmp = path + '.part'
    with urllib.request.urlopen(MODEL_URL, timeout=90) as r, open(tmp, 'wb') as f:
        h = hashlib.sha256()
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            h.update(chunk); f.write(chunk)
    if h.hexdigest() != MODEL_SHA256:
        os.remove(tmp)
        raise ValueError('checksum model tidak cocok')
    os.replace(tmp, path)


def _get_session():
    """Sesi onnxruntime (dibuat sekali). None bila tidak tersedia."""
    global _session, _retry_after
    if _session is not None:
        return _session
    if time.time() < _retry_after:
        return None
    with _lock:
        if _session is not None:
            return _session
        try:
            import onnxruntime as ort
            path = _model_path()
            if not os.path.isfile(path):
                _download(path)
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            _session = ort.InferenceSession(path, opts, providers=['CPUExecutionProvider'])
        except Exception as e:
            logger.warning('model hapus-latar tidak tersedia, pakai cadangan: %s', e)
            _retry_after = time.time() + 600
            return None
    return _session


def _predict(im):
    """Peta kepercayaan objek 0..1 (float32, ukuran gambar), atau None."""
    import numpy as np
    from PIL import Image
    sess = _get_session()
    if sess is None:
        return None
    rgb = im.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    a = np.asarray(rgb, dtype=np.float32)
    a = a / max(float(a.max()), 1e-6)
    a = (a - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: a.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
    out = (out - out.min()) / max(float(out.max() - out.min()), 1e-6)
    m = Image.fromarray((out * 255).astype('uint8')).resize(im.size, Image.LANCZOS)
    return np.asarray(m, dtype=np.float32) / 255.0


def _uniform_bg_mask(im, tol=28):
    """Cadangan: bila tepi gambar berwarna hampir seragam, anggap itu latar dan buang
    daerah serupa yang tersambung ke tepi. → peta 0..1 atau None."""
    import numpy as np
    from PIL import Image
    small = im.convert('RGB')
    small.thumbnail((256, 256))
    a = np.asarray(small, dtype=np.int16)
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    if np.abs(edge - bg).max(axis=1).mean() > tol / 2:      # tepi tidak seragam → bukan latar polos
        return None
    near = (np.abs(a - bg).max(axis=2) <= tol)
    # hanya yang tersambung ke tepi (isi dari tepi), agar bagian dalam objek yang mirip latar tidak bolong
    reach = np.zeros_like(near)
    reach[0, :], reach[-1, :], reach[:, 0], reach[:, -1] = near[0, :], near[-1, :], near[:, 0], near[:, -1]
    for _ in range(max(near.shape)):
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]; grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]; grown[:, :-1] |= reach[:, 1:]
        grown &= near
        if (grown == reach).all():
            break
        reach = grown
    obj = (~reach).astype('uint8') * 255
    return np.asarray(Image.fromarray(obj).resize(im.size, Image.LANCZOS), dtype=np.float32) / 255.0


def _apply(im, m):
    """Pasang peta m sebagai alpha lalu potong rapat. → (RGBA, ok)."""
    import numpy as np
    from PIL import Image
    alpha = np.clip((m - 0.15) / 0.7, 0.0, 1.0)
    cover = float((alpha > 0.5).mean())
    if not (MIN_COVER <= cover <= MAX_COVER):
        return im, False
    rgba = im.convert('RGBA')
    if 'A' in im.getbands():                                   # hormati transparansi asli
        alpha = np.minimum(alpha, np.asarray(im.getchannel('A'), dtype=np.float32) / 255.0)
    rgba.putalpha(Image.fromarray((alpha * 255).astype('uint8')))
    ys, xs = np.where(alpha > 0.06)
    if not len(xs):
        return im, False
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    px, py = int((x1 - x0) * PAD) + 1, int((y1 - y0) * PAD) + 1
    box = (max(0, x0 - px), max(0, y0 - py), min(im.width, x1 + px), min(im.height, y1 + py))
    return rgba.crop(box), True


def remove_background(im):
    """→ (gambar, dihapus: bool). Gambar tetap utuh (tanpa perubahan) bila gagal/tidak masuk akal."""
    try:
        m = _predict(im)
        if m is None:
            m = _uniform_bg_mask(im)
        if m is None:
            return im, False
        return _apply(im, m)
    except Exception as e:
        logger.warning('hapus latar gagal: %s', e)
        return im, False
