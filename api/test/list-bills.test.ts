import { describe, expect, it } from 'vitest'
import { call, createBill, createHome, type Share } from './helpers'

// Shape of GET /api/homes/:homeId/bills (only the fields these tests read).
type ListedShare = Share & { memberName: string }
type ListedBill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: ListedShare[]
}
type BillsList = { bills: ListedBill[] }

function listBills(homeId: string) {
  return call<BillsList>('GET', `/api/homes/${homeId}/bills`)
}

describe('list bills', () => {
  it('lists a bill with its shares, in member order, with member names', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])
    const created = await createBill(homeId, 1001)

    const listed = await listBills(homeId)

    expect(listed.status).toBe(200)
    expect(listed.body.bills).toHaveLength(1)
    const bill = listed.body.bills[0]
    expect(bill).toMatchObject({
      id: created.body.id,
      homeId,
      title: 'Electricity',
      totalCents: 1001,
    })
    expect(bill?.shares.map((share) => share.memberId)).toEqual(members.map((m) => m.id))
    expect(bill?.shares.map((share) => share.memberName)).toEqual(['Asha', 'Ben'])
    expect(bill?.shares.map((share) => share.amountCents)).toEqual([501, 500])
  })

  it('lists the newest bill first and keeps shares with their own bill', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const first = await createBill(homeId, 1000)
    const second = await createBill(homeId, 300)

    const listed = await listBills(homeId)

    expect(listed.body.bills.map((bill) => bill.id)).toEqual([second.body.id, first.body.id])
    expect(listed.body.bills.map((bill) => bill.shares.map((s) => s.amountCents))).toEqual([
      [150, 150],
      [500, 500],
    ])
  })

  it('shows paidAt after a share is paid', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const created = await createBill(homeId, 1000)
    const share = created.body.shares[0]
    if (!share) throw new Error('bill has no shares')

    await call('POST', `/api/bills/${created.body.id}/shares/${share.id}/pay`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    const listed = await listBills(homeId)

    const shares = listed.body.bills[0]?.shares
    expect(shares?.[0]?.paidAt).toEqual(expect.any(String))
    expect(shares?.[1]?.paidAt).toBeNull()
  })

  it('returns an empty list for a home with no bills', async () => {
    const { homeId } = await createHome(['Asha'])

    const listed = await listBills(homeId)

    expect(listed.status).toBe(200)
    expect(listed.body.bills).toEqual([])
  })

  it('returns 404 when the home does not exist', async () => {
    const listed = await listBills('does-not-exist')

    expect(listed.status).toBe(404)
  })
})
