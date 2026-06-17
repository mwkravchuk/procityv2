import { createContext, useContext } from 'react'
import type { User } from '../api'

export type SessionContextValue = {
  user: User | null
  login: (displayName: string) => Promise<User>
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider')
  }
  return value
}
