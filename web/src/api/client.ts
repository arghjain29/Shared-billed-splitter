import type { BillsResponse, Result, Share } from './types'

// Give up on a request after this long, so a slow API can't leave the page stuck.
const TIMEOUT_MS = 8000

/**
 * Calls the API and NEVER throws. Every outcome becomes a Result:
 * success, API error, server down, timeout, or a broken (non-JSON) response.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  // 1. Send the request. fetch throws on network failure or timeout.
  let res: Response
  try {
    res = await fetch(path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { ok: false, error: 'The server took too long to answer. Please try again.' }
    }
    return { ok: false, error: "Can't reach the server. Check your connection and try again." }
  }

  // 2. Read the body once, as text, then try to parse it.
  //    A crashed server may send HTML or nothing, which would make res.json() throw.
  let body: unknown = null
  try {
    const text = await res.text()
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }

  // 3. Error status: use the API's `{ error }` message if there is one.
  if (!res.ok) {
    return { ok: false, error: errorMessage(body) ?? `Server error (${res.status})` }
  }

  // 4. Success. `as T`: we trust our own API's response shape.
  return { ok: true, data: body as T }
}

/** Reads `{ error: string }` from an unknown body, without using `any`. */
function errorMessage(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body
    if (typeof error === 'string') {
      return error
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// API calls used by the page
// ---------------------------------------------------------------------------

export function getBills(homeId: string): Promise<Result<BillsResponse>> {
  return request<BillsResponse>(`/api/homes/${encodeURIComponent(homeId)}/bills`)
}

/**
 * Pays one share. Reuse the SAME idempotencyKey when retrying the same payment,
 * so a retry after a timeout can never pay twice.
 */
export function payShare(
  billId: string,
  shareId: string,
  idempotencyKey: string,
): Promise<Result<Share>> {
  const path = `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`
  return request<Share>(path, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
