import type { IdRow } from '../types'
import { notFound } from './errors'

// Small database checks shared by several routes.

/** Throws a 404 if the home does not exist. */
export async function requireHome(db: D1Database, homeId: string): Promise<void> {
  const home = await db.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first<IdRow>()
  if (!home) {
    throw notFound('Home')
  }
}
