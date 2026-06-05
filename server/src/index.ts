import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import app from './app.js'
import { warmMaster } from './providers/mfapi.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load server/.env if present (Node >= 20.12 built-in; no dependency).
try {
  process.loadEnvFile(path.resolve(__dirname, '../.env'))
} catch {
  /* no .env file — fine, stay keyless */
}

// Single-process hosting (local / Render / Fly / Azure App Service): also serve
// the built PWA. On serverless the static site is served by the platform's CDN.
const webDist = path.resolve(__dirname, '../../web/dist')
if (existsSync(webDist)) {
  app.use(express.static(webDist))
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')))
}

const PORT = Number(process.env.PORT || 8787)
app.listen(PORT, () => {
  console.log(`[my-funds] market-data proxy listening on http://localhost:${PORT}`)
  // Preload the MF master list so the first fund search is instant (fire-and-forget).
  void warmMaster()
})
