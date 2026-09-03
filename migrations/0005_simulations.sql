-- Simulations, personas, usage helpers

ALTER TABLE test_cases ADD COLUMN customer_persona TEXT;
ALTER TABLE test_cases ADD COLUMN context_json TEXT;

CREATE TABLE IF NOT EXISTS simulations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  persona TEXT,
  initial_message TEXT NOT NULL,
  turns TEXT,
  expected_behavior TEXT,
  forbidden_behavior TEXT,
  expected_escalation INTEGER DEFAULT 0,
  expected_action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_simulations_agent ON simulations(agent_id);

CREATE TABLE IF NOT EXISTS simulation_runs (
  id TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL,
  agent_version_id TEXT,
  status TEXT NOT NULL,
  transcript TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sim_runs ON simulation_runs(simulation_id, created_at);
