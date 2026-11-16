// Shift calendar for Spinning Unit DIL: continuous 3-shift operation, 365 days,
// with a 3-hour night cleaning window inside Shift C.
export const SHIFTS = [
  { id: 'A', start: 6, end: 14, label: 'Shift A', span: '06:00–14:00' },
  { id: 'B', start: 14, end: 22, label: 'Shift B', span: '14:00–22:00' },
  { id: 'C', start: 22, end: 6, label: 'Shift C', span: '22:00–06:00' },
] as const

export const CLEANING = { start: 1, end: 4, label: 'Night cleaning', span: '01:00–04:00' }

/** Wall-clock parts in Pakistan time regardless of the laptop's timezone */
export function pkParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = Number(get('hour')) % 24
  return {
    hour,
    minute: Number(get('minute')),
    time: `${String(hour).padStart(2, '0')}:${get('minute')}:${get('second')}`,
    date: `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`,
  }
}

export function shiftAt(hour: number) {
  if (hour >= 6 && hour < 14) return SHIFTS[0]
  if (hour >= 14 && hour < 22) return SHIFTS[1]
  return SHIFTS[2]
}

export function isCleaning(hour: number) {
  return hour >= CLEANING.start && hour < CLEANING.end
}
