import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Pages already moved to the theme system (redesign goes page by page) */
const DARK_PAGES = ['/today', '/map', '/downtime', '/downtime-month', '/health', '/advisor', '/ask']

/** Remembers the collapsed sidebar on this browser only; works without storage too */
const COLLAPSE_KEY = 'enervtek:sidebar-collapsed'
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const { pathname } = useLocation()
  const dark = DARK_PAGES.includes(pathname)
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  // Close the mobile menu after navigating
  useEffect(() => setNavOpen(false), [pathname])

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* storage blocked: still works for this visit */
      }
      return !c
    })

  return (
    <div className="h-full flex">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onMenu={() => setNavOpen(true)} />
        <main className={clsx('flex-1 min-h-0 overflow-auto', dark && 'theme-dark glow-bg')}>
          {/* Keyed by page so each page fades in when you arrive */}
          <div key={pathname} className="page-in px-4 py-5 md:px-8 md:py-7 max-w-[1500px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
