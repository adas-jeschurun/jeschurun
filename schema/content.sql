-- jes-v2-content schema

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  hebrew_year INTEGER NOT NULL,
  slug TEXT NOT NULL,
  parasha_key TEXT,
  published_at TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  sort_order INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (hebrew_year, slug)
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'published',
  source_issue TEXT,
  published_at TEXT,
  updated_at TEXT,
  lead_image TEXT,
  order_in_issue INTEGER,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'published',
  source_issue TEXT,
  published_at TEXT,
  updated_at TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS bios (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'published',
  years TEXT,
  published_at TEXT,
  updated_at TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  body_md TEXT,
  body_text TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (kind, parent_id, lang)
);

CREATE TABLE IF NOT EXISTS tags (
  slug TEXT PRIMARY KEY,
  labels_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS article_tags (
  article_id TEXT NOT NULL,
  tag_slug TEXT NOT NULL,
  PRIMARY KEY (article_id, tag_slug)
);

CREATE TABLE IF NOT EXISTS related_articles (
  article_id TEXT NOT NULL,
  related_id TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, related_id)
);

CREATE TABLE IF NOT EXISTS site_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  key TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  source_path TEXT
);

CREATE TABLE IF NOT EXISTS import_manifest (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_status_date ON answers(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_bios_status_date ON bios(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_status_date ON issues(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_translations_kind_parent ON translations(kind, parent_id);
CREATE INDEX IF NOT EXISTS idx_translations_search ON translations(kind, lang);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_slug);
CREATE INDEX IF NOT EXISTS idx_related_article ON related_articles(article_id);
