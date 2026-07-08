import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type RenewalData } from '../lib/api';
import { CheckCircle, XCircle, Clock, CreditCard, Package, Building2, Calendar } from 'lucide-react';
import { toast } from '../components/Toast';

export default function RenewalPage() {
  const { ref } = useParams<{ ref: string }>();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('status');
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<RenewalData>({
    queryKey: ['renewal', ref],
    queryFn: () => api.getRenewalInfo(ref!),
    enabled: !!ref,
  });

  const payMut = useMutation({
    mutationFn: (pkgId?: number) => api.createRenewalPayment(ref!, pkgId),
    onSuccess: (resp) => {
      setPaymentUrl(resp.payment_url);
      window.location.href = resp.payment_url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-tx3 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (isError || !data?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
        <div className="glass-card max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-danger/15 flex items-center justify-center mx-auto mb-4">
            <XCircle size={32} className="text-danger" />
          </div>
          <h2 className="text-xl font-bold text-tx1 mb-2">Link Tidak Valid</h2>
          <p className="text-sm text-tx3 mb-6">Renewal link tidak ditemukan atau tidak valid.</p>
          <button onClick={() => refetch()} className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const { tenant, subscription, package: pkg, packages, duitku_configured } = data;

  if (returnUrl === 'return' || paymentUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
        <div className="glass-card max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-success" />
          </div>
          <h2 className="text-xl font-bold text-tx1 mb-2">Pembayaran Selesai</h2>
          <p className="text-sm text-tx3 mb-2">Terima kasih atas pembayaran Anda.</p>
          <p className="text-sm text-tx3 mb-6">Status langganan akan diperbarui otomatis setelah pembayaran dikonfirmasi.</p>
          <button onClick={() => refetch()} className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">
            Refresh Status
          </button>
        </div>
      </div>
    );
  }

  const daysLeft = subscription.days_remaining;
  const isExpired = !subscription.is_active;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Package size={22} className="text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-tx1">Renewal Langganan</h1>
          </div>
          <p className="text-sm text-tx3">Perpanjang langganan monitoring OLT Anda</p>
        </div>

        {/* Tenant Info Card */}
        <div className="glass-card p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Building2 size={20} className="text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-tx1">{tenant.name}</h3>
              <p className="text-xs text-tx3">{tenant.subdomain}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-tx3 text-xs mb-1">Kontak</p>
              <p className="text-tx1 font-medium">{tenant.contact_name || '-'}</p>
            </div>
            <div>
              <p className="text-tx3 text-xs mb-1">Telepon</p>
              <p className="text-tx1 font-medium">{tenant.contact_phone || '-'}</p>
            </div>
          </div>
        </div>

        {/* Current Subscription Card */}
        <div className="glass-card p-6 mb-4">
          <h3 className="font-semibold text-tx1 mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-accent" />
            Langganan Saat Ini
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-tx3">Paket</span>
              <span className="text-sm font-medium text-tx1">{pkg.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-tx3">Maks OLT</span>
              <span className="text-sm font-medium text-tx1">{pkg.max_olts} OLT</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-tx3">Berakhir Pada</span>
              <span className="text-sm font-medium text-tx1">
                {subscription.end_date ? new Date(subscription.end_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-tx3">Status</span>
              {isExpired ? (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-danger/20 text-danger">Expired</span>
              ) : daysLeft <= 7 ? (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-danger/20 text-danger flex items-center gap-1">
                  <Clock size={12} /> {daysLeft} hari lagi
                </span>
              ) : daysLeft <= 30 ? (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-warning/20 text-warning flex items-center gap-1">
                  <Clock size={12} /> {daysLeft} hari lagi
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-success/20 text-success flex items-center gap-1">
                  <CheckCircle size={12} /> {daysLeft} hari lagi
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Package Selection */}
        <div className="glass-card p-6 mb-4">
          <h3 className="font-semibold text-tx1 mb-4">Pilih Paket Renewal</h3>
          <div className="space-y-3">
            {packages.map(p => (
              <label
                key={p.id}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                  (selectedPkgId ?? pkg.id) === p.id
                    ? 'border-accent bg-accent/10'
                    : 'border-brd hover:border-accent/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="package"
                    checked={(selectedPkgId ?? pkg.id) === p.id}
                    onChange={() => setSelectedPkgId(p.id)}
                    className="accent-[var(--accent)]"
                  />
                  <div>
                    <p className="font-medium text-tx1 text-sm">{p.name}</p>
                    <p className="text-xs text-tx3">{p.max_olts} OLT, {p.duration_days} hari</p>
                  </div>
                </div>
                <span className="font-bold text-tx1 text-sm">Rp {p.price.toLocaleString('id-ID')}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Payment Section */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-tx1">Pembayaran</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-tx3">Total:</span>
              <span className="text-lg font-bold text-accent">
                Rp {(packages.find(p => p.id === (selectedPkgId ?? pkg.id))?.price || 0).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {!duitku_configured ? (
            <div className="text-center py-4">
              <p className="text-sm text-tx3 mb-4">Payment gateway belum dikonfigurasi. Silakan hubungi admin untuk perpanjangan manual.</p>
            </div>
          ) : (
            <button
              onClick={() => payMut.mutate(selectedPkgId ?? undefined)}
              disabled={payMut.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              <CreditCard size={18} />
              {payMut.isPending ? 'Memproses...' : 'Bayar Sekarang'}
            </button>
          )}

          <p className="text-xs text-tx3 mt-4 text-center">
            Pembayaran diproses melalui Duitku. Anda akan diarahkan ke halaman pembayaran.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-tx3">
            Butuh bantuan? Hubungi layanan pelanggan.
          </p>
        </div>
      </div>
    </div>
  );
}
