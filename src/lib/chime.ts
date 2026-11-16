// Short synthesized chimes for live events (no audio files, works offline).
// Browsers only allow sound after the viewer has interacted with the page;
// before that the chime is skipped silently.

let ctx: AudioContext | null = null
let muted = false
const listeners = new Set<(m: boolean) => void>()

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  listeners.forEach((f) => f(m))
}
export function onMutedChange(f: (m: boolean) => void) {
  listeners.add(f)
  return () => void listeners.delete(f)
}

const NOTES = {
  /** Something stopped: three quick high notes */
  alarm: [880, 660, 880],
  /** Back running: a soft rising pair */
  ok: [523, 784],
}

/** `force` plays even when muted (the presenter's sound test) */
export function chime(kind: keyof typeof NOTES, force = false) {
  if (muted && !force) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const c = ctx
    NOTES[kind].forEach((f, i) => {
      const t = c.currentTime + i * 0.16
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(kind === 'alarm' ? 0.2 : 0.12, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
      o.connect(g).connect(c.destination)
      o.start(t)
      o.stop(t + 0.16)
    })
  } catch {
    /* no audio available */
  }
}
