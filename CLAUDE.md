# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## What this is

**My Funds — Portfolio Tracker**: a mobile-first **PWA** that tracks Indian **stocks
(NSE/BSE)** and **mutual funds (incl. SIPs)**. A clone of the "My Funds – Portfolio
Tracker" app.

The defining architectural fact: **there is no backend database and no login.** All
portfolio data (instruments, transactions, SIPs, watchlist, settings) lives **on-device in
IndexedDB**. The server is a *stateless market-data proxy only* — it never sees or stores
user portfolios. Each visitor's data stays in their own browser.

## Repository layout

npm-workspaces monorepo (workspaces: `web`, `server`):

```
web/         React + Vite + TS PWA (all portfolio logic & data live here)
server/      Stateless Express proxy for market data (Yahoo + MFAPI + optional Twelve Data)
api/         Vercel serverless shim — re-exports server/src/app.ts as a function
vercel.json  Vercel build/deploy config (static web/dist + /api/* → the function)
package.json Root: workspace scripts (dev/build/start/typecheck)
```

## Commands

Run from the **repo root** unless noted. There is no test suite; `typecheck` is the
primary correctness gate — **run it after any change.**

| Command | What it does |
|---|---|
| `npm install` | Installs both workspaces |
| `npm run dev` | Concurrently: web (Vite) on **:5173**, proxy on **:8787**. Vite proxies `/api` → :8787. Develop against **http://localhost:5173**. |
| `npm run dev:web` / `npm run dev:api` | Run just one side |
| `npm run build` | `tsc -b && vite build` → outputs `web/dist` |
| `npm start` | Production: Express serves `web/dist` + `/api` on **:8787** |
| `npm run typecheck` | `tsc` over server, then web. **Use this to validate changes.** |

- Server scripts run Node with `NODE_OPTIONS=--use-system-ca` (via `cross-env`) — see
  [Gotchas](#gotchas-read-before-editing).
- Dev mode points at the proxy via `VITE_API_TARGET` (defaults to `http://localhost:8787`).

## How a price flows (the core data path)

```
UI / hook → web/src/api/instrument.ts (unified dispatcher, branches on Instrument.type)
   ├─ stock → web/src/api/stocks.ts → GET /api/stocks/* → server → Yahoo (→ Twelve Data fallback)
   └─ mf    → web/src/api/mf.ts     → GET /api/mf/*     → server → api.mfapi.in
```

Both branches normalize to a `PriceSnapshot` and land in the **Zustand market store**
(`web/src/store/market.ts`), which also persists every snapshot to the `prices` IndexedDB
table for instant offline display on next load.

> **Note:** **both** stocks and mutual funds go through the Node proxy (`/api/stocks/*`
> and `/api/mf/*`) — there is no browser-direct call to `api.mfapi.in`. MFAPI's response is
> reshaped across both layers (`server/src/providers/mfapi.ts` returns it raw;
> `web/src/api/mf.ts` converts dd-mm-yyyy → ISO, strips invalid NAVs, reverses to
> oldest-first). The Vite/PWA config still has a direct-to-`api.mfapi.in` runtime cache
> rule (`vite.config.ts`), which is now effectively dormant — remove it if you tidy that file.

## Web app (`web/src`)

```
domain/      Pure business logic & types — NO React, NO I/O (the heart of the app)
db/          Dexie/IndexedDB schema + repository actions (the only persistence layer)
api/         Market-data clients + unified instrument dispatcher
store/        Zustand market (price) store
hooks/        usePortfolio + useBootstrap (orchestration + reactive derivation)
lib/          format, backup, excel, pin, theme (leaf utilities)
components/   Shared UI: TabBar, charts, sheets, rows, primitives (ui.tsx)
screens/      One file per screen
App.tsx       Shell: PIN gate, routes, theme sync, conditional TabBar
main.tsx      Entry: registers service worker, wraps App in BrowserRouter
```

### Domain model (`web/src/domain/types.ts`)

The four persisted record types, all using **string IDs** and **ISO `YYYY-MM-DD` dates**:

- **`Instrument`** — a tradeable asset. `type: 'stock' | 'mf'`; stocks keyed by `symbol`
  (e.g. `RELIANCE.NS`), funds by `schemeCode`. `currency` defaults to INR.
- **`Transaction`** — a `buy`/`sell` event: `units`, `price`, `fees`, optional `notes`,
  optional `sipId` (set only on auto-generated SIP buys), `instrumentId` FK.
- **`Sip`** — recurring plan: `amount` (INR), `frequency` (weekly/fortnightly/monthly),
  `startDate`, `active`, `lastRun`.
- **`PriceSnapshot`** — live/cached price: `price`, `prevClose`, `asOf`.

`Holding` and `PortfolioSummary` are **computed**, not stored.

### Portfolio math (`web/src/domain/portfolio.ts`) — read carefully before touching

- **Average-cost accounting (NOT FIFO).** `computeHolding()` sorts txns by `(date, createdAt)`,
  accumulates units + cost-basis on BUY (fees added to basis), and on SELL realizes
  P&L against the **running average cost** (`sellUnits*price − fees − sellUnits*avgCost`),
  reducing basis proportionally. Overselling is guarded; residual units `< 1e-9` are
  normalized to exactly 0 (and basis zeroed) to kill floating-point ghosts.
- **Un-priced holdings are excluded from money aggregates.** `computePortfolio()` only
  counts holdings with `hasPrice=true` toward invested/currentValue/dayChange/byType —
  this prevents a missing price from showing as a fake loss. Un-priced holdings still
  appear in the holdings list (`hasPrice=false`) for visibility.
- Holdings are sorted by `currentValue` descending.

### XIRR (`web/src/domain/xirr.ts`)

Newton-Raphson (start r=0.1, ≤100 iters, tol 1e-8) with a **bisection fallback** (bracket
`[-0.9999, 10]`, expands hi to 100, ≤300 iters, tol 1e-7). Cash-flow sign convention:
**buys negative, sells positive, current value as a final positive inflow.** Returns
`null` if <2 flows, no mix of in/outflows, or no solution. `r` clamped above −1.

### SIP scheduling & materialization

- `web/src/domain/sip.ts` is pure date math: `dueInstallments(sip, today)` walks forward
  from `nextDueDate()` one frequency step at a time, collecting all dates `<= today`
  (ISO strings compared lexicographically; 2000-iter safety guard).
- `runDueSips()` in `web/src/db/repo.ts` is the **engine**: for each active SIP it fetches
  the historical NAV/close for each due date via `priceOnDate()`, computes
  `units = amount / price`, inserts a `buy` transaction (`sipId` set,
  `notes = 'SIP · {frequency}'`), and advances `lastRun`. **It breaks early if a price
  fetch fails**, so the next run retries from that date — partial progress persists.
- Called **once per session** from `useBootstrap()`.

### Persistence (`web/src/db/`)

Single Dexie DB named **`my-funds`, version 1** (`web/src/db/index.ts`):

```js
instruments:  'id, type, name'
transactions: 'id, instrumentId, date, sipId'
sips:         'id, instrumentId'        // active is NOT indexed (Booleans can't be IDB keys) → filtered in JS
watchlist:    'id, instrumentId'
prices:       'instrumentId, asOf'      // best-effort offline cache
settings:     'key'                     // key/value via getSetting/setSetting
```

`web/src/db/repo.ts` holds **all mutations** — `addTransaction`, `update/deleteTransaction`,
`addSip`, `setSipActive`, `deleteSip(id, removeTxns?)`, `add/removeFromWatchlist`,
`getOrCreateInstrument`, `pruneInstrument`, `runDueSips`. IDs come from `uid(prefix)`
(`t_` txns, `s_` SIPs, no prefix for instruments). `pruneInstrument` only deletes an
instrument with **zero transactions AND no watchlist entry** (garbage-collection safety).

### State, hooks & reactivity (`web/src/store/`, `web/src/hooks/`)

- **`useMarket`** (Zustand): `{ prices, refreshing, lastRefresh }` + `hydrate()`,
  `setPrice()`, `refreshOne()`, `refresh(instruments[])`. `refresh()` runs **5 concurrent
  workers** off a shared queue; no-op if already refreshing.
- **`usePortfolio()`** memoizes `computePortfolio()` over live Dexie queries
  (`useLiveQuery`) + the price store. `loading` until instruments + transactions resolve.
- **`useBootstrap()`** orchestrates app start: (1) `hydrate()` stale prices from IndexedDB
  → (2) `runDueSips()` once → (3) `refresh()` tracked instruments. Guarded by refs
  (`ran`, `refreshedFor`) to avoid duplicate work.

### Screens & routing (`web/src/App.tsx`)

Tab screens (show `TabBar`): `/` Portfolio · `/holdings` Holdings · `/watchlist` Watchlist ·
`/settings` Settings.
Pushed screens (hide TabBar, show back AppBar): `/add` AddTransaction · `/sip` SIPs ·
`/instrument/:id` InstrumentDetail (`isPushedScreen()` decides). `App` gates the whole app
behind `LockScreen` when a PIN hash is set, and syncs theme on mount + OS preference change.

### Shared UI & utilities

- `components/ui.tsx` — primitives: `Spinner`, `Loading`, `EmptyState`, `Delta`, `Pill`,
  `StatTile`, `SegmentedControl`, `AppBar`, `useToast`.
- `lib/format.ts` — **Indian** money formatting: `formatINR` (₹, `en-IN`), `formatINRCompact`
  (Cr ≥1e7 / L ≥1e5), `formatSignedINR` (+/−), `formatPct`, `formatUnits`. `sign()` treats
  `|n| < 1e-9` as zero (drives green/red/gray coloring).
- `lib/backup.ts` — JSON export/import (`buildBackup`/`importBackup` merge|replace,
  `wipeAllData`). **`pinHash` is deliberately excluded** from backups.
- `lib/excel.ts` — lazy-loads SheetJS, writes a two-sheet `.xlsx` (Holdings + Transactions).
- `lib/pin.ts` — `hashPin`/`verifyPin` via SubtleCrypto SHA-256 with salt `my-funds:v1:`.
  **Convenience lock, not real security** (no timing-safe compare; data is unencrypted in
  IndexedDB).
- `lib/theme.ts` — light/dark/system; sets `data-theme` + `<meta theme-color>`
  (light `#0b7a4b`, dark `#0b1120`).

## Server (`server/src`) — market-data proxy

Stateless Express app. `app.ts` is the **pure API** (CORS + JSON, no static, no `listen`)
so it runs identically as a single process (`index.ts`) or a Vercel function
(`api/[...path].ts` re-exports it). `index.ts` additionally serves `web/dist` if present
and listens on `PORT` (default **8787**).

Endpoints (all JSON; success = raw normalized object, error = `{ error, detail? }`):

| Method · Path | Source | Cache TTL |
|---|---|---|
| `GET /api/health` | — | `{ ok, ts, twelvedata }` |
| `GET /api/stocks/search?q=` | Yahoo `v1/finance/search` (EQUITY/ETF only, .NS/.BO first) | 1h; errors → `[]` |
| `GET /api/stocks/quote?symbol=` | Yahoo `v8/finance/chart` → `StockQuote` | 5m |
| `GET /api/stocks/history?symbol=&range=` | Yahoo `v8/finance/chart` → `StockHistory` | 6h |
| `GET /api/mf/search?q=` | api.mfapi.in (3-attempt backoff 400/800/1200ms) | 1h; errors → `[]` |
| `GET /api/mf/:code` | api.mfapi.in (`:code` must be **digits only**) | 30m |

- **Caching:** in-memory `TtlCache` (`cache.ts`) keyed by string (`quote:SYMBOL`, etc.).
  Per-process, lost on restart. TTLs tuned for once-daily close prices.
- **Stock fallback chain:** Yahoo first; if it throws **and** `TWELVEDATA_API_KEY` is set,
  fall back to Twelve Data (`td.enabled()` gate). Otherwise fully keyless.
- **Yahoo spoofs a Chrome User-Agent** to avoid 429s — required for non-browser requests.
- Provider errors surface as `ProviderError` (default HTTP 502; Yahoo 404 preserved).

## Deployment (Vercel)

Static PWA on the CDN + Express proxy as a serverless function. `vercel.json`: build →
`web/dist`, SPA rewrite of everything except `/api/*` to `/index.html`. Deploy from repo
root: `npx vercel --prod`. Optionally set `TWELVEDATA_API_KEY` in project env vars.

## Gotchas (read before editing)

- **`--use-system-ca`:** server dev/start scripts set `NODE_OPTIONS=--use-system-ca` so Node
  trusts the OS cert store. Required behind TLS-intercepting corporate proxies (else
  `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`); harmless otherwise. Don't drop it from the scripts.
- **`xlsx` advisory:** SheetJS `xlsx@0.18.5` has a known advisory. Here it only *generates*
  a file from the user's own data and never parses untrusted input — keep it that way.
- **No tests.** Validate with `npm run typecheck`. TS strict mode is on everywhere.
- **PIN is not encryption** and **backups omit `pinHash`** — don't market either as secure.
- **`sips.active` isn't indexed** (IDB Boolean limitation) — filter active SIPs in JS.
- **Dates are ISO `YYYY-MM-DD` strings** throughout the domain/db layers and rely on
  lexicographic ordering. `createdAt`/`asOf`/`time` are epoch ms. Don't mix the two.
- **Schema is at version 1 with no migrations.** Any change to a table's keys/indexes needs
  a new `version(n).stores({...}).upgrade(...)` block in `web/src/db/index.ts`.
- **Money data is "as of last close,"** third-party, as-is — not investment advice.
