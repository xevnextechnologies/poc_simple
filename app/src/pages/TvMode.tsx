import clsx from 'clsx'
import { Maximize2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SITE } from '../data/din'
import { EnervtekMark } from '../components/layout/Logo'
import { CLEANING, isCleaning, pkParts, shiftAt } from '../lib/time'
import { last30 } from '../sim/costs'
import { useLive } from '../sim/useLive'
import { useApp } from '../store/app'
import { MillMap } from './MillMap'
import { CostOverview, DemandToday, GridSolar, MachinesNow, MoneyFound, PowerNow, Ukg, WherePowerGoes } from './MillToday'

const SLIDES = ['Mill right now', 'Every machine', 'Where it goes'] as const
const SLIDE_SEC = 15
/** Card padding + header + legend row, around each chart */
const CHROME = 112
const GAP = 24

function useScreenH() {
  const [h, setH] = useState(window.innerHeight)
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}

/** Full-screen wall display for the HQ office: the same chart cards as Mill today, rotating every 15 s. */
export function TvMode() {
  const tick = useApp((s) => s.tick)
  const dipSeq = useApp((s) => s.dipSeq)
  const now = useApp((s) => s.now)
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const screenH = useScreenH()
  // header 72 + footer 48 + main padding 2×28
  const avail = Math.max(560, screenH - 72 - 48 - 56)

  useEffect(() => {
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [tick])

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), SLIDE_SEC * 1000)
    return () => clearInterval(t)
  }, [paused])

  // When the presenter fires the dip, jump to the map so the room sees the cards stop
  useEffect(() => {
    if (dipSeq > 0) setSlide(1)
  }, [dipSeq])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setSlide((s) => (s + 1) % SLIDES.length)
      if (e.key === 'ArrowLeft') setSlide((s) => (s + SLIDES.length - 1) % SLIDES.length)
      if (e.key === ' ') setPaused((p) => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const p = pkParts(new Date(now))
  const cleaning = isCleaning(p.hour)

  return (
    <div className="h-full flex flex-col bg-bg">
      <header className="h-[72px] shrink-0 bg-brand-dark text-white flex items-center gap-5 px-8">
        <EnervtekMark size={38} />
        <div className="leading-tight">
          <div className="font-display font-bold text-[22px]">{SITE.company}</div>
          <div className="text-[13px] text-white/60">{SITE.unit} · live from Enervtek</div>
        </div>
        <div className="flex-1" />
        <span className={clsx('inline-flex items-center gap-2 h-9 px-4 rounded-full text-[15px] font-semibold', cleaning ? 'bg-warn-bg text-warn' : 'bg-white/10 text-brand-soft')}>
          <span className={clsx('w-2.5 h-2.5 rounded-full', cleaning ? 'bg-warn' : 'bg-brand-soft live-pulse')} />
          {cleaning ? `Night cleaning ${CLEANING.span}` : `Production running · ${shiftAt(p.hour).label}`}
        </span>
        <div className="text-right leading-tight">
          <div className="font-display font-bold text-[26px] num">{p.time.slice(0, 5)}</div>
          <div className="text-[12px] text-white/60">{p.date}</div>
        </div>
        <button
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}))}
          className="w-10 h-10 grid place-items-center rounded-lg hover:bg-white/10 text-white/70"
          title="Full screen"
        >
          <Maximize2 size={18} />
        </button>
        <Link to="/today" className="w-10 h-10 grid place-items-center rounded-lg hover:bg-white/10 text-white/70" title="Exit TV mode">
          <X size={20} />
        </Link>
      </header>

      <main className="flex-1 min-h-0 px-8 py-7 overflow-hidden">
        {slide === 0 && <NowSlide avail={avail} />}
        {slide === 1 && (
          <div className="card h-full p-6">
            <MillMap compact />
          </div>
        )}
        {slide === 2 && <WhereSlide avail={avail} />}
      </main>

      <footer className="h-12 shrink-0 flex items-center justify-center gap-3 border-t border-line bg-panel">
        {SLIDES.map((s, i) => (
          <button
            key={s}
            onClick={() => setSlide(i)}
            className={clsx('h-8 px-4 rounded-full text-[13px] font-semibold transition-colors', i === slide ? 'bg-brand-dark text-white' : 'text-muted hover:bg-sunken')}
          >
            {s}
          </button>
        ))}
        <span className="text-[12px] text-faint ml-4">{paused ? 'Paused (space to resume)' : `Next in ${SLIDE_SEC}s · ← → to switch · space to pause`}</span>
      </footer>
    </div>
  )
}

/** Slide 1: load, sources, machines on top; cost and money below */
function NowSlide({ avail }: { avail: number }) {
  const live = useLive()
  const slot = Math.floor(live.hour * 4)
  const days = useMemo(() => last30(), [])
  const charts = avail - 2 * CHROME - GAP
  const top = Math.round(charts * 0.4)
  const bottom = charts - top
  return (
    <div className="grid grid-cols-3 gap-6 h-full content-start">
      <PowerNow live={live} slot={slot} h={top} />
      <GridSolar slot={slot} h={top} />
      <MachinesNow live={live} h={top} />
      <div className="col-span-2">
        <CostOverview days={days} h={bottom} />
      </div>
      <MoneyFound h={bottom} />
    </div>
  )
}

/** Slide 3: where the power goes, efficiency, and grid demand */
function WhereSlide({ avail }: { avail: number }) {
  const live = useLive()
  const slot = Math.floor(live.hour * 4)
  const days = useMemo(() => last30(), [])
  const chart = avail - CHROME
  return (
    <div className="grid grid-cols-3 gap-6 h-full content-start">
      <WherePowerGoes h={chart - 190} />
      <Ukg days={days} h={chart} />
      <DemandToday slot={slot} h={chart} />
    </div>
  )
}
