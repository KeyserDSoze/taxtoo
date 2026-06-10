import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// On GitHub Pages with a custom domain (taxtoo.app) the base is '/'.
// If you serve from a repo sub-path instead, set VITE_BASE=/taxtoo/ in the workflow.
// With Electron (file:// protocol) a relative base './' is required.
const isElectron = process.env.ELECTRON === 'true';
const base = isElectron ? './' : (process.env.VITE_BASE ?? '/')
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 54321,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Taxtoo',
        short_name: 'Taxtoo',
        description: 'Calcola l\u2019IMU e genera l\u2019F24 con l\u2019AI, salvando tutto nel tuo Drive',
        theme_color: '#0ea5e9',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-72.png',   sizes: '72x72',   type: 'image/png' },
          { src: 'icons/icon-96.png',   sizes: '96x96',   type: 'image/png' },
          { src: 'icons/icon-128.png',  sizes: '128x128', type: 'image/png' },
          { src: 'icons/icon-144.png',  sizes: '144x144', type: 'image/png' },
          { src: 'icons/icon-152.png',  sizes: '152x152', type: 'image/png' },
          { src: 'icons/icon-192.png',  sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-384.png',  sizes: '384x384', type: 'image/png' },
          { src: 'icons/icon-512.png',  sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        categories: ['finance', 'productivity', 'utilities'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/downloads\//],
      },
    }),
  ],
})
