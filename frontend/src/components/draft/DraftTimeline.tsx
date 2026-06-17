import type { DraftState } from '../../api'

const draftTeamOrder = [1, 2, 2, 1, 1, 2, 2, 1]

type DraftTimelineProps = {
  draftState: DraftState
}

export function DraftTimeline({ draftState }: DraftTimelineProps) {
  return (
    <div>
      <h3>Draft Timeline</h3>
      <ol className="timeline">
        {draftTeamOrder.map((team, index) => {
          const pickNumber = index + 1
          const pick = draftState.picks.find((candidate) => candidate.pickNumber === pickNumber)
          const captain = draftState.captains.find((candidate) => candidate.team === team)
          const isNext = draftState.nextPickNumber === pickNumber
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
  )
}
