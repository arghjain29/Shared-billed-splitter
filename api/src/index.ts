import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bills } from './routes/bills'
import { homes } from './routes/homes'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Homes, members, balances
app.route('/api', homes)
// Create a bill (POST /api/homes/:homeId/bills), pay a share
app.route('/api', bills)

// ---------------------------------------------------------------------------
// Error handling: every error leaves the API as `{ error: message }`
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  // Errors thrown on purpose (400, 404, 409, 422): safe to show the message.
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  // Anything else is a bug or a database failure: log it, hide the details.
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// No route matched the URL.
app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
