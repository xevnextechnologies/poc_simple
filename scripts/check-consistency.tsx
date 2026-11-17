// Consistency check: the same number must come out the same everywhere.
import { MACHINES, FEEDERS, TOTAL_SOLAR_KWP, SITE } from '../src/data/din'
import { snapshot, DAY_CURVE, todaySoFar, byArea } from '../src/sim/engine'
import { INSIGHTS, MDI } from '../src/sim/insights'
import { TRACK } from '../src/sim/tracking'
import { HEALTH_LIST, PERF_FLAGGED, healthCounts } from '../src/sim/health'
import { nonLinearRegister, BUS_PQ, thdv, tdd, resonanceOrder } from '../src/sim/pq'
import { AREA_DAY_KWH, DAY_KWH, last30, PRODUCTION_TODAY, KG_PER_DAY } from '../src/sim/costs'
import { answer, SUGGESTIONS } from '../src/sim/assistant'
import { DEMO, LIVE_STOPS } from '../src/sim/scenarios'
import { DT_MACHINES, POSSIBLE_KG_MONTH, kgPerHour, byGroup, byReason, bySection, isPlanned, monthStops, stoppedNow, totals } from '../src/sim/downtime'

let fails = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fails++
}
const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-6

// 1. Electrical sums
const t = Date.now()
const s = snapshot(t)
const machineSum = MACHINES.reduce((x, m) => x + s.machines[m.id].kw, 0)
ok(near(machineSum, s.mix.load), `Machines add up to mill load (${machineSum.toFixed(0)} = ${s.mix.load.toFixed(0)} kW)`)
ok(near(s.mix.grid + s.mix.solar, s.mix.load), 'Grid + solar = mill load')
ok(!('gas' in s.mix), 'No gas generator in the supply')
ok(Math.max(...DAY_CURVE.map((d) => d.grid)) < SITE.sanctionedKw, `Grid demand stays under the ${SITE.sanctionedKw} kW supply`)
ok(near(byArea(s.machines).reduce((x, a) => x + a.kw, 0), s.mix.load), 'Areas add up to mill load')
ok(near(AREA_DAY_KWH.reduce((x, a) => x + a.kwh, 0), DAY_KWH, 0.01), 'Area daily kWh add up to the daily total')
ok(DAY_CURVE.every((d) => d.grid >= -1), 'Grid never negative in the daily curve')
ok(Math.max(...DAY_CURVE.map((d) => d.solar)) < TOTAL_SOLAR_KWP, 'Solar never above installed kWp')
ok(near(todaySoFar(24).kg, SITE.kgPerDay, 0.001), `A normal day makes Din's real output (${Math.round(todaySoFar(24).kg)} kg = ${SITE.kgPerDay} kg)`)
ok(todaySoFar(24).ukg > 2.6 && todaySoFar(24).ukg < 3.6, `Mill units per kg is believable for a ring + OE mill (${todaySoFar(24).ukg.toFixed(2)})`)
ok(FEEDERS.length === 43, '43 feeders')
ok(nonLinearRegister().reduce((x, g) => x + g.count, 0) === MACHINES.length, `Harmonics register covers every machine (${nonLinearRegister().reduce((x, g) => x + g.count, 0)} of ${MACHINES.length})`)

// 2. Findings
ok(INSIGHTS.every((i) => TRACK[i.id]), 'Every finding has an owner, status and measure')
// Simple version: only downtime and machine problems, and no prices anywhere
ok(INSIGHTS.every((i) => i.kind === 'downtime' || i.kind === 'problem'), `Findings are downtime or machine problems only (${INSIGHTS.length})`)
ok(INSIGHTS.every((i) => i.rsMonth === 0), 'No finding carries a rupee amount')
const textOf = (o: unknown) => JSON.stringify(o, (_k, v) => (typeof v === 'function' ? undefined : v))
ok(!INSIGHTS.some((i) => /\bRs\b|rupee|lakh|crore/i.test(textOf(i))), 'No rupees in any finding text')
ok(!INSIGHTS.some((i) => /\bRs\b|rupee|lakh|crore/i.test(textOf(TRACK[i.id]))), 'No rupees in any fix plan')
ok(PERF_FLAGGED.some((r) => r.id === 'RF-34'), 'Ring Frame 34 still flagged as a machine problem')
ok(near(MDI.restartPeak, Math.max(...DAY_CURVE.map((d) => d.grid))), `Restart peak is the day's highest grid demand (${MDI.restartPeak.toFixed(0)} kW)`)

// 3. Live status vs health pages
const live = new Set(MACHINES.filter((m) => ['attention', 'stopped'].includes(s.machines[m.id].status)).map((m) => m.id))
const health = new Set(HEALTH_LIST.filter((h) => h.level !== 'ok').map((h) => h.id))
const hourNow = s.hour
const cleaningNow = hourNow >= 1 && hourNow < 4
if (!cleaningNow) {
  // Machines stopped for a repair are downtime, not health
  const repairs = new Set(LIVE_STOPS.map((x) => x.machineId))
  const missing = [...health].filter((id) => !live.has(id) && !['CD-05', 'CD-06', 'CD-07'].includes(id))
  const extra = [...live].filter((id) => !health.has(id) && !repairs.has(id))
  ok(missing.length === 0 && extra.length === 0, `Map "needs a look" matches Machine health (missing ${missing.join(',') || '-'}, extra ${extra.join(',') || '-'})`)
}

// 3b. Downtime: the map and the downtime pages agree
const stops = monthStops(t)
const mapStopped = new Set(MACHINES.filter((m) => s.machines[m.id].status === 'stopped').map((m) => m.id))
const dtStopped = new Set(stoppedNow(stops).map((x) => x.machine.id))
if (!cleaningNow) {
  const onlyMap = [...mapStopped].filter((id) => !dtStopped.has(id))
  const onlyDt = [...dtStopped].filter((id) => !mapStopped.has(id))
  ok(!onlyMap.length && !onlyDt.length, `Stopped on the map = stopped on Downtime now (${dtStopped.size}; map only ${onlyMap.join(',') || '-'}, downtime only ${onlyDt.join(',') || '-'})`)
}
const dt = totals(stops)
ok(near(byGroup(stops.filter((x) => !isPlanned(x))).reduce((a, g) => a + g.hours, 0) + stops.filter((x) => !x.reason).reduce((a, x) => a + x.minutes, 0) / 60, dt.hours, 0.001), `Downtime by reason adds up to the month (${dt.hours.toFixed(0)} h)`)
ok(near(bySection(stops.filter((x) => !isPlanned(x))).reduce((a, r) => a + r.kg, 0), dt.kg, 0.001), `Yarn lost by section adds up to the month (${dt.kg.toFixed(0)} kg)`)
ok(dt.kg / POSSIBLE_KG_MONTH < 0.05, `Yarn lost is a believable share of production (${((dt.kg / POSSIBLE_KG_MONTH) * 100).toFixed(1)}%)`)
const bearingFinding = INSIGHTS.find((i) => i.id === 'bearing-overrun')!
ok(bearingFinding.plain.includes(String(byReason(stops).find((r) => r.reason.id === 'bearing')!.count)), 'Bearing finding uses the same job count as Downtime this month')
ok(stops.filter((x) => x.reason?.id === 'power-dip').length === 14 * 3, 'Power dips stopped Cards 05–07 14 times in 30 days, as on Machine health')
ok(healthCounts().ok + healthCounts().watch + healthCounts().act === MACHINES.length, 'Health counts cover all machines')

// 4. Harmonics story
const b = BUS_PQ.LT2
ok(Math.abs(resonanceOrder('LT2', b.stepsIn) - 7) < 0.6, `LT#2 resonance near 7th (${resonanceOrder('LT2', b.stepsIn).toFixed(2)})`)
ok(thdv(b) < 8 && tdd(b) > 8, `LT#2 THDv under limit (${thdv(b).toFixed(1)}), TDD over (${tdd(b).toFixed(1)})`)

// 5. Production and cost
ok(near(PRODUCTION_TODAY.reduce((x, c) => x + c.kg, 0), KG_PER_DAY, 0.01), 'Production by count adds up to daily kg')
ok(near(PRODUCTION_TODAY.reduce((x, c) => x + c.kg * c.ukg, 0) / KG_PER_DAY, DAY_KWH / KG_PER_DAY, 0.01), 'Units per kg by count averages to the mill figure')
ok(near(DT_MACHINES.filter((m) => m.kind === 'ring-frame' || m.kind === 'open-end').reduce((x, m) => x + kgPerHour(m) * 21, 0), SITE.kgPerDay, 0.001), 'Ring + Open End frames make the daily output')
{
  const oe = DT_MACHINES.filter((m) => m.kind === 'open-end')
  const perRotor = kgPerHour(oe[0]) / (oe[0].rotors ?? 1)
  const rings = DT_MACHINES.filter((m) => m.kind === 'ring-frame')
  const perSpindleDay = (rings.reduce((x, m) => x + kgPerHour(m), 0) * 21) / rings.reduce((x, m) => x + (m.spindles ?? 0), 0)
  ok(perRotor > 0.35 && perRotor < 0.6, `Open End output per rotor is believable (${perRotor.toFixed(2)} kg/h)`)
  ok(perSpindleDay > 0.4 && perSpindleDay < 0.7, `Ring output per spindle is believable (${perSpindleDay.toFixed(2)} kg/day)`)
}
const d30 = last30()
ok(d30.length === 30, '30 days of history')

// 6. Chatbot uses the same numbers
for (const q of SUGGESTIONS.flatMap((g) => g.qs)) {
  const a = answer(q)
  const words = [...a.paras, a.sources, ...(a.reading ?? [])].join(' ')
  ok(!a.paras[0].startsWith('I am not sure') && !/\bRs\b|rupee|lakh|crore|\bDin\b|DIL/.test(words), `Chat answers, no prices or customer name: "${q}"`)
}
for (const q of ['Card 21 kyun band hai?', 'Tell me about Ring Frame 34', 'How is the mill doing right now?']) {
  const a = answer(q)
  ok(!/\bRs\b|rupee|lakh|crore|\bDin\b|DIL/.test([...a.paras, a.sources].join(' ')), `Typed question has no prices: "${q}"`)
}
ok(answer('roi').paras.length > 0, 'Chat fallback exists')

// 7. Presenter dip
const before = snapshot(Date.now()).machines['CD-06'].status
DEMO.dipAt = Date.now()
const after = snapshot(Date.now() + 1000).machines['CD-06'].status
const later = snapshot(Date.now() + 27 * 60_000).machines['CD-06'].status
ok(after === 'stopped' && later !== 'stopped', `Trigger dip: Card 06 ${before} → ${after} → back after reload (${later})`)
ok(INSIGHTS.find((i) => i.id === 'card-trips')!.title.includes(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(DEMO.dipAt)), 'Finding title follows the new dip time')

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
