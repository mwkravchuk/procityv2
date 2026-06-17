export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export const API_WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

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
  activeMatchId?: number
}

export type Match = {
  id: number
  seasonId: number
  status: string
  mapName: string
  createdAt: string
  startedAt?: string
  endedAt?: string
}

export type MatchPlayer = {
  id: number
  userId: number
  displayName: string
  team?: number
  isCaptain: boolean
  draftPickPosition?: number
}

export type DraftPick = {
  id: number
  matchId: number
  pickNumber: number
  captainUserId: number
  captainDisplayName: string
  pickedUserId: number
  pickedDisplayName: string
  team: number
  createdAt: string
}

export type DraftState = {
  match: Match
  captains: MatchPlayer[]
  availablePlayers: MatchPlayer[]
  picks: DraftPick[]
  nextPickNumber?: number
  currentCaptain?: MatchPlayer
  isComplete: boolean
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

export function getQueueState(userId?: number) {
  const query = userId ? `?userId=${userId}` : ''
  return request<QueueState>(`/queue/state${query}`)
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

export function assignDraftCaptains(matchId: number, userId: number) {
  return request<DraftState>(`/matches/${matchId}/draft/captains?userId=${userId}`, {
    method: 'POST',
  })
}

export function getDraftState(matchId: number, userId: number) {
  return request<DraftState>(`/matches/${matchId}/draft/state?userId=${userId}`)
}

export function draftSocketUrl(matchId: number, userId: number) {
  return `${API_WS_BASE_URL}/matches/${matchId}/draft/ws?userId=${userId}`
}

export function submitDraftPick(
  matchId: number,
  captainUserId: number,
  pickedUserId: number,
  pickNumber: number,
) {
  return request<DraftState>(`/matches/${matchId}/draft/picks`, {
    method: 'POST',
    body: JSON.stringify({ captainUserId, pickedUserId, pickNumber }),
  })
}
