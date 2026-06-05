export type ThemeMode = 'light' | 'dark' | 'system'

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'system') return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  return mode === 'dark'
}

export function applyTheme(mode: ThemeMode): void {
  const dark = resolveDark(mode)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#0b1120' : '#0b7a4b')
}
