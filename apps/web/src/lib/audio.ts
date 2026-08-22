// Audio Context Synthesizer

let audioCtx: AudioContext | null = null

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
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

interface ToneOptions {
  /** AudioContext time to start at. */
  at: number
  freq: number
  duration: number
  peak?: number
}

/** One shaped note. The attack is fast but not instant, so it does not click. */
function tone(ctx: AudioContext, { at, freq, duration, peak = 0.32 }: ToneOptions) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, at)

  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(at)
  osc.stop(at + duration)
}

/** How long `playWaiterCallAlert` sounds for, in seconds. */
export const WAITER_CALL_ALERT_SECONDS = 2.4

let waiterAlertSoundingUntil = 0

/**
 * A table is calling for a waiter — a two-tone pattern repeated three times,
 * about 2.4 seconds in all.
 *
 * Deliberately not `playAlertBeep`. A waiter is moving around a noisy room and
 * may be several metres from the screen, so a 150 ms blip is simply missed; a
 * pattern that repeats reads as a summons and survives a burst of background
 * noise. The falling interval is also different from the kitchen's rising chime,
 * so the two are never confused from across the floor.
 *
 * A second request while the first is still sounding is ignored. The socket
 * event and the ten-second poll both report the same call, and two overlapping
 * copies of a 2.4-second alert are noise, not urgency.
 */
export function playWaiterCallAlert() {
  const ctx = getAudioContext()
  if (ctx.state !== 'running') return

  if (ctx.currentTime < waiterAlertSoundingUntil) return
  waiterAlertSoundingUntil = ctx.currentTime + WAITER_CALL_ALERT_SECONDS

  const start = ctx.currentTime
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const at = start + repeat * 0.8
    tone(ctx, { at, freq: 987.77, duration: 0.34 }) // B5
    tone(ctx, { at: at + 0.3, freq: 739.99, duration: 0.46 }) // F#5
  }
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
