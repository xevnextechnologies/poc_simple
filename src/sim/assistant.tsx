// Scripted "Ask Enervtek" answers. Every number is read from the same model as
// the rest of the app, so the chatbot never contradicts a screen.
import type { ReactNode } from 'react'
import { MACHINES, SOLAR_ARRAYS, TOTAL_SOLAR_KWP, feederById, hallById, machineById } from '../data/din'
import { Evidence } from '../components/charts/Evidence'
import { busLabel, fmt, pkr } from '../lib/format'
import { AREA_DAY_KWH, BLENDED_RS, LEDGER, SAVING_NOW_RS, last30 } from './costs'
import { TARIFF, machineAt, pkMidnight, snapshot } from './engine'
import { HEALTH, HEALTH_LIST, PEER_GROUPS, groupRows, healthCounts } from './health'
import { INSIGHTS, OPEN_RS_MONTH, insightById, insightForMachine } from './insights'
import { BUS_PQ, tdd, thdv } from './pq'
import { STAGES, TRACK } from './tracking'
import { READY_COUNT, READINESS, RULES as OP_RULES } from './iso'
import { GROUPS, POSSIBLE_KG_MONTH, byGroup, byMachine, byReason, bySection, dur, isPlanned, monthStops, stoppedNow, totals, type Stop } from './downtime'
import { useApp } from '../store/app'

/** Stops as the screens see them, including reasons entered during the demo */
const stopsNow = () => monthStops(Date.now(), useApp.getState().dtEntries)
const clock = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(t)
const reasonText = (x: Stop) => (x.reason ? x.reason.label : 'No reason entered yet')

export interface Answer {
  /** Steps shown while "thinking": what data Enervtek is reading */
  reading: string[]
  /** Paragraphs; **bold** is supported */
  paras: string[]
  attach?: ReactNode
  links?: { to: string; label: string }[]
  sources: string
  followUps?: string[]
}

export const SUGGESTIONS: { group: string; qs: string[] }[] = [
  { group: 'Downtime', qs: ['Which machines are stopped right now?', 'Why is Ring Frame 12 stopped?', 'How much downtime did we have this month?'] },
  { group: 'Production', qs: ['How much production did we lose this month?', 'Which machines stop the most?', 'Which jobs take longer than they should?'] },
  { group: 'Machine health', qs: ['How healthy are my machines?', 'Which machine is most likely to break down?', 'Why did Card 06 stop?'] },
  { group: 'Recommendations', qs: ['What should my team fix first?', 'How can we cut downtime?', 'Which stops have no reason entered?', 'Are we ready for ISO 50001?'] },
]

/* ------------------------------ small blocks ------------------------------ */
function Table({ head, rows, right = [] }: { head: string[]; rows: (string | number)[][]; right?: number[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-muted border-b border-line">
          {head.map((h, i) => (
            <th key={h} className={`py-1.5 font-semibold ${right.includes(i) ? 'text-right' : ''}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            {r.map((c, j) => (
              <td key={j} className={`py-1.5 ${right.includes(j) ? 'text-right num' : ''} ${j === 0 ? 'font-medium' : ''}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
const Chart = ({ id, title }: { id: string; title: string }) => (
  <div>
    <div className="text-[13px] font-semibold mb-1">{title}</div>
    <Evidence id={id} height={200} />
  </div>
)

/* ------------------------------ answers ------------------------------ */
const A: Record<string, () => Answer> = {
  downNow() {
    const live = stoppedNow(stopsNow()).sort((a, b) => b.overMin - a.overMin || b.minutes - a.minutes)
    const over = live.filter((x) => x.overMin > 0)
    const missing = live.filter((x) => !x.reason)
    return {
      reading: ['Reading the meters on 122 production machines', 'Finding machines with no current outside cleaning', 'Matching each stop to its reason and normal time'],
      paras: [
        live.length ? `**${live.length} machines are stopped right now.**` : '**Every production machine is running.**',
        ...(over.length ? [`${over.map((x) => `**${x.machine.name}**`).join(' and ')} ${over.length === 1 ? 'is' : 'are'} taking longer than the normal time for the job.`] : []),
        ...(missing.length ? [`${missing.map((x) => x.machine.name).join(', ')} ${missing.length === 1 ? 'has' : 'have'} no reason entered yet. Please ask the supervisor to enter it on the tablet.`] : []),
      ],
      attach: live.length ? (
        <Table
          head={['Machine', 'Why', 'Down for', 'Normal']}
          right={[2, 3]}
          rows={live.map((x) => [x.machine.name, reasonText(x), dur(x.minutes), x.expectedMin != null ? dur(x.expectedMin) : '—'])}
        />
      ) : undefined,
      links: [
        { to: '/downtime', label: 'Downtime now' },
        { to: '/map', label: 'Mill map' },
      ],
      sources: 'Machine and feeder meters (current), reasons entered by staff',
      followUps: ['Why is Ring Frame 12 stopped?', 'How much downtime did we have this month?'],
    }
  },

  downMonth() {
    const st = stopsNow()
    const t = totals(st)
    const groups = byGroup(st.filter((x) => !isPlanned(x))).filter((g) => g.stops > 0).sort((a, b) => b.hours - a.hours)
    return {
      reading: ['Reading 30 days of stops from the meters', 'Grouping by reason', 'Leaving out cleaning, doffing and planned stops'],
      paras: [
        `This month machines stopped **${fmt(t.stops)} times**, for **${fmt(t.hours)} hours** in total. That does not include night cleaning, doffing or the ${fmt(t.plannedHours)} hours of planned stops.`,
        `The biggest cause is **mechanical faults**, and **${fmt(t.overHours)} hours** were jobs that ran past their normal time.`,
      ],
      attach: <Table head={['Why', 'Stops', 'Hours']} right={[1, 2]} rows={groups.map((g) => [GROUPS[g.group].label, g.stops, fmt(g.hours)])} />,
      links: [{ to: '/downtime-month', label: 'Downtime this month' }],
      sources: 'Stop history from the meters, reasons from staff entries',
      followUps: ['How much production did we lose this month?', 'Which jobs take longer than they should?'],
    }
  },

  prodLost() {
    const st = stopsNow()
    const t = totals(st)
    const sec = bySection(st.filter((x) => !isPlanned(x)))
    return {
      reading: ['Adding up every stop this month', 'Working out each machine\'s share of production', 'Allowing for material in stock between sections'],
      paras: [
        `Stops cost about **${fmt(t.kg)} kg of yarn** this month: **${fmt((t.kg / POSSIBLE_KG_MONTH) * 100, 1)}%** of what the mill can make.`,
        `**${sec[0].name}** loses the most. Ring frames lose yarn the moment they stop; cards, combers and the other earlier machines have material in stock, so only their longer stops cost yarn.`,
      ],
      attach: <Table head={['Section', 'Stops', 'Yarn lost']} right={[1, 2]} rows={sec.map((x) => [x.name, x.stops, `${fmt(x.kg)} kg`])} />,
      links: [{ to: '/downtime-month', label: 'Downtime this month' }],
      sources: 'Stop history, mill output per section',
      followUps: ['Which machines stop the most?', 'How can we cut downtime?'],
    }
  },

  topMachines() {
    const rows = byMachine(stopsNow().filter((x) => !isPlanned(x))).slice(0, 6)
    return {
      reading: ['Ranking machines by production lost this month'],
      paras: [
        `**${rows[0].machine.name}** lost the most production this month: **${fmt(rows[0].kg)} kg** over ${rows[0].stops} stops, mostly ${rows[0].main.toLowerCase()}.`,
        'The list is led by long single jobs (gearboxes, motors) more than by machines that stop often. Spares at hand and a faster repair would help most.',
      ],
      attach: <Table head={['Machine', 'Stops', 'Hours', 'Yarn lost']} right={[1, 2, 3]} rows={rows.map((r) => [r.machine.name, r.stops, fmt(r.hours, 1), `${fmt(r.kg)} kg`])} />,
      links: [{ to: '/downtime-month', label: 'Downtime this month' }],
      sources: 'Stop history from the meters',
      followUps: ['Which jobs take longer than they should?', 'How can we cut downtime?'],
    }
  },

  overrun() {
    const rows = byReason(stopsNow())
      .filter((r) => r.reason.group !== 'planned')
      .sort((a, b) => b.avgMin / b.reason.expectedMin - a.avgMin / a.reason.expectedMin)
    const w = rows[0]
    return {
      reading: ['Comparing every finished job with its normal time'],
      paras: [
        `**${w.reason.label}s** are the problem: ${w.count} this month, **${dur(w.avgMin)} on average** against a normal time of ${dur(w.reason.expectedMin)}. That is ${fmt(w.overHours)} machine hours more than needed.`,
        'Belt, roller and sensor jobs finish close to their normal time, so the delay is specific to bearings. A common cause is that bearings and pullers are kept in the main store.',
      ],
      attach: (
        <div className="space-y-4">
          <Chart id="bearing-overrun" title="Every bearing change this month: time taken vs the normal time" />
          <Table head={['Job', 'Jobs', 'Average', 'Normal']} right={[1, 2, 3]} rows={rows.map((r) => [r.reason.label, r.count, dur(r.avgMin), dur(r.reason.expectedMin)])} />
        </div>
      ),
      links: [
        { to: '/advisor#bearing-overrun', label: 'Recommendation' },
        { to: '/downtime-month', label: 'Downtime this month' },
      ],
      sources: 'Stop start and end from the meters, job type from staff entries',
      followUps: ['How can we cut downtime?'],
    }
  },

  missing() {
    const l = stopsNow().filter((x) => !x.reason).sort((a, b) => b.start - a.start)
    const day = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short' }).format(t)
    return {
      reading: ['Finding stops the meters recorded without a reason'],
      paras: [
        l.length
          ? `**${l.length} stops** this month have no reason entered, ${fmt(l.reduce((a, x) => a + x.minutes, 0) / 60)} hours in total. Without a reason we cannot tell whether they took too long or keep coming back.`
          : '**Every stop this month has a reason.** Well done to the supervisors.',
        ...(l.length ? ['The supervisor can enter them on the Downtime pages, in a few seconds each.'] : []),
      ],
      attach: l.length ? <Table head={['Machine', 'When', 'Down for']} right={[2]} rows={l.slice(0, 8).map((x) => [x.machine.name, `${day(x.start)} ${clock(x.start)}`, dur(x.minutes)])} /> : undefined,
      links: [
        { to: '/downtime-month', label: 'Enter the reasons' },
        { to: '/advisor#no-reason', label: 'Recommendation' },
      ],
      sources: 'Stop history from the meters',
      followUps: ['How can we cut downtime?'],
    }
  },

  cutDowntime() {
    const st = stopsNow()
    const br = byReason(st).find((r) => r.reason.id === 'bearing')
    const dips = st.filter((x) => x.reason?.id === 'power-dip')
    return {
      reading: ['Reading open downtime findings', 'Ranking by production won back'],
      paras: [
        'Three things would cut downtime the most:',
        `**1. Bearing changes:** keep a bearing kit at each section. They take ${br ? dur(br.avgMin) : 'twice as long'} instead of ${dur(90)}, so this wins back the most production.`,
        `**2. Power dips:** ${dips.length} card stops this month came from supply dips during line changeover. Changing over without a gap and turning on ride-through in the card drives stops them, at no cost.`,
        '**3. A reason for every stop:** the supervisor enters it before the machine restarts, so every stop can be checked against its normal time.',
      ],
      links: [
        { to: '/advisor#bearing-overrun', label: 'Bearing changes' },
        { to: '/advisor#card-trips', label: 'Power dips' },
        { to: '/advisor#no-reason', label: 'Missing reasons' },
      ],
      sources: 'Downtime findings and stop history',
      followUps: ['Which jobs take longer than they should?', 'What should my team fix first?'],
    }
  },

  breakRisk() {
    const act = HEALTH_LIST.filter((h) => h.level === 'act').sort((a, b) => a.score - b.score)
    return {
      reading: [`Running 8 electrical checks on ${MACHINES.length} machines`, 'Comparing with each machine\'s own last 6 weeks'],
      paras: [
        'The **blow room condenser motor (Line 1)** is the most likely to break down. The current on its three phases has gone from 3% to 9% uneven in three weeks, which usually comes before a motor burns out. If it stops, blow room Line 1 stops feeding the cards.',
        `${act.length} machines need a check this week:`,
      ],
      attach: <Table head={['Machine', 'Score', 'Why']} right={[1]} rows={act.map((h) => [machineById[h.id].name, `${h.score}/100`, h.headline ?? ''])} />,
      links: [
        { to: '/health?m=BR-L1-CN', label: 'Condenser health' },
        { to: '/advisor#condenser', label: 'Recommendation' },
      ],
      sources: 'Machine and feeder meters, 8 electrical checks every 5 s',
      followUps: ['How healthy are my machines?', 'What should my team fix first?'],
    }
  },
  today() {
    const open = INSIGHTS.filter((i) => i.kind !== 'verified' && TRACK[i.id].stage < 4).sort((a, b) => b.rsMonth - a.rsMonth)
    return {
      reading: [`Reading all ${INSIGHTS.length} findings`, 'Checking owners and due dates', 'Ranking by production, risk and money'],
      paras: [
        `Your team has **${open.length} things** to look at. In order:`,
        '**1.** Put a bearing kit at each section: bearing changes take twice their normal time. **2.** Check the blow room condenser motor this week, before it burns out. **3.** Enter a reason for every stop. **4.** Stop the power dips that trip Cards 05–07.',
      ],
      attach: (
        <Table
          head={['Job', 'Who', 'When', 'Stage']}
          rows={open.map((i) => [i.nextStep, TRACK[i.id].owner, TRACK[i.id].due, STAGES[TRACK[i.id].stage]])}
        />
      ),
      links: [{ to: '/advisor', label: 'Open recommendations' }],
      sources: 'Open findings and action tracker',
      followUps: ['How can we cut downtime?', 'Why did Card 06 stop?'],
    }
  },

  cardTrips() {
    const i = insightById['card-trips']
    return {
      reading: ['Reading LT#2 incomer power-quality meter', 'Reading feeder meter "Card (4 to 09)"', 'Lining up events to the millisecond'],
      paras: [
        `${i.title}. ${i.plain}`,
        `This is not a fault in the cards. **14 dips in the last 30 days** stopped cards the same way, each costing about 20 minutes of reloading: roughly **770 kg of sliver** and **14 hours of card time** a month.`,
        `**What to do:** ${i.nextStep}`,
      ],
      attach: <Chart id="card-trips" title="Power dips that stopped cards, last 30 days" />,
      links: [
        { to: '/map?m=CD-06', label: 'See Card 06 on the map' },
        { to: '/downtime', label: 'Downtime now' },
        { to: '/advisor#card-trips', label: 'Recommendation' },
      ],
      sources: 'PQ analyser on LT#2 incomer (1 s), feeder meter PQ-LT2-10',
      followUps: ['What is causing the harmonics on LT#2?', 'What should my team check today?'],
    }
  },

  rings() {
    const g = PEER_GROUPS[0]
    const rows = groupRows(g).sort((a, b) => b.dev - a.dev)
    const all = PEER_GROUPS.filter((x) => x.id.startsWith('ring')).flatMap((x) => groupRows(x)).filter((r) => r.level !== 'ok')
    return {
      reading: ['Reading 38 ring frame meters', 'Grouping identical frames on the same count', 'Comparing units per kg, last 7 days'],
      paras: [
        `Only **Ring Frame ${all[0] ? all[0].id.replace('RF-', '') : '34'}** stands out. It uses **10.5% more power per kg** than Frames 32–39, which are identical and run the same 30s combed. Extra power for the same work is an early sign of wear.`,
        'All other ring frames are within ±3% of their sisters, which is normal.',
        `**What to do:** ${insightById['ring-34'].nextStep}`,
      ],
      attach: (
        <div className="space-y-4">
          <Chart id="ring-34" title="Ring Frame 34 vs its sister frames" />
          <Table head={['Frame', 'Units / kg', 'vs sisters']} right={[1, 2]} rows={rows.map((r) => [r.name, fmt(r.ukg, 2), `${r.dev >= 0 ? '+' : ''}${fmt(r.dev, 1)}%`])} />
        </div>
      ),
      links: [
        { to: '/health?m=RF-34', label: 'Machine health' },
        { to: '/advisor#ring-34', label: 'Recommendation' },
      ],
      sources: 'Machine meters on each ring frame, production entry by count',
      followUps: ['Tell me about Ring Frame 34', 'How healthy are my machines?'],
    }
  },

  harmonics() {
    const b = BUS_PQ.LT2
    return {
      reading: ['Reading LT#2 power-quality analyser', 'Calculating resonance from your SLD (T-2, PF.2)', 'Checking against IEEE 519'],
      paras: [
        `The card drives on LT#2 draw "dirty" current: mostly the **5th and 7th harmonics**. Harmonic current is **${fmt(tdd(b), 1)}%** against a limit of 8%.`,
        `On its own that would be manageable. The problem is the **PF.2 capacitor bank**: with ${b.stepsIn} of 10 steps in, it and Transformer T-2 resonate near the **7th harmonic** and amplify it. Capacitor current is **${b.capCurrentPct}%** of rated (limit 130%), and **2 steps have already blown their fuses**. Voltage distortion is ${fmt(thdv(b), 1)}%, close to the 8% limit.`,
        '**What to do:** fit 7% detuned capacitor steps on PF.2 (do not just replace fuses), and check that the card drives have DC chokes or line reactors.',
      ],
      attach: <Chart id="lt2-harmonics" title="LT#2 harmonic current vs IEEE 519 limits" />,
      links: [
        { to: '/advisor#lt2-harmonics', label: 'Recommendation' },
      ],
      sources: 'Class-A PQ analyser on LT#2 incomer, PF.2 step status',
      followUps: ['Why did Card 06 stop?', 'What should my team check today?'],
    }
  },

  mdi() {
    const i = insightById['restart-peak']
    return {
      reading: ['Reading grid incomer, 15-minute demand', 'Finding this month’s highest demand', 'Matching it to what started at that moment'],
      paras: [
        i.plain,
        `That one 15-minute spike sets the maximum demand charge for the whole month: about **${pkr(i.rsMonth)} a month** more than needed.`,
        `**What to do:** ${i.nextStep} It costs nothing.`,
      ],
      attach: <Chart id="restart-peak" title="Grid demand, 03:00 to 08:00" />,
      links: [{ to: '/advisor#restart-peak', label: 'Recommendation' }],
      sources: '11 kV incomer power-quality meter, 15-minute demand',
      followUps: ['If we fix everything, how much do we save in a year?'],
    }
  },

  cost() {
    const d = last30()
    const m = d.reduce((a, x) => ({ cost: a.cost + x.cost, kwh: a.kwh + x.kwh, kg: a.kg + x.kg, solar: a.solar + x.solarKwh }), { cost: 0, kwh: 0, kg: 0, solar: 0 })
    const total = AREA_DAY_KWH.reduce((s, a) => s + a.kwh, 0)
    return {
      reading: ['Adding up 30 days of grid and solar', 'Dividing by the yarn produced', 'Ranking areas by cost'],
      paras: [
        `In the last 30 days electricity cost **${pkr(m.cost)}**: **Rs ${fmt(m.cost / m.kg)} for every kg of yarn**.`,
        `Solar saved you **${pkr(m.solar * TARIFF.gridRs)}**. The four biggest areas (ring, AC, blow room & carding, lights & services) are ${fmt((AREA_DAY_KWH.slice(0, 4).reduce((s, a) => s + a.kwh, 0) / total) * 100)}% of the bill.`,
        `Enervtek has found **${pkr(OPEN_RS_MONTH)} a month** of waste that can be removed, most of it at no cost.`,
      ],
      attach: <Table head={['Area', 'Per month', 'Share']} right={[1, 2]} rows={AREA_DAY_KWH.map((a) => [a.label, pkr(a.kwh * 30 * BLENDED_RS), `${fmt((a.kwh / total) * 100)}%`])} />,
      links: [{ to: '/advisor', label: 'Recommendations' }],
      sources: 'Incomer meters, solar inverter loggers, daily production entry',
      followUps: ['If we fix everything, how much do we save in a year?', 'How can we reduce the maximum demand (MDI) charge?'],
    }
  },

  roi() {
    const COST: Record<string, number> = { 'restart-peak': 0, 'compressor-night': 0, 'ring-34': 30_000, 'ac-persistence': 0 }
    const open = INSIGHTS.filter((i) => i.kind === 'waste')
    return {
      reading: ['Reading open findings with a rupee value', 'Adding cost to fix from the measure library', 'Working out payback'],
      paras: [
        `Fixing the ${open.length} open waste findings saves about **${pkr(OPEN_RS_MONTH)} a month**, or **${pkr(OPEN_RS_MONTH * 12)} a year**. Together they cost about Rs 30,000 to fix, so the payback is **days, not months**.`,
        `On top of that, the fixes already done are saving **${pkr(SAVING_NOW_RS)} a month**, measured.`,
        'The LT#2 capacitor bank and the blow room motor are extra: they protect equipment and production rather than reduce the bill.',
      ],
      attach: (
        <Table
          head={['Fix', 'Cost', 'Saves / year']}
          right={[1, 2]}
          rows={[...open.map((i) => [i.nextStep.split('.')[0], COST[i.id] ? pkr(COST[i.id]) : 'Nothing', pkr(i.rsMonth * 12)]), ['Total', 'Rs 30,000', pkr(OPEN_RS_MONTH * 12)]]}
        />
      ),
      links: [
        { to: '/advisor', label: 'Recommendations' },
      ],
      sources: 'Findings, textile measure library, savings ledger',
      followUps: ['What should my team check today?'],
    }
  },

  health() {
    const c = healthCounts()
    const bad = HEALTH_LIST.filter((h) => h.level !== 'ok').sort((a, b) => a.score - b.score)
    return {
      reading: [`Running 8 checks on ${MACHINES.length} machines`, 'Comparing with each machine’s own history', 'Ranking by health score'],
      paras: [
        `**${c.ok} of ${MACHINES.length} machines are healthy.** ${c.watch} need watching and **${c.act} need a check this week**.`,
        'The most urgent is the **blow room condenser motor**: the current on its three phases has gone from 3% to 9% uneven in three weeks, which usually comes before a motor burns out.',
      ],
      attach: <Table head={['Machine', 'Score', 'Why']} right={[1]} rows={bad.map((h) => [machineById[h.id].name, `${h.score}/100`, h.headline ?? ''])} />,
      links: [{ to: '/health', label: 'Machine health' }],
      sources: 'Machine and feeder meters, 8 electrical checks every 5 s',
      followUps: ['Tell me about Ring Frame 34', 'What should my team check today?'],
    }
  },

  solar() {
    const d = last30()
    const solar = d.reduce((s, x) => s + x.solarKwh, 0)
    const PVSYST_YEAR = 7_047_334
    const y = solar / (TOTAL_SOLAR_KWP - 0.06 * 1490)
    const rows = SOLAR_ARRAYS.map((a) => {
      const spec = a.id === 'PV-2068' ? y * 0.94 : y
      return [`${a.name} (${busLabel(a.bus)})`, `${fmt(a.kwp)} kWp`, fmt(spec), a.id === 'PV-2068' ? '−6% vs others' : 'Normal']
    })
    const pace = (solar / 30) * 365
    return {
      reading: ['Reading 3 inverter loggers', 'Comparing with your PVsyst report (7,047 MWh/year)', 'Comparing the 3 arrays per kWp'],
      paras: [
        `Last 30 days the solar plant made **${fmt(solar / 1000)} MWh**. At that pace it would make ${fmt(pace / 1000)} MWh a year, **${fmt((pace / PVSYST_YEAR) * 100)}%** of what PVsyst promised. November has shorter days, so this is in line.`,
        '**One thing to check:** Solar Panel 2068 on LT#3&4 is making **6% less per kWp** than the other two arrays. That usually means dirty panels, a tripped string or an inverter issue on Inverter 8.',
      ],
      attach: <Table head={['Array', 'Size', 'kWh per kWp (30 days)', 'Status']} right={[1, 2]} rows={rows} />,
      sources: 'Inverter data loggers, PVsyst simulation report from Din',
      followUps: ['How much are we spending on electricity this month?'],
    }
  },

  iso() {
    const din = READINESS.filter((r) => r.status !== 'ready')
    return {
      reading: ['Checking the audit-ready pack', 'Counting records produced from your meters'],
      paras: [
        `**${READY_COUNT.ready} of ${READY_COUNT.total}** ISO 50001 items are already produced by Enervtek from your meters: the energy review, baseline and efficiency indicator, metering plan, ${OP_RULES.length} operating rules checked every day, the deviation log, and targets with every fix checked by measurement.`,
        `What is left is the **people side**: ${din.map((r) => r.item.toLowerCase()).join(', ')}. Mostly a signed one-page policy, a named energy in-charge and a yearly internal audit.`,
        'Enervtek does not make the mill certified by itself. It keeps every record an auditor asks for, ready to export.',
      ],
      attach: <Table head={['Item', 'Status']} rows={READINESS.map((r) => [r.item, r.status === 'ready' ? 'Produced by Enervtek' : r.status === 'partly' ? 'Needs one step from the mill' : "Mill's team"])} />,
      sources: 'Audit-ready pack',
    }
  },

  now() {
    const s = snapshot(Date.now())
    const counts = { running: 0, attention: 0, stopped: 0, idle: 0 }
    for (const m of MACHINES) counts[s.machines[m.id].status]++
    return {
      reading: ['Reading live values from all meters'],
      paras: [
        `Right now the mill is using **${fmt(s.mix.load / 1000, 2)} MW**. Grid ${fmt((s.mix.grid / s.mix.load) * 100)}%, solar ${fmt((s.mix.solar / s.mix.load) * 100)}%.`,
        `**${counts.running + counts.attention} machines are running**, ${counts.stopped} stopped and ${counts.attention} need a look.`,
      ],
      links: [
        { to: '/map', label: 'Mill map' },
        { to: '/downtime', label: 'Downtime now' },
      ],
      sources: 'Live meters, refreshed every 2 seconds',
      followUps: ['What should my team check today?'],
    }
  },
}

/** What the downtime record says about one machine */
function downtimeLines(id: string): string[] {
  const mine = stopsNow().filter((x) => x.machine.id === id)
  const live = mine.find((x) => x.ongoing)
  const hrs = mine.reduce((a, x) => a + x.minutes, 0) / 60
  return [
    ...(live
      ? [`**It is stopped right now:** ${reasonText(live).toLowerCase()}, down for ${dur(live.minutes)}${live.expectedMin != null ? ` against a normal time of ${dur(live.expectedMin)}` : ''}.${live.part ? ` Part: ${live.part}.` : ''}`]
      : []),
    mine.length ? `This month it stopped **${mine.length} times**, ${fmt(hrs, 1)} hours in total.` : 'It has not stopped this month, apart from cleaning and doffing.',
  ]
}

/** Answer about any single machine */
function machineAnswer(id: string): Answer {
  const m = machineById[id]
  const s = snapshot(Date.now())
  const l = s.machines[id]
  const h = HEALTH[id]
  const f = feederById[m.feederId]
  const ins = insightForMachine(id)
  const mid = pkMidnight(Date.now())
  const hour = s.hour
  let kwh = 0
  for (let x = 0; x < hour; x += 0.25) kwh += machineAt(m, x, mid + x * 3600_000).kw * 0.25
  const ratio = l.normalKw ? l.kw / l.normalKw : 1
  return {
    reading: [`Reading ${m.metering === 'feeder' ? `feeder meter on "${f.sldName}"` : `${m.name} meter`}`, 'Comparing with its normal', 'Checking its health record'],
    paras: [
      `**${m.name}** (${hallById[m.hallId].name}, feeder "${f.sldName}" on ${busLabel(f.bus)}) is **${l.status === 'attention' ? 'running but needs a look' : l.status}**, using **${fmt(l.kw, 1)} kW** against a normal of ${fmt(l.normalKw, 1)} kW (${ratio >= 1 ? '+' : ''}${fmt((ratio - 1) * 100)}%).`,
      `Today it has used ${fmt(kwh)} units. Health score **${h.score}/100**${h.headline ? `: ${h.headline.toLowerCase()}` : ', no signs of stress'}.`,
      ...downtimeLines(id),
      ...(ins ? [`Enervtek has a finding on it: **${ins.title}**. ${ins.nextStep}`] : []),
    ],
    attach: ins ? <Chart id={ins.id} title={TRACK[ins.id].evidence} /> : undefined,
    links: [
      { to: `/map?m=${id}`, label: 'See on the map' },
      { to: `/downtime#${id}`, label: 'Downtime' },
      { to: `/health?m=${id}`, label: 'Health checks' },
      ...(ins ? [{ to: `/advisor#${ins.id}`, label: 'Recommendation' }] : []),
    ],
    sources: m.metering === 'feeder' ? 'Share of feeder meter (no machine meter yet)' : m.metering === 'pq' ? 'Power-quality meter on the drive' : 'Machine meter',
    followUps: ['How healthy are my machines?'],
  }
}

/* ------------------------------ matching ------------------------------ */
const PREFIX: [RegExp, string][] = [
  [/ring(?:\s*frame)?/, 'RF'],
  [/card/, 'CD'],
  [/auto\s*con(?:e|er)/, 'AW'],
  [/simplex/, 'SX'],
  [/draw(?:\s*frame)?/, 'DF'],
  [/comber/, 'CB'],
  [/open\s*end|\boe\b/, 'OE'],
]

export function findMachine(q: string): string | null {
  for (const [re, pre] of PREFIX) {
    const m = q.match(new RegExp(`(?:${re.source})\\s*(?:no\\.?|#)?\\s*(\\d{1,2})`))
    if (m) {
      const id = `${pre}-${m[1].padStart(2, '0')}`
      if (machineById[id]) return id
    }
  }
  const byName = MACHINES.find((m) => q.includes(m.name.toLowerCase()))
  return byName?.id ?? null
}

const RULES: [RegExp, keyof typeof A][] = [
  [/\biso\b|50001|energy management|audit|certif/, 'iso'],
  [/stopped (right )?now|stopped at the moment|abhi band|band (hain|hai)|kaun.*band|which machines.*(stop|down)/, 'downNow'],
  [/no reason|without (a )?reason|reason (not|missing)|wajah nahi/, 'missing'],
  [/longer than|take longer|too long|overrun|standard time|zyada (der|waqt)/, 'overrun'],
  [/stop the most|most stops|stop most|zyada band/, 'topMachines'],
  [/cut downtime|reduce downtime|less downtime|downtime kam|kam band/, 'cutDowntime'],
  [/production|lost|nuqsan|yarn|kitna maal/, 'prodLost'],
  [/downtime|down ?time|stoppage|kitni der band/, 'downMonth'],
  [/break ?down|likely to (fail|break)|kharab/, 'breakRisk'],
  [/check|today|aaj|kya karna|team|kaam|to.?do|fix first/, 'today'],
  [/harmonic|thd|capacitor|pf\.?2|distortion|resonan/, 'harmonics'],
  [/healthy|health|break ?down|wear|degrad/, 'health'],
  [/ring frames?.*(wast|most|more)|wast.*ring|which ring/, 'rings'],
  [/right now|doing|status|abhi/, 'now'],
]

export function answer(raw: string): Answer {
  const q = raw.toLowerCase()
  const mid = findMachine(q)
  if (mid && /stop|trip|why|band|kyun/.test(q) && insightForMachine(mid)?.id === 'card-trips') return A.cardTrips()
  if (mid && /stop|why|band|kyun|down/.test(q)) return machineAnswer(mid)
  if (/card.*(stop|trip)|(stop|trip).*card|dip/.test(q) && !mid) return A.cardTrips()
  if (/which ring|ring frames/.test(q)) return A.rings()
  if (mid) return machineAnswer(mid)
  for (const [re, key] of RULES) if (re.test(q)) return A[key]()
  return {
    reading: ['Looking for a match'],
    paras: [
      'I am not sure I understood that one. In this demo I can answer questions about machines stopped now, downtime this month, production lost, jobs that take too long, any machine (for example “Card 21” or “Ring Frame 12”), machine health and what to fix first.',
    ],
    sources: '',
    followUps: ['Which machines are stopped right now?', 'How much production did we lose this month?', 'What should my team fix first?'],
  }
}

/** Opening question for a link from another page */
export function questionFor(params: URLSearchParams): string | null {
  const m = params.get('m')
  if (m && machineById[m]) return `Tell me about ${machineById[m].name}`
  const about = params.get('about')
  const map: Record<string, string> = {
    'card-trips': 'Why did Card 06 stop?',
    'ring-34': 'Which ring frames are wasting the most energy?',
    'lt2-harmonics': 'What is causing the harmonics on LT#2?',
    condenser: 'Tell me about Condenser — Line 1',
    'bearing-overrun': 'Which jobs take longer than they should?',
    'no-reason': 'Which stops have no reason entered?',
  }
  return about ? map[about] ?? null : null
}

export { LEDGER }
