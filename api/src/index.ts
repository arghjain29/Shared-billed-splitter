import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Every thrown error ends up here and leaves the API as `{ error: message }`.
app.onError((err, c) => {
  // Errors we threw on purpose (404, 422, ...): safe to show the message.
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
