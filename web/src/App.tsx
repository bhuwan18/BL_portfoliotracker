import { useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { TabBar } from './components/TabBar'
import { useBootstrap } from './hooks/usePortfolio'
import { getSetting } from './db'
import { applyTheme, type ThemeMode } from './lib/theme'
import { PortfolioScreen } from './screens/Portfolio'
import { HoldingsScreen } from './screens/Holdings'
import { AddTransactionScreen } from './screens/AddTransaction'
import { InstrumentDetailScreen } from './screens/InstrumentDetail'
import { WatchlistScreen } from './screens/Watchlist'
import { SettingsScreen } from './screens/Settings'
import { LockScreen } from './screens/Lock'

function useThemeSetting() {
  const mode = useLiveQuery(() => getSetting<ThemeMode>('theme', 'system'))
  useEffect(() => {
    applyTheme(mode ?? 'system')
  }, [mode])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if ((mode ?? 'system') === 'system') applyTheme('system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])
}

// Pushed (non-tab) screens hide the bottom tab bar and rely on the AppBar back button.
function isPushedScreen(pathname: string): boolean {
  return pathname === '/add' || pathname.startsWith('/instrument/')
}

export default function App() {
  useBootstrap()
  useThemeSetting()
  const location = useLocation()
  const pinHash = useLiveQuery(() => getSetting<string | null>('pinHash', null))
  const [unlocked, setUnlocked] = useState(false)

  // Wait until we know whether a PIN is set, to avoid flashing the app behind the lock.
  if (pinHash === undefined) {
    return (
      <div className="center" style={{ minHeight: '100vh' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (pinHash && !unlocked) {
    return <LockScreen pinHash={pinHash} onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="app">
      <main className="app-main">
        <Routes location={location}>
          <Route path="/" element={<PortfolioScreen />} />
          <Route path="/holdings" element={<HoldingsScreen />} />
          <Route path="/add" element={<AddTransactionScreen />} />
          <Route path="/instrument/:id" element={<InstrumentDetailScreen />} />
          <Route path="/watchlist" element={<WatchlistScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<PortfolioScreen />} />
        </Routes>
      </main>
      {!isPushedScreen(location.pathname) && <TabBar />}
    </div>
  )
}
