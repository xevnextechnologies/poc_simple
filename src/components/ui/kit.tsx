// Building blocks shared by the redesigned (dark, control-room) pages:
// count-up numbers, sparklines, number tiles, section titles and panels.
import clsx from 'clsx'
import { Info, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { fmt } from '../../lib/format'
import type { DtGroup, Stop } from '../../sim/downtime'

/** Downtime reason colours, from the theme (CSS variables --dt-*), so they suit every theme */
export const reasonRgb = (g: DtGroup | 'none' | null | undefined) => `rgb(var(--dt-${g ?? 'none'}))`
export const stopRgb = (s: Stop) => reasonRgb(s.reason?.group)

/** 1h 52m style, for tight spaces */
export const short = (min: number) => {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

export const TONE = { alarm: 'text-alarm', warn: 'text-warn', brand: 'text-brand', fg: 'text-fg' } as const
export const TONE_BG = { alarm: 'bg-alarm-bg', warn: 'bg-warn-bg', brand: 'bg-mint', fg: 'bg-sunken' } as const
export const TONE_RGB = { alarm: 'rgb(var(--alarm))', warn: 'rgb(var(--warn))', brand: 'rgb(var(--brand))', fg: 'rgb(var(--muted))' } as const
export type Tone = keyof typeof TONE

/** Eases a number toward its new value */
export function useCountUp(target: number, ms = 800) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      // rAF time can be slightly earlier than performance.now(): clamp to [0, 1]
      const k = Math.max(0, Math.min(1, (t - start) / ms))
      const x = a + (target - a) * (1 - Math.pow(1 - k, 3))
      from.current = x
      setV(x)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/** True one frame after mount, so SVG strokes and bars can animate in */
export function useMounted() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(r)
  }, [])
  return on
}

/** Area sparkline that stretches to its box */
export function Spark({ data, color, className }: { data: number[]; color: string; className?: string }) {
  const id = `sp${useId().replace(/:/g, '')}`
  if (data.length < 2) return null
  const W = 100
  const H = 30
  const max = Math.max(...data)
  const min = Math.min(...data)
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6)
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * W).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** Number tile: icon, trend line, big count-up value, short label */
export function Kpi({ icon: Icon, value, digits = 0, unit, label, tone, trend, hint, trendTitle = 'Last 12 hours' }: {
  icon: LucideIcon
  value: number
  digits?: number
  unit?: string
  label: string
  tone: Tone
  trend: number[]
  /** Short explanation behind an ⓘ */
  hint?: string
  trendTitle?: string
}) {
  const v = useCountUp(value)
  return (
    <div className="rounded-2xl border border-line bg-panel p-3.5 sm:p-4 flex flex-col justify-between gap-3 min-w-0" title={trendTitle}>
      <div className="flex items-start gap-3">
        <span className={clsx('w-8 h-8 rounded-lg grid place-items-center shrink-0', TONE_BG[tone], TONE[tone])}>
          <Icon size={16} />
        </span>
        <Spark data={trend} color={TONE_RGB[tone]} className="flex-1 h-8 min-w-0" />
      </div>
      <div>
        <div className={clsx('num font-display font-bold text-[28px] sm:text-[34px] leading-none tracking-tight', TONE[tone])}>
          {fmt(v, digits)}
          {unit && <span className="text-[14px] sm:text-[15px] font-semibold text-muted ml-1">{unit}</span>}
        </div>
        <div className="text-[12px] text-muted mt-1.5 flex items-center gap-1 min-w-0">
          <span className="truncate">{label}</span>
          {hint && (
            <span title={hint} aria-label={hint} tabIndex={0} className="focus-ring rounded-full text-faint hover:text-fg cursor-help shrink-0">
              <Info size={12} />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function SectionTitle({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <h2 className="font-display font-semibold text-[17px]">{title}</h2>
      {count != null && <span className="num h-6 min-w-6 px-2 grid place-items-center rounded-full bg-sunken text-[12px] font-semibold text-muted">{count}</span>}
      {children && <div className="ml-auto">{children}</div>}
    </div>
  )
}

/** Card with a small uppercase title and an optional right-hand slot */
export function Panel({ title, right, className, children, delay = 0 }: { title?: string; right?: ReactNode; className?: string; children: ReactNode; delay?: number }) {
  return (
    <section className={clsx('rise rounded-2xl border border-line bg-panel p-4 sm:p-5 flex flex-col min-w-0', className)} style={{ animationDelay: `${delay}ms` }}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-faint">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}
