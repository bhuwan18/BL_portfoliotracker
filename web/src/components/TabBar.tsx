import { NavLink } from 'react-router-dom'
import { LayoutGrid, ListOrdered, Plus, Settings, Star, type LucideIcon } from 'lucide-react'

function Tab({ to, end, icon: Icon, label }: { to: string; end?: boolean; icon: LucideIcon; label: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
      <Icon size={21} />
      <span>{label}</span>
    </NavLink>
  )
}

export function TabBar() {
  return (
    <nav className="tabbar">
      <Tab to="/" end icon={LayoutGrid} label="Portfolio" />
      <Tab to="/holdings" icon={ListOrdered} label="Holdings" />
      <div className="fab-wrap">
        <NavLink to="/add" className="fab" aria-label="Add transaction">
          <Plus size={26} />
        </NavLink>
      </div>
      <Tab to="/watchlist" icon={Star} label="Watchlist" />
      <Tab to="/settings" icon={Settings} label="Settings" />
    </nav>
  )
}
