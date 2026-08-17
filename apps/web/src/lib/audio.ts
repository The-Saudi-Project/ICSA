// Audio Context Synthesizer

let audioCtx: AudioContext | null = null

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioCtx
}

/** 
 * Attempts to resume the AudioContext. Browsers require a user interaction 
 * before AudioContext is allowed to play sound.
 */
export async function unlockAudio() {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  return ctx.state === 'running'
}

export function isAudioUnlocked() {
  return audioCtx?.state === 'running'
}

/** Plays a two-tone beep (e.g. for Kitchen New Order) */
export function playNewOrderChime() {
  const ctx = getAudioContext()
  if (ctx.state !== 'running') return

  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
  osc1.frequency.setValueAtTime(783.99, ctx.currentTime + 0.15) // G5
  
  gain1.gain.setValueAtTime(0, ctx.currentTime)
  gain1.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02)
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)

  osc1.connect(gain1)
  gain1.connect(ctx.destination)

  osc1.start(ctx.currentTime)
  osc1.stop(ctx.currentTime + 0.5)
}

/** Plays a pleasant ascending chord (e.g. for Customer Order Ready) */
export function playSuccessChime() {
  const ctx = getAudioContext()
  if (ctx.state !== 'running') return

  const frequencies = [523.25, 659.25, 783.99, 1046.50] // C E G C
  const timeOffset = 0.08
  
  frequencies.forEach((freq, index) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime + index * timeOffset)
    
    gain.gain.setValueAtTime(0, ctx.currentTime + index * timeOffset)
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + index * timeOffset + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * timeOffset + 0.8)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime + index * timeOffset)
    osc.stop(ctx.currentTime + index * timeOffset + 0.8)
  })
}

/** Plays a short distinct beep (e.g. for Cashier Cash Pending) */
export function playAlertBeep() {
  const ctx = getAudioContext()
  if (ctx.state !== 'running') return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'square'
  osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
  
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.15)
}
