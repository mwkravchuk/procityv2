import type { MatchPlayer } from '../../api'

type AvailablePlayersProps = {
  canPick: boolean
  draftBusy: boolean
  players: MatchPlayer[]
  signedInCaptainTeam?: number
  onPick: (player: MatchPlayer) => void
}

export function AvailablePlayers({
  canPick,
  draftBusy,
  players,
  signedInCaptainTeam,
  onPick,
}: AvailablePlayersProps) {
  return (
    <div>
      <h3>Available Players</h3>
      {players.length === 0 ? (
        <p className="hint">No players available.</p>
      ) : (
        <div className="player-grid">
          {players.map((player) => (
            <button
              className="player-pick"
              type="button"
              key={player.userId}
              onClick={() => onPick(player)}
              disabled={!canPick || draftBusy}
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
  )
}
