import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from './components/Toast'
import { ConfirmDialog } from './components/ConfirmDialog'
import './index.css'
import './lib/api'  // Global fetch interceptor for CSRF protection
import App from './App'

// Service Worker: handled by vite-plugin-pwa (autoUpdate + skipWaiting + clientsClaim)
// No manual registration needed — plugin injects registerSW.js automatically

// Init theme
const theme = localStorage.getItem('theme') || 'dark';
if (theme === 'light') document.documentElement.classList.add('light');

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
