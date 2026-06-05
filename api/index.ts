// Vercel serverless entry. The vercel.json rewrite routes every /api/* request here;
// the Express app (shared with the single-process server in server/src/index.ts) does
// the actual routing on the original URL.
import app from '../server/src/app.js'

export default app
