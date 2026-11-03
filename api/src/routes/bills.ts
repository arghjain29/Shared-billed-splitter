import { Hono } from 'hono'
import { z } from 'zod'
import { requireHome } from '../lib/db'
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors'
import { readJson } from '../lib/http'
import { toShareResponse } from '../lib/mappers'
import { splitCents } from '../lib/split'
import { parse } from '../lib/validate'
import type { AppEnv, BillResponse, IdRow, PaidShareRow, ShareResponse, ShareRow } from '../types'

// Bills: create a bill split between members, and pay a share.
export const bills = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

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
// Routes
// ---------------------------------------------------------------------------

/** Create a bill and split it between all members of the home. */
bills.post('/homes/:homeId/bills', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  await requireHome(db, homeId)

  const { title, totalCents } = parse(createBillSchema, await readJson(c))

  // Members in the order they were added: this order decides who gets the extra cents.
  const { results: members } = await db
    .prepare('SELECT id FROM members WHERE home_id = ? ORDER BY seq')
    .bind(homeId)
    .all<IdRow>()
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
          `INSERT INTO shares (id, home_id, bill_id, member_id, amount_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(shareId, homeId, billId, member.id, amountCents, createdAt),
    )
    shares.push({ id: shareId, memberId: member.id, amountCents, paidAt: null })
  }

  await db.batch(statements)

  const response: BillResponse = { id: billId, homeId, title, totalCents, shares }
  return c.json(response, 201)
})

/**
 * Pay one share. Safe to retry with the same Idempotency-Key,
 * and safe when two requests try to pay the same share at once.
 */
bills.post('/bills/:billId/shares/:shareId/pay', async (c) => {
  const db = c.env.DB
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  // 1. The client must send a key so a retried request can be recognised.
  const key = c.req.header('Idempotency-Key')?.trim()
  if (!key) {
    throw badRequest('Idempotency-Key header is required')
  }
  if (key.length > 255) {
    throw badRequest('Idempotency-Key header must be at most 255 characters')
  }

  // 2. Try to pay. The `paid_at IS NULL` check and the write happen in ONE
  //    statement, so if two requests race, only one can change the row.
  const paidAt = new Date().toISOString()
  const paid = await db
    .prepare(
      `UPDATE shares
       SET paid_at = ?, idempotency_key = ?
       WHERE id = ? AND bill_id = ? AND paid_at IS NULL
       RETURNING id, member_id, amount_cents, paid_at`,
    )
    .bind(paidAt, key, shareId, billId)
    .first<ShareRow>()

  if (paid) {
    return c.json(toShareResponse(paid), 200)
  }

  // 3. Nothing was updated. Find out why.
  const existing = await db
    .prepare(
      `SELECT id, member_id, amount_cents, paid_at, idempotency_key
       FROM shares
       WHERE id = ? AND bill_id = ?`,
    )
    .bind(shareId, billId)
    .first<PaidShareRow>()

  if (!existing) {
    // Say which one is missing: the bill, or the share on that bill.
    const bill = await db.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first<IdRow>()
    throw notFound(bill ? 'Share' : 'Bill')
  }

  // Same key as the payment that went through: a retry. Return the stored result.
  if (existing.idempotency_key === key) {
    return c.json(toShareResponse(existing), 200)
  }

  // Already paid by a different request.
  throw conflict('Share is already paid')
})
