import clsx from 'clsx'
import { ChevronsLeft, ChevronsRight, Presentation, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../../store/app'
import { NAV, type NavItem } from './nav'
import { EnervtekMark } from './Logo'

function Item({ item, mini }: { item: NavItem; mini: boolean }) {
  return (
    <NavLink
      to={item.to}
      end
      title={item.label}
      className={({ isActive }) =>
        clsx(
          'focus-ring relative flex items-center gap-2.5 h-10 lg:h-9 rounded-lg px-3 text-[14px] lg:text-[13.5px] font-medium transition-colors',
          mini && 'lg:justify-center lg:px-0',
          isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:text-fg hover:bg-sunken',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r bg-brand" />}
          <item.icon size={mini ? 18 : 16} strokeWidth={2} className="shrink-0" />
          <span className={clsx('truncate', mini && 'lg:hidden')}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Fixed rail on desktop (full or icons only); slide-in drawer below lg */
export function Sidebar({ open, onClose, collapsed, onToggle }: { open: boolean; onClose: () => void; collapsed: boolean; onToggle: () => void }) {
  const mini = collapsed
  const togglePresenter = useApp((s) => s.togglePresenter)
  return (
    <>
      <div
        className={clsx('fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] transition-opacity lg:hidden', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={clsx(
          'theme-dark fixed inset-y-0 left-0 z-50 w-[260px] lg:static lg:z-auto h-full shrink-0 flex flex-col border-r border-line transition-[transform,width] duration-300 lg:translate-x-0',
          mini ? 'lg:w-[72px]' : 'lg:w-[232px]',
          open ? 'translate-x-0 shadow-pop' : '-translate-x-full',
        )}
      >
        <div className={clsx('h-16 flex items-center gap-2.5 px-5 shrink-0 border-b border-line', mini && 'lg:justify-center lg:px-0')}>
          <EnervtekMark size={28} />
          <div className={clsx('font-display font-bold text-[16px] tracking-tight flex-1', mini && 'lg:hidden')}>Enervtek</div>
          <button onClick={onClose} className="focus-ring lg:hidden w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pt-5 space-y-6">
          {NAV.map((g, i) => (
            <div key={g.title}>
              <div className={clsx('px-3 mb-2 text-[10.5px] uppercase tracking-[0.12em] font-semibold text-faint truncate', mini && 'lg:hidden')}>{g.title}</div>
              {mini && i > 0 && <div className="hidden lg:block h-px bg-line mx-2 mb-3 -mt-3" />}
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <Item key={it.to} item={it} mini={mini} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={clsx('px-3 py-3 border-t border-line text-[11px] text-faint flex items-center justify-between gap-2', mini && 'lg:flex-col lg:px-0')}>
          {/* Opens the presenter panel (dip, sounds, reset, themes): the way in on phones, where there is no Shift + P */}
          <button
            onClick={() => {
              togglePresenter()
              onClose()
            }}
            title="Presenter panel (Shift + P)"
            className={clsx('focus-ring inline-flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] font-semibold text-muted hover:text-fg hover:bg-sunken', mini && 'lg:px-0 lg:w-9 lg:justify-center')}
          >
            <Presentation size={16} className="shrink-0" />
            <span className={clsx(mini && 'lg:hidden')}>Presenter</span>
            <kbd className={clsx('hidden px-1.5 py-0.5 rounded border border-line text-[10px] font-normal text-faint', !mini && 'lg:inline')}>Shift P</kbd>
          </button>
          <button
            onClick={onToggle}
            className="focus-ring hidden lg:grid w-8 h-8 place-items-center rounded-lg text-muted hover:text-fg hover:bg-sunken"
            aria-label={mini ? 'Expand menu' : 'Collapse menu'}
            title={mini ? 'Expand menu' : 'Collapse menu'}
          >
            {mini ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
      </aside>
    </>
  )
}
