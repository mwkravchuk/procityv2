package draft

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/procity/procityv2/backend/internal/models"
)

var (
	ErrMatchNotFound       = errors.New("match not found")
	ErrMatchNotDrafting    = errors.New("match is not drafting")
	ErrInvalidCaptains     = errors.New("match has an invalid captain state")
	ErrDraftComplete       = errors.New("draft is complete")
	ErrInvalidPickNumber   = errors.New("pickNumber is not the next draft pick")
	ErrNotCaptainTurn      = errors.New("captain is not on the clock")
	ErrPlayerUnavailable   = errors.New("player is not available to draft")
	ErrExpectedTwoCaptains = errors.New("match must have exactly two captains")
	ErrMatchAccessDenied   = errors.New("user is not in this match")
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) AssignCaptains(ctx context.Context, matchID int64) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, `
		SELECT status
		FROM matches
		WHERE id = $1
		FOR UPDATE
	`, matchID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMatchNotFound
	}
	if err != nil {
		return err
	}

	var captainCount int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM match_players
		WHERE match_id = $1 AND is_captain = true
	`, matchID).Scan(&captainCount); err != nil {
		return err
	}

	if captainCount == 2 {
		return tx.Commit(ctx)
	}
	if captainCount != 0 {
		return ErrInvalidCaptains
	}
	if status != "drafting" {
		return ErrMatchNotDrafting
	}

	tag, err := tx.Exec(ctx, `
		WITH selected AS (
			SELECT id, ROW_NUMBER() OVER ()::smallint AS team
			FROM (
				SELECT id
				FROM match_players
				WHERE match_id = $1
				ORDER BY random()
				LIMIT 2
			) random_players
		)
		UPDATE match_players mp
		SET is_captain = true,
			team = selected.team
		FROM selected
		WHERE mp.id = selected.id
	`, matchID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 2 {
		return ErrExpectedTwoCaptains
	}

	return tx.Commit(ctx)
}

type SubmitPickInput struct {
	CaptainUserID int64
	PickedUserID  int64
	PickNumber    int16
}

func (s *Service) SubmitPick(ctx context.Context, matchID int64, input SubmitPickInput) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, `
		SELECT status
		FROM matches
		WHERE id = $1
		FOR UPDATE
	`, matchID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMatchNotFound
	}
	if err != nil {
		return err
	}
	if status != "drafting" {
		return ErrMatchNotDrafting
	}

	var captainCount int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM match_players
		WHERE match_id = $1 AND is_captain = true
	`, matchID).Scan(&captainCount); err != nil {
		return err
	}
	if captainCount != 2 {
		return ErrExpectedTwoCaptains
	}

	var previousPick int16
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(MAX(pick_number), 0)::smallint
		FROM match_draft_picks
		WHERE match_id = $1
	`, matchID).Scan(&previousPick); err != nil {
		return err
	}

	nextPick := previousPick + 1
	if nextPick > 8 {
		return ErrDraftComplete
	}
	if input.PickNumber != nextPick {
		return ErrInvalidPickNumber
	}

	expectedTeam := teamForPick(nextPick)
	var currentCaptainID int64
	err = tx.QueryRow(ctx, `
		SELECT user_id
		FROM match_players
		WHERE match_id = $1
			AND is_captain = true
			AND team = $2
	`, matchID, expectedTeam).Scan(&currentCaptainID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrExpectedTwoCaptains
	}
	if err != nil {
		return err
	}
	if input.CaptainUserID != currentCaptainID {
		return ErrNotCaptainTurn
	}

	tag, err := tx.Exec(ctx, `
		UPDATE match_players
		SET team = $1,
			draft_pick_position = $2
		WHERE match_id = $3
			AND user_id = $4
			AND is_captain = false
			AND team IS NULL
			AND draft_pick_position IS NULL
	`, expectedTeam, nextPick, matchID, input.PickedUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrPlayerUnavailable
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO match_draft_picks (
			match_id,
			pick_number,
			captain_user_id,
			picked_user_id,
			team
		)
		VALUES ($1, $2, $3, $4, $5)
	`, matchID, nextPick, currentCaptainID, input.PickedUserID, expectedTeam); err != nil {
		return err
	}

	if nextPick == 8 {
		if _, err := tx.Exec(ctx, `
			UPDATE matches
			SET status = 'ready'
			WHERE id = $1
		`, matchID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *Service) State(ctx context.Context, matchID int64) (models.DraftState, error) {
	state := models.DraftState{}

	err := s.pool.QueryRow(ctx, `
		SELECT id, season_id, status, map_name, created_at, started_at, ended_at
		FROM matches
		WHERE id = $1
	`, matchID).Scan(
		&state.Match.ID,
		&state.Match.SeasonID,
		&state.Match.Status,
		&state.Match.MapName,
		&state.Match.CreatedAt,
		&state.Match.StartedAt,
		&state.Match.EndedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return state, ErrMatchNotFound
	}
	if err != nil {
		return state, err
	}

	players, err := s.loadPlayers(ctx, matchID)
	if err != nil {
		return state, err
	}

	state.Captains = make([]models.MatchPlayer, 0, 2)
	state.AvailablePlayers = make([]models.MatchPlayer, 0, len(players))
	for _, player := range players {
		if player.IsCaptain {
			state.Captains = append(state.Captains, player)
			continue
		}
		if player.Team == nil {
			state.AvailablePlayers = append(state.AvailablePlayers, player)
		}
	}

	state.Picks, err = s.loadPicks(ctx, matchID)
	if err != nil {
		return state, err
	}

	state.IsComplete = len(state.Picks) >= 8 || state.Match.Status != "drafting"
	if !state.IsComplete && len(state.Captains) == 2 {
		nextPick := int16(len(state.Picks) + 1)
		state.NextPickNumber = &nextPick

		expectedTeam := teamForPick(nextPick)
		for _, captain := range state.Captains {
			if captain.Team != nil && *captain.Team == expectedTeam {
				currentCaptain := captain
				state.CurrentCaptain = &currentCaptain
				break
			}
		}
	}

	return state, nil
}

func (s *Service) StateForUser(ctx context.Context, matchID int64, userID int64) (models.DraftState, error) {
	if err := s.RequireParticipant(ctx, matchID, userID); err != nil {
		return models.DraftState{}, err
	}
	return s.State(ctx, matchID)
}

func (s *Service) RequireParticipant(ctx context.Context, matchID int64, userID int64) error {
	var matchExists bool
	var isParticipant bool
	if err := s.pool.QueryRow(ctx, `
		SELECT
			EXISTS(SELECT 1 FROM matches WHERE id = $1),
			EXISTS(
				SELECT 1
				FROM match_players
				WHERE match_id = $1 AND user_id = $2
			)
	`, matchID, userID).Scan(&matchExists, &isParticipant); err != nil {
		return err
	}
	if !matchExists {
		return ErrMatchNotFound
	}
	if !isParticipant {
		return ErrMatchAccessDenied
	}
	return nil
}

func (s *Service) ActiveMatchForUser(ctx context.Context, userID int64) (*int64, error) {
	var matchID int64
	err := s.pool.QueryRow(ctx, `
		SELECT m.id
		FROM matches m
		JOIN match_players mp ON mp.match_id = m.id
		WHERE mp.user_id = $1
			AND m.status IN ('drafting', 'ready', 'in_progress')
		ORDER BY m.created_at DESC, m.id DESC
		LIMIT 1
	`, userID).Scan(&matchID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &matchID, nil
}

func (s *Service) loadPlayers(ctx context.Context, matchID int64) ([]models.MatchPlayer, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT mp.id, mp.user_id, u.display_name, mp.team, mp.is_captain, mp.draft_pick_position
		FROM match_players mp
		JOIN users u ON u.id = mp.user_id
		WHERE mp.match_id = $1
		ORDER BY mp.is_captain DESC, mp.team ASC NULLS LAST, mp.draft_pick_position ASC NULLS LAST, u.display_name ASC
	`, matchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	players := []models.MatchPlayer{}
	for rows.Next() {
		var player models.MatchPlayer
		var team sql.NullInt16
		var draftPickPosition sql.NullInt16
		if err := rows.Scan(
			&player.ID,
			&player.UserID,
			&player.DisplayName,
			&team,
			&player.IsCaptain,
			&draftPickPosition,
		); err != nil {
			return nil, err
		}
		if team.Valid {
			value := team.Int16
			player.Team = &value
		}
		if draftPickPosition.Valid {
			value := draftPickPosition.Int16
			player.DraftPickPosition = &value
		}
		players = append(players, player)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return players, nil
}

func (s *Service) loadPicks(ctx context.Context, matchID int64) ([]models.DraftPick, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			mdp.id,
			mdp.match_id,
			mdp.pick_number,
			mdp.captain_user_id,
			captain.display_name,
			mdp.picked_user_id,
			picked.display_name,
			mdp.team,
			mdp.created_at
		FROM match_draft_picks mdp
		JOIN users captain ON captain.id = mdp.captain_user_id
		JOIN users picked ON picked.id = mdp.picked_user_id
		WHERE mdp.match_id = $1
		ORDER BY mdp.pick_number ASC
	`, matchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	picks := []models.DraftPick{}
	for rows.Next() {
		var pick models.DraftPick
		if err := rows.Scan(
			&pick.ID,
			&pick.MatchID,
			&pick.PickNumber,
			&pick.CaptainUserID,
			&pick.CaptainDisplayName,
			&pick.PickedUserID,
			&pick.PickedDisplayName,
			&pick.Team,
			&pick.CreatedAt,
		); err != nil {
			return nil, err
		}
		picks = append(picks, pick)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return picks, nil
}

func teamForPick(pickNumber int16) int16 {
	if pickNumber < 1 || pickNumber > 8 {
		return 0
	}
	teams := [8]int16{1, 2, 2, 1, 1, 2, 2, 1}
	return teams[pickNumber-1]
}
