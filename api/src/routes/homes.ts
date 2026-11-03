import { Hono } from 'hono'
import { z } from 'zod'
import { notFound, unprocessable } from '../lib/errors'
import { readJson } from '../lib/http'
import { splitCents } from '../lib/split'
import { parse } from '../lib/validate'
import type { AppEnv, ShareResponse } from '../types'

export const homes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Name is required' })
    .max(100, { message: 'Name must be at most 100 characters' }),
})

const createBillSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Title is required' })
    .max(100, { message: 'Title must be at most 100 characters' }),
  totalCents: z
    .number({ message: 'totalCents must be a number' })
    .int({ message: 'totalCents must be a whole number of cents' })
    .positive({ message: 'totalCents must be greater than 0' }),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Throws a 404 if the home does not exist. */
async function requireHome(db: D1Database, homeId: string): Promise<void> {
  const home = await db.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    throw notFound('Home')
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

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
  await requireHome(c.env.DB, homeId)

  const { name } = parse(nameSchema, await readJson(c))
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, name, createdAt)
    .run()

  return c.json({ id, homeId, name }, 201)
})

homes.post('/homes/:homeId/bills', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  await requireHome(db, homeId)

  const { title, totalCents } = parse(createBillSchema, await readJson(c))

  // Members in the order they were added: this order decides who gets the extra cents.
  const { results: members } = await db
    .prepare('SELECT id FROM members WHERE home_id = ? ORDER BY seq')
    .bind(homeId)
    .all<{ id: string }>()
  if (members.length === 0) {
    throw unprocessable('Home has no members')
  }

  const amounts = splitCents(totalCents, members.length)
  const billId = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  // The bill and all its shares go into ONE batch: all rows are saved, or none.
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(billId, homeId, title, totalCents, createdAt),
  ]
  const shares: ShareResponse[] = []

  for (let i = 0; i < members.length; i++) {
    const member = members[i]
    const amountCents = amounts[i]
    if (member === undefined || amountCents === undefined) {
      throw new Error('split length does not match member count') // cannot happen
    }

    const shareId = crypto.randomUUID()
    statements.push(
      db
        .prepare(
          'INSERT INTO shares (id, home_id, bill_id, member_id, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(shareId, homeId, billId, member.id, amountCents, createdAt),
    )
    shares.push({ id: shareId, memberId: member.id, amountCents, paidAt: null })
  }

  await db.batch(statements)

  return c.json({ id: billId, homeId, title, totalCents, shares }, 201)
})
