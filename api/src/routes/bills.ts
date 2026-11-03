import { Hono } from 'hono'
import { badRequest, conflict, notFound } from '../lib/errors'
import { toShareResponse } from '../lib/mappers'
import type { AppEnv, IdRow, PaidShareRow, ShareRow } from '../types'

export const bills = new Hono<AppEnv>()

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
