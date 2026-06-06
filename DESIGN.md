---
name: My Funds — Portfolio Tracker
description: A sharp, data-dense, no-login PWA for tracking Indian stocks and mutual funds, on-device.
colors:
  accent-light: "#0b7a4b"
  accent-dark: "#16c784"
  accent-ink-light: "#ffffff"
  accent-ink-dark: "#04130c"
  gain-light: "#0b7a4b"
  gain-dark: "#16c784"
  loss-light: "#d11f1f"
  loss-dark: "#f0616d"
  badge-gain: "#0b7a4b"
  badge-loss: "#d12626"
  badge-zero: "#5a6b85"
  stock-hue: "#2f80ed"
  mf-hue: "#8b5cf6"
  bg-light: "#eef1f7"
  bg-dark: "#0b1120"
  surface-light: "#ffffff"
  surface-dark: "#131c2f"
  surface-2-light: "#f3f6fb"
  surface-2-dark: "#1a2438"
  ink-light: "#0f1b2d"
  ink-dark: "#f1f5f9"
  ink-dim-light: "#5a6b85"
  ink-dim-dark: "#9aa7bd"
  border-light: "#e3e9f2"
  border-dark: "#26324c"
  hero-grad-from-light: "#0e8a55"
  hero-grad-to-light: "#0b7a4b"
  hero-grad-from-dark: "#112038"
  hero-grad-to-dark: "#0b1120"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14.5px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  sm: "12px"
  control: "14px"
  md: "18px"
  lg: "24px"
  pill: "999px"
spacing:
  gap: "14px"
  pad: "16px"
  section: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.accent-ink-light}"
    rounded: "{rounded.control}"
    height: "50px"
    padding: "0 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.control}"
    height: "50px"
  button-danger:
    backgroundColor: "rgba(209,31,31,0.1)"
    textColor: "{colors.loss-light}"
    rounded: "{rounded.control}"
    height: "50px"
  card:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface-2-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.control}"
    height: "50px"
    padding: "0 14px"
  gain-badge:
    backgroundColor: "{colors.badge-gain}"
    textColor: "#ffffff"
    rounded: "7px"
    padding: "2px 9px"
---

# Design System: My Funds — Portfolio Tracker

## 1. Overview

**Creative North Star: "The Honest Ledger"**

My Funds is an instrument, not a feed. It reports the truth about a person's holdings — as
of last close, dated and exact — and then gets out of the way. The whole system behaves
like a well-kept ledger: tabular, precise, unhurried, and incapable of spin. Numbers are
the content; everything else is scaffolding that earns its place by making a figure clearer.

The aesthetic is **sharp and data-dense, held back from clutter by hierarchy rather than
shrinkage**. A retail investor checking their phone at market close should read current
value, day's change, and XIRR in a two-second glance, then drill into per-lot performance
without the layout ever feeling cramped or noisy. Density is achieved through tabular
numerals, tight-but-breathing vertical rhythm, and a palette that spends color only where
it carries meaning. The single chromatic decision the eye has to make is *up or down* —
green for gain, red for loss — and that signal is never spent on decoration.

This system explicitly rejects four neighbors. It is **not a hype crypto app** (no neon
gradients, confetti, streaks, or "to the moon" celebration of gains). It is **not a
cluttered legacy broker** (no grey data-grids, hairline text, or sub-44px tap targets). It
is **not generic AI SaaS** (no cream/sand background, no tracked-uppercase eyebrow above
every section, no identical icon-card grids, no gradient text). And it is **never pushy**
(no ads, upsells, recommended buys, or scores that imply advice — it reports, it does not
recommend).

**Key Characteristics:**
- Mobile-first, single-column, capped at a 480px reading width — built for the glance.
- Tabular numerals everywhere figures appear; alignment is non-negotiable.
- One green accent + a gain/loss red; color is a data channel, not mood.
- Flat bordered surfaces at rest; shadow reserved for things that float.
- Dual light/dark themes, synced to OS preference, both holding WCAG AA.

## 2. Colors

A near-monochrome, low-chroma field of cool neutrals carries the content, while a single
emerald accent and a gain/loss pair carry every chromatic decision. Each theme is a full
ramp tuned independently so contrast holds in both.

### Primary
- **Bourse Green** (light `#0b7a4b`, dark `#16c784`): the brand accent and the gain color.
  Used on the primary button, active controls, links, the lock-screen mark, range pills,
  and as the hero gradient base. In light mode it is a deep emerald (AA on white); in dark
  mode it brightens to a spring emerald that clears AA on the navy surfaces. Carries the
  "up" half of every gain/loss signal.

### Secondary
- **Loss Red** (light `#d11f1f`, dark `#f0616d`): the "down" half. Text-token brightness is
  tuned per theme so it stays legible on dark surfaces; never used decoratively.
- **Solid Badge Fills** (gain `#0b7a4b`, loss `#d12626`, zero `#5a6b85`): theme-independent
  fills for the white-on-color P&L chip. These are deliberately *not* the text tokens — a
  white-on-fill badge needs the opposite contrast math from bright-on-dark body text.

### Tertiary
- **Stock Blue** (`#2f80ed`) and **Fund Violet** (`#8b5cf6`): the instrument-type hues.
  Used only in two coordinated places — the hero allocation bar/legend and a faint tint on
  holding cards — so "blue = stock, purple = fund" reads consistently. Never as a general
  accent.

### Neutral
- **Ink** (light `#0f1b2d`, dark `#f1f5f9`): primary text.
- **Ink Dim** (light `#5a6b85`, dark `#9aa7bd`): secondary text, labels, captions. Tuned to
  clear 4.5:1 on its surface — never lighter "for elegance."
- **Page** (light `#eef1f7`, dark `#0b1120`): the body background. The dark page is a true
  deep navy; the light page is a cool off-white, not a warm cream.
- **Surface ramp** (light `#ffffff` / `#f3f6fb` / `#e9eef6`, dark `#131c2f` / `#1a2438` /
  `#212d45`): three stepped layers for cards, inset inputs, and pressed/raised states.
- **Border** (light `#e3e9f2`, dark `#26324c`) and **Border Soft** (light `#eef2f8`, dark
  `#1d2840`): the 1px hairline that defines flat surfaces in lieu of shadow.

### Named Rules
**The One Signal Rule.** Color answers exactly one question on a data screen: did this go
up or down. Green and red are reserved for that. Anything tinted for any other reason
(a type hue, an accent-soft fill) must stay low-chroma and out of the gain/loss register so
the up/down signal is never ambiguous.

**The No-Cream Rule.** The light background is a cool blue-grey off-white (`#eef1f7`),
never a warm cream/sand/parchment. Warmth is not this brand; a cream bg is the AI default
and is forbidden here.

## 3. Typography

**System Font:** the native UI stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI',
Roboto, 'Helvetica Neue', Arial, sans-serif`).

**Character:** there is one family, by design. A portfolio tracker borrows the platform's
own voice so figures feel native and trustworthy, and renders instantly with no web-font
flash. Hierarchy comes entirely from **weight contrast (400 → 800) and scale**, plus
`font-variant-numeric: tabular-nums` on every figure so columns of numbers align to the
digit. No display face, no second family — restraint is the point.

### Hierarchy
- **Display** (800, 30–34px, line-height 1.05, `-0.02em`): the hero portfolio value and the
  instrument detail price. The single largest figure on a screen.
- **Headline** (800, 20px, `-0.01em`): the AppBar title.
- **Title** (700, 14.5px, line-height 1.3): holding/row names and figures. The workhorse.
- **Body** (400, 14px, line-height 1.5): descriptions, help text, key/value rows.
- **Label** (700, 13px, `0.04em`, UPPERCASE): functional section headers ("HOLDINGS"). These
  are list headers, not decorative eyebrows — they name a real list directly below.

### Named Rules
**The Tabular Rule.** Every number — prices, units, percentages, currency — uses tabular
numerals. Figures that change (live prices, day-change) must not reflow horizontally as
digits update. Non-negotiable.

**The Two-Line Cap Rule.** Long fund names clamp to two lines (`-webkit-line-clamp: 2`) and
wrap; detail lines (units, as-on date) stay single-line and ellipsize. Names may grow down,
never sideways into the figures column.

## 4. Elevation

Flat by default. Surfaces sit on the page defined by a 1px hairline border (Border Soft),
not by shadow. Tonal layering (the three-step surface ramp) conveys nesting and pressed
states. **Shadow is reserved exclusively for elements that genuinely float above the page:**
the hero gradient card, bottom sheets, the toast, and a row while it is being dragged.

### Shadow Vocabulary
- **Float** (light `box-shadow: 0 8px 24px rgba(15,27,45,0.1)`, dark `0 10px 30px
  rgba(0,0,0,0.35)`): the only shadow token (`--shadow`). Used on the hero, sheets, toast,
  and the dragged sortable row. There is no "card shadow" — cards are flat.
- **Segment lift** (`0 1px 3px rgba(0,0,0,0.18)`): a hairline shadow on the *active* segment
  of a segmented control only, to read it as raised above its track.

### Named Rules
**The Flat-By-Default Rule.** A surface at rest has a border, never a shadow. A shadow on a
resting card is a bug — if it isn't floating (sheet, hero, toast, drag), it doesn't get one.
Depth between resting surfaces is tonal (surface → surface-2 → surface-3).

## 5. Components

Components are **refined and minimal**: crisp edges, generous tap targets, restrained
press feedback (a 0.98–0.99 scale on `:active`), and color spent only where it means
something. They read like parts of a measuring tool, not a consumer toy.

### Buttons
- **Shape:** softly rounded (14px control radius), full-width, 50px tall — a comfortable
  thumb target.
- **Primary:** Bourse Green fill with accent-ink text (white in light, near-black in dark).
- **Ghost:** transparent with a 1px border; for secondary actions.
- **Danger:** loss-red text on a low-opacity red wash (`neg-soft`) — visible but not alarming
  until tapped.
- **Dashed:** a dashed-border placeholder picker (e.g. "Select instrument").
- **Press / Focus:** `transform: scale(0.98)` on active; a 2px accent `:focus-visible` ring
  offset 2px (global). No hover-only affordances — this is a touch-first app.

### Chips & Pills
- **Return pill** (`.pill`): pill-shaped, tabular, tinted by sign — `pos-soft` / `neg-soft` /
  neutral `chip`. Doubles as the XIRR ⇄ absolute toggle (it's a real button).
- **Gain badge** (`.gain-badge`): solid color-filled chip, white text, 7px radius — the
  high-contrast P&L marker on holding cards.
- **Chip button** (`.chip-btn`): pill, accent text on `accent-soft`, ≥44px tall — inline
  actions like "Change".

### Cards / Containers
- **Corner Style:** 18px (`--radius`); the hero uses 24px (`--radius-lg`).
- **Background:** Surface (`#fff` / `#131c2f`) on the page background.
- **Shadow Strategy:** none at rest — see Elevation. The hero is the exception (it floats).
- **Border:** 1px Border Soft hairline. **No colored side-stripe borders, ever.**
- **Internal Padding:** 16px (`--pad`); compact rows 13–14px.

### Holding Card (signature component)
The defining row: a two-column layout (left = name + as-on/units detail, right = value +
day-change figure), an optional solid gain/loss badge that toggles return mode, and a
trailing chevron into detail. It carries a *faint* type tint — `color-mix` of the surface
with the stock-blue or fund-violet hue (≤6%) plus a slightly tinted border — so type reads
at a glance without shouting. In edit mode it gains a drag handle and a swipe-to-delete
action revealed beneath. This is where "dense, not cluttered" is won or lost.

### Inputs / Fields
- **Style:** inset on Surface-2, 1px Border Soft, 14px radius, 50px tall, **16px font** (to
  prevent iOS zoom-on-focus).
- **Focus:** border shifts to Bourse Green; a focus-visible ring for keyboard nav.
- **Error:** border turns loss-red, `aria-invalid="true"`, and a red help line appears on
  blur.

### Navigation
- **No bottom tab bar.** The app is a single Portfolio hub (summary + holdings inline) with
  pushed screens (Add transaction, Instrument detail, Settings) that hide chrome and show a
  sticky, blurred back **AppBar**. Movement is back-button + tap-into-row, not tab-switching.
- **Bottom sheets** are the primary modal surface: rounded-top, slide-up with a grabber, a
  scrim behind, bounded to the visual viewport so they never hide behind the keyboard.

## 6. Do's and Don'ts

### Do:
- **Do** put `font-variant-numeric: tabular-nums` on every figure; align numbers to the digit.
- **Do** spend green/red only on the gain/loss signal, and reinforce it with sign (`+`/`−`)
  and position so it survives color-blindness — color is never the only cue.
- **Do** keep surfaces flat with a 1px hairline; grant shadow only to floating elements
  (hero, sheets, toast, dragged row).
- **Do** keep tap targets ≥44px and inputs at 16px font.
- **Do** state figures plainly with their as-of date and stop. Report; don't editorialize.
- **Do** keep the light background a cool off-white (`#eef1f7`) and the dark a true navy.

### Don't:
- **Don't** celebrate gains or dramatize losses — no confetti, streaks, neon, or "to the
  moon" framing. This is not a hype crypto app.
- **Don't** drift toward a legacy broker: no grey data-grids, no hairline-tiny text, no
  cramped sub-44px targets. Density must stay legible.
- **Don't** use a cream/sand/parchment background, a tracked-uppercase eyebrow above every
  section, identical icon-card grids, or gradient text. This is not generic AI SaaS.
- **Don't** add ads, upsells, "recommended buys," or scores that imply advice. Nothing here
  is investment advice and the UI must never imply otherwise.
- **Don't** use a `border-left`/`border-right` colored stripe greater than 1px on any card,
  row, or callout. Use a full hairline, a tonal fill, or a leading badge instead.
- **Don't** put a shadow on a resting card. If it isn't floating, it stays flat.
- **Don't** introduce a second font family or a display typeface; hierarchy is weight + scale.
