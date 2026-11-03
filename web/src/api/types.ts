// Shapes the web page uses. Copied from api/src/types.ts (only what the page needs).

/** Every API call returns this instead of throwing. Check `ok` before using `data`. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** POST /api/bills/:billId/shares/:shareId/pay */
export type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

/** A share inside the bills list: also has the member's name. */
export type BillShare = Share & {
  memberName: string
}

export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: BillShare[]
}

/** GET /api/homes/:homeId/bills */
export type BillsResponse = {
  bills: Bill[]
}
