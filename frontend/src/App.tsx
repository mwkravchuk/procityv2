import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  assignDraftCaptains,
  devLogin,
  getDraftState,
  getQueueState,
  joinQueue,
  leaveQueue,
  submitDraftPick,
} from './api'
import type { DraftState, MatchPlayer, QueueState, User } from './api'

const draftTeamOrder = [1, 2, 2, 1, 1, 2, 2, 1]

function App() {
  const [displayName, setDisplayName] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [queueState, setQueueState] = useState<QueueState>({ count: 0, entries: [] })
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null)
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)

  const queuedUserIds = useMemo(
    () => new Set(queueState.entries.map((entry) => entry.userId)),
    [queueState.entries],
  )

  const isQueued = user ? queuedUserIds.has(user.id) : false

  const refreshQueue = useCallback(async () => {
    try {
      const nextState = await getQueueState()
      setQueueState(nextState)
      if (!activeMatchId && nextState.mostRecentMatchId) {
        setActiveMatchId(nextState.mostRecentMatchId)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }, [activeMatchId])

  const refreshDraft = useCallback(async (matchId = activeMatchId) => {
    if (!matchId) return
    try {
      const nextDraftState = await getDraftState(matchId)
      setDraftState(nextDraftState)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [activeMatchId])

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
    if (!activeMatchId) return

    const kickoff = window.setTimeout(() => {
      void refreshDraft(activeMatchId)
    }, 0)

    const timer = window.setInterval(() => {
      void refreshDraft(activeMatchId)
    }, 2000)

    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
    }
  }, [activeMatchId, refreshDraft])

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
      if (result.createdMatchId) {
        setActiveMatchId(result.createdMatchId)
      }
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

  const handleAssignCaptains = async () => {
    if (!activeMatchId) return
    setDraftBusy(true)
    setError(null)
    setMessage(null)
    try {
      const nextDraftState = await assignDraftCaptains(activeMatchId)
      setDraftState(nextDraftState)
      setMessage(`Captains assigned for match #${activeMatchId}.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDraftBusy(false)
    }
  }

  const handlePick = async (player: MatchPlayer) => {
    if (!user || !activeMatchId || !visibleDraftState?.nextPickNumber) return
    setDraftBusy(true)
    setError(null)
    setMessage(null)
    try {
      const nextDraftState = await submitDraftPick(
        activeMatchId,
        user.id,
        player.userId,
        visibleDraftState.nextPickNumber,
      )
      setDraftState(nextDraftState)
      setMessage(`${player.displayName} drafted.`)
    } catch (e) {
      setError((e as Error).message)
      await refreshDraft(activeMatchId)
    } finally {
      setDraftBusy(false)
    }
  }

  const visibleDraftState = draftState?.match.id === activeMatchId ? draftState : null

  const signedInCaptainTeam = visibleDraftState?.captains.find((captain) => captain.userId === user?.id)?.team
  const canCurrentUserPick = Boolean(
    user &&
      visibleDraftState?.currentCaptain?.userId === user.id &&
      visibleDraftState.nextPickNumber &&
      !visibleDraftState.isComplete,
  )

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
          <p className="hint">
            Latest match id:{' '}
            <button
              className="link-button"
              type="button"
              onClick={() => setActiveMatchId(queueState.mostRecentMatchId ?? null)}
            >
              #{queueState.mostRecentMatchId}
            </button>
          </p>
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

      {activeMatchId && (
        <section className="panel draft-panel">
          <div className="section-header">
            <div>
              <h2>Draft Match #{activeMatchId}</h2>
              {visibleDraftState && (
                <p className="hint compact">
                  {visibleDraftState.match.mapName} - {visibleDraftState.match.status}
                </p>
              )}
            </div>
            <div className="controls tight">
              <button type="button" onClick={() => refreshDraft()} disabled={draftBusy}>Refresh Draft</button>
              {visibleDraftState && visibleDraftState.captains.length !== 2 && (
                <button type="button" onClick={handleAssignCaptains} disabled={draftBusy}>Assign Captains</button>
              )}
            </div>
          </div>

          {visibleDraftState ? (
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
            <p className="hint">Loading draft.</p>
          )}
        </section>
      )}
    </main>
  )
}

export default App
