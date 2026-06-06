# B Funds — Portfolio Tracker (Mobile Web App)

A mobile-first **PWA** that tracks your **Indian stocks (NSE/BSE)** and **mutual funds (incl. SIP)** —
a clone of the *“My Funds – Portfolio Tracker”* app. No login: all your portfolio data stays **local on
your device** (IndexedDB). Prices update from free market-data APIs.

## Features

- 📈 Track unlimited **NSE/BSE stocks** and **mutual funds** (with SIP)
- 💰 Portfolio summary: **invested, current value, total P/L, day's gain, realized P/L, XIRR**
- 🥧 Asset **allocation** donut, per-instrument **price / NAV charts** (1M–Max)
- 🔁 **SIP** management — auto-materializes due installments at each date's NAV
- ⭐ **Watchlist** for instruments you don't yet hold
- 🔐 Optional **PIN lock**, light/dark/system **themes**
- 💾 **Backup & restore** (export/import JSON), **export to Excel** (.xlsx)
- 📲 Installable **PWA** with offline shell + last-known prices

## Architecture

npm-workspaces monorepo:

- **`web/`** — React + Vite + TypeScript PWA (Zustand, Dexie/IndexedDB, Recharts, React Router, SheetJS).
  All portfolio data is local; the backend is only a market-data proxy.
- **`server/`** — a thin, stateless **Express proxy** (run via `tsx`) for market data (stocks + mutual fund NAV).

### Data sources

| Asset | Source | How |
|------|--------|-----|
| Mutual fund NAV | [api.mfapi.in](https://www.mfapi.in) | Via the **Node proxy** (`/api/mf/*`) — fetched server-side (keyless) with caching + retry |
| Stocks (NSE/BSE) | Yahoo Finance v8 | Via the **Node proxy** (`/api/stocks/*`) — Yahoo is CORS-blocked and needs a browser User-Agent |

Daily closing prices only (matching the original app). An optional **Twelve Data** fallback activates if
`TWELVEDATA_API_KEY` is set; otherwise everything stays keyless.

## Getting started

```bash
npm install        # installs both workspaces
npm run dev        # web on http://localhost:5173, proxy on :8787 (vite proxies /api)
```

Open **http://localhost:5173** (use a mobile viewport / device emulation for the intended layout).

### Production

```bash
npm run build      # builds the PWA into web/dist
npm start          # Express serves web/dist + /api on http://localhost:8787
```

### Environment (optional)

Copy `server/.env.example` to `server/.env`:

```
TWELVEDATA_API_KEY=   # optional stock fallback (free tier); leave blank to stay keyless
PORT=8787
```

## Deploy to Vercel

The app deploys as a **static PWA** (Vercel's CDN) plus the Express proxy as a **serverless
function** (`api/[...path].ts`, which re-exports the shared `server/src/app.ts`). Config lives in
`vercel.json` (build → `web/dist`, SPA fallback, `/api/*` → the function).

One-time, from the repo root (PowerShell). `NODE_OPTIONS=--use-system-ca` lets the Vercel CLI's HTTPS
work behind the corporate TLS proxy — omit it on a normal network:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npx vercel login          # sign in / sign up (browser or email)
npx vercel --prod --yes   # build + deploy; prints the live https URL
```

- Optional: add `TWELVEDATA_API_KEY` under the Vercel project's **Environment Variables** to enable the
  stock fallback (otherwise it stays keyless).
- The deployment hosts the app publicly at a `*.vercel.app` URL; each visitor's portfolio data stays in
  *their own* browser (IndexedDB) — nothing is shared or uploaded.
- Re-deploy anytime with `npx vercel --prod`. Or connect the GitHub repo in the Vercel dashboard for
  auto-deploys on push.

## Notes

- **Corporate networks / TLS:** the server runs Node with `--use-system-ca` (set automatically via
  `cross-env` in the `dev`/`start` scripts) so it trusts the OS certificate store. This is required behind
  TLS-intercepting proxies, where Node's bundled CA list would otherwise reject HTTPS
  (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`). It is harmless on normal networks.
- **`xlsx` advisory:** SheetJS (npm `xlsx@0.18.5`) carries a known advisory; here it is used only to
  generate a local Excel file from your own data and never parses untrusted input.
- Market data is "as of last close" and provided as-is by third-party APIs; not investment advice.

## Project layout

```
server/src/        Express proxy (cache, Yahoo + optional Twelve Data providers, /api/stocks routes)
web/src/
  api/             mf + stock proxy clients (both via /api/*) + unified instrument layer
  db/              Dexie schema + repository actions (incl. SIP runner)
  domain/          types, portfolio math, XIRR, SIP scheduling
  store/           Zustand market (prices) store
  hooks/           usePortfolio + bootstrap (SIP run + price refresh)
  lib/             format, backup, excel, pin, theme
  components/      shared UI (TabBar, charts, sheets, rows, primitives)
  screens/         Portfolio, Holdings, AddTransaction, InstrumentDetail, Sip, Watchlist, Settings, Lock
```
