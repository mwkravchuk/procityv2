-- migrate:up

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seasons (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_season_idx ON seasons (is_active) WHERE is_active = TRUE;

INSERT INTO seasons (name, is_active)
VALUES ('Season 1', TRUE)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS queue_entries (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id BIGSERIAL PRIMARY KEY,
    season_id BIGINT NOT NULL REFERENCES seasons(id),
    status TEXT NOT NULL CHECK (status IN ('drafting', 'ready', 'in_progress', 'completed', 'canceled')),
    map_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    winning_team SMALLINT,
    team_a_rounds SMALLINT,
    team_b_rounds SMALLINT
);

CREATE TABLE IF NOT EXISTS match_players (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    team SMALLINT,
    is_captain BOOLEAN NOT NULL DEFAULT FALSE,
    draft_pick_position SMALLINT,
    kills SMALLINT,
    deaths SMALLINT,
    assists SMALLINT,
    acs SMALLINT,
    first_bloods SMALLINT,
    agent_name TEXT,
    UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS queue_entries_created_at_idx ON queue_entries (created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS match_players_match_id_idx ON match_players (match_id);

-- migrate:down

DROP INDEX IF EXISTS match_players_match_id_idx;
DROP INDEX IF EXISTS queue_entries_created_at_idx;
DROP TABLE IF EXISTS match_players;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS queue_entries;
DROP INDEX IF EXISTS one_active_season_idx;
DROP TABLE IF EXISTS seasons;
DROP TABLE IF EXISTS users;
