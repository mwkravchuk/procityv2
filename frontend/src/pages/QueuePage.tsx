import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getQueueState, joinQueue, leaveQueue } from '../api'
import type { QueueState } from '../api'
import { AppHeader } from '../components/AppHeader'
import { DevLogin } from '../components/DevLogin'
import { QueueControls } from '../components/QueueControls'
import { QueueList } from '../components/QueueList'
import { useSession } from '../context/session'

export function QueuePage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const [queueState, setQueueState] = useState<QueueState>({ count: 0, entries: [] })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const queuedUserIds = useMemo(
    () => new Set(queueState.entries.map((entry) => entry.userId)),
    [queueState.entries],
  )

  const isQueued = user ? queuedUserIds.has(user.id) : false
  const activeMatchId = queueState.activeMatchId

  const refreshQueue = useCallback(async (userId = user?.id) => {
    try {
      const nextState = await getQueueState(userId)
      setQueueState(nextState)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [user?.id])

  const navigateToMatch = useCallback((matchId: number) => {
    navigate(`/matches/${matchId}`)
  }, [navigate])

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
    if (!user || !activeMatchId) return
    navigateToMatch(activeMatchId)
  }, [activeMatchId, navigateToMatch, user])

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

  return (
    <>
      <AppHeader
        title="Private Queue"
        subtitle="Stub login, join queue, leave queue, and jump into your active match."
      />
      <DevLogin />
      <QueueControls
        activeMatchId={activeMatchId}
        busy={busy}
        canAct={Boolean(user)}
        count={queueState.count}
        isQueued={isQueued}
        onPrimaryAction={handlePrimaryQueueAction}
        onRefresh={() => refreshQueue()}
      />
      {message && <p className="status success">{message}</p>}
      {error && <p className="status error">{error}</p>}
      <QueueList entries={queueState.entries} />
    </>
  )
}
