import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from './components/Toast'
import { ConfirmDialog } from './components/ConfirmDialog'
import './index.css'
import './glass.css'  // tema glass (additive; hapus baris ini untuk kembali ke tampilan lama)
import './motion.css' // animasi: nyala dashboard, kedip status, transisi halaman (hapus untuk mematikan)
import './tokens.css' // token + komponen redesign Fase 1 (additive)
import './lightpath.css' // desain "Jalur Cahaya": data hidup, satu momen cahaya (hapus untuk tampilan lama)
import './lib/api'  // Global fetch interceptor for CSRF protection
import './i18n'     // react-i18next — id/en locales, browser pref + user profile
import { initTheme } from './stores/theme'
import App from './App'

// Service Worker — versi baru TIDAK memuat ulang halaman seketika; diterapkan
// saat pindah halaman atau lewat tombol (lihat lib/swUpdate.ts).
import { initServiceWorker } from './lib/swUpdate'
initServiceWorker()

// Setelah deploy, file chunk lama (hash lama) sudah tidak ada di server. Bila
// sebuah halaman gagal dimuat karena itu, muat ulang sekali agar dapat versi baru.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'nms-chunk-reload-at'
  const last = Number(sessionStorage.getItem(key) || 0)
  if (Date.now() - last > 30000) {
    event.preventDefault()
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

// Init theme (localStorage/system) before first paint; per-user preference
// is applied later by App once /api/auth/me resolves.
initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10000, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
        <ConfirmDialog />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
