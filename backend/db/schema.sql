CREATE TABLE IF NOT EXISTS daily_slots (
    slot_id TEXT PRIMARY KEY,
    slot_index INTEGER NOT NULL,
    case_date TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    mood TEXT NOT NULL,
    setting TEXT NOT NULL,
    victim_json TEXT NOT NULL,
    world_json TEXT NOT NULL,
    fingerprint_json TEXT NOT NULL,
    chroma_collection TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_slots_case_date_index
ON daily_slots(case_date, slot_index);

CREATE INDEX IF NOT EXISTS idx_daily_slots_case_date
ON daily_slots(case_date, status);

CREATE TABLE IF NOT EXISTS suspects (
    slot_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    occupation TEXT NOT NULL,
    relationship_to_victim TEXT NOT NULL,
    personality TEXT NOT NULL,
    alibi TEXT NOT NULL,
    alibi_true INTEGER NOT NULL,
    secret TEXT NOT NULL,
    knowledge_json TEXT NOT NULL,
    is_killer INTEGER NOT NULL,
    archetype TEXT NOT NULL DEFAULT '',
    speech_style TEXT NOT NULL DEFAULT '',
    emotional_tell TEXT NOT NULL DEFAULT '',
    lie_strategy TEXT NOT NULL DEFAULT '',
    private_wound TEXT NOT NULL DEFAULT '',
    pressure_response TEXT NOT NULL DEFAULT '',
    relationship_to_other_suspects TEXT NOT NULL DEFAULT '',
    gender_presentation TEXT,
    appearance TEXT NOT NULL DEFAULT '',
    model_path TEXT,
    voice_id TEXT,
    PRIMARY KEY (slot_id, character_id),
    FOREIGN KEY (slot_id) REFERENCES daily_slots(slot_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
    slot_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    implicates TEXT NOT NULL,
    is_red_herring INTEGER NOT NULL,
    PRIMARY KEY (slot_id, evidence_id),
    FOREIGN KEY (slot_id) REFERENCES daily_slots(slot_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_status (
    slot_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    model_path TEXT,
    voice_id TEXT,
    model_status TEXT NOT NULL DEFAULT 'pending',
    voice_status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (slot_id, character_id)
);

CREATE TABLE IF NOT EXISTS keywords (
    keyword_id TEXT PRIMARY KEY,
    case_date TEXT NOT NULL,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    slot_scores_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_keywords_case_date
ON keywords(case_date);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    slot_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    state_json TEXT NOT NULL
);
