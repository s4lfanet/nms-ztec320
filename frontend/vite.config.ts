import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      disable: false,
      manifest: {
        name: 'Salfanet NMS — FTTH Network Management',
        short_name: 'Salfanet NMS',
        description: 'Salfanet NMS — FTTH Network Management System',
        theme_color: '#0A0C14',
        background_color: '#0A0C14',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        id: '/',
        categories: ['utilities', 'productivity'],
        icons: [
          { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/static/, /^\/ws/, /^\/health/, /^\/docs/, /^\/openapi/, /^\/spa/, /^\/metrics/],
        // No runtimeCaching for /api/ and /ws/ — let the browser handle
        // them natively. A NetworkOnly SW route on a downed origin throws
        // noisy "no-response" errors; bypassing the SW avoids that.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: '/',
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
      '/auth': 'http://localhost:5000',
      '/static': 'http://localhost:5000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('zustand')) return 'vendor-state';
          }
        },
      },
    },
  },
})
