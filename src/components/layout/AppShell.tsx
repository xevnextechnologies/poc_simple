import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="h-full flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-auto">
          <div className="px-8 py-7 max-w-[1500px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
