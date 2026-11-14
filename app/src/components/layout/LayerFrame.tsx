import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { NAV } from './nav'

/**
 * Frame for the pages of one Enervtek layer: a band that names the layer,
 * tabs for its pages, and a "next layer" link so the flow
 * Monitoring → Performance & health → AI advisor stays obvious.
 */
export function LayerFrame({ layer, title, subtitle, actions, children }: {
  layer: number
  title: string
  subtitle: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const group = NAV.find((g) => g.layer === layer)!
  const next = NAV.find((g) => g.layer === layer + 1)

  return (
    <>
      <div className="rounded-2xl bg-brand-dark text-white px-6 pt-5 pb-0 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-brand-soft text-brand-dark grid place-items-center font-display font-bold">{layer}</span>
            <div className="leading-tight">
              <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-white/60">Layer {layer}</div>
              <div className="font-display font-semibold text-[17px]">
                {group.title} <span className="text-white/55 font-normal text-[14px]">· {group.promise}</span>
              </div>
            </div>
          </div>
          {next && (
            <Link to={next.items[0].to} className="hidden md:inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-soft hover:text-white">
              Next: {next.title} <ArrowRight size={15} />
            </Link>
          )}
        </div>
        <nav className="flex gap-1 mt-4 overflow-x-auto">
          {group.items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                clsx(
                  'focus-ring inline-flex items-center gap-2 h-10 px-4 rounded-t-lg text-[14px] font-semibold whitespace-nowrap transition-colors',
                  isActive ? 'bg-bg text-brand-dark' : 'text-white/70 hover:text-white hover:bg-white/10',
                )
              }
            >
              <i.icon size={16} /> {i.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <h1 className="font-display font-bold text-[28px] leading-tight tracking-tight">{title}</h1>
          <p className="text-muted mt-1 text-[15px] max-w-3xl">{subtitle}</p>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {children}
    </>
  )
}

/** Small "what this means / what to do" box used at the bottom of layer 2 pages */
export function HandOff({ text, to, label }: { text: string; to: string; label: string }) {
  return (
    <div className="mt-6 rounded-xl bg-mint border border-brand-soft px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="text-[14px]">
        <span className="font-semibold">Layer 3 · AI advisor:</span> {text}
      </div>
      <Link to={to} className="btn-primary">
        {label} <ArrowRight size={15} />
      </Link>
    </div>
  )
}

export const LEVEL_UI = {
  ok: { label: 'Good', cls: 'bg-mint text-brand', dot: 'bg-brand', hex: '#237A57' },
  watch: { label: 'Watch', cls: 'bg-warn-bg text-warn', dot: 'bg-solar', hex: '#E0A100' },
  act: { label: 'Act now', cls: 'bg-alarm-bg text-alarm', dot: 'bg-alarm', hex: '#B83A2C' },
} as const

export function LevelPill({ level, label }: { level: keyof typeof LEVEL_UI; label?: string }) {
  const l = LEVEL_UI[level]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap', l.cls)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', l.dot)} />
      {label ?? l.label}
    </span>
  )
}
