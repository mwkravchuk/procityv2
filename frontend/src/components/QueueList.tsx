import type { QueueEntry } from '../api'

type QueueListProps = {
  entries: QueueEntry[]
}

export function QueueList({ entries }: QueueListProps) {
  return (
    <section className="panel">
      <h2>Current Queue</h2>
      {entries.length === 0 ? (
        <p className="hint">No players queued yet.</p>
      ) : (
        <ol className="queue-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.displayName}</span>
              <small>{new Date(entry.createdAt).toLocaleTimeString()}</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
