package queue

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/procity/procityv2/backend/internal/models"
)

var (
	ErrAlreadyQueued = errors.New("player is already in queue")
	ErrNotQueued     = errors.New("player is not in queue")
	ErrNoActiveMaps  = errors.New("no active maps configured")
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{
		pool: pool,
	}
}

type JoinResult struct {
	CreatedMatchID *int64 `json:"createdMatchId,omitempty"`
}

func (s *Service) Join(ctx context.Context, userID int64) (JoinResult, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return JoinResult{}, err
	}
	defer tx.Rollback(ctx)

	insertTag, err := tx.Exec(ctx, `
		INSERT INTO queue_entries (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO NOTHING
	`, userID)
	if err != nil {
		return JoinResult{}, err
	}
	if insertTag.RowsAffected() == 0 {
		return JoinResult{}, ErrAlreadyQueued
	}

	var count int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM queue_entries`).Scan(&count); err != nil {
		return JoinResult{}, err
	}

	if count < 10 {
		if err := tx.Commit(ctx); err != nil {
			return JoinResult{}, err
		}
		return JoinResult{}, nil
	}

	rows, err := tx.Query(ctx, `
		SELECT id, user_id
		FROM queue_entries
		ORDER BY created_at ASC, id ASC
		LIMIT 10
		FOR UPDATE SKIP LOCKED
	`)
	if err != nil {
		return JoinResult{}, err
	}
	defer rows.Close()

	entryIDs := make([]int64, 0, 10)
	userIDs := make([]int64, 0, 10)
	for rows.Next() {
		var entryID int64
		var queuedUserID int64
		if err := rows.Scan(&entryID, &queuedUserID); err != nil {
			return JoinResult{}, err
		}
		entryIDs = append(entryIDs, entryID)
		userIDs = append(userIDs, queuedUserID)
	}
	if rows.Err() != nil {
		return JoinResult{}, rows.Err()
	}

	if len(entryIDs) < 10 {
		if err := tx.Commit(ctx); err != nil {
			return JoinResult{}, err
		}
		return JoinResult{}, nil
	}

	var seasonID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM seasons WHERE is_active = true LIMIT 1`).Scan(&seasonID); err != nil {
		return JoinResult{}, fmt.Errorf("no active season configured: %w", err)
	}

	selectedMap, err := s.selectRandomActiveMap(ctx, tx)
	if err != nil {
		return JoinResult{}, err
	}

	var matchID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO matches (season_id, status, map_name)
		VALUES ($1, 'drafting', $2)
		RETURNING id
	`, seasonID, selectedMap).Scan(&matchID); err != nil {
		return JoinResult{}, err
	}

	for pick, queuedUserID := range userIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO match_players (match_id, user_id, draft_pick_position)
			VALUES ($1, $2, $3)
		`, matchID, queuedUserID, pick+1); err != nil {
			return JoinResult{}, err
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM queue_entries WHERE id = ANY($1)`, entryIDs); err != nil {
		return JoinResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return JoinResult{}, err
	}

	return JoinResult{CreatedMatchID: &matchID}, nil
}

func (s *Service) selectRandomActiveMap(ctx context.Context, tx pgx.Tx) (string, error) {
	var selectedMap string
	err := tx.QueryRow(ctx, `
		SELECT name
		FROM maps
		WHERE is_active = true
		ORDER BY random()
		LIMIT 1
	`).Scan(&selectedMap)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNoActiveMaps
	}
	if err != nil {
		return "", err
	}
	return selectedMap, nil
}

func (s *Service) Leave(ctx context.Context, userID int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM queue_entries WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotQueued
	}
	return nil
}

func (s *Service) State(ctx context.Context) (models.QueueState, error) {
	state := models.QueueState{}

	var count int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM queue_entries`).Scan(&count); err != nil {
		return state, err
	}
	state.Count = count

	rows, err := s.pool.Query(ctx, `
		SELECT qe.id, qe.user_id, u.display_name, qe.created_at
		FROM queue_entries qe
		JOIN users u ON u.id = qe.user_id
		ORDER BY qe.created_at ASC, qe.id ASC
	`)
	if err != nil {
		return state, err
	}
	defer rows.Close()

	entries := make([]models.QueueEntry, 0, count)
	for rows.Next() {
		var e models.QueueEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.DisplayName, &e.CreatedAt); err != nil {
			return state, err
		}
		entries = append(entries, e)
	}
	if rows.Err() != nil {
		return state, rows.Err()
	}
	state.Entries = entries

	var latestID int64
	err = s.pool.QueryRow(ctx, `SELECT id FROM matches ORDER BY id DESC LIMIT 1`).Scan(&latestID)
	if err == nil {
		state.MostRecentMatchID = &latestID
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return state, err
	}

	return state, nil
}
