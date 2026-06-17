import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '../context/session'

export function DevLogin() {
  const { user, login } = useSession()
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
      const loggedInUser = await login(trimmed)
      setMessage(`Logged in as ${loggedInUser.displayName}.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
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
      {message && <p className="status success">{message}</p>}
      {error && <p className="status error">{error}</p>}
    </section>
  )
}
