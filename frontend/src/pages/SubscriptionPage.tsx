import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type RenewalData, type SubscriptionStatus, type PaymentMethod, type InvoiceRecord } from '../lib/api';
import { CheckCircle, XCircle, Clock, CreditCard, AlertCircle, Loader2, Wallet, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';

export default function SubscriptionPage() {
  const qc = useQueryClient();
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);
  const [selectedPayMethod, setSelectedPayMethod] = useState<string>('');
  const [paySuccess, setPaySuccess] = useState(false);
  const [payForInvoice, setPayForInvoice] = useState<InvoiceRecord | null>(null);
  const payMethodRef = useRef<HTMLDivElement>(null);

  // Get subscription status to find renewal ref
  const { data: subStatus } = useQuery<SubscriptionStatus>({
    queryKey: ['subscription-status'],
    queryFn: api.subscriptionStatus,
  });

  const renewalRef = subStatus?.renewal_ref;

  const { data, isLoading, isError, refetch } = useQuery<RenewalData>({
    queryKey: ['renewal', renewalRef],
    queryFn: () => api.getRenewalInfo(renewalRef!),
    enabled: !!renewalRef,
  });

  const selectedPkg = data?.packages?.find(p => p.id === (selectedPkgId ?? data.package.id)) || data?.package;

  // Fetch payment methods for selected package amount
  const { data: payMethodsData } = useQuery<{ success: boolean; payment_methods: PaymentMethod[] }>({
    queryKey: ['payment-methods', selectedPkg?.price],
    queryFn: () => api.getPaymentMethods(selectedPkg!.price),
    enabled: !!selectedPkg && data?.duitku_configured === true,
  });

  // Fetch tenant invoices
  const { data: invoices } = useQuery<InvoiceRecord[]>({
    queryKey: ['tenant-invoices'],
    queryFn: api.tenantInvoices,
  });

  const payMut = useMutation({
    mutationFn: (pkgId?: number) => api.createRenewalPayment(renewalRef!, pkgId ?? selectedPkgId ?? undefined, selectedPayMethod || undefined),
    onSuccess: (resp) => {
      setPaySuccess(true);
      window.location.href = resp.payment_url;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ['subscription-status'] }),
  });

  const handleInvoicePay = (inv: InvoiceRecord) => {
    setPayForInvoice(inv);
    setSelectedPkgId(inv.package_id);
    setSelectedPayMethod('');
    setTimeout(() => payMethodRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  const handleCancelInvoicePay = () => {
    setPayForInvoice(null);
    setSelectedPkgId(null);
    setSelectedPayMethod('');
  };

  if (!renewalRef || isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
        <h1 className="text-xl md:text-2xl font-bold">Subscription & Renewal</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-accent animate-spin" />
        </div>
      </div>
    );
  }

  if (isError || !data?.success) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
        <h1 className="text-xl md:text-2xl font-bold">Subscription & Renewal</h1>
        <div className="glass-card p-8 text-center">
          <AlertCircle size={32} className="text-danger mx-auto mb-3" />
          <p className="text-sm text-tx3">Unable to load subscription data.</p>
          <button onClick={() => refetch()} className="mt-4 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { tenant, subscription, package: pkg, packages, duitku_configured } = data;
  const daysLeft = subscription.days_remaining;
  const isExpired = !subscription.is_active;
  const tenantInvoicesList = invoices || [];
  const isTrial = tenantInvoicesList.some(inv => inv.invoice_type === 'trial');
  const payMethods = payMethodsData?.payment_methods || [];

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Subscription & Renewal</h1>

      {/* Trial Banner — shown when on trial */}
      {isTrial && !isExpired && (
        <div className="glass-card p-4 md:p-5 mb-4 border border-accent/30 bg-accent/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                <Clock size={20} className="text-accent" />
              </div>
              <div>
                <div className="text-sm font-semibold text-accent">Masa Trial Aktif</div>
                <div className="text-xs text-tx3 mt-0.5">
                  {daysLeft > 0 ? (
                    <span>Sisa <strong className="text-warning">{daysLeft} hari</strong> trial. Lakukan perpanjangan sebelum habis.</span>
                  ) : (
                    <span className="text-danger">Trial Anda sudah habis. Silakan perpanjang sekarang.</span>
                  )}
                </div>
              </div>
            </div>
            <a href="#renewal-section" className="shrink-0 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors">
              Perpanjang Sekarang
            </a>
          </div>
        </div>
      )}

      {/* Expired Banner */}
      {isExpired && (
        <div className="glass-card p-4 md:p-5 mb-4 border border-danger/30 bg-danger/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger/15 flex items-center justify-center flex-shrink-0">
                <XCircle size={20} className="text-danger" />
              </div>
              <div>
                <div className="text-sm font-semibold text-danger">Subscription Expired</div>
                <div className="text-xs text-tx3 mt-0.5">Akses dashboard dibatasi. Lakukan perpanjangan untuk mengaktifkan kembali.</div>
              </div>
            </div>
            <a href="#renewal-section" className="shrink-0 px-4 py-2 rounded-xl bg-danger hover:bg-danger/80 text-white text-xs font-semibold transition-colors">
              Perpanjang Sekarang
            </a>
          </div>
        </div>
      )}

      {/* Status Banner */}
      <div className={cn(
        'glass-card p-4 md:p-6 mb-4 border',
        isExpired ? 'border-danger/30' : daysLeft <= 7 ? 'border-warning/30' : 'border-success/20'
      )}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
              isExpired ? 'bg-danger/15 text-danger' : daysLeft <= 7 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'
            )}>
              {isExpired ? <XCircle size={24} /> : daysLeft <= 7 ? <Clock size={24} /> : <CheckCircle size={24} />}
            </div>
            <div>
              <div className="text-sm font-semibold text-tx1">
                {isTrial ? 'Trial — ' : ''}{pkg.name} Package
              </div>
              <div className="text-xs text-tx3 mt-0.5">
                {isExpired ? (
                  <span className="text-danger font-medium">Subscription Expired</span>
                ) : (
                  <span className={cn('font-medium', daysLeft <= 7 ? 'text-warning' : 'text-success')}>
                    {daysLeft} hari tersisa
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-tx3">OLT Usage</div>
              <div className="text-sm font-bold mt-0.5">{pkg.max_olts} OLT</div>
            </div>
            <div>
              <div className="text-xs text-tx3">Start</div>
              <div className="text-sm font-medium mt-0.5">
                {subscription.start_date ? new Date(subscription.start_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-tx3">Expiry</div>
              <div className="text-sm font-medium mt-0.5">
                {subscription.end_date ? new Date(subscription.end_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tenant Info */}
      <div className="glass-card p-4 md:p-6 mb-4">
        <h3 className="text-sm font-semibold text-tx2 mb-3">Tenant Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-tx3 text-xs">Business Name</span>
            <p className="text-tx1 font-medium">{tenant.name}</p>
          </div>
          <div>
            <span className="text-tx3 text-xs">Contact</span>
            <p className="text-tx1 font-medium">{tenant.contact_name || '-'}</p>
          </div>
          <div>
            <span className="text-tx3 text-xs">Phone</span>
            <p className="text-tx1 font-medium">{tenant.contact_phone || '-'}</p>
          </div>
          <div>
            <span className="text-tx3 text-xs">Domain</span>
            <p className="text-tx1 font-medium">{tenant.subdomain}</p>
          </div>
        </div>
      </div>

      {/* Package Selection — hidden when paying for a specific invoice */}
      {!payForInvoice && (
        <div id="renewal-section" className="glass-card p-4 md:p-6 mb-4">
          <h3 className="text-sm font-semibold text-tx2 mb-4">Pilih Paket Renewal</h3>
          <div className="space-y-3">
            {packages.map(p => (
              <label
                key={p.id}
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all',
                  (selectedPkgId ?? pkg.id) === p.id
                    ? 'border-accent bg-accent/10'
                    : 'border-brd hover:border-accent/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="package"
                    checked={(selectedPkgId ?? pkg.id) === p.id}
                    onChange={() => { setSelectedPkgId(p.id); }}
                    className="accent-[var(--accent)]"
                  />
                  <div>
                    <p className="font-medium text-tx1 text-sm">{p.name}</p>
                    <p className="text-xs text-tx3">{p.max_olts} OLT, {p.duration_days} hari</p>
                    {p.description && <p className="text-xs text-tx3 mt-0.5">{p.description}</p>}
                  </div>
                </div>
                <span className="font-bold text-tx1 text-sm">Rp {p.price.toLocaleString('id-ID')}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Invoice/Tagihan Section */}
      {tenantInvoicesList.length > 0 && (
        <div className="glass-card p-4 md:p-6 mb-4">
          <h3 className="text-sm font-semibold text-tx2 mb-4 flex items-center gap-2">
            <FileText size={16} /> Tagihan / Invoice
          </h3>
          <div className="space-y-2">
            {tenantInvoicesList.map(inv => {
              const isUnpaid = inv.status === 'unpaid';
              const isPaid = inv.status === 'paid';
              return (
                <div key={inv.id} className={cn(
                  'flex items-center justify-between p-3 rounded-xl border',
                  isUnpaid ? 'border-warning/30 bg-warning/5' : isPaid ? 'border-success/20 bg-success/5' : 'border-brd'
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-tx3">{inv.invoice_number}</span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        isPaid ? 'bg-success/15 text-success' : isUnpaid ? 'bg-warning/15 text-warning' : 'bg-glass text-tx3'
                      )}>
                        {isPaid ? 'Lunas' : isUnpaid ? 'Belum Bayar' : inv.status}
                      </span>
                      {inv.invoice_type === 'auto' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">Auto</span>
                      )}
                      {inv.invoice_type === 'pg' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">PG (Duitku)</span>
                      )}
                    </div>
                    <p className="text-xs text-tx3 truncate">{inv.description || inv.package_name}</p>
                    {inv.due_date && isUnpaid && (
                      <p className="text-xs text-warning mt-1">Jatuh tempo: {new Date(inv.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    )}
                    {inv.paid_at && isPaid && (
                      <p className="text-xs text-success mt-1">Dibayar: {new Date(inv.paid_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    )}
                  </div>
                  <div className="text-right ml-3 flex-shrink-0 flex flex-col items-end gap-2">
                    <div className="text-sm font-bold text-tx1">Rp {inv.amount.toLocaleString('id-ID')}</div>
                    {isUnpaid && duitku_configured && (
                      <button
                        onClick={() => handleInvoicePay(inv)}
                        className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        <CreditCard size={12} />
                        Bayar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice Payment Banner */}
      {payForInvoice && (
        <div className="glass-card p-4 mb-4 border border-accent/30 bg-accent/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-accent" />
              <div>
                <p className="text-sm font-medium text-tx1">Membayar Invoice: {payForInvoice.invoice_number}</p>
                <p className="text-xs text-tx3">{payForInvoice.package_name} — Rp {payForInvoice.amount.toLocaleString('id-ID')}</p>
              </div>
            </div>
            <button
              onClick={handleCancelInvoicePay}
              className="text-xs text-tx3 hover:text-danger transition-colors px-3 py-1.5 rounded-lg border border-brd hover:border-danger/30"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Payment Method Selection */}
      {duitku_configured && payMethods.length > 0 && (
        <div ref={payMethodRef} className="glass-card p-4 md:p-6 mb-4 scroll-mt-20">
          <h3 className="text-sm font-semibold text-tx2 mb-4 flex items-center gap-2">
            <Wallet size={16} /> Metode Pembayaran
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {payMethods.map(m => (
              <label
                key={m.paymentMethod}
                className={cn(
                  'flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all',
                  selectedPayMethod === m.paymentMethod
                    ? 'border-accent bg-accent/10'
                    : 'border-brd hover:border-accent/50'
                )}
              >
                <input
                  type="radio"
                  name="paymethod"
                  checked={selectedPayMethod === m.paymentMethod}
                  onChange={() => { setSelectedPayMethod(m.paymentMethod); }}
                  className="sr-only"
                />
                {m.paymentImage && (
                  <img src={m.paymentImage} alt={m.paymentName} className="h-8 w-auto mb-2 object-contain" />
                )}
                <span className="text-xs text-tx2 text-center font-medium">{m.paymentName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Payment Section */}
      <div className="glass-card p-4 md:p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-tx2">Pembayaran via Duitku</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-tx3">Total:</span>
            <span className="text-lg font-bold text-accent">Rp {(payForInvoice ? payForInvoice.amount : selectedPkg?.price)?.toLocaleString('id-ID') ?? '-'}</span>
          </div>
        </div>

        {paySuccess ? (
          <div className="text-center py-4">
            <Loader2 className="h-8 w-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-tx3">Mengarahkan ke halaman pembayaran Duitku...</p>
          </div>
        ) : !duitku_configured ? (
          <div className="text-center py-4">
            <AlertCircle size={28} className="text-warning mx-auto mb-3" />
            <p className="text-sm text-tx3 mb-2">Payment gateway belum dikonfigurasi.</p>
            <p className="text-xs text-tx3">Silakan hubungi admin untuk perpanjangan manual.</p>
          </div>
        ) : (
          <button
            onClick={() => payMut.mutate(payForInvoice ? payForInvoice.package_id : selectedPkgId ?? undefined)}
            disabled={payMut.isPending || !selectedPayMethod}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            <CreditCard size={18} />
            {payMut.isPending ? 'Memproses...' : !selectedPayMethod ? 'Pilih Metode Pembayaran Dulu' : payForInvoice ? `Bayar Invoice ${payForInvoice.invoice_number}` : 'Bayar & Perpanjang Sekarang'}
          </button>
        )}

        <p className="text-xs text-tx3 mt-4 text-center">
          Pembayaran diproses aman melalui Duitku. Anda akan diarahkan ke halaman pembayaran.
        </p>
      </div>
    </div>
  );
}
