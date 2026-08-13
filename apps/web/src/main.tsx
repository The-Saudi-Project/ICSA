import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.js'
import './styles/theme.css'
import './styles/openwork.css'
import { restoreSession } from './lib/staffApi.js'

// Restore the session from the httpOnly refresh cookie before mounting the app
// to prevent the user from being momentarily logged out on refresh.
restoreSession().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
