import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Backend proxy target for `npm run dev`. The Express proxy runs on 8787.
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:8787'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'B Funds — Portfolio Tracker',
        short_name: 'B Funds',
        description: 'Track your Indian stocks & mutual funds. Day gain, P/L, XIRR, charts — no login required.',
        theme_color: '#0b7a4b',
        background_color: '#0b1120',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // Search is interactive and useless offline. Never cache it: a single
            // empty `[]` response (proxy not up yet, a transient Yahoo 429, an old
            // build) would otherwise get cached for a day and served stale by the
            // NetworkFirst rule below, making the autocomplete show "No matches"
            // long after the backend recovered. Must precede the generic /api/ rule.
            urlPattern: ({ url }) =>
              url.pathname === '/api/stocks/search' || url.pathname === '/api/mf/search',
            handler: 'NetworkOnly',
          },
          {
            // Mutual fund NAV data (called browser-direct, CORS-open)
            urlPattern: ({ url }) => url.hostname === 'api.mfapi.in',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'mfapi',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Our stock proxy (quotes & history — cached for offline price display)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'stock-proxy',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
})
