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

type MatchPlayer struct {
	ID                int64  `json:"id"`
	UserID            int64  `json:"userId"`
	DisplayName       string `json:"displayName"`
	Team              *int16 `json:"team,omitempty"`
	IsCaptain         bool   `json:"isCaptain"`
	DraftPickPosition *int16 `json:"draftPickPosition,omitempty"`
}

type DraftPick struct {
	ID                 int64     `json:"id"`
	MatchID            int64     `json:"matchId"`
	PickNumber         int16     `json:"pickNumber"`
	CaptainUserID      int64     `json:"captainUserId"`
	CaptainDisplayName string    `json:"captainDisplayName"`
	PickedUserID       int64     `json:"pickedUserId"`
	PickedDisplayName  string    `json:"pickedDisplayName"`
	Team               int16     `json:"team"`
	CreatedAt          time.Time `json:"createdAt"`
}

type DraftState struct {
	Match            Match         `json:"match"`
	Captains         []MatchPlayer `json:"captains"`
	AvailablePlayers []MatchPlayer `json:"availablePlayers"`
	Picks            []DraftPick   `json:"picks"`
	NextPickNumber   *int16        `json:"nextPickNumber,omitempty"`
	CurrentCaptain   *MatchPlayer  `json:"currentCaptain,omitempty"`
	IsComplete       bool          `json:"isComplete"`
}

type QueueState struct {
	Count             int          `json:"count"`
	Entries           []QueueEntry `json:"entries"`
	MostRecentMatchID *int64       `json:"mostRecentMatchId,omitempty"`
	ActiveMatchID     *int64       `json:"activeMatchId,omitempty"`
}
