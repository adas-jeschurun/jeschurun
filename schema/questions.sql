-- jes-v2-questions schema

CREATE TABLE IF NOT EXISTS incoming_questions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  language TEXT NOT NULL,
  subject TEXT NOT NULL,
  question_text TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  reply_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  policy_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incoming_questions_status_date
  ON incoming_questions(status, created_at DESC);
