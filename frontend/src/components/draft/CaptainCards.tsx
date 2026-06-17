import type { DraftState } from '../../api'

type CaptainCardsProps = {
  draftState: DraftState
}

export function CaptainCards({ draftState }: CaptainCardsProps) {
  return (
    <div className="captain-grid">
      {[1, 2].map((team) => {
        const captain = draftState.captains.find((candidate) => candidate.team === team)
        const isOnClock = draftState.currentCaptain?.userId === captain?.userId
        return (
          <div className={`captain-box team-${team}`} key={team}>
            <span>Team {team} Captain</span>
            <strong>{captain?.displayName ?? 'Unassigned'}</strong>
            {isOnClock && <small>On the clock</small>}
          </div>
        )
      })}
    </div>
  )
}
