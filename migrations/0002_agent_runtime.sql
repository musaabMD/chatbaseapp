-- Agent platform runtime: versions, procedure runs, action executions, identity, message parts

CREATE TABLE IF NOT EXISTS procedure_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_step INTEGER NOT NULL DEFAULT 0,
  state TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_procedure_runs_conversation ON procedure_runs(conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_procedure_runs_agent ON procedure_runs(agent_id, status);

CREATE TABLE IF NOT EXISTS action_executions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  action_id TEXT,
  conversation_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,
  output TEXT,
  error TEXT,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_action_executions_conversation ON action_executions(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_action_executions_agent ON action_executions(agent_id, created_at);

-- Conversation identity / verified context (server-trusted, never model-decided)
ALTER TABLE conversations ADD COLUMN verified_identity TEXT;
ALTER TABLE conversations ADD COLUMN language TEXT;
ALTER TABLE conversations ADD COLUMN procedure_run_id TEXT;
ALTER TABLE conversations ADD COLUMN agent_version_id TEXT;

-- Rich message parts protocol alongside plain content
ALTER TABLE messages ADD COLUMN parts TEXT;
ALTER TABLE messages ADD COLUMN agent_version_id TEXT;

-- Agent model defaults oriented toward OpenRouter gateway
-- (existing rows keep their values; new agents can set openrouter defaults in app code)
