export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type User = {
  id: number
  displayName: string
}

export type QueueEntry = {
  id: number
  userId: number
  displayName: string
  createdAt: string
}

export type QueueState = {
  count: number
  entries: QueueEntry[]
  mostRecentMatchId?: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error ?? 'request failed')
  }

  return payload as T
}

export function devLogin(displayName: string) {
  return request<User>('/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  })
}

export function getQueueState() {
  return request<QueueState>('/queue/state')
}

export function joinQueue(userId: number) {
  return request<{ createdMatchId?: number }>('/queue/join', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export function leaveQueue(userId: number) {
  return request<{ status: string }>('/queue/leave', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}
