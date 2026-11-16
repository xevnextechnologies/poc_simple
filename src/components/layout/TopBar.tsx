import clsx from 'clsx'
import { useEffect } from 'react'
import { Factory, Menu } from 'lucide-react'
import { CLEANING, isCleaning, pkParts, shiftAt } from '../../lib/time'
import { useApp } from '../../store/app'

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const now = useApp((s) => s.now)
  const tick = useApp((s) => s.tick)

  useEffect(() => {
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [tick])

  const p = pkParts(new Date(now))
  const shift = shiftAt(p.hour)
  const cleaning = isCleaning(p.hour)

  return (
    <header className="theme-dark h-16 shrink-0 flex items-center gap-3 sm:gap-4 px-4 sm:px-6 border-b border-line">
      <button onClick={onMenu} className="focus-ring lg:hidden -ml-1 w-9 h-9 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken" aria-label="Open menu">
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-3 min-w-0">
        <span className="hidden sm:grid w-8 h-8 rounded-lg bg-mint text-brand place-items-center shrink-0">
          <Factory size={17} />
        </span>
        <div className="leading-tight min-w-0">
          <div className="font-display font-semibold text-[15px] truncate">Spinning mill</div>
          <div className="text-xs text-muted truncate">Live demo</div>
        </div>
      </div>

      <div className="flex-1" />

      <span
        className={clsx(
          'inline-flex items-center gap-2 h-8 px-2.5 sm:px-3 rounded-full text-[13px] font-semibold shrink-0',
          cleaning ? 'bg-warn-bg text-warn' : 'bg-mint text-brand',
        )}
        title={cleaning ? `Night cleaning (${CLEANING.span})` : 'Live · production running'}
      >
        <span className={clsx('w-2 h-2 rounded-full', cleaning ? 'bg-warn' : 'bg-brand live-pulse')} />
        <span className="hidden md:inline">{cleaning ? `Night cleaning (${CLEANING.span})` : 'Live · production running'}</span>
        <span className="md:hidden">{cleaning ? 'Cleaning' : 'Live'}</span>
      </span>
      <span className="hidden md:inline text-[13px] text-muted">
        <span className="font-semibold text-fg">{shift.label}</span> · {shift.span}
      </span>

      <div className="hidden sm:block h-8 w-px bg-line" />

      <div className="text-right leading-tight shrink-0">
        <div className="num font-display font-semibold text-[15px]">{p.time.slice(0, 5)}</div>
        <div className="hidden sm:block text-xs text-muted">{p.date}</div>
      </div>
    </header>
  )
}
