import express from 'express'
import cors from 'cors'
import stocks from './routes/stocks.js'
import mf from './routes/mf.js'

// Pure API app — no static serving, no listen — so it can run either as a
// single-process server (see index.ts) or as a serverless function (see /api).
const app = express()
app.use(cors())
app.use(express.json())

// Mounted at both the `/api/...` paths and the bare `/...` paths. Single-process
// hosting (server/src/index.ts) and the Vite dev proxy send the full `/api/...` path;
// the Vercel rewrite (`/api/(.*)` → `/api`) normally preserves it too, but mounting
// the bare paths as well keeps routing working even if the prefix is ever stripped.
app.get(['/api/health', '/health'], (_req, res) => {
  res.json({ ok: true, ts: Date.now(), twelvedata: Boolean(process.env.TWELVEDATA_API_KEY) })
})

app.use(['/api/stocks', '/stocks'], stocks)
app.use(['/api/mf', '/mf'], mf)

export default app
