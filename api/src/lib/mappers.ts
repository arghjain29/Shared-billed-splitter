import type {
  BalanceResponse,
  BalanceRow,
  BillShareResponse,
  BillShareRow,
  ShareResponse,
  ShareRow,
} from '../types'

// Converts database rows (snake_case) into API responses (camelCase).
// Every row-to-response conversion lives here, so the two shapes never mix.

export function toShareResponse(row: ShareRow): ShareResponse {
  return {
    id: row.id,
    memberId: row.member_id,
    amountCents: row.amount_cents,
    paidAt: row.paid_at,
  }
}

export function toBillShareResponse(row: BillShareRow): BillShareResponse {
  // Same fields as a normal share, plus the member's name.
  return { ...toShareResponse(row), memberName: row.member_name }
}

export function toBalanceResponse(row: BalanceRow): BalanceResponse {
  return {
    memberId: row.member_id,
    name: row.name,
    outstandingCents: row.outstanding_cents,
  }
}
