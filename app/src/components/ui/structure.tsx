// Page structure used on every screen, so a first-time viewer always sees:
//   1. a one-sentence answer at the top (PageSummary)
//   2. numbered sections with a plain heading and one line of "what this tells you"
//   3. detail folded away behind "Show …" (Disclosure)
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react'
import { useState, type ReactNode } from 'react'

type Tone = 'ok' | 'watch' | 'act' | 'info'

const TONE: Record<Tone, { icon: typeof Info; ring: string; text: string }> = {
  ok: { icon: CheckCircle2, ring: 'bg-mint text-brand', text: 'text-brand' },
  watch: { icon: AlertTriangle, ring: 'bg-warn-bg text-warn', text: 'text-warn' },
  act: { icon: AlertTriangle, ring: 'bg-alarm-bg text-alarm', text: 'text-alarm' },
  info: { icon: Info, ring: 'bg-mint text-brand', text: 'text-brand' },
}

export interface Fact {
  label: string
  value: string
  tone?: Tone
}

/** One-sentence answer to "what is happening here?" plus a few key facts */
export function PageSummary({ tone = 'info', headline, detail, facts }: { tone?: Tone; headline: ReactNode; detail?: ReactNode; facts?: Fact[] }) {
  const t = TONE[tone]
  return (
    <div className="card p-5 mb-2 flex flex-col lg:flex-row lg:items-center gap-5">
      <div className="flex gap-4 flex-1 min-w-0">
        <span className={clsx('w-11 h-11 rounded-full grid place-items-center shrink-0', t.ring)}>
          <t.icon size={21} />
        </span>
        <div className="min-w-0">
          <div className="font-display font-semibold text-[19px] leading-snug">{headline}</div>
          {detail && <div className="text-[14px] text-muted mt-1">{detail}</div>}
        </div>
      </div>
      {facts && facts.length > 0 && (
        <div className="flex gap-2 lg:gap-0 flex-wrap lg:flex-nowrap lg:divide-x divide-line shrink-0">
          {facts.map((f) => (
            <div key={f.label} className="px-0 lg:px-5 first:pl-0 last:pr-0 min-w-[110px]">
              <div className="text-[12px] text-muted whitespace-nowrap">{f.label}</div>
              <div className={clsx('font-display font-bold text-[22px] num leading-tight whitespace-nowrap', f.tone && f.tone !== 'info' && TONE[f.tone].text)}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Numbered section: heading + one line of what it tells you */
export function Section({ n, title, tells, actions, children, className }: {
  n?: number
  title: string
  tells?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('mt-9', className)}>
      <div className="flex items-end justify-between gap-4 mb-3.5 flex-wrap">
        <div className="flex items-start gap-3">
          {n != null && (
            <span className="w-7 h-7 rounded-full bg-brand-dark text-white grid place-items-center text-[13px] font-bold font-display shrink-0 mt-0.5">{n}</span>
          )}
          <div>
            <h2 className="font-display font-semibold text-[20px] leading-tight">{title}</h2>
            {tells && <p className="text-[14px] text-muted mt-0.5">{tells}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** Detail that is useful but not needed at first glance */
export function Disclosure({ label, hideLabel, children, defaultOpen = false, className }: {
  label: string
  hideLabel?: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-brand hover:bg-mint transition-colors"
      >
        <ChevronDown size={15} className={clsx('transition-transform', open && 'rotate-180')} />
        {open ? hideLabel ?? 'Hide' : label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

/** Small tab strip for showing one chart at a time */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[] }) {
  return (
    <div className="flex gap-1 border-b border-line mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'focus-ring h-10 px-4 -mb-px border-b-2 text-[14px] font-semibold whitespace-nowrap transition-colors',
            value === t.id ? 'border-brand text-brand-dark' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
