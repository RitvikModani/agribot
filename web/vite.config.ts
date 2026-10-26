import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves the repo at /agribot/. The deploy workflow sets VITE_BASE;
  // local dev keeps '/'.
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'AgriBot — field console',
        short_name: 'AgriBot',
        description: 'Control the AgriBot rover and read its tomato-leaf diagnoses.',
        theme_color: '#46512d',
        background_color: '#f4ede1',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Replay data is the offline fallback: cache it so it survives dead venue Wi-Fi.
        runtimeCaching: [
          {
            urlPattern: /\/replay\//,
            handler: 'CacheFirst',
            options: { cacheName: 'agribot-replay', expiration: { maxEntries: 60 } },
          },
        ],
      },
    }),
  ],
  server: {
    // Listen on IPv4 and IPv6, and on the LAN: 127.0.0.1 works, and a phone on the same Wi-Fi can open it.
    host: true,
    fs: { strict: false },
  },
  preview: {
    host: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
