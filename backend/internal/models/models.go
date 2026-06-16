package models

import "time"

type User struct {
	ID          int64     `json:"id"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type QueueEntry struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Match struct {
	ID        int64      `json:"id"`
	SeasonID  int64      `json:"seasonId"`
	Status    string     `json:"status"`
	MapName   string     `json:"mapName"`
	CreatedAt time.Time  `json:"createdAt"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
	EndedAt   *time.Time `json:"endedAt,omitempty"`
}

type QueueState struct {
	Count             int          `json:"count"`
	Entries           []QueueEntry `json:"entries"`
	MostRecentMatchID *int64       `json:"mostRecentMatchId,omitempty"`
}
