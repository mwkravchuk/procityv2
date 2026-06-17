import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useMatch, useNavigate } from 'react-router-dom'
import './App.css'
import {
  assignDraftCaptains,
  devLogin,
  draftSocketUrl,
  getDraftState,
  getQueueState,
  joinQueue,
  leaveQueue,
  submitDraftPick,
} from './api'
import type { DraftState, MatchPlayer, QueueState, User } from './api'

const draftTeamOrder = [1, 2, 2, 1, 1, 2, 2, 1]

function AppContent() {
  const navigate = useNavigate()
  const matchRoute = useMatch('/matches/:matchId')
  const [displayName, setDisplayName] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [queueState, setQueueState] = useState<QueueState>({ count: 0, entries: [] })
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)

  const routeMatchId = matchRoute?.params.matchId ? Number(matchRoute.params.matchId) : null
  const visibleDraftState = draftState?.match.id === routeMatchId ? draftState : null

  const queuedUserIds = useMemo(
    () => new Set(queueState.entries.map((entry) => entry.userId)),
    [queueState.entries],
  )

  const isQueued = user ? queuedUserIds.has(user.id) : false
  const activeMatchId = queueState.activeMatchId
  const signedInCaptainTeam = visibleDraftState?.captains.find((captain) => captain.userId === user?.id)?.team
  const canCurrentUserPick = Boolean(
    user &&
      visibleDraftState?.currentCaptain?.userId === user.id &&
      visibleDraftState.nextPickNumber &&
      !visibleDraftState.isComplete,
  )

  const navigateToMatch = useCallback((matchId: number) => {
    navigate(`/matches/${matchId}`)
  }, [navigate])

  const refreshQueue = useCallback(async (userId = user?.id) => {
    try {
      const nextState = await getQueueState(userId)
      setQueueState(nextState)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [user?.id])

  const refreshDraft = useCallback(async (matchId = routeMatchId, userId = user?.id) => {
    if (!matchId || !userId) return
    try {
      const nextDraftState = await getDraftState(matchId, userId)
      setDraftState(nextDraftState)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [routeMatchId, user?.id])

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
  }, [refreshQueue])

  useEffect(() => {
    if (!routeMatchId || !user) return

    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let cancelled = false

    const connect = () => {
      if (cancelled) return

      void refreshDraft(routeMatchId, user.id)
      socket = new WebSocket(draftSocketUrl(routeMatchId, user.id))

      socket.onmessage = (event) => {
        setDraftState(JSON.parse(event.data) as DraftState)
        setError(null)
      }

      socket.onclose = () => {
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, 1000)
        }
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    const kickoff = window.setTimeout(connect, 0)

    return () => {
      cancelled = true
      window.clearTimeout(kickoff)
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer)
      }
      socket?.close()
    }
  }, [refreshDraft, routeMatchId, user])

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
      await refreshQueue(loggedInUser.id)
      if (routeMatchId) {
        await refreshDraft(routeMatchId, loggedInUser.id)
      }
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
      await refreshQueue(user.id)
      if (result.createdMatchId) {
        navigateToMatch(result.createdMatchId)
        setMessage(`Match #${result.createdMatchId} created. Queue promoted into drafting.`)
        return
      }
      setMessage('You joined the queue.')
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
      await refreshQueue(user.id)
      setMessage('You left the queue.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handlePrimaryQueueAction = () => {
    if (activeMatchId) {
      navigateToMatch(activeMatchId)
      return
    }
    if (isQueued) {
      void handleLeave()
      return
    }
    void handleJoin()
  }

  const handleAssignCaptains = async () => {
    if (!routeMatchId || !user) return
    setDraftBusy(true)
    setError(null)
    setMessage(null)
    try {
      const nextDraftState = await assignDraftCaptains(routeMatchId, user.id)
      setDraftState(nextDraftState)
      setMessage(`Captains assigned for match #${routeMatchId}.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDraftBusy(false)
    }
  }

  const handlePick = async (player: MatchPlayer) => {
    if (!user || !routeMatchId || !visibleDraftState?.nextPickNumber) return
    setDraftBusy(true)
    setError(null)
    setMessage(null)
    try {
      const nextDraftState = await submitDraftPick(
        routeMatchId,
        user.id,
        player.userId,
        visibleDraftState.nextPickNumber,
      )
      setDraftState(nextDraftState)
      setMessage(`${player.displayName} drafted.`)
    } catch (e) {
      setError((e as Error).message)
      await refreshDraft(routeMatchId, user.id)
    } finally {
      setDraftBusy(false)
    }
  }

  const primaryQueueLabel = activeMatchId
    ? 'Join Current Match'
    : isQueued
      ? 'Leave Queue'
      : 'Join Queue'

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">ProcityV2 thin slice</p>
        <h1>{routeMatchId ? `Match #${routeMatchId}` : 'Private Queue'}</h1>
        <p className="subtitle">
          {routeMatchId
            ? 'Live draft state is loaded from a snapshot, then kept fresh over a match WebSocket.'
            : 'Stub login, join queue, leave queue, and jump into your active match.'}
        </p>
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

      <Routes>
        <Route
          path="/"
          element={(
            <>
              <section className="panel">
                <h2>Queue Controls</h2>
                <div className="controls">
                  <button type="button" onClick={handlePrimaryQueueAction} disabled={!user || busy}>
                    {primaryQueueLabel}
                  </button>
                  <button type="button" onClick={() => refreshQueue()} disabled={busy}>Refresh</button>
                </div>
                <p className="hint">Queue size: <strong>{queueState.count}</strong> / 10</p>
                {activeMatchId && (
                  <p className="hint">You have an active match waiting.</p>
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
            </>
          )}
        />

        <Route
          path="/matches/:matchId"
          element={(
            <section className="panel draft-panel">
              <div className="section-header">
                <div>
                  <h2>Draft Room</h2>
                  {visibleDraftState && (
                    <p className="hint compact">
                      {visibleDraftState.match.mapName} - {visibleDraftState.match.status}
                    </p>
                  )}
                </div>
                <div className="controls tight">
                  <button type="button" onClick={() => navigate('/')} disabled={draftBusy}>Back to Queue</button>
                  <button type="button" onClick={() => refreshDraft()} disabled={!user || draftBusy}>Refresh Snapshot</button>
                  {visibleDraftState && visibleDraftState.captains.length !== 2 && (
                    <button type="button" onClick={handleAssignCaptains} disabled={!user || draftBusy}>Assign Captains</button>
                  )}
                </div>
              </div>

              {!user ? (
                <p className="hint">Sign in to access this match.</p>
              ) : visibleDraftState ? (
                <>
                  <div className="captain-grid">
                    {[1, 2].map((team) => {
                      const captain = visibleDraftState.captains.find((candidate) => candidate.team === team)
                      const isOnClock = visibleDraftState.currentCaptain?.userId === captain?.userId
                      return (
                        <div className={`captain-box team-${team}`} key={team}>
                          <span>Team {team} Captain</span>
                          <strong>{captain?.displayName ?? 'Unassigned'}</strong>
                          {isOnClock && <small>On the clock</small>}
                        </div>
                      )
                    })}
                  </div>

                  <div className="draft-layout">
                    <div>
                      <h3>Available Players</h3>
                      {visibleDraftState.availablePlayers.length === 0 ? (
                        <p className="hint">No players available.</p>
                      ) : (
                        <div className="player-grid">
                          {visibleDraftState.availablePlayers.map((player) => (
                            <button
                              className="player-pick"
                              type="button"
                              key={player.userId}
                              onClick={() => handlePick(player)}
                              disabled={!canCurrentUserPick || draftBusy}
                            >
                              <span>{player.displayName}</span>
                              <small>Draft</small>
                            </button>
                          ))}
                        </div>
                      )}
                      {signedInCaptainTeam && (
                        <p className="hint">You are Team {signedInCaptainTeam} captain.</p>
                      )}
                    </div>

                    <div>
                      <h3>Draft Timeline</h3>
                      <ol className="timeline">
                        {draftTeamOrder.map((team, index) => {
                          const pickNumber = index + 1
                          const pick = visibleDraftState.picks.find((candidate) => candidate.pickNumber === pickNumber)
                          const captain = visibleDraftState.captains.find((candidate) => candidate.team === team)
                          const isNext = visibleDraftState.nextPickNumber === pickNumber
                          return (
                            <li className={isNext ? 'next-pick' : ''} key={pickNumber}>
                              <span className="pick-number">{pickNumber}</span>
                              <div>
                                <strong>{pick?.pickedDisplayName ?? 'Pending'}</strong>
                                <small>
                                  Team {team} - {pick?.captainDisplayName ?? captain?.displayName ?? 'Captain pending'}
                                </small>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  </div>
                </>
              ) : (
                <p className="hint">Loading match.</p>
              )}

              {message && <p className="status success">{message}</p>}
              {error && <p className="status error">{error}</p>}
            </section>
          )}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
