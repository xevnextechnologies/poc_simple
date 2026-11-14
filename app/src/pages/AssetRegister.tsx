import clsx from 'clsx'
import { ChevronRight, Search, Sun, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  FEEDERS,
  GRID_INTAKE,
  HALLS,
  LT_BUSES,
  MACHINES,
  METER_POINTS,
  PF_PANELS,
  SITE,
  SOLAR_ARRAYS,
  STAGE_LABEL,
  TOTAL_SOLAR_KWP,
  TOTAL_TRANSFORMER_KVA,
  TRANSFORMERS,
  ZONES,
  feederById,
  hallById,
  machinesByFeeder,
  zoneById,
} from '../data/din'
import type { BusId, Feeder, Machine } from '../data/din'
import { BusBadge, Badge, Meter, MeteringBadge, PageHeader, Panel, Segmented, Stat } from '../components/ui/primitives'
import { breakerKw, busLabel, fmt } from '../lib/format'

type View = 'hierarchy' | 'inventory' | 'halls'

const connectedKw = (ms: Machine[]) => ms.reduce((s, m) => s + m.ratedKw, 0)

export function AssetRegister() {
  const [view, setView] = useState<View>('hierarchy')
  const totalKw = connectedKw(MACHINES)
  const productionMachines = MACHINES.filter((m) =>
    ['blowroom', 'carding', 'drawing', 'combing', 'simplex', 'ring', 'openend', 'winding'].includes(m.stage),
  ).length

  return (
    <>
      <PageHeader
        crumbs={['For engineers', 'Plant setup']}
        title="Plant setup"
        subtitle={`Electrical hierarchy and machine inventory for ${SITE.unit}, built from the site SLD approved by ${SITE.sldApprovedBy}`}
        actions={
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'hierarchy', label: 'Electrical hierarchy' },
              { value: 'inventory', label: 'Machine inventory' },
              { value: 'halls', label: 'Halls & zones' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <Stat label="Connected load" value={fmt(totalKw)} unit="kW" sub={`Sanctioned ${fmt(SITE.sanctionedKw)} kW · grid ${fmt(SITE.gridSupplyKw)} kW`} />
        <Stat label="Transformer capacity" value={fmt(TOTAL_TRANSFORMER_KVA)} unit="kVA" sub={`${TRANSFORMERS.length} × 2500 kVA · 11 kV / 410 V`} />
        <Stat label="LT feeders" value={FEEDERS.length} sub={`${FEEDERS.filter((f) => f.metering === 'pq').length} with power-quality analysers`} />
        <Stat label="Production machines" value={productionMachines} sub={`${MACHINES.length} assets incl. utilities`} />
        <Stat label="Ring spindles" value={fmt(SITE.spindles)} sub={`${SITE.ringFrames} ring frames · 2 OE × 480 rotors`} />
        <Stat label="Metering points" value={METER_POINTS.length} sub="Modbus RTU / TCP via edge gateway" tone="accent" />
      </div>

      {view === 'hierarchy' && <Hierarchy />}
      {view === 'inventory' && <Inventory />}
      {view === 'halls' && <Halls />}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Electrical hierarchy                                                      */
/* -------------------------------------------------------------------------- */

function Hierarchy() {
  const [open, setOpen] = useState<Record<string, boolean>>({ 'LT2-F10': true })
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[320px_1fr] gap-4">
      <div className="flex flex-col gap-4">
        <Panel title="Supply sources">
          <div className="space-y-3">
            <SourceRow
              icon={<Zap size={14} />}
              tone="grid"
              title={GRID_INTAKE.name}
              lines={[`${SITE.supplyVoltage} · ${fmt(SITE.gridSupplyKw)} kW available`, GRID_INTAKE.meteringCubicle, GRID_INTAKE.protectionCubicle]}
              meter={GRID_INTAKE.meterId}
            />
            <SourceRow
              icon={<Sun size={14} />}
              tone="solar"
              title={`Solar PV · ${fmt(TOTAL_SOLAR_KWP)} kWp`}
              lines={SOLAR_ARRAYS.map((s) => `${s.name}: ${fmt(s.kwp)} kWp → ${s.inverter} (${busLabel(s.bus)})`)}
              meter="Inverter loggers ×3"
            />

          </div>
        </Panel>

        <Panel title="Transformers & PF correction" bodyClassName="p-0">
          <table className="w-full text-xs">
            <tbody>
              {TRANSFORMERS.map((t) => {
                const pf = PF_PANELS.find((p) => p.bus === t.bus)!
                return (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-faint text-2xs">
                        {fmt(t.kva)} kVA · {t.ratio} · Z {t.impedancePct}% · VCB {t.vcbA}A
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <BusBadge bus={t.bus} />
                      <div className="text-faint text-2xs mt-1">
                        {pf.name.split(' ')[0]} {fmt(pf.kvar)} kVAR
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel
        title="LT distribution"
        subtitle="Feeder names as written on 'SLD For Spinning Unit DIL'"
        bodyClassName="p-0"
        actions={
          <div className="flex items-center gap-3 text-2xs text-faint">
            <span>Connected kW vs breaker capacity at 0.9 PF</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[920px]">
            <thead className="text-faint">
              <tr className="border-b border-line">
                <Th className="w-[34%] pl-4">Feeder / machine</Th>
                <Th>Breaker</Th>
                <Th className="text-right">Connected</Th>
                <Th className="w-[160px]">Breaker utilisation</Th>
                <Th className="text-right">Assets</Th>
                <Th>Metering</Th>
                <Th className="pr-4">Meter ID</Th>
              </tr>
            </thead>
            {LT_BUSES.map((bus) => (
              <BusGroup key={bus.id} busId={bus.id} open={open} toggle={toggle} />
            ))}
          </table>
        </div>
      </Panel>
    </div>
  )
}

function SourceRow({ icon, title, lines, meter, tone }: { icon: React.ReactNode; title: string; lines: string[]; meter: string; tone: string }) {
  return (
    <div className="flex gap-3">
      <div className={clsx('w-7 h-7 rounded grid place-items-center shrink-0', `bg-${tone}/15 text-${tone}`)}>{icon}</div>
      <div className="min-w-0 text-xs">
        <div className="font-medium">{title}</div>
        {lines.map((l) => (
          <div key={l} className="text-faint text-2xs leading-5 truncate">
            {l}
          </div>
        ))}
        <div className="text-2xs text-muted mt-0.5 num">{meter}</div>
      </div>
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={clsx('px-3 h-9 text-left font-medium label !text-[10px] whitespace-nowrap', className)}>{children}</th>
}

function BusGroup({ busId, open, toggle }: { busId: BusId; open: Record<string, boolean>; toggle: (id: string) => void }) {
  const bus = LT_BUSES.find((b) => b.id === busId)!
  const tr = TRANSFORMERS.find((t) => t.id === bus.transformerId)!
  const pf = PF_PANELS.find((p) => p.id === bus.pfPanelId)!
  const pv = SOLAR_ARRAYS.find((s) => s.id === bus.solarId)!
  const feeders = FEEDERS.filter((f) => f.bus === busId)
  const busMachines = MACHINES.filter((m) => feederById[m.feederId].bus === busId)

  return (
    <tbody>
      <tr className="bg-sunken/60 border-b border-line">
        <td colSpan={7} className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="flex items-center gap-2">
              <span className={clsx('w-1 h-5 rounded-full', `bg-${bus.color}`)} />
              <span className="font-semibold text-[13px]">{bus.name}</span>
              <span className="text-faint num">"{bus.sldLabel}"</span>
            </span>
            <Meta k="Transformer" v={`${tr.name} · ${fmt(tr.kva)} kVA`} />
            <Meta k="Incomer" v={`ACB ${fmt(tr.incomerAcbA)}A · ${tr.controller}`} />
            <Meta k="PF panel" v={`${fmt(pf.kvar)} kVAR · ${pf.steps} steps · ${pf.detuned ? 'detuned' : 'not detuned'}`} />
            <Meta k="Solar" v={`${pv.name} · ${fmt(pv.kwp)} kWp`} />
            <Meta k="Connected" v={`${fmt(connectedKw(busMachines))} kW · ${feeders.length} feeders`} />
          </div>
        </td>
      </tr>
      {feeders.map((f) => (
        <FeederRows key={f.id} feeder={f} open={!!open[f.id]} onToggle={() => toggle(f.id)} />
      ))}
    </tbody>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <span className="text-2xs">
      <span className="text-faint">{k} </span>
      <span className="text-muted num">{v}</span>
    </span>
  )
}

function FeederRows({ feeder, open, onToggle }: { feeder: Feeder; open: boolean; onToggle: () => void }) {
  const ms = machinesByFeeder[feeder.id] ?? []
  const conn = connectedKw(ms)
  const cap = breakerKw(feeder.breakerA)
  const util = conn / cap
  return (
    <>
      <tr className="border-b border-line hover:bg-raised/60 cursor-pointer" onClick={onToggle}>
        <td className="pl-4 pr-3 py-2">
          <div className="flex items-center gap-2">
            <ChevronRight size={14} className={clsx('text-faint transition-transform shrink-0', open && 'rotate-90')} />
            <span className="num text-faint text-2xs w-[64px] shrink-0">{feeder.id}</span>
            <span className="font-medium truncate">{feeder.sldName}</span>
            {feeder.note && <Badge tone="warn">{feeder.note}</Badge>}
          </div>
        </td>
        <td className="px-3 py-2 num text-muted whitespace-nowrap">
          {feeder.breaker} {fmt(feeder.breakerA)}A
        </td>
        <td className="px-3 py-2 num text-right whitespace-nowrap">{fmt(conn, conn < 100 ? 1 : 0)} kW</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <Meter value={util} />
            <span className="num text-2xs text-muted w-9 text-right">{fmt(util * 100)}%</span>
          </div>
        </td>
        <td className="px-3 py-2 num text-right text-muted">{ms.length}</td>
        <td className="px-3 py-2">
          <MeteringBadge tier={feeder.metering} />
        </td>
        <td className="pr-4 pl-3 py-2 num text-2xs text-muted">{feeder.meterId}</td>
      </tr>
      {open &&
        ms.map((m) => (
          <tr key={m.id} className="border-b border-line bg-sunken/30">
            <td className="pl-[52px] pr-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="num text-2xs text-accent w-[72px] shrink-0">{m.id}</span>
                <span className="truncate">{m.name}</span>
              </div>
            </td>
            <td className="px-3 py-1.5 text-2xs text-faint">{m.drive}</td>
            <td className="px-3 py-1.5 num text-right text-muted">{fmt(m.ratedKw, m.ratedKw % 1 ? 1 : 0)} kW</td>
            <td className="px-3 py-1.5 text-2xs text-faint truncate max-w-[200px]" colSpan={2}>
              {m.spec}
            </td>
            <td className="px-3 py-1.5">
              <MeteringBadge tier={m.metering} />
            </td>
            <td className="pr-4 pl-3 py-1.5 num text-2xs text-faint">{m.meterId ?? '—'}</td>
          </tr>
        ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Machine inventory                                                         */
/* -------------------------------------------------------------------------- */

function Inventory() {
  const [q, setQ] = useState('')
  const [hall, setHall] = useState('all')
  const [stage, setStage] = useState('all')
  const [bus, setBus] = useState<'all' | BusId>('all')

  const stages = useMemo(() => Array.from(new Set(MACHINES.map((m) => m.stage))), [])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return MACHINES.filter((m) => {
      const f = feederById[m.feederId]
      if (hall !== 'all' && m.hallId !== hall) return false
      if (stage !== 'all' && m.stage !== stage) return false
      if (bus !== 'all' && f.bus !== bus) return false
      if (!needle) return true
      return [m.id, m.name, f.sldName, m.spec ?? ''].some((s) => s.toLowerCase().includes(needle))
    })
  }, [q, hall, stage, bus])

  return (
    <Panel
      title={`Machines · ${rows.length} of ${MACHINES.length}`}
      bodyClassName="p-0"
      actions={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-line bg-sunken w-56">
            <Search size={14} className="text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ID, name or feeder…"
              className="bg-transparent outline-none text-xs flex-1 placeholder:text-faint"
            />
          </label>
          <Select value={hall} onChange={setHall} options={[['all', 'All halls'], ...HALLS.map((h) => [h.id, h.name] as [string, string])]} />
          <Select value={stage} onChange={setStage} options={[['all', 'All processes'], ...stages.map((s) => [s, STAGE_LABEL[s]] as [string, string])]} />
          <Segmented
            value={bus}
            onChange={setBus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'LT1', label: 'LT#1' },
              { value: 'LT2', label: 'LT#2' },
              { value: 'LT34', label: 'LT#3&4' },
            ]}
          />
        </div>
      }
    >
      <div className="overflow-auto max-h-[calc(100vh-330px)]">
        <table className="w-full text-xs min-w-[1100px]">
          <thead className="sticky top-0 bg-panel z-10">
            <tr className="border-b border-line">
              <Th className="pl-4">ID</Th>
              <Th>Machine</Th>
              <Th>Hall · zone</Th>
              <Th>Feeder (SLD)</Th>
              <Th>Bus</Th>
              <Th className="text-right">Rated</Th>
              <Th>Drive</Th>
              <Th>Year</Th>
              <Th>Specification</Th>
              <Th className="pr-4">Metering</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const f = feederById[m.feederId]
              return (
                <tr key={m.id} className="border-b border-line hover:bg-raised/60">
                  <td className="pl-4 pr-3 py-2 num text-accent whitespace-nowrap">{m.id}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{m.name}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">
                    {hallById[m.hallId].short} · {zoneById[m.zoneId].name}
                  </td>
                  <td className="px-3 py-2 text-muted max-w-[240px] truncate" title={f.sldName}>
                    {f.sldName}
                  </td>
                  <td className="px-3 py-2">
                    <BusBadge bus={f.bus} />
                  </td>
                  <td className="px-3 py-2 num text-right whitespace-nowrap">{fmt(m.ratedKw, m.ratedKw % 1 ? 1 : 0)} kW</td>
                  <td className="px-3 py-2 text-muted">{m.drive}</td>
                  <td className="px-3 py-2 num text-muted">{m.modelYear}</td>
                  <td className="px-3 py-2 text-faint max-w-[260px] truncate" title={m.spec}>
                    {m.spec ?? '—'}
                  </td>
                  <td className="pr-4 pl-3 py-2">
                    <MeteringBadge tier={m.metering} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring h-8 px-2 rounded-md border border-line bg-sunken text-xs text-fg"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

/* -------------------------------------------------------------------------- */
/*  Halls & zones                                                             */
/* -------------------------------------------------------------------------- */

function Halls() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
      {HALLS.map((h, i) => {
        const zones = ZONES.filter((z) => z.hallId === h.id)
        const ms = MACHINES.filter((m) => m.hallId === h.id)
        const spindles = ms.reduce((s, m) => s + (m.kind === 'ring-frame' ? m.spindles ?? 0 : 0), 0)
        return (
          <Panel
            key={h.id}
            title={
              <span className="flex items-center gap-2">
                <span className="num text-2xs text-faint">{String(i + 1).padStart(2, '0')}</span>
                {h.name}
              </span>
            }
            actions={<span className="num text-xs text-muted">{fmt(connectedKw(ms))} kW connected</span>}
          >
            <p className="text-muted text-xs mb-3">{h.description}</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat k="Assets" v={fmt(ms.length)} />
              <MiniStat k="Zones" v={fmt(zones.length)} />
              <MiniStat k="Spindles" v={spindles ? fmt(spindles) : '—'} />
            </div>
            <div className="divide-y divide-line border-t border-line">
              {zones.map((z) => {
                const zm = ms.filter((m) => m.zoneId === z.id)
                const buses = Array.from(new Set(zm.map((m) => feederById[m.feederId].bus)))
                return (
                  <div key={z.id} className="flex items-center gap-3 py-2 text-xs">
                    <span className="font-medium flex-1 truncate">{z.name}</span>
                    <span className="flex gap-1">
                      {buses.map((b) => (
                        <BusBadge key={b} bus={b} />
                      ))}
                    </span>
                    <span className="num text-muted w-16 text-right">{zm.length} assets</span>
                    <span className="num text-muted w-20 text-right">{fmt(connectedKw(zm))} kW</span>
                  </div>
                )
              })}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-line bg-sunken/50 px-2.5 py-2">
      <div className="label !text-[10px]">{k}</div>
      <div className="num text-[15px] mt-0.5">{v}</div>
    </div>
  )
}
