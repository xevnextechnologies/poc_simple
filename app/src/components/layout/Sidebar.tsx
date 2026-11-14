import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import { NAV, type NavItem } from './nav'
import { EnervtekMark } from './Logo'

function Item({ item, small }: { item: NavItem; small?: boolean }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        clsx(
          'focus-ring flex items-center gap-2.5 rounded-lg px-3 transition-colors',
          small ? 'h-8 text-[13px]' : 'h-9 text-[14px] font-medium',
          isActive ? 'bg-white text-brand-dark' : 'text-white/75 hover:text-white hover:bg-white/10',
        )
      }
    >
      <item.icon size={small ? 15 : 17} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="h-full w-[248px] shrink-0 flex flex-col bg-brand-dark text-white">
      <div className="h-16 flex items-center gap-2.5 px-5 shrink-0">
        <EnervtekMark />
        <div className="leading-tight">
          <div className="font-display font-bold text-[18px] tracking-tight">Enervtek</div>
          <div className="text-[10.5px] text-white/55 uppercase tracking-[0.12em] font-bold">Energy & operations</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-3 space-y-5">
        {NAV.map((g) => (
          <div key={g.title}>
            {g.layer ? (
              <div className="flex items-center gap-2 px-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-soft text-brand-dark grid place-items-center text-[11px] font-bold font-display">
                  {g.layer}
                </span>
                <div className="leading-tight">
                  <div className="text-[11px] uppercase tracking-[0.1em] font-bold text-white/90">{g.title}</div>
                  <div className="text-[11px] text-white/50">{g.promise}</div>
                </div>
              </div>
            ) : null}
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <Item key={i.to} item={i} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="px-3 pt-3 pb-1 text-[11px] text-white/45 leading-relaxed">
          Demo data
          <br />
          Presenter: Shift + P
        </div>
      </div>
    </aside>
  )
}
