import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
