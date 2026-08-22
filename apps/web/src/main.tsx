import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/900.css'
import '@fontsource/tajawal/400.css'
import '@fontsource/tajawal/500.css'
import '@fontsource/tajawal/700.css'
import '@fontsource/tajawal/800.css'
import '@fontsource/tajawal/900.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.js'
import './styles/theme.css'
import './styles/openwork.css'
import './styles/home.css'
import { restoreSession } from './lib/staffApi.js'

import { registerSW } from 'virtual:pwa-register'

// Register the PWA service worker to cache static assets
registerSW({ immediate: true })

// Restore the session from the httpOnly refresh cookie before mounting the app
// to prevent the user from being momentarily logged out on refresh.
restoreSession().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
