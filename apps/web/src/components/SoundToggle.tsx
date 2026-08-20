import { useEffect, useState } from 'react'
import { isAudioUnlocked, unlockAudio } from '../lib/audio.js'

export function SoundToggle() {
  const [unlocked, setUnlocked] = useState(isAudioUnlocked())

  useEffect(() => {
    // Try checking if it's already running on mount
    setUnlocked(isAudioUnlocked())
    
    // Autoplay policy might allow it immediately on some browsers or if already interacted with
    const interval = setInterval(() => {
      setUnlocked(isAudioUnlocked())
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const toggle = async () => {
    if (!unlocked) {
      const ok = await unlockAudio()
      setUnlocked(ok)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={unlocked ? "Sound is ON" : "Click to enable sound"}
      className={`p-2 rounded-xl border transition-colors flex items-center justify-center ${
        unlocked
          ? 'bg-status-success-wash border-status-success/30 text-status-success'
          : 'bg-surface-strong border-border text-ink-faint hover:text-ink'
      }`}
    >
      {unlocked ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      )}
    </button>
  )
}
