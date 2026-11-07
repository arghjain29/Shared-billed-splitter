import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => <Outlet />,
  // Safety net: if any page throws while rendering, show this instead of a blank screen.
  errorComponent: ({ error }) => (
    <main className="page">
      <div className="notice notice-error" role="alert">
        <p>Something went wrong: {error instanceof Error ? error.message : 'unknown error'}</p>
        <Link to="/">Go to the start page</Link>
      </div>
    </main>
  ),
  notFoundComponent: () => (
    <main className="page">
      <div className="notice">
        <p>This page does not exist.</p>
        <Link to="/">Go to the start page</Link>
      </div>
    </main>
  ),
})
