/**
 * iOS Dynamic Type bridge.
 *
 * styles.css anchors :root to `-apple-system-body` so the rem-based type scale
 * tracks Settings → Display & Brightness → Text Size. That CSS-only link is the
 * documented technique, but inside a standalone home-screen PWA some WebKit
 * builds don't propagate the dynamic size into the `rem` unit, so the whole
 * scale stays put. We make it robust by measuring the resolved
 * `-apple-system-body` pixel size and pinning it onto <html> as an explicit
 * font-size: `rem` is then relative to a concrete px value that equals the
 * user's Dynamic Type size — no reliance on the keyword flowing into `rem`.
 *
 * No-ops on non-WebKit (where the keyword is invalid): `CSS.supports` is false,
 * so we never touch <html> and the 16px CSS base stands (Android Chrome applies
 * its own page zoom for the system font-size setting).
 *
 * The measured inline size also overrides the `@supports` rule's font-size, so
 * the two never disagree; the CSS rule remains as the pre-JS fallback.
 */
export function syncDynamicType(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!window.CSS?.supports?.('font', '-apple-system-body')) return

  const apply = () => {
    const host = document.body ?? document.documentElement
    const probe = document.createElement('div')
    // Off-screen and inert: only its computed font-size is read. The `font`
    // shorthand resolves to the OS Dynamic Type "body" size regardless of
    // anything inherited.
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;font:-apple-system-body;'
    host.appendChild(probe)
    const px = parseFloat(getComputedStyle(probe).fontSize)
    probe.remove()
    if (px > 0) document.documentElement.style.fontSize = `${px}px`
  }

  apply()
  // A long-lived PWA doesn't reload when the user changes Text Size and returns,
  // so re-measure on foreground / bfcache restore — it catches up without a
  // full relaunch.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply()
  })
  window.addEventListener('pageshow', apply)
}
