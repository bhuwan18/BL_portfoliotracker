// Vercel serverless entry. Every /api/* request is routed here; the Express app
// (shared with the single-process server) handles the actual routing.
import app from '../server/src/app.js'

export default app
