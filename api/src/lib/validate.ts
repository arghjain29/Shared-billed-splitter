import type { z } from 'zod'
import { unprocessable } from './errors'

/**
 * Checks `data` against a Zod schema and returns it typed.
 * Throws a 422 `{ error }` with the first problem if it does not match.
 */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw unprocessable(result.error.issues[0]?.message ?? 'Invalid input')
  }
  return result.data
}
