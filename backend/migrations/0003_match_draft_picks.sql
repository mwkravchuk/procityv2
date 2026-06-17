-- migrate:up

CREATE TABLE IF NOT EXISTS match_draft_picks (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    pick_number SMALLINT NOT NULL CHECK (pick_number BETWEEN 1 AND 8),
    captain_user_id BIGINT NOT NULL REFERENCES users(id),
    picked_user_id BIGINT NOT NULL REFERENCES users(id),
    team SMALLINT NOT NULL CHECK (team IN (1, 2)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, pick_number),
    UNIQUE (match_id, picked_user_id)
);

CREATE INDEX IF NOT EXISTS match_draft_picks_match_id_idx ON match_draft_picks (match_id, pick_number);

-- Existing draft positions were queue-pop placeholders; clear them so draft order reflects actual picks.
UPDATE match_players
SET draft_pick_position = NULL;

-- migrate:down

DROP INDEX IF EXISTS match_draft_picks_match_id_idx;
DROP TABLE IF EXISTS match_draft_picks;
