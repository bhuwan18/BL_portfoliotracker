# Product

## Register

product

## Users

Indian retail investors managing their own money. They hold a mix of **NSE/BSE stocks** and
**mutual funds (including SIPs)** and want one honest view of where they stand. They are
comfortable with numbers — invested vs. current value, day's change, realized P&L, XIRR —
and check in from their phone, often in short glances: at market close, before a buy/sell,
or when reconciling a SIP installment.

The job to be done: **"Show me the truth about my portfolio, fast, without selling me
anything."** There is no advisor and no login — the user is the sole owner of the data,
which lives on-device. The primary task on most screens is *reading accurate figures*;
the secondary task is *recording reality* (logging a transaction, adding a SIP, importing
via share key).

## Product Purpose

**My Funds** is a no-login, on-device portfolio tracker for Indian stocks and mutual funds.
It exists because retail investors want a single, trustworthy P&L view across instruments
without handing their holdings to a broker, an ad network, or a robo-advisor. All data
stays in the browser (IndexedDB); the server is a stateless market-data proxy (daily close
prices). The one exception is the opt-in "share via key" flow.

Success looks like: a user opens the app, reads their current value, day's change, and XIRR
in under two seconds with zero ambiguity about what each number means — and trusts that the
app isn't nudging them toward any trade.

## Brand Personality

**Sharp, precise, honest.** This is an instrument panel, not a hype feed. The voice is
plain and exact: it names the number and the asof date, and stops. No exclamation, no
encouragement to trade, no celebration of gains or commiseration over losses — green and
red are *data*, not mood.

Density is a feature. Power users want more real signal per screen (figures, returns,
allocation, per-lot performance) than a typical consumer app shows — but density earns its
place only when every element is legible at a glance. Tabular numerals, tight but breathing
rhythm, and a restrained palette (one green accent; gain/green and loss/red as the only
chromatic signals) carry the load.

Three words: **sharp, trustworthy, unhurried.**

## Anti-references

- **Hype crypto app.** No neon gradients, confetti, "to the moon" energy, gamified
  speculation, streaks, or any framing that rewards trading activity. Gains and losses are
  reported, never celebrated.
- **Cluttered legacy broker.** No dense grey grids, hairline-tiny text, cramped tap
  targets, or dated enterprise-broker chrome. Density must stay *legible* — the hard line
  this product walks is dense **without** cluttered.
- **Generic AI SaaS.** No cream/sand body background, no tracked-uppercase eyebrow above
  every section, no identical icon-card grids, no gradient text. (The existing section
  labels are functional list headers, not decorative kickers — keep them that way.)
- **Pushy / salesy.** No ads, no upsells, no "recommended buys," no portfolio scores that
  imply advice. The product reports; it does not recommend. Nothing here is investment
  advice and the UI must never imply otherwise.

## Design Principles

1. **Dense, not cluttered.** Show more real signal per screen than a consumer app would,
   but every figure must be legible at a glance. The tension between "data-dense" and "not
   a legacy broker" is resolved by hierarchy, tabular numerals, and rhythm — never by
   shrinking text or crowding tap targets below 44px.
2. **The number is the product.** Figures are the primary content; chrome serves them.
   Tabular alignment, an unambiguous asof date, and consistent gain/loss coloring matter
   more than decoration. When in doubt, make the number clearer.
3. **Report, don't advise.** State what is true (as of last close) and stop. No nudges, no
   celebration, no recommendations. Green and red are data channels, not emotions.
4. **The device owns the data.** On-device, no-login, offline-capable is the architecture
   *and* the trust promise. Surface it honestly: show cached/asof state plainly, and make
   the one data-leaving path (share via key) explicit about what it does.
5. **Fast glances first.** Optimize for the two-second check-in: current value, day's
   change, XIRR readable immediately. Deeper tasks (logging, SIPs, detail charts) are one
   deliberate step away, never in the way of the glance.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**, extending what the codebase already does:

- Body text ≥4.5:1, large/bold text ≥3:1 against its surface (both themes). Gain/loss text
  tokens stay bright on dark surfaces; solid gain/loss badges use white-on-fill that clears
  AA independent of theme.
- Visible keyboard focus rings on all interactive elements (already global via
  `:focus-visible` plus per-component rings on rows/toggles/handles).
- `prefers-reduced-motion` honored: decorative entrance/press motion neutralized while
  functional loading indicators keep animating.
- Color is never the *only* signal — gain/loss is reinforced by sign (`+`/`−`) and position,
  so red/green color-blindness doesn't hide meaning.
- Tap targets ≥44px; inputs at 16px to prevent iOS zoom-on-focus.
- Light, dark, and system themes, synced to OS preference.
