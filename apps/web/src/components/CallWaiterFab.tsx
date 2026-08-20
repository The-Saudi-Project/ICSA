import { useState } from 'react'
import { getTableToken, getSession } from '../lib/session.js'
import { api } from '../lib/api.js'
import { useToast } from './ToastContext.js'

export function CallWaiterFab() {
  const [calling, setCalling] = useState(false)
  const { showToast } = useToast()
  const token = getTableToken()
  const session = getSession()

  // Only show if the customer is at a table (has a token)
  if (!token || !session) return null

  async function handleCall() {
    setCalling(true)
    try {
      await api('/public/call-waiter', { method: 'POST' })
      showToast('Waiter has been called', 'success')
    } catch (err) {
      showToast((err as Error).message || 'Failed to call waiter', 'error')
    } finally {
      setCalling(false)
    }
  }

  return (
    <button
      onClick={() => void handleCall()}
      disabled={calling}
      className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl hover:bg-accent-bright focus:outline-none focus:ring-4 focus:ring-accent/30 disabled:opacity-50 transition-all hover:-translate-y-1"
      aria-label="Call Waiter"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    </button>
  )
}
