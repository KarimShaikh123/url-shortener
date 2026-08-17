CREATE TABLE IF NOT EXISTS links (
  slug TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clicks (
  slug TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clicks_slug_idx ON clicks (slug);
CREATE INDEX IF NOT EXISTS clicks_clicked_at_idx ON clicks (clicked_at);
