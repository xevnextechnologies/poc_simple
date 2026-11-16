import clsx from 'clsx'
import { AlertTriangle, Bot, MapPin, Palette, Presentation, RotateCcw, Timer, Volume2, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chime } from '../../lib/chime'
import { THEMES, applyTheme, currentTheme } from '../../theme'
import { DEMO } from '../../sim/scenarios'
import { useApp } from '../../store/app'

const ALARM_MS = 25_000

/**
 * Presenter tools for the meeting:
 *  - Shift + D  fires the LT#2 power dip now (cards trip, alarm pops up)
 *  - Shift + P  opens the presenter panel
 *  - Shift + T  opens Downtime now
 * Plus the alarm pop-up that appears when the dip fires.
 */
export function DemoLayer() {
  const { dipSeq, presenterOpen, triggerDip, resetDemo, togglePresenter } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'd') triggerDip()
      else if (k === 'p') togglePresenter()
      else if (k === 't') navigate('/downtime')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [triggerDip, togglePresenter, navigate])

  return (
    <>
      <DipAlarm seq={dipSeq} />
      {presenterOpen && (
        <div className="theme-dark fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-line bg-panel text-fg shadow-pop p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display font-semibold">
              <Presentation size={16} /> Presenter
            </div>
            <button onClick={togglePresenter} className="w-7 h-7 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken" title="Close">
              <X size={15} />
            </button>
          </div>
          <div className="space-y-2 mt-3">
            <PBtn onClick={triggerDip} icon={Zap} label="Trigger power dip now" keys="Shift + D" strong />
            <PBtn onClick={() => navigate('/downtime')} icon={Timer} label="Downtime now" keys="Shift + T" />
            <PBtn
              onClick={() => {
                chime('alarm', true)
                setTimeout(() => chime('ok', true), 900)
              }}
              icon={Volume2}
              label="Test sounds"
            />
            <PBtn onClick={resetDemo} icon={RotateCcw} label="Reset demo" />
          </div>

          <ThemePicker />

          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            The dip trips Cards 05, 06 and 07 on LT#2. They come back by themselves over the next 17–26 minutes, as the sliver is reloaded. Shift + P hides this panel.
          </p>
        </div>
      )}
    </>
  )
}

function PBtn({ onClick, icon: Icon, label, keys, strong }: { onClick: () => void; icon: typeof Zap; label: string; keys?: string; strong?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'focus-ring w-full flex items-center gap-2.5 h-10 px-3 rounded-lg text-[13px] font-semibold transition',
        strong ? 'bg-brand text-bg hover:brightness-110' : 'bg-sunken hover:brightness-110',
      )}
    >
      <Icon size={15} />
      <span className="flex-1 text-left">{label}</span>
      {keys && <span className={clsx('text-[11px] font-normal', strong ? 'opacity-70' : 'text-muted')}>{keys}</span>}
    </button>
  )
}

/** Live theme switch for the meeting (resets to src/theme.ts on reload) */
function ThemePicker() {
  const [cur, setCur] = useState(currentTheme())
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-semibold text-faint mb-2">
        <Palette size={12} /> Theme
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              applyTheme(t.id)
              setCur(t.id)
            }}
            title={t.label}
            aria-pressed={cur === t.id}
            className={clsx('focus-ring flex flex-col items-center gap-1 rounded-lg p-1 transition-colors', cur === t.id ? 'bg-sunken' : 'hover:bg-sunken/60')}
          >
            <span
              className={clsx('w-9 h-9 rounded-full grid place-items-center border-2', cur === t.id ? 'border-fg' : 'border-line')}
              style={{ background: `radial-gradient(circle at 70% 30%, ${t.accent} 0 28%, ${t.bg} 30%)` }}
            />
            <span className={clsx('text-[10px] truncate max-w-full', cur === t.id ? 'text-fg font-semibold' : 'text-muted')}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function DipAlarm({ seq }: { seq: number }) {
  const [shown, setShown] = useState(0)
  const visible = seq > 0 && shown !== seq

  useEffect(() => {
    if (!visible) return
    chime('alarm')
    const t = setTimeout(() => setShown(seq), ALARM_MS)
    return () => clearTimeout(t)
  }, [visible, seq])

  // The moment the dip fired (stays fixed while the layer re-renders every second)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(DEMO.dipAt)

  if (!visible) return null
  const close = () => setShown(seq)

  return (
    <div
      key={seq}
      role="alert"
      className="theme-dark fixed top-20 left-4 right-4 sm:left-auto sm:right-5 sm:w-[380px] z-50 rounded-2xl bg-panel border border-alarm/60 shadow-pop overflow-hidden animate-[slidein_.35s_ease-out] glow-alarm"
    >
      <div className="flex items-start gap-3 p-4">
        <span className="w-11 h-11 rounded-xl bg-alarm-bg text-alarm grid place-items-center shrink-0">
          <Zap size={22} className="blink-soft" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-alarm">Voltage dip · LT#2</span>
            <span className="num text-[12px] text-muted">{time}</span>
          </div>
          <div className="font-display font-semibold text-[17px] leading-tight mt-1">Cards 05, 06, 07 tripped</div>
          <div className="flex flex-wrap gap-1.5 mt-2.5 text-[11px] font-semibold">
            <span className="h-6 px-2 inline-flex items-center rounded-md bg-sunken text-muted num">80 ms</span>
            <span className="h-6 px-2 inline-flex items-center rounded-md bg-sunken text-muted">Card (4 to 09)</span>
            <span className="h-6 px-2 inline-flex items-center gap-1 rounded-md bg-alarm-bg text-alarm num">
              <AlertTriangle size={11} /> 15th in 30 days
            </span>
          </div>
        </div>
        <button onClick={close} className="focus-ring -mr-1 -mt-1 w-7 h-7 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken" title="Dismiss">
          <X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-3 border-t border-line divide-x divide-line text-[13px] font-semibold">
        <Link to="/map?m=CD-06" onClick={close} className="h-11 inline-flex items-center justify-center gap-1.5 text-brand hover:bg-sunken">
          <MapPin size={14} /> Map
        </Link>
        <Link to="/downtime" onClick={close} className="h-11 inline-flex items-center justify-center gap-1.5 text-muted hover:text-fg hover:bg-sunken">
          <Timer size={14} /> Downtime
        </Link>
        <Link to="/ask?about=card-trips" onClick={close} className="h-11 inline-flex items-center justify-center gap-1.5 text-muted hover:text-fg hover:bg-sunken">
          <Bot size={14} /> Why?
        </Link>
      </div>

      {/* Time left before it hides itself */}
      <div className="h-[3px] bg-alarm origin-left" style={{ animation: `shrink-x ${ALARM_MS}ms linear forwards` }} />
    </div>
  )
}
