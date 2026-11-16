import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ALL_NAV } from './components/layout/nav'
import { Overview } from './pages/Overview'
import { MillMapLive } from './pages/MillMapLive'
import { Recommendations } from './pages/Recommendations'
import { MachineHealth } from './pages/MachineHealth'
import { AskEnervtek } from './pages/AskEnervtek'
import { DowntimeNow } from './pages/DowntimeNow'
import { DowntimeMonth } from './pages/DowntimeMonth'
import { DemoLayer } from './components/demo/DemoLayer'

// Simple version of the POC: seven screens, opening on "Mill today".
const BUILT: Record<string, () => JSX.Element> = {
  '/today': Overview,
  '/map': MillMapLive,
  '/downtime': DowntimeNow,
  '/downtime-month': DowntimeMonth,
  '/health': MachineHealth,
  '/advisor': Recommendations,
  '/ask': AskEnervtek,
}

export default function App() {
  return (
    <>
      <DemoLayer />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          {ALL_NAV.map((n) => {
            const Page = BUILT[n.to]
            return Page ? <Route key={n.to} path={`${n.to}/*`} element={<Page />} /> : null
          })}
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </>
  )
}
