-- Escalations, traces, helpdesk notes, channel events

CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  ticket_id TEXT,
  reason TEXT NOT NULL,
  trigger_message_id TEXT,
  summary TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  destination TEXT NOT NULL DEFAULT 'inbox',
  assigned_user TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_escalations_workspace ON escalations(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_escalations_conversation ON escalations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(workspace_id, status);

CREATE TABLE IF NOT EXISTS agent_traces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  conversation_id TEXT,
  message_id TEXT,
  input TEXT,
  intent TEXT,
  retrieved_context TEXT,
  procedure_selection TEXT,
  llm_run TEXT,
  tool_calls TEXT,
  guardrail_decisions TEXT,
  escalation_decision TEXT,
  final_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_traces_conversation ON agent_traces(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_traces_agent ON agent_traces(agent_id, created_at);

CREATE TABLE IF NOT EXISTS internal_notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_user_id TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_conversation ON internal_notes(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS channel_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT,
  conversation_id TEXT,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_channel_events_workspace ON channel_events(workspace_id, channel, created_at);

ALTER TABLE conversations ADD COLUMN automation_state TEXT DEFAULT 'auto';
ALTER TABLE tickets ADD COLUMN escalation_id TEXT;
ALTER TABLE tickets ADD COLUMN ai_summary TEXT;
