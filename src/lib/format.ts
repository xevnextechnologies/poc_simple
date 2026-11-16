const cache = new Map<number, Intl.NumberFormat>()

export function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—'
  let f = cache.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('en-PK', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    cache.set(digits, f)
  }
  return f.format(n)
}

/** PKR the way Pakistani owners read it: lakh and crore */
export function pkr(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e7) return `Rs ${fmt(n / 1e7, 2)} crore`
  if (abs >= 1e5) return `Rs ${fmt(n / 1e5, 1)} lakh`
  if (abs >= 1e3) return `Rs ${fmt(Math.round(n / 100) * 100)}`
  return `Rs ${fmt(n)}`
}

export function power(kw: number): { value: string; unit: string } {
  return Math.abs(kw) >= 1000 ? { value: fmt(kw / 1000, 2), unit: 'MW' } : { value: fmt(kw), unit: 'kW' }
}

export function hhmm(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function breakerKw(amps: number, pf = 0.9): number {
  return (Math.sqrt(3) * 410 * amps * pf) / 1000
}

export function busLabel(id: string): string {
  return id === 'LT34' ? 'LT#3&4' : id.replace('LT', 'LT#')
}
