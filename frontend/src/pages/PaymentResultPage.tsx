import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CheckCircle, XCircle, Clock, Loader2, Zap, ArrowRight } from 'lucide-react';

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = searchParams.get('status') || '';
  const order = searchParams.get('order') || '';
  const [polling, setPolling] = useState(true);
  const [brandName, setBrandName] = useState('');
  const [baseDomain, setBaseDomain] = useState('salfa.my.id');

  useEffect(() => {
    fetch('/api/public/branding').then(r => r.json()).then(d => {
      setBrandName(d.nms_name || 'FiberNMS');
      if (d.base_domain) setBaseDomain(d.base_domain);
    }).catch(() => { setBrandName('FiberNMS'); });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['registration-status', order],
    queryFn: () => api.publicRegistrationStatus(order),
    enabled: !!order,
    refetchInterval: polling ? 3000 : false,
  });

  useEffect(() => {
    if (data && (data.status === 'paid' || data.status === 'failed')) {
      setPolling(false);
    }
  }, [data]);

  const isSuccess = status === 'success' || data?.status === 'paid';
  const isFailed = status === 'failed' || data?.status === 'failed';
  const isPending = !isSuccess && !isFailed;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-tx1 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-brd/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
              <Zap size={20} className="text-accent" />
            </div>
            <span className="text-lg font-bold">{brandName}</span>
          </button>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 md:p-12 max-w-md w-full text-center">
          {isLoading || (isPending && polling) ? (
            <>
              <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
                <Loader2 size={32} className="text-accent animate-spin" />
              </div>
              <h2 className="text-xl font-bold mb-2">Menunggu Konfirmasi</h2>
              <p className="text-sm text-tx3 mb-4">
                Sedang menunggu konfirmasi pembayaran dari payment gateway...
              </p>
              <p className="text-xs text-tx3">Order ID: {order}</p>
            </>
          ) : isSuccess ? (
            <>
              <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-success" />
              </div>
              <h2 className="text-xl font-bold mb-2">Pembayaran Berhasil!</h2>
              <p className="text-sm text-tx3 mb-2">
                Tenant <span className="font-semibold text-tx1">{data?.tenant_name}</span> telah aktif.
              </p>
              <p className="text-sm text-tx3 mb-6">
                Anda dapat login menggunakan username dan password yang Anda buat.
              </p>
              <div className="glass-card rounded-xl p-4 mb-6 text-left">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-tx3">Status Tenant</span>
                  <span className="text-success font-medium">Active</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-tx3">Subdomain</span>
                  <span className="font-mono text-xs">{data?.subdomain}.{baseDomain}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-tx3">Amount</span>
                  <span className="font-medium">Rp {data?.amount?.toLocaleString('id-ID')}</span>
                </div>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all flex items-center justify-center gap-2"
              >
                Login Sekarang <ArrowRight size={18} />
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-danger/15 flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} className="text-danger" />
              </div>
              <h2 className="text-xl font-bold mb-2">Pembayaran Gagal</h2>
              <p className="text-sm text-tx3 mb-6">
                Pembayaran tidak berhasil. Silakan coba daftar ulang atau hubungi support.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/register')}
                  className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all"
                >
                  Daftar Ulang
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 py-3 rounded-xl glass-card border border-brd hover:border-accent/50 font-medium transition-all"
                >
                  Ke Beranda
                </button>
              </div>
            </>
          )}

          {!isLoading && isPending && !polling && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-tx3">
              <Clock size={16} /> Pembayaran masih pending
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
