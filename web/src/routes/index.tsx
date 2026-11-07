import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { createDemoHome } from '../api/client'

export const Route = createFileRoute('/')({
  component: Home,
})

type DemoState = { status: 'idle' } | { status: 'creating' } | { status: 'error'; message: string }

function Home() {
  const navigate = useNavigate()
  const [homeId, setHomeId] = useState('')
  const [demo, setDemo] = useState<DemoState>({ status: 'idle' })

  function openHome(event: FormEvent) {
    event.preventDefault()
    const id = homeId.trim()
    if (id) {
      void navigate({ to: '/homes/$homeId', params: { homeId: id } })
    }
  }

  async function startDemo() {
    setDemo({ status: 'creating' })
    const res = await createDemoHome()
    if (!res.ok) {
      setDemo({ status: 'error', message: res.error })
      return
    }
    void navigate({ to: '/homes/$homeId', params: { homeId: res.data } })
  }

  return (
    <main className="page">
      <h1>Bill Splitter</h1>

      <section className="card">
        <h2>Open a home</h2>
        <form className="row" onSubmit={openHome}>
          <label className="sr-only" htmlFor="home-id">
            Home id
          </label>
          <input
            id="home-id"
            value={homeId}
            onChange={(event) => setHomeId(event.target.value)}
            placeholder="Home id"
          />
          <button type="submit" disabled={!homeId.trim()}>
            Open
          </button>
        </form>
      </section>

      <section className="card">
        <h2>No home yet?</h2>
        <p className="muted">Creates a home with 3 members and 2 bills.</p>
        <button
          type="button"
          onClick={() => void startDemo()}
          disabled={demo.status === 'creating'}
        >
          {demo.status === 'creating' ? 'Creating…' : 'Create demo home'}
        </button>
        {demo.status === 'error' && (
          <p className="share-error" role="alert">
            {demo.message}
          </p>
        )}
      </section>
    </main>
  )
}
