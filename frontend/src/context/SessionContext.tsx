import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { devLogin } from '../api'
import type { User } from '../api'
import { SessionContext } from './session'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const login = useCallback(async (displayName: string) => {
    const loggedInUser = await devLogin(displayName)
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  const value = useMemo(() => ({ user, login }), [login, user])

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}
