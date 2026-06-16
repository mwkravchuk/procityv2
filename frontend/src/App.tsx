import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  devLogin,
  getQueueState,
  joinQueue,
  leaveQueue,
} from './api'
import type { QueueState, User } from './api'

function App() {
  const [displayName, setDisplayName] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [queueState, setQueueState] = useState<QueueState>({ count: 0, entries: [] })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const queuedUserIds = useMemo(
    () => new Set(queueState.entries.map((entry) => entry.userId)),
    [queueState.entries],
  )

  const isQueued = user ? queuedUserIds.has(user.id) : false

  const refreshQueue = async () => {
    try {
      const nextState = await getQueueState()
      setQueueState(nextState)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void refreshQueue()
    }, 0)

    const timer = window.setInterval(() => {
      void refreshQueue()
    }, 3000)

    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
    }
  }, [])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Enter a display name to continue.')
      return
    }

    setBusy(true)
    try {
      const loggedInUser = await devLogin(trimmed)
      setUser(loggedInUser)
      setMessage(`Logged in as ${loggedInUser.displayName}.`)
      await refreshQueue()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await joinQueue(user.id)
      await refreshQueue()
      setMessage(
        result.createdMatchId
          ? `Match #${result.createdMatchId} created. Queue promoted into drafting.`
          : 'You joined the queue.',
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleLeave = async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await leaveQueue(user.id)
      await refreshQueue()
      setMessage('You left the queue.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">ProcityV2 thin slice</p>
        <h1>Private Queue</h1>
        <p className="subtitle">Stub login, join queue, leave queue, and auto-promote to drafting when 10 players are queued.</p>
      </header>

      <section className="panel">
        <h2>Dev Login</h2>
        <form onSubmit={handleLogin} className="login-form">
          <input
            placeholder="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy}>Sign in (stub)</button>
        </form>
        {user && <p className="hint">Signed in as <strong>{user.displayName}</strong> (id: {user.id})</p>}
      </section>

      <section className="panel">
        <h2>Queue Controls</h2>
        <div className="controls">
          <button type="button" onClick={handleJoin} disabled={!user || busy || isQueued}>Join Queue</button>
          <button type="button" onClick={handleLeave} disabled={!user || busy || !isQueued}>Leave Queue</button>
          <button type="button" onClick={refreshQueue} disabled={busy}>Refresh</button>
        </div>
        <p className="hint">Queue size: <strong>{queueState.count}</strong> / 10</p>
        {queueState.mostRecentMatchId && (
          <p className="hint">Latest match id: <strong>#{queueState.mostRecentMatchId}</strong></p>
        )}
        {message && <p className="status success">{message}</p>}
        {error && <p className="status error">{error}</p>}
      </section>

      <section className="panel">
        <h2>Current Queue</h2>
        {queueState.entries.length === 0 ? (
          <p className="hint">No players queued yet.</p>
        ) : (
          <ol className="queue-list">
            {queueState.entries.map((entry) => (
              <li key={entry.id}>
                <span>{entry.displayName}</span>
                <small>{new Date(entry.createdAt).toLocaleTimeString()}</small>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}

export default App
