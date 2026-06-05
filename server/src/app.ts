import express from 'express'
import cors from 'cors'
import stocks from './routes/stocks.js'
import mf from './routes/mf.js'
import share from './routes/share.js'
import { storeIsDurable } from './store.js'

// Pure API app — no static serving, no listen — so it can run either as a
// single-process server (see index.ts) or as a serverless function (see /api).
const app = express()
app.use(cors())
// 8mb limit (the default is 100kb) so a full portfolio can be POSTed to /api/share.
// Raising it globally is necessary because this parser runs before the router, so a
// per-route limit would be shadowed; the real ceiling is enforced in routes/share.ts.
app.use(express.json({ limit: '8mb' }))

// Mounted at both the `/api/...` paths and the bare `/...` paths. Single-process
// hosting (server/src/index.ts) and the Vite dev proxy send the full `/api/...` path;
// the Vercel rewrite (`/api/(.*)` → `/api`) normally preserves it too, but mounting
// the bare paths as well keeps routing working even if the prefix is ever stripped.
app.get(['/api/health', '/health'], (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    twelvedata: Boolean(process.env.TWELVEDATA_API_KEY),
    kv: storeIsDurable(),
  })
})

app.use(['/api/stocks', '/stocks'], stocks)
app.use(['/api/mf', '/mf'], mf)
app.use(['/api/share', '/share'], share)

// Terminal error handler so body-parser failures (malformed/oversize JSON) return
// JSON rather than Express's default HTML error page. Must be 4-arg to be treated as
// an error handler; unused params are `_`-prefixed for noUnusedParameters.
app.use(
  (
    err: { type?: string; status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({ error: 'payload too large' })
    }
    if (err?.type === 'entity.parse.failed' || err?.status === 400) {
      return res.status(400).json({ error: 'invalid json' })
    }
    return res.status(500).json({ error: 'internal error' })
  },
)

export default app
