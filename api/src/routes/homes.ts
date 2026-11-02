import { Hono } from 'hono'
import { z } from 'zod'
import { notFound } from '../lib/errors'
import { readJson } from '../lib/http'
import { parse } from '../lib/validate'
import type { AppEnv } from '../types'

export const homes = new Hono<AppEnv>()

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Name is required' })
    .max(100, { message: 'Name must be at most 100 characters' }),
})

homes.post('/homes', async (c) => {
  const { name } = parse(nameSchema, await readJson(c))
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, name, createdAt)
    .run()
  return c.json({ id, name }, 201)
})

homes.post('/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  // Checks that the home exists before adding a member to it.
  const result = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>() // returns the row or null
  if (!result) {
    throw notFound('Home')
  }
  // then validate the request body and insert the member
  const { name } = parse(nameSchema, await readJson(c))
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await c.env.DB.prepare('INSERT INTO members (id, home_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, name, createdAt)
    .run()
  return c.json({ id, homeId, name }, 201)
})
