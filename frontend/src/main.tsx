import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from './components/Toast'
import { ConfirmDialog } from './components/ConfirmDialog'
import './index.css'
import App from './App'

// Force-unregister stale service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    if (regs.length > 0) {
      // Unregister ALL old service workers
      Promise.all(regs.map(reg => reg.unregister())).then(() => {
        // Clear all caches
        if ('caches' in window) {
          caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))));
        }
      });
    }
  });
}

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
    <BrowserRouter basename="/spa">
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
        <ConfirmDialog />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
