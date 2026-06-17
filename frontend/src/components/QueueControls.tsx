type QueueControlsProps = {
  activeMatchId?: number
  busy: boolean
  canAct: boolean
  count: number
  isQueued: boolean
  onPrimaryAction: () => void
  onRefresh: () => void
}

export function QueueControls({
  activeMatchId,
  busy,
  canAct,
  count,
  isQueued,
  onPrimaryAction,
  onRefresh,
}: QueueControlsProps) {
  const primaryQueueLabel = activeMatchId
    ? 'Join Current Match'
    : isQueued
      ? 'Leave Queue'
      : 'Join Queue'

  return (
    <section className="panel">
      <h2>Queue Controls</h2>
      <div className="controls">
        <button type="button" onClick={onPrimaryAction} disabled={!canAct || busy}>
          {primaryQueueLabel}
        </button>
        <button type="button" onClick={onRefresh} disabled={busy}>Refresh</button>
      </div>
      <p className="hint">Queue size: <strong>{count}</strong> / 10</p>
      {activeMatchId && (
        <p className="hint">You have an active match waiting.</p>
      )}
    </section>
  )
}
