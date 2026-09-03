-- Optimize loop, Backstage, knowledge gaps, secrets vault, brand voice

ALTER TABLE agents ADD COLUMN brand_voice TEXT;
ALTER TABLE agents ADD COLUMN draft_snapshot TEXT;
ALTER TABLE conversations ADD COLUMN subtopic TEXT;
ALTER TABLE conversations ADD COLUMN sentiment_score REAL;

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  question TEXT NOT NULL,
  question_norm TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  avg_confidence REAL,
  last_conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  suggested_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gaps_agent ON knowledge_gaps(agent_id, occurrence_count);
CREATE INDEX IF NOT EXISTS idx_gaps_workspace ON knowledge_gaps(workspace_id, status);

CREATE TABLE IF NOT EXISTS question_clusters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  canonical_question TEXT NOT NULL,
  question_norm TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  sample_conversation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, question_norm)
);
CREATE INDEX IF NOT EXISTS idx_questions_agent ON question_clusters(agent_id, occurrence_count);

CREATE TABLE IF NOT EXISTS backstage_suggestions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_backstage_workspace ON backstage_suggestions(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS integration_secrets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  integration_id TEXT,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_secrets_workspace ON integration_secrets(workspace_id, provider);

CREATE TABLE IF NOT EXISTS channel_webhooks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  verify_token TEXT,
  signing_secret TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, channel)
);

CREATE TABLE IF NOT EXISTS publish_gates (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  suite_id TEXT,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
