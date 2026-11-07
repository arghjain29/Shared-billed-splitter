import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getBalances, getBills, payShare } from '../api/client'
import type { Balance, Bill, BillShare } from '../api/types'

export const Route = createFileRoute('/homes/$homeId')({
  component: BillsPage,
})

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

/** The whole page is in exactly one of these states. "Empty" = ready with no bills. */
type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bills: Bill[] }

/** The balances card has its own state, so a balances error never hides the bills. */
type BalancesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; balances: Balance[] }

/** One share's Pay button. A failed payment keeps the share unpaid and shows why. */
type PayState = { status: 'idle' } | { status: 'paying' } | { status: 'error'; message: string }

const IDLE: PayState = { status: 'idle' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Amounts stay in cents everywhere; they become dollars only for display. */
function formatCents(cents: number): string {
  return money.format(cents / 100)
}

/** Returns the bills with one share marked as paid. */
function markPaid(bills: Bill[], billId: string, shareId: string, paidAt: string | null): Bill[] {
  return bills.map((bill) =>
    bill.id !== billId
      ? bill
      : {
          ...bill,
          shares: bill.shares.map((share) => (share.id === shareId ? { ...share, paidAt } : share)),
        },
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function BillsPage() {
  const { homeId } = Route.useParams()
  const [page, setPage] = useState<PageState>({ status: 'loading' })
  const [balances, setBalances] = useState<BalancesState>({ status: 'loading' })
  const [payStates, setPayStates] = useState<Record<string, PayState>>({})

  // Count loads, so an old response that arrives late is ignored.
  const latestLoad = useRef(0)
  const latestBalancesLoad = useRef(0)
  // One idempotency key per share, kept until that payment succeeds,
  // so retrying after a timeout reuses the key and can never pay twice.
  const payKeys = useRef(new Map<string, string>())

  const load = useCallback(async () => {
    const thisLoad = ++latestLoad.current
    setPage({ status: 'loading' })
    const res = await getBills(homeId)
    if (thisLoad !== latestLoad.current) return // a newer load started; drop this one
    setPage(
      res.ok ? { status: 'ready', bills: res.data.bills } : { status: 'error', message: res.error },
    )
  }, [homeId])

  /**
   * Loads balances. `showLoading: false` refreshes in the background
   * (after a payment) so the card keeps showing the old numbers until the new ones arrive.
   */
  const loadBalances = useCallback(
    async (showLoading = true) => {
      const thisLoad = ++latestBalancesLoad.current
      if (showLoading) setBalances({ status: 'loading' })
      const res = await getBalances(homeId)
      if (thisLoad !== latestBalancesLoad.current) return
      setBalances(
        res.ok
          ? { status: 'ready', balances: res.data.balances }
          : { status: 'error', message: res.error },
      )
    },
    [homeId],
  )

  useEffect(() => {
    void load()
    void loadBalances()
  }, [load, loadBalances])

  function reloadAll() {
    void load()
    void loadBalances()
  }

  function setPayState(shareId: string, state: PayState) {
    setPayStates((prev) => ({ ...prev, [shareId]: state }))
  }

  async function pay(billId: string, shareId: string) {
    let key = payKeys.current.get(shareId)
    if (!key) {
      key = crypto.randomUUID()
      payKeys.current.set(shareId, key)
    }

    setPayState(shareId, { status: 'paying' })
    const res = await payShare(billId, shareId, key)

    if (!res.ok) {
      // Payment failed: the share stays unpaid on screen, and we show why.
      setPayState(shareId, { status: 'error', message: res.error })
      return
    }

    // Only now, after the API confirmed, show the share as paid.
    payKeys.current.delete(shareId)
    setPayState(shareId, IDLE)
    setPage((prev) =>
      prev.status === 'ready'
        ? { ...prev, bills: markPaid(prev.bills, billId, shareId, res.data.paidAt) }
        : prev,
    )
    // Balances are calculated by the API, so ask it again instead of guessing here.
    void loadBalances(false)
  }

  return (
    <main className="page">
      <p>
        <Link to="/">← All homes</Link>
      </p>
      <h1>Bills</h1>

      {page.status === 'loading' && <p className="muted">Loading bills…</p>}

      {page.status === 'error' && (
        <div className="notice notice-error" role="alert">
          <p>{page.message}</p>
          <button type="button" onClick={reloadAll}>
            Try again
          </button>
        </div>
      )}

      {/* Only shown once the bills loaded, so a missing home shows one error, not two. */}
      {page.status === 'ready' && (
        <BalancesCard state={balances} onRetry={() => void loadBalances()} />
      )}

      {page.status === 'ready' && page.bills.length === 0 && (
        <div className="notice">
          <p>No bills yet for this home.</p>
        </div>
      )}

      {page.status === 'ready' &&
        page.bills.map((bill) => (
          <BillCard
            key={bill.id}
            bill={bill}
            payStates={payStates}
            onPay={(shareId) => void pay(bill.id, shareId)}
          />
        ))}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function BalancesCard(props: { state: BalancesState; onRetry: () => void }) {
  const { state, onRetry } = props

  return (
    <section className="card">
      <h2>Who owes what</h2>

      {state.status === 'loading' && <p className="muted">Loading balances…</p>}

      {state.status === 'error' && (
        <div className="share-error" role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && state.balances.length === 0 && (
        <p className="muted">This home has no members yet.</p>
      )}

      {state.status === 'ready' && state.balances.length > 0 && (
        <ul className="balances">
          {state.balances.map((balance) => (
            <li key={balance.memberId} className="balance">
              <span>{balance.name}</span>
              {balance.outstandingCents === 0 ? (
                <span className="paid">Settled</span>
              ) : (
                <span className="amount">owes {formatCents(balance.outstandingCents)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function BillCard(props: {
  bill: Bill
  payStates: Record<string, PayState>
  onPay: (shareId: string) => void
}) {
  const { bill, payStates, onPay } = props
  const paidCount = bill.shares.filter((share) => share.paidAt !== null).length

  return (
    <section className="card">
      <header className="card-header">
        <h2>{bill.title}</h2>
        <span className="amount">{formatCents(bill.totalCents)}</span>
      </header>
      <p className="muted">
        {paidCount} of {bill.shares.length} paid
      </p>
      <ul className="shares">
        {bill.shares.map((share) => (
          <ShareRow
            key={share.id}
            share={share}
            payState={payStates[share.id] ?? IDLE}
            onPay={() => onPay(share.id)}
          />
        ))}
      </ul>
    </section>
  )
}

function ShareRow(props: { share: BillShare; payState: PayState; onPay: () => void }) {
  const { share, payState, onPay } = props
  const isPaid = share.paidAt !== null

  return (
    <li className="share">
      <span className="share-name">{share.memberName}</span>
      <span className="amount">{formatCents(share.amountCents)}</span>
      <span className="share-action">
        {isPaid ? (
          <span className="paid">Paid ✓</span>
        ) : (
          <button type="button" onClick={onPay} disabled={payState.status === 'paying'}>
            {payState.status === 'paying'
              ? 'Paying…'
              : payState.status === 'error'
                ? 'Retry'
                : 'Pay'}
          </button>
        )}
      </span>
      {!isPaid && payState.status === 'error' && (
        <span className="share-error" role="alert">
          {payState.message}
        </span>
      )}
    </li>
  )
}
