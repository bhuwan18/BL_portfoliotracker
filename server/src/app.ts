import express from 'express'
import cors from 'cors'
import stocks from './routes/stocks.js'
import mf from './routes/mf.js'

// Pure API app — no static serving, no listen — so it can run either as a
// single-process server (see index.ts) or as a serverless function (see /api).
const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), twelvedata: Boolean(process.env.TWELVEDATA_API_KEY) })
})

app.use('/api/stocks', stocks)
app.use('/api/mf', mf)

export default app
