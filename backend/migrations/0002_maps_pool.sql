-- migrate:up

CREATE TABLE IF NOT EXISTS maps (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO maps (name, is_active)
VALUES
    ('Abyss', TRUE),
    ('Ascent', TRUE),
    ('Bind', TRUE),
    ('Fracture', TRUE),
    ('Haven', TRUE),
    ('Icebox', TRUE),
    ('Lotus', TRUE),
    ('Pearl', TRUE),
    ('Split', TRUE),
    ('Sunset', TRUE)
ON CONFLICT (name) DO NOTHING;

-- migrate:down

DROP TABLE IF EXISTS maps;
