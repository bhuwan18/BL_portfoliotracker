import { Suspense, lazy, useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useBootstrap } from './hooks/usePortfolio'
import { getSetting } from './db'
import { applyTheme, type ThemeMode } from './lib/theme'
// Portfolio (the landing route) and Lock (the PIN gate) stay eager — they're on the
// first-paint path, so code-splitting them would only add a spinner flash on launch.
import { PortfolioScreen } from './screens/Portfolio'
import { LockScreen } from './screens/Lock'

// Pushed screens are only reached by an explicit tap, never first paint, so they're
// lazy-loaded. InstrumentDetail pulls in recharts, which Rollup then emits as its own chunk
// loaded only when the chart route mounts — keeping it out of the initial bundle.
// (Screens use named exports, hence the `.then` shim to satisfy React.lazy's default export.)
const AddTransactionScreen = lazy(() =>
  import('./screens/AddTransaction').then((m) => ({ default: m.AddTransactionScreen })),
)
const InstrumentDetailScreen = lazy(() =>
  import('./screens/InstrumentDetail').then((m) => ({ default: m.InstrumentDetailScreen })),
)
const SettingsScreen = lazy(() =>
  import('./screens/Settings').then((m) => ({ default: m.SettingsScreen })),
)

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

export default function App() {
  useBootstrap()
  useThemeSetting()
  const location = useLocation()
  const pinHash = useLiveQuery(() => getSetting<string | null>('pinHash', null))
  const biometricCredId = useLiveQuery(() => getSetting<string | null>('biometricCredId', null))
  const [unlocked, setUnlocked] = useState(false)

  // Wait until we know whether a PIN is set, to avoid flashing the app behind the lock.
  if (pinHash === undefined || biometricCredId === undefined) {
    return (
      <div className="center" style={{ minHeight: '100dvh' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (pinHash && !unlocked) {
    return (
      <LockScreen
        pinHash={pinHash}
        biometricCredId={biometricCredId ?? null}
        onUnlock={() => setUnlocked(true)}
      />
    )
  }

  return (
    <div className="app">
      <main className="app-main">
        <Suspense
          fallback={
            <div className="center" style={{ minHeight: '60dvh' }}>
              <span className="spinner" />
            </div>
          }
        >
          <Routes location={location}>
            <Route path="/" element={<PortfolioScreen />} />
            <Route path="/add" element={<AddTransactionScreen />} />
            <Route path="/instrument/:id" element={<InstrumentDetailScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<PortfolioScreen />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
