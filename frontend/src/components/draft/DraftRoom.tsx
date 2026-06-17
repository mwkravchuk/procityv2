import type { DraftState, MatchPlayer, User } from '../../api'
import { AvailablePlayers } from './AvailablePlayers'
import { CaptainCards } from './CaptainCards'
import { DraftTimeline } from './DraftTimeline'

type DraftRoomProps = {
  draftBusy: boolean
  draftState: DraftState | null
  error: string | null
  message: string | null
  user: User | null
  onAssignCaptains: () => void
  onBackToQueue: () => void
  onPick: (player: MatchPlayer) => void
  onRefresh: () => void
}

export function DraftRoom({
  draftBusy,
  draftState,
  error,
  message,
  user,
  onAssignCaptains,
  onBackToQueue,
  onPick,
  onRefresh,
}: DraftRoomProps) {
  const signedInCaptainTeam = draftState?.captains.find((captain) => captain.userId === user?.id)?.team
  const canCurrentUserPick = Boolean(
    user &&
      draftState?.currentCaptain?.userId === user.id &&
      draftState.nextPickNumber &&
      !draftState.isComplete,
  )

  return (
    <section className="panel draft-panel">
      <div className="section-header">
        <div>
          <h2>Draft Room</h2>
          {draftState && (
            <p className="hint compact">
              {draftState.match.mapName} - {draftState.match.status}
            </p>
          )}
        </div>
        <div className="controls tight">
          <button type="button" onClick={onBackToQueue} disabled={draftBusy}>Back to Queue</button>
          <button type="button" onClick={onRefresh} disabled={!user || draftBusy}>Refresh Snapshot</button>
          {draftState && draftState.captains.length !== 2 && (
            <button type="button" onClick={onAssignCaptains} disabled={!user || draftBusy}>Assign Captains</button>
          )}
        </div>
      </div>

      {!user ? (
        <p className="hint">Sign in to access this match.</p>
      ) : draftState ? (
        <>
          <CaptainCards draftState={draftState} />
          <div className="draft-layout">
            <AvailablePlayers
              canPick={canCurrentUserPick}
              draftBusy={draftBusy}
              players={draftState.availablePlayers}
              signedInCaptainTeam={signedInCaptainTeam}
              onPick={onPick}
            />
            <DraftTimeline draftState={draftState} />
          </div>
        </>
      ) : (
        <p className="hint">Loading match.</p>
      )}

      {message && <p className="status success">{message}</p>}
      {error && <p className="status error">{error}</p>}
    </section>
  )
}
