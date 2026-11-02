import type { Context } from 'hono'
import { badRequest } from './errors'

/**
 * Reads the request body as JSON.
 * Returns `unknown` so the caller must validate it before use.
 * Throws a 400 if the body is missing or not valid JSON.
 */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw badRequest('Request body must be valid JSON')
  }
}
