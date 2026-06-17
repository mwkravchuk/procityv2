import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  assignDraftCaptains,
  draftSocketUrl,
  getDraftState,
  submitDraftPick,
} from '../api'
import type { DraftState, MatchPlayer } from '../api'
import { AppHeader } from '../components/AppHeader'
import { DevLogin } from '../components/DevLogin'
import { DraftRoom } from '../components/draft/DraftRoom'
import { useSession } from '../context/session'

export function MatchPage() {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const { user } = useSession()
  const parsedMatchId = matchId ? Number(matchId) : NaN
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)

  const visibleDraftState = draftState?.match.id === parsedMatchId ? draftState : null

  const refreshDraft = useCallback(async (userId = user?.id) => {
    if (!Number.isFinite(parsedMatchId) || !userId) return
    try {
      const nextDraftState = await getDraftState(parsedMatchId, userId)
      setDraftState(nextDraftState)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [parsedMatchId, user?.id])

  useEffect(() => {
    if (!Number.isFinite(parsedMatchId) || !user) return

    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let cancelled = false

    const connect = () => {
      if (cancelled) return

      void refreshDraft(user.id)
      socket = new WebSocket(draftSocketUrl(parsedMatchId, user.id))

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
  }, [parsedMatchId, refreshDraft, user])

  const handleAssignCaptains = async () => {
    if (!user || !Number.isFinite(parsedMatchId)) return
    setDraftBusy(true)
    setError(null)
    setMessage(null)
    try {
      const nextDraftState = await assignDraftCaptains(parsedMatchId, user.id)
      setDraftState(nextDraftState)
      setMessage(`Captains assigned for match #${parsedMatchId}.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDraftBusy(false)
    }
  }

  const handlePick = async (player: MatchPlayer) => {
    if (!user || !Number.isFinite(parsedMatchId) || !visibleDraftState?.nextPickNumber) return
    setDraftBusy(true)
    setError(null)
    setMessage(null)
    try {
      const nextDraftState = await submitDraftPick(
        parsedMatchId,
        user.id,
        player.userId,
        visibleDraftState.nextPickNumber,
      )
      setDraftState(nextDraftState)
      setMessage(`${player.displayName} drafted.`)
    } catch (e) {
      setError((e as Error).message)
      await refreshDraft(user.id)
    } finally {
      setDraftBusy(false)
    }
  }

  if (!Number.isFinite(parsedMatchId) || parsedMatchId <= 0) {
    return <Navigate to="/" replace />
  }

  return (
    <>
      <AppHeader
        title={`Match #${parsedMatchId}`}
        subtitle="Live draft state is loaded from a snapshot, then kept fresh over a match WebSocket."
      />
      <DevLogin />
      <DraftRoom
        draftBusy={draftBusy}
        draftState={visibleDraftState}
        error={error}
        message={message}
        user={user}
        onAssignCaptains={handleAssignCaptains}
        onBackToQueue={() => navigate('/')}
        onPick={handlePick}
        onRefresh={() => refreshDraft()}
      />
    </>
  )
}
