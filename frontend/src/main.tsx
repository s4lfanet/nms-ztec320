import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from './components/Toast'
import { ConfirmDialog } from './components/ConfirmDialog'
import './index.css'
import './lib/api'  // Global fetch interceptor for CSRF protection
import './i18n'     // react-i18next — id/en locales, browser pref + user profile
import { initTheme } from './stores/theme'
import App from './App'

// Service Worker registered by vite-plugin-pwa (injectRegister: 'auto', autoUpdate)

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
