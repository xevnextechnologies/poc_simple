import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { MeteringTier } from '../../data/din'
import { METERING_HINT, METERING_LABEL } from '../../data/din'
import type { Status } from '../../sim/engine'

export function Panel({ title, subtitle, actions, children, className, bodyClassName }: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={clsx('card flex flex-col min-w-0', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-[16px] leading-snug">{title}</h2>
            {subtitle && <div className="text-[13px] text-muted mt-0.5">{subtitle}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx('min-h-0', bodyClassName ?? 'px-5 pb-5')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, crumbs, layer }: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  crumbs?: string[]
  layer?: { n: number; name: string }
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6">
      <div className="min-w-0">
        {layer && (
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 rounded-full bg-brand text-white grid place-items-center text-[11px] font-bold font-display">{layer.n}</span>
            <span className="eyebrow !text-brand">{layer.name}</span>
          </div>
        )}
        {crumbs && !layer && <div className="eyebrow mb-2">{crumbs.join(' / ')}</div>}
        <h1 className="font-display font-bold text-[30px] leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-1 text-[15px] max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, unit, sub, tone }: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  tone?: 'ok' | 'warn' | 'alarm' | 'accent'
}) {
  return (
    <div className="card px-5 py-4 min-w-0">
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={clsx(
            'num font-display font-bold text-[26px] leading-none',
            tone === 'ok' && 'text-ok',
            tone === 'warn' && 'text-warn',
            tone === 'alarm' && 'text-alarm',
            tone === 'accent' && 'text-brand',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-muted text-sm">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-muted mt-2 truncate">{sub}</div>}
    </div>
  )
}

const TONE: Record<string, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-mint text-brand',
  ok: 'bg-mint text-brand',
  warn: 'bg-warn-bg text-warn',
  alarm: 'bg-alarm-bg text-alarm',
  lt1: 'bg-lt1/10 text-lt1',
  lt2: 'bg-lt2/10 text-lt2',
  lt3: 'bg-lt3/10 text-lt3',
}

export function Badge({ children, tone = 'neutral', className, title }: {
  children: ReactNode
  tone?: string
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold whitespace-nowrap',
        TONE[tone] ?? TONE.neutral,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function BusBadge({ bus }: { bus: string }) {
  const tone = bus === 'LT1' ? 'lt1' : bus === 'LT2' ? 'lt2' : 'lt3'
  return <Badge tone={tone} className="num">{bus === 'LT34' ? 'LT#3&4' : bus.replace('LT', 'LT#')}</Badge>
}

export function MeteringBadge({ tier }: { tier: MeteringTier | 'incomer' }) {
  const tone = tier === 'pq' || tier === 'incomer' || tier === 'machine' ? 'accent' : 'neutral'
  return (
    <Badge tone={tone} title={METERING_HINT[tier]}>
      {METERING_LABEL[tier]}
    </Badge>
  )
}

export const STATUS_META: Record<Status, { label: string; dot: string; tone: string; fill: string }> = {
  running: { label: 'Running', dot: 'bg-ok', tone: 'ok', fill: 'rgb(var(--brand))' },
  attention: { label: 'Needs a look', dot: 'bg-warn', tone: 'warn', fill: 'rgb(var(--solar))' },
  stopped: { label: 'Stopped', dot: 'bg-alarm', tone: 'alarm', fill: 'rgb(var(--alarm))' },
  idle: { label: 'Idle', dot: 'bg-idle', tone: 'neutral', fill: 'rgb(var(--idle))' },
}

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS_META[status]
  return (
    <Badge tone={s.tone}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </Badge>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
}) {
  return (
    <div className="inline-flex p-1 rounded-lg bg-sunken border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'focus-ring h-7 px-3 rounded-md text-[13px] font-semibold transition-colors',
            value === o.value ? 'bg-panel text-brand-dark shadow-card' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Meter({ value, max = 1, tone }: { value: number; max?: number; tone?: 'ok' | 'warn' | 'alarm' }) {
  const pct = Math.max(0, Math.min(1, value / max))
  const t = tone ?? (pct > 0.9 ? 'alarm' : pct > 0.75 ? 'warn' : 'ok')
  return (
    <div className="h-1.5 w-full rounded-full bg-sunken overflow-hidden">
      <div
        className={clsx('h-full rounded-full', t === 'ok' && 'bg-brand', t === 'warn' && 'bg-warn', t === 'alarm' && 'bg-alarm')}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  )
}
