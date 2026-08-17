import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      manifest: {
        name: 'Restaurant Platform',
        short_name: 'Restaurant',
        theme_color: '#0a0a12',
        background_color: '#0a0a12',
        display: 'standalone',
        icons: [] // would be populated with real icons
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5174,
    proxy: {
      // The API sets a refresh cookie scoped to /api/v1/auth, so in development
      // the two are served from one origin and the cookie is same-site.
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
  build: {
    // Customer route budget is 60 KB gzipped; warn well before that in raw bytes.
    chunkSizeWarningLimit: 220,
  },
})
