# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## What this is

**B Funds — Portfolio Tracker**: a mobile-first **PWA** that tracks Indian **stocks
(NSE/BSE)** and **mutual funds (incl. SIPs)**. A clone of the "My Funds – Portfolio
Tracker" app.

The defining architectural fact: **there is no login, and no per-user database.** All
portfolio data (instruments, transactions, SIPs, profiles, settings) lives **on-device in
IndexedDB**, and the server is a **stateless market-data proxy** for normal operation.

A device may hold **multiple portfolio profiles** (e.g. "Main" + "Family"), each with its own
transactions and SIPs; instruments and the price cache are shared across profiles. One profile
is active at a time. See [Domain model](#domain-model-websrcdomaintypests) and
[Persistence](#persistence-websrcdb).

> **One deliberate exception — "share via key":** when a user taps *Share via key* in
> Settings, the **active profile's** portfolio is uploaded **in plain text** to a Redis KV
> (Upstash / Vercel KV) under a short random code and kept for **30 days**, so another
> device can import it via that code (`POST/GET /api/share`). This is the only path where
> portfolio data leaves the device or touches the server. The code is a bearer token
> (anyone holding it can read the data); there is no encryption. See
> [Server](#server-serversrc--market-data-proxy--share-relay) and the in-app About copy.

## Repository layout

npm-workspaces monorepo (workspaces: `web`, `server`):

```
web/         React + Vite + TS PWA (all portfolio logic & data live here)
server/      Express proxy: market data (Yahoo + MFAPI + optional Twelve Data) + share-key relay
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
hooks/        usePortfolio/useBootstrap, useProfiles, useReturnMode, useHeroToggles,
             useHoldingsOrder, usePortfolioHistory (orchestration + reactive derivation)
lib/          format, backup, share, excel, pin, biometric, theme, dynamicType (leaf utilities)
components/   Shared UI: charts, sheets, sortable holdings, rows, avatar, primitives (ui.tsx)
screens/      One file per screen (Portfolio, AddTransaction, InstrumentDetail, Settings, Lock)
App.tsx       Shell: PIN/biometric gate, routes, theme sync
main.tsx      Entry: registers service worker, runs syncDynamicType(), wraps App in BrowserRouter
```

> **There is no tab bar.** The app is effectively a single home screen (`Portfolio`) plus
> `Settings`, with `AddTransaction` and `InstrumentDetail` pushed on top. Holdings, SIPs and the
> trend chart all live inside the Portfolio/InstrumentDetail screens — the old Holdings, Watchlist
> and SIPs screens (and the watchlist feature itself) have been removed.

### Domain model (`web/src/domain/types.ts`)

The five persisted record types, all using **string IDs** and **ISO `YYYY-MM-DD` dates**:

- **`Instrument`** — a tradeable asset, **shared across profiles**. `type: 'stock' | 'mf'`.
  `id` is a **composite** built by `instrument.ts`: `stock:<SYMBOL>` (e.g. `stock:RELIANCE.NS`)
  or `mf:<SCHEMECODE>` (e.g. `mf:118550`). Carries `symbol`/`exchange` (stocks) or `schemeCode`/
  `category` (funds); `currency` defaults to INR.
- **`Transaction`** — a `buy`/`sell` event: `units`, `price`, `fees`, optional `notes`,
  optional `sipId` (set only on auto-generated SIP buys), `instrumentId` FK, **`profileId`**
  (which profile it belongs to).
- **`Sip`** — recurring plan: `amount` (INR), `frequency` (weekly/fortnightly/monthly),
  `startDate`, `active`, `lastRun`, **`profileId`**, and optional **`installments`** (total
  planned count; omitted = ongoing/open-ended).
- **`PriceSnapshot`** — live/cached price: `price`, `prevClose`, `asOf`. Shared across profiles.
- **`Profile`** — a portfolio profile: `id`, `name`, `createdAt`. The default profile id is
  `'default'` (`DEFAULT_PROFILE_ID`); the active one is recorded in settings under
  `activeProfileId` (`ACTIVE_PROFILE_KEY`).

`Holding` and `PortfolioSummary` are **computed**, not stored. `Holding` carries per-position
`xirr` and `realizedPnl`; `PortfolioSummary` carries blended `xirr`, per-sleeve `xirrByType`,
`byType` (current value) and `pnlByType` (unrealized gain) for stock vs mf, plus `realizedPnl`.

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
- Holdings are sorted by `currentValue` descending (the Portfolio screen may then re-apply a
  saved manual order — see [useHoldingsOrder](#state-hooks--reactivity-websrcstore-websrchooks)).
- **XIRR is computed at three altitudes from one shared helper.** `transactionCashFlows()`
  replays the same average-cost/oversell logic to emit each instrument's buy/sell flows (buys
  negative gross+fees, sells positive clamped−fees). `computeHolding()` appends the holding's
  current value as a terminal inflow for a **per-holding** `xirr`; `xirrForSubset()` does the
  same over a set of positions for the **blended** `summary.xirr` and the **per-sleeve**
  `xirrByType` (stock/mf). Closed positions (units 0) are included in subset XIRR (their
  realized money belongs in the return); held-but-unpriced positions are excluded. The terminal
  inflow is dated at `todayAsOf()` (UTC midnight of today) so a same-day buy spans zero time and
  cleanly returns `null` instead of an absurd annualized rate.

### XIRR (`web/src/domain/xirr.ts`)

Newton-Raphson (start r=0.1, ≤100 iters, tol 1e-8) with a **bisection fallback** (bracket
`[-0.9999, 10]`, expands hi to 100, ≤300 iters, tol 1e-7). Cash-flow sign convention:
**buys negative, sells positive, current value as a final positive inflow.** Returns
`null` if <2 flows, no mix of in/outflows, or no solution. `r` clamped above −1.

SIPs are **mutual-fund only** and created from the `AddTransaction` screen (a `SIP` option in
its Buy/Sell/SIP type toggle), not a dedicated screen. Existing SIPs are listed, paused/resumed
and deleted from `InstrumentDetail`.

- `web/src/domain/sip.ts` is pure date math: `dueInstallments(sip, today)` walks forward from
  `startDate` one frequency step at a time, collecting due dates `<= today` and skipping those
  already materialized (`> lastRun`). An **`installments` count caps** the schedule, so a
  fully-past fixed-term SIP materializes its whole history in one run while an ongoing SIP (no
  count) generates forever (ISO strings compared lexicographically; 2000-iter safety guard).
  `lastInstallmentDate()` / `isComplete()` derive the final date and completion state;
  `FREQUENCY_LABEL` maps frequency → display label.
- `runDueSips()` in `web/src/db/repo.ts` is the **engine**: for each active SIP it fetches
  the historical NAV/close for each due date via `priceOnDate()`, computes
  `units = amount / price`, inserts a `buy` transaction (`sipId` + `profileId` set,
  `notes = 'SIP · {frequency}'`), and advances `lastRun`. **It breaks early if a price
  fetch fails**, so the next run retries from that date — partial progress persists. When a
  fixed-term SIP runs its final installment, it is **deactivated** (`active=false`) so it reads
  as a closed plan.
- Called **once per session** from `useBootstrap()` (after `ensureProfiles()`), and again right
  after a SIP is created in `AddTransaction`.

### Persistence (`web/src/db/`)

Single Dexie DB named **`my-funds`, now at version 3** (`web/src/db/index.ts`). Current shape:

```js
instruments:  'id, type, name'
transactions: 'id, instrumentId, date, sipId, profileId'
sips:         'id, instrumentId, profileId'  // active is NOT indexed (Booleans can't be IDB keys) → filtered in JS
prices:       'instrumentId, asOf'           // best-effort offline cache (shared)
settings:     'key'                          // key/value via getSetting/setSetting
profiles:     'id, createdAt'
```

Migrations live in the `MyFundsDB` constructor: **v1** shipped with a `watchlist` store; **v2**
drops it (`watchlist: null`); **v3** adds the `profiles` table + `profileId` index on
transactions/sips and an `.upgrade()` that backfills existing rows to `DEFAULT_PROFILE_ID`.
Fresh installs (where no upgrade runs) converge via `ensureProfiles()` (see below).

`web/src/db/repo.ts` holds **all mutations**:
- Transactions/instruments: `addTransaction` (stamps active `profileId`),
  `update/deleteTransaction`, `getOrCreateInstrument`, `pruneInstrument`,
  `deleteHolding(instrumentId, profileId)` (atomically drops a profile's txns+SIPs for one
  instrument).
- SIPs: `addSip` (stamps `profileId`, normalizes `installments`), `setSipActive`,
  `deleteSip(id, removeTxns?)`, `runDueSips`.
- Profiles: `ensureProfiles` (idempotent bootstrap — guarantees ≥1 profile + a valid
  `activeProfileId`, and migrates a legacy global `holdingsOrder` setting onto the default
  profile), `createProfile`, `renameProfile`, `setActiveProfile`, `deleteProfile` (refuses to
  delete the last profile; reassigns active to the oldest survivor).

IDs come from `uid(prefix)` (`t_` txns, `s_` SIPs, `p_` profiles, no prefix for instruments —
their ids are the composite `stock:`/`mf:` keys). Instruments are **shared reference data**, so
`pruneInstrument`/`deleteHolding`/`deleteProfile` garbage-collect an instrument (and its cached
price) only once **no transaction or SIP references it in ANY profile**.

### State, hooks & reactivity (`web/src/store/`, `web/src/hooks/`)

- **`useMarket`** (Zustand): `{ prices, refreshing, lastRefresh }` + `hydrate()`,
  `setPrice()`, `refreshOne()`, `refresh(instruments[])`. `refresh()` runs **5 concurrent
  workers** off a shared queue; no-op if already refreshing, and persists `lastPriceRefresh`.
  `pricesAreStale()` reports true when there's been no bulk refresh in **2h** (`PRICE_STALE_MS`).
- **`usePortfolio()`** memoizes `computePortfolio()` over live Dexie queries + the price store.
  **Profile-scoped:** instruments are read globally but transactions are filtered to the active
  profile (`useActiveProfile`); `loading` stays true until the active profile, instruments and
  transactions all resolve. `useTrackedInstruments()` returns the active profile's held
  instruments (those worth pricing); `useInstrument`/`useInstrumentTxns`/`useHolding` are the
  per-instrument variants used by InstrumentDetail.
- **`useBootstrap()`** orchestrates app start: (1) `hydrate()` cached prices from IndexedDB →
  (2) once: `ensureProfiles()` then `runDueSips()` → (3) `refresh()` tracked instruments **only
  if `pricesAreStale()`** (the manual refresh button bypasses that gate). Guarded by refs
  (`ran`, `refreshedFor`) to avoid duplicate work.
- **`useProfiles`** — `useProfiles()` (all profiles) + `useActiveProfile()` (`{ activeId,
  setActive }`; `activeId` is `undefined` until resolved, to avoid flashing wrong-profile data).
- **`useReturnMode`** — single global `'xirr' | 'absolute'` lens (settings key `returnMode`),
  shared by the hero pill, holding rows and InstrumentDetail's perf tile.
- **`useHeroToggles`** — per-display toggles persisted in settings: `useDayMode` (today's tile
  %/₹), `useIrrSleeve` (XIRR all/stock/mf), `useTrendExpanded`, `useTrendView` (value/return %),
  `useTrendRange` (1mo/6mo/1y/max).
- **`useHoldingsOrder`** — per-profile manual holdings order (settings key
  `holdingsOrder:<profileId>`); `orderHoldings()` applies a saved id list, appending any unknown
  holdings at the end.
- **`usePortfolioHistory(range)`** — builds the value-over-time series. Fetches each tracked
  instrument's full `'max'` history once per session (5-concurrent worker pool, session cache
  keyed on the instrument SET), then `buildPortfolioHistory()` (`domain/portfolioHistory.ts`)
  forward-fills daily holdings with the **same average-cost replay** as `computeHolding` so the
  curve's right edge matches the dashboard; range toggles re-slice with no refetch.

### Screens & routing (`web/src/App.tsx`)

Four routes, no tab bar: `/` Portfolio · `/add` AddTransaction · `/instrument/:id`
InstrumentDetail · `/settings` Settings (`*` falls back to Portfolio). Portfolio and
LockScreen are eager (first-paint path); AddTransaction, InstrumentDetail and Settings are
`React.lazy` so **recharts** (pulled in by the charts) lands in its own async chunk. `App` gates
the whole app behind `LockScreen` when a `pinHash` setting is present, syncs theme on mount + OS
preference change, and waits for both `pinHash` and `biometricCredId` to resolve before painting.

- **Portfolio** (`screens/Portfolio.tsx`) — the home screen. A two-metric **hero** (Today's move
  + Overall/per-sleeve XIRR, each tappable to toggle/cycle; current value + invested as demoted
  stat tiles; an allocation bar; an optional realized-P/L line) over a **Holdings** list. The
  title becomes a profile switcher once a second profile exists. Holdings support a stock/mf
  **type filter**, drag-to-reorder + swipe-to-delete via `SortableHoldings` (edit mode), and a
  collapsible **Trend** chart (`TrendSection`) that mounts `usePortfolioHistory` only when opened.
- **InstrumentDetail** — price + a fixed 6-month `PriceChart`, a perf tile (XIRR/₹ P/L via the
  shared return mode), the held position, any SIPs (pause/resume/delete), and the transaction
  list (tap a row to edit/delete via `EditTransactionSheet`).
- **AddTransaction** — instrument search + Buy/Sell/SIP entry (amount-or-units for funds,
  auto-priced from the chosen date).
- **Settings** — Profiles (add/switch/rename/delete), Data (share/import key, Excel export),
  Security (PIN + Face ID enroll/disable), Appearance (theme), Danger zone (clear all), About.
- **Lock** (`screens/Lock.tsx`, exported as `LockScreen`) — PIN keypad with an optional Face ID /
  Touch ID button; auto-attempts biometric once on mount.

### Shared UI & utilities

- `components/ui.tsx` — primitives: `Spinner`, `Loading`, `EmptyState`, `Delta`, `Pill`,
  `StatTile`, `SegmentedControl`, `AppBar`, `useToast`.
- Other components: `PortfolioChart` / `PriceChart` (recharts area charts),
  `SortableHoldings` (hand-rolled pointer-event drag-reorder + long-press-to-edit +
  swipe-to-delete) + `HoldingRow`, `Sheet` (bottom sheet, keyboard-inset aware),
  `SearchSheet`, `EditTransactionSheet`, `DeleteHoldingSheet`, `InstrumentAvatar`
  (deterministic colored initials).
- `lib/format.ts` — **Indian** money formatting: `formatINR` (₹, `en-IN`), `formatINRCompact`
  (Cr ≥1e7 / L ≥1e5), `formatSignedINR` (+/−), `formatPct`, `formatUnits`. `sign()` treats
  `|n| < 1e-9` as zero (drives green/red/gray coloring).
- `lib/backup.ts` — `buildBackup()` serializes the **active profile only** (its transactions +
  SIPs, the instruments they reference, and portable settings) at payload `version: 2`;
  `parseBackup()` validates; `applyBackup()` **replaces the active profile's** data (clears only
  that profile's txns/SIPs, upserts shared instruments, re-tags incoming rows to the active
  profile) and tolerates old v1 payloads (no `profileId`, stray `watchlist`). `wipeAllData()`
  clears all tables incl. profiles. **Device-bound/profile-local settings are excluded**
  (`pinHash`, `biometricCredId`, `activeProfileId`, `holdingsOrder:*`); the price cache is not
  included.
- `lib/share.ts` — `shareBackup()` (POST `buildBackup()` → `{ code, expiresAt }`) and
  `importFromCode()` (GET payload → `parseBackup` → `applyBackup`; the Settings import flow then
  reloads the page). Both **throw** on failure (unlike the market clients) so the UI can show a
  precise message; `ShareNotFoundError` distinguishes an expired/unknown key (404).
- `lib/excel.ts` — lazy-loads SheetJS, writes a two-sheet `.xlsx` (Holdings + Transactions).
- `lib/pin.ts` — `hashPin`/`verifyPin` via SubtleCrypto SHA-256 with salt `my-funds:v1:`.
  **Convenience lock, not real security** (no timing-safe compare; data is unencrypted in
  IndexedDB).
- `lib/biometric.ts` — WebAuthn platform-authenticator unlock (Face ID / Touch ID):
  `isBiometricSupported`, `enrollBiometric` (returns a base64url credential id stored in settings
  as `biometricCredId`), `verifyBiometric`. **Client-side convenience gate only** — no server
  verification; the PIN is always the fallback, and removing the PIN also clears the credential.
  Requires a secure context and is bound to the current hostname.
- `lib/theme.ts` — light/dark/system; sets `data-theme` + `<meta theme-color>`
  (light `#0b7a4b`, dark `#0b1120`).
- `lib/dynamicType.ts` — `syncDynamicType()` (called from `main.tsx`) makes the root `rem` track
  iOS Dynamic Type on WebKit by measuring `-apple-system-body`; no-op elsewhere.

## Server (`server/src`) — market-data proxy + share relay

Express app. `app.ts` is the **pure API** (CORS + JSON, no static, no `listen`) so it runs
identically as a single process (`index.ts`) or a Vercel function (`api/index.ts`
re-exports it). `index.ts` additionally serves `web/dist` if present and listens on `PORT`
(default **8787**). The JSON body limit is raised to **8mb** (default is 100kb) for share
uploads, and a terminal error middleware returns JSON for malformed/oversize bodies.

Endpoints (all JSON; success = raw normalized object, error = `{ error, detail? }`):

| Method · Path | Source | Cache TTL |
|---|---|---|
| `GET /api/health` | — | `{ ok, ts, twelvedata, kv }` (`kv` = durable share store configured) |
| `GET /api/stocks/search?q=` | Yahoo `v1/finance/search` (EQUITY/ETF only, .NS/.BO first) | 1h; errors → `[]` |
| `GET /api/stocks/quote?symbol=` | Yahoo `v8/finance/chart` → `StockQuote` | 5m |
| `GET /api/stocks/history?symbol=&range=` | Yahoo `v8/finance/chart` → `StockHistory` | 6h |
| `GET /api/mf/search?q=` | api.mfapi.in (3-attempt backoff 400/800/1200ms) | 1h; errors → `[]` |
| `GET /api/mf/:code` | api.mfapi.in (`:code` must be **digits only**) | 30m |
| `POST /api/share` | body = `BackupPayload`; stores plaintext in KV → `{ code, expiresAt }` | 30d TTL |
| `GET /api/share/:code` | KV lookup (code normalized, shape-checked) → `BackupPayload` | — (404 if missing/expired) |

- **Caching:** in-memory `TtlCache` (`cache.ts`) keyed by string (`quote:SYMBOL`, etc.).
  Per-process, lost on restart. TTLs tuned for once-daily close prices.
- **Stock fallback chain:** Yahoo first; if it throws **and** `TWELVEDATA_API_KEY` is set,
  fall back to Twelve Data (`td.enabled()` gate). Otherwise fully keyless.
- **Yahoo spoofs a Chrome User-Agent** to avoid 429s — required for non-browser requests.
- Provider errors surface as `ProviderError` (default HTTP 502; Yahoo 404 preserved).

### Share relay (`store.ts` + `routes/share.ts`)

- **`store.ts`** is a tiny `KvStore` abstraction: `RestKvStore` talks to Upstash Redis /
  Vercel KV over the **REST command-array API** (`POST <url>` with `Authorization: Bearer`
  and body `["SET", key, value, "EX", ttl]` / `["GET", key]`); `MemoryKvStore` is a
  process-local fallback used **only when no KV env vars are set** (local dev — not durable,
  not shared across serverless invocations). `getStore()` resolves lazily; `storeIsDurable()`
  feeds `/api/health`.
- **Env vars** (set EITHER pair): `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV) **or**
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash). Production on Vercel
  **requires** these — the in-memory fallback won't resolve across function invocations.
- **`routes/share.ts`:** short codes are 8 chars of a 30-symbol Crockford base32 alphabet
  (no ambiguous `0/O/1/I/L/U`), generated with `randomBytes` + rejection sampling (~39 bits),
  formatted `ABCD-EFGH`; stored/looked-up under the normalized `share:<CODE>` key. POST
  validates `app === 'my-funds'` + a `data` object and rejects payloads > 6 MB (413).
- **Plaintext + bearer code:** payloads are stored unencrypted; the code grants read access.
  `pinHash` is stripped client-side in `buildBackup()`.

## Deployment (Vercel)

Static PWA on the CDN + Express proxy as a serverless function. `vercel.json`: build →
`web/dist`, SPA rewrite of everything except `/api/*` to `/index.html`. Deploy from repo
root: `npx vercel --prod`. Optionally set `TWELVEDATA_API_KEY` in project env vars.

**Required for "share via key":** provision a Redis KV (Vercel KV / Upstash marketplace
integration, or a bare Upstash database) and set its REST URL + token env vars (see
[Share relay](#share-relay-storets--routesshare)). Without them the share endpoints fall
back to in-memory storage, which **does not work on serverless** (each invocation is a
separate instance) — share keys won't resolve. `vercel.json` needs no change.

## Gotchas (read before editing)

- **`--use-system-ca`:** server dev/start scripts set `NODE_OPTIONS=--use-system-ca` so Node
  trusts the OS cert store. Required behind TLS-intercepting corporate proxies (else
  `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`); harmless otherwise. Don't drop it from the scripts.
- **`xlsx` advisory:** SheetJS `xlsx@0.18.5` has a known advisory. Here it only *generates*
  a file from the user's own data and never parses untrusted input — keep it that way.
- **No tests.** Validate with `npm run typecheck`. TS strict mode is on everywhere.
- **PIN is not encryption** and **backups omit `pinHash`** — don't market either as secure.
- **Share keys are plaintext + bearer tokens.** `POST /api/share` stores the full portfolio
  unencrypted for 30 days; anyone with the code can read it. Don't describe it as private or
  encrypted, and keep `pinHash` stripped from the payload (`buildBackup` already does this).
  Production needs the KV env vars or codes silently won't resolve on serverless.
- **PIN/biometric are convenience locks, not encryption.** Removing the PIN also disables Face
  ID (the biometric credential is only ever a PIN alternative). Backups omit both — don't market
  them as secure.
- **`sips.active` isn't indexed** (IDB Boolean limitation) — filter active SIPs in JS.
- **Everything is profile-scoped except instruments and prices.** New per-portfolio data needs a
  `profileId`; reads must filter on the active profile (`useActiveProfile`). Instruments are
  shared and only GC'd when unreferenced across **all** profiles — don't delete one just because
  the active profile dropped it.
- **There is no watchlist anymore** (dropped in DB v2) — don't reintroduce references to it.
- **Dates are ISO `YYYY-MM-DD` strings** throughout the domain/db layers and rely on
  lexicographic ordering. `createdAt`/`asOf`/`time` are epoch ms. Don't mix the two.
- **Schema is at version 3.** Any change to a table's keys/indexes needs a new
  `version(n).stores({...}).upgrade(...)` block in `web/src/db/index.ts`; keep `ensureProfiles()`
  as the convergence path for fresh installs that run no upgrade.
- **Money data is "as of last close,"** third-party, as-is — not investment advice.
