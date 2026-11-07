import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { type Balance, type Bill, call, createBill, createHome, type Share } from './helpers'

// The 7 "Cases you must handle" from the README, tested more closely than the visible tests.

type ErrorBody = { error: string }

function pay(billId: string, shareId: string, key?: string) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: key ? { 'Idempotency-Key': key } : {},
  })
}

function balances(homeId: string) {
  return call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
}

function listBills(homeId: string) {
  return call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
}

/** A home with two members and one 1000-cent bill. Returns the first share. */
async function setup() {
  const { homeId, members } = await createHome(['Asha', 'Ben'])
  const bill = await createBill(homeId, 1000)
  const share = bill.body.shares[0]
  if (!share) throw new Error('bill has no shares')
  return { homeId, members, billId: bill.body.id, share }
}

// ---------------------------------------------------------------------------
// 1. A home with no members
// ---------------------------------------------------------------------------

describe('1. home with no members', () => {
  it('rejects the bill with 422 and a JSON error, and saves nothing', async () => {
    const { homeId } = await createHome([])

    const bill = await call<ErrorBody>('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Rent', totalCents: 1000 },
    })

    expect(bill.status).toBe(422)
    expect(bill.body.error).toEqual(expect.any(String))
    const listed = await listBills(homeId)
    expect(listed.body.bills).toEqual([])
  })

  it('returns an empty balances list', async () => {
    const { homeId } = await createHome([])

    const result = await balances(homeId)

    expect(result.status).toBe(200)
    expect(result.body.balances).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. An amount that is zero, negative, or not a whole number
// ---------------------------------------------------------------------------

describe('2. invalid amounts and input', () => {
  it.each([
    0,
    -1,
    -100,
    0.5,
    10.5,
    '1000',
    null,
    true,
    [1000],
    { cents: 1000 },
    2 ** 53, // too big to be an exact whole number in JavaScript
  ])('rejects totalCents %j with 422 and a JSON error', async (totalCents) => {
    const { homeId } = await createHome(['Asha'])

    const bill = await call<ErrorBody>('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Rent', totalCents },
    })

    expect(bill.status).toBe(422)
    expect(bill.body.error).toEqual(expect.any(String))
  })

  it('rejects a missing totalCents', async () => {
    const { homeId } = await createHome(['Asha'])

    const bill = await call('POST', `/api/homes/${homeId}/bills`, { body: { title: 'Rent' } })

    expect(bill.status).toBe(422)
  })

  it.each(['', '   ', null, 42])('rejects the title %j', async (title) => {
    const { homeId } = await createHome(['Asha'])

    const bill = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title, totalCents: 1000 },
    })

    expect(bill.status).toBe(422)
  })

  it.each(['', '   ', null, 42])('rejects the home name %j', async (name) => {
    const home = await call('POST', '/api/homes', { body: { name } })

    expect(home.status).toBe(422)
  })

  it('rejects a body that is not valid JSON with 400', async () => {
    const { homeId } = await createHome(['Asha'])

    // `call` always sends JSON, so build this request by hand.
    const response = await exports.default.fetch(
      new Request(`http://localhost/api/homes/${homeId}/bills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ not json',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: expect.any(String) })
  })
})

// ---------------------------------------------------------------------------
// 3. An amount that does not divide evenly
// ---------------------------------------------------------------------------

describe('3. uneven split', () => {
  it.each([
    [100, ['A', 'B', 'C'], [34, 33, 33]],
    [101, ['A', 'B', 'C'], [34, 34, 33]],
    [1, ['A', 'B', 'C'], [1, 0, 0]],
    [2, ['A', 'B', 'C'], [1, 1, 0]],
    [7, ['A', 'B'], [4, 3]],
  ])('splits %i cents as expected', async (total, names, expected) => {
    const { homeId } = await createHome(names)

    const bill = await createBill(homeId, total)

    expect(bill.status).toBe(201)
    expect(bill.body.shares.map((share) => share.amountCents)).toEqual(expected)
  })

  it('a member with a 0-cent share is not listed as owing anything', async () => {
    const { homeId } = await createHome(['A', 'B', 'C'])
    await createBill(homeId, 1)

    const result = await balances(homeId)

    expect(result.body.balances.map((b) => b.outstandingCents)).toEqual([1, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// 4. The same payment request sent twice
// ---------------------------------------------------------------------------

describe('4. same payment sent twice', () => {
  it('answers every repeat with the same result and pays only once', async () => {
    const { homeId, billId, share } = await setup()
    const key = crypto.randomUUID()

    const first = await pay(billId, share.id, key)
    const second = await pay(billId, share.id, key)
    const third = await pay(billId, share.id, key)

    expect([first.status, second.status, third.status]).toEqual([200, 200, 200])
    expect(second.body).toEqual(first.body)
    expect(third.body).toEqual(first.body)
    const result = await balances(homeId)
    expect(result.body.balances.map((b) => b.outstandingCents)).toEqual([0, 500])
  })

  it('treats a key with extra spaces as the same key', async () => {
    const { billId, share } = await setup()
    const key = crypto.randomUUID()

    const first = await pay(billId, share.id, key)
    const second = await pay(billId, share.id, `  ${key}  `)

    expect(second.status).toBe(200)
    expect(second.body.paidAt).toBe(first.body.paidAt)
  })

  it('rejects an empty Idempotency-Key with 400', async () => {
    const { billId, share } = await setup()

    const paid = await call('POST', `/api/bills/${billId}/shares/${share.id}/pay`, {
      headers: { 'Idempotency-Key': '   ' },
    })

    expect(paid.status).toBe(400)
  })

  it('a rejected request does not pay the share', async () => {
    const { homeId, billId, share } = await setup()

    await pay(billId, share.id) // no key: 400

    const result = await balances(homeId)
    expect(result.body.balances.map((b) => b.outstandingCents)).toEqual([500, 500])
  })
})

// ---------------------------------------------------------------------------
// 5. Two members paying the same share at the same time
// ---------------------------------------------------------------------------

describe('5. two payments at the same time', () => {
  it('lets exactly one of two different keys win; the other gets 409', async () => {
    const { homeId, billId, share } = await setup()

    // Promise.all sends both requests without waiting for the first to finish.
    const results = await Promise.all([
      pay(billId, share.id, crypto.randomUUID()),
      pay(billId, share.id, crypto.randomUUID()),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const result = await balances(homeId)
    expect(result.body.balances.map((b) => b.outstandingCents)).toEqual([0, 500])
  })

  it('lets exactly one of many different keys win', async () => {
    const { billId, share } = await setup()

    const results = await Promise.all(
      Array.from({ length: 10 }, () => pay(billId, share.id, crypto.randomUUID())),
    )

    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(results.filter((r) => r.status === 409)).toHaveLength(9)
  })

  it('answers the same key sent at the same time with one identical result', async () => {
    const { billId, share } = await setup()
    const key = crypto.randomUUID()

    const results = await Promise.all(Array.from({ length: 5 }, () => pay(billId, share.id, key)))

    expect(results.every((r) => r.status === 200)).toBe(true)
    const paidAts = new Set(results.map((r) => r.body.paidAt))
    expect(paidAts.size).toBe(1)
  })

  it('paying different shares at the same time works for both', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const [a, b] = bill.body.shares
    if (!a || !b) throw new Error('bill has no shares')

    const results = await Promise.all([
      pay(bill.body.id, a.id, crypto.randomUUID()),
      pay(bill.body.id, b.id, crypto.randomUUID()),
    ])

    expect(results.map((r) => r.status)).toEqual([200, 200])
    const result = await balances(homeId)
    expect(result.body.balances.map((x) => x.outstandingCents)).toEqual([0, 0])
  })
})

// ---------------------------------------------------------------------------
// 6. A bill or share that does not exist
// ---------------------------------------------------------------------------

describe('6. missing bill or share', () => {
  it('returns 404 for a share that belongs to a different bill', async () => {
    const { homeId, share } = await setup()
    const otherBill = await createBill(homeId, 500)

    const paid = await pay(otherBill.body.id, share.id, crypto.randomUUID())

    expect(paid.status).toBe(404)
  })

  it('returns 404 with a JSON error for both a missing bill and a missing share', async () => {
    const { billId, share } = await setup()

    const noBill = await call<ErrorBody>('POST', `/api/bills/nope/shares/${share.id}/pay`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    const noShare = await call<ErrorBody>('POST', `/api/bills/${billId}/shares/nope/pay`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })

    expect(noBill.status).toBe(404)
    expect(noBill.body.error).toEqual(expect.any(String))
    expect(noShare.status).toBe(404)
    expect(noShare.body.error).toEqual(expect.any(String))
  })

  it('returns 404 for every home route when the home does not exist', async () => {
    const results = await Promise.all([
      call('POST', '/api/homes/nope/members', { body: { name: 'Asha' } }),
      call('POST', '/api/homes/nope/bills', { body: { title: 'Rent', totalCents: 100 } }),
      call('GET', '/api/homes/nope/bills'),
      call('GET', '/api/homes/nope/balances'),
    ])

    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404])
  })
})

// ---------------------------------------------------------------------------
// 7. Every error is JSON (the web page relies on this)
// ---------------------------------------------------------------------------

describe('7. errors are JSON', () => {
  it('answers an unknown route with a JSON 404', async () => {
    const result = await call<ErrorBody>('GET', '/api/does-not-exist')

    expect(result.status).toBe(404)
    expect(result.body).toEqual({ error: expect.any(String) })
  })
})
