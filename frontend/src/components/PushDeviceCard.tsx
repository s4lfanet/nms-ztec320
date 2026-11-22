import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Send, Smartphone, CheckCircle2 } from 'lucide-react';
import { toast } from './Toast';
import { Button, Card } from './ui';
import { api } from '../lib/api';
import { getPushState, enablePush, disablePush } from '../lib/push';

/** Kartu aktif/nonaktif Web Push untuk perangkat ini (dipakai di Alert Settings & Profil). */
export function PushDeviceCard() {
  const { t } = useTranslation();
  const [state, setState] = useState<string>('unsubscribed');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getPushState().then(setState); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state === 'subscribed') {
        await disablePush();
        setState('unsubscribed');
        toast.success(t('cmp_push.webPushDisabledOn'));
      } else {
        const ok = await enablePush();
        setState(ok ? 'subscribed' : 'unsubscribed');
        if (ok) toast.success(t('cmp_push.webPushOnThis'));
        else toast.error(t('cmp_push.notificationPermissionDeniedBy'));
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
      toast.success(t('cmp_push.testPushSentCheck'));
    } catch (e) {
      toast.error((e as Error).message || 'Test push gagal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      icon={<Smartphone size={16} />}
      title={t('cmp_push.webPushThisBrowser')}
      action={
        state === 'subscribed' ? (
          <span className="badge badge-success inline-flex items-center gap-1"><CheckCircle2 size={12} /> {t('cmp_push.on')}</span>
        ) : state === 'unsupported' ? (
          <span className="badge badge-neutral">{t('cmp_push.notSupported')}</span>
        ) : state === 'denied' ? (
          <span className="badge badge-danger">{t('cmp_push.blockedByBrowser')}</span>
        ) : (
          <span className="badge badge-neutral">{t('cmp_push.off')}</span>
        )
      }
    >
      <p className="text-xs text-tx3 mb-3">{t('cmp_push.receiveAlertsAsSystem')}</p>
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
          <p className="text-xs text-tx3">{t('cmp_push.openTheSiteSettings')}</p>
        )}
      </div>
    </Card>
  );
}
