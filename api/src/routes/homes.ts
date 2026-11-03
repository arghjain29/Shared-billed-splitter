import { Hono } from 'hono'
import { z } from 'zod'
import { requireHome } from '../lib/db'
import { readJson } from '../lib/http'
import { toBalanceResponse } from '../lib/mappers'
import { parse } from '../lib/validate'
import type { AppEnv, BalanceRow, BalancesResponse, HomeResponse, MemberResponse } from '../types'

// Homes, their members, and what each member owes.
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Create a home. */
homes.post('/homes', async (c) => {
  const db = c.env.DB
  const { name } = parse(nameSchema, await readJson(c))
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await db
    .prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, name, createdAt)
    .run()

  const response: HomeResponse = { id, name }
  return c.json(response, 201)
})

/** Add a member to a home. Members get `seq` automatically, which records their order. */
homes.post('/homes/:homeId/members', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  await requireHome(db, homeId)

  const { name } = parse(nameSchema, await readJson(c))
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await db
    .prepare('INSERT INTO members (id, home_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, name, createdAt)
    .run()

  const response: MemberResponse = { id, homeId, name }
  return c.json(response, 201)
})

/**
 * What each member still owes: the sum of their unpaid shares across all bills.
 * Calculated from the shares on every request, so it can never drift out of sync.
 */
homes.get('/homes/:homeId/balances', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  await requireHome(db, homeId)

  // LEFT JOIN keeps members who owe nothing. The `paid_at IS NULL` check sits in
  // ON (not WHERE) so members whose shares are all paid are not dropped.
  const { results } = await db
    .prepare(
      `SELECT m.id AS member_id,
              m.name,
              COALESCE(SUM(s.amount_cents), 0) AS outstanding_cents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id AND s.paid_at IS NULL
       WHERE m.home_id = ?
       GROUP BY m.id
       ORDER BY m.seq`,
    )
    .bind(homeId)
    .all<BalanceRow>()

  const response: BalancesResponse = { balances: results.map(toBalanceResponse) }
  return c.json(response, 200)
})
