-- jes-v2-analytics schema

CREATE TABLE IF NOT EXISTS content_events_daily (
  event_date   TEXT NOT NULL,
  content_id   TEXT NOT NULL,
  content_type TEXT NOT NULL,
  language     TEXT NOT NULL,
  event        TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT '',
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, content_id, content_type, language, event, source)
);

CREATE INDEX IF NOT EXISTS idx_content_events_popular
  ON content_events_daily(event, language, content_type, content_id, event_date);

CREATE INDEX IF NOT EXISTS idx_content_events_date
  ON content_events_daily(event_date);
