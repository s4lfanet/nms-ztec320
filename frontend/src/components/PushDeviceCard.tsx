import { useState, useEffect } from 'react';
import { Bell, Send, Smartphone, CheckCircle2 } from 'lucide-react';
import { toast } from './Toast';
import { Button, Card } from './ui';
import { api } from '../lib/api';
import { getPushState, enablePush, disablePush } from '../lib/push';

/** Kartu aktif/nonaktif Web Push untuk perangkat ini (dipakai di Alert Settings & Profil). */
export function PushDeviceCard() {
  const [state, setState] = useState<string>('unsubscribed');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getPushState().then(setState); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state === 'subscribed') {
        await disablePush();
        setState('unsubscribed');
        toast.success('Web Push dinonaktifkan di perangkat ini');
      } else {
        const ok = await enablePush();
        setState(ok ? 'subscribed' : 'unsubscribed');
        if (ok) toast.success('Web Push aktif — perangkat ini akan menerima alert');
        else toast.error('Izin notifikasi ditolak browser');
      }
    } catch (e) {
      toast.error((e as Error).message || 'Gagal mengatur Web Push');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      await api.pushTest();
      toast.success('Test push terkirim — cek notifikasi di perangkat ini');
    } catch (e) {
      toast.error((e as Error).message || 'Test push gagal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      icon={<Smartphone size={16} />}
      title="Web Push (Browser ini)"
      action={
        state === 'subscribed' ? (
          <span className="badge badge-success inline-flex items-center gap-1"><CheckCircle2 size={12} /> Aktif</span>
        ) : state === 'unsupported' ? (
          <span className="badge badge-neutral">Tidak didukung</span>
        ) : state === 'denied' ? (
          <span className="badge badge-danger">Diblokir browser</span>
        ) : (
          <span className="badge badge-neutral">Nonaktif</span>
        )
      }
    >
      <p className="text-xs text-tx3 mb-3">Terima alert sebagai notifikasi sistem di perangkat ini — walau aplikasi sedang tidak dibuka. Nyalakan juga toggle 'Web Push' di aturan alert.</p>
      <div className="flex flex-wrap items-center gap-2">
        {state !== 'unsupported' && (
          <Button variant="primary" icon={<Bell size={14} />} onClick={toggle} loading={busy}>
            {state === 'subscribed' ? 'Nonaktifkan' : 'Aktifkan Web Push'}
          </Button>
        )}
        {state === 'subscribed' && (
          <Button variant="secondary" icon={<Send size={14} />} onClick={sendTest} loading={busy}>
            Kirim Test
          </Button>
        )}
        {state === 'denied' && (
          <p className="text-xs text-tx3">Buka pengaturan situs di browser (ikon gembok di address bar) → izinkan Notifications → refresh halaman.</p>
        )}
      </div>
    </Card>
  );
}
