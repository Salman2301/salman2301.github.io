-- The workspace document. One row per workspace; the site uses 'default'.
CREATE TABLE IF NOT EXISTS workspace (
  id         TEXT PRIMARY KEY,
  rev        INTEGER NOT NULL,
  doc        TEXT NOT NULL,
  device     TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

-- The last revisions of each workspace, so a bad write can be read back.
CREATE TABLE IF NOT EXISTS revisions (
  id     TEXT NOT NULL,
  rev    INTEGER NOT NULL,
  doc    TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  at     INTEGER NOT NULL,
  PRIMARY KEY (id, rev)
);

CREATE INDEX IF NOT EXISTS revisions_by_time ON revisions (id, at DESC);
