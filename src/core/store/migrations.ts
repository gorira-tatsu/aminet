import type { Database } from "bun:sqlite";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packuments (
  ecosystem  TEXT NOT NULL DEFAULT 'npm',
  name       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  data       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name)
);
CREATE INDEX IF NOT EXISTS idx_packuments_hash ON packuments (hash);

CREATE TABLE IF NOT EXISTS packages (
  ecosystem        TEXT NOT NULL DEFAULT 'npm',
  name             TEXT NOT NULL,
  version          TEXT NOT NULL,
  hash             TEXT NOT NULL,
  license          TEXT,
  license_category TEXT NOT NULL,
  dependencies     TEXT NOT NULL,
  resolved_at      INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_hash ON packages (hash);

CREATE TABLE IF NOT EXISTS vulnerabilities (
  ecosystem  TEXT NOT NULL DEFAULT 'npm',
  name       TEXT NOT NULL,
  version    TEXT NOT NULL,
  hash       TEXT NOT NULL,
  vulns      TEXT NOT NULL,
  vuln_count INTEGER NOT NULL,
  scanned_at INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name, version)
);
CREATE INDEX IF NOT EXISTS idx_vulns_hash ON vulnerabilities (hash);
CREATE INDEX IF NOT EXISTS idx_vulns_scanned ON vulnerabilities (scanned_at);
`;

const MIGRATION_V2 = `
ALTER TABLE packages ADD COLUMN license_file_checked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packages ADD COLUMN license_file_spdx TEXT;
`;

const MIGRATION_V3 = `
ALTER TABLE packages ADD COLUMN tarball_url TEXT;
ALTER TABLE packages ADD COLUMN integrity TEXT;
`;

const MIGRATION_V4 = `
CREATE TABLE IF NOT EXISTS security_signals (
  ecosystem TEXT NOT NULL DEFAULT 'npm',
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  scanned_at INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name, version, category)
);
`;

const MIGRATION_V5 = `
ALTER TABLE vulnerabilities ADD COLUMN advisory_sources TEXT DEFAULT 'osv';
ALTER TABLE vulnerabilities ADD COLUMN normalized_advisories TEXT;
`;

const MIGRATION_V6 = `
CREATE TABLE IF NOT EXISTS license_intelligence (
  ecosystem TEXT NOT NULL DEFAULT 'npm',
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  declared_license TEXT,
  discovered_license TEXT,
  confidence TEXT NOT NULL,
  attribution_parties TEXT,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name, version)
);
`;

const MIGRATION_V7 = `
CREATE TABLE IF NOT EXISTS trust_scores (
  ecosystem TEXT NOT NULL DEFAULT 'npm',
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  breakdown TEXT NOT NULL,
  signals TEXT NOT NULL,
  has_provenance INTEGER NOT NULL DEFAULT 0,
  scorecard_score REAL,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name, version)
);
`;

const MIGRATION_V8 = `
CREATE TABLE IF NOT EXISTS npm_downloads_cache (
  ecosystem TEXT NOT NULL DEFAULT 'npm',
  name TEXT NOT NULL,
  weekly_downloads INTEGER,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name)
);

CREATE TABLE IF NOT EXISTS depsdev_versions_cache (
  ecosystem TEXT NOT NULL DEFAULT 'npm',
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  data TEXT,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (ecosystem, name, version)
);

CREATE TABLE IF NOT EXISTS depsdev_projects_cache (
  project_id TEXT PRIMARY KEY,
  data TEXT,
  fetched_at INTEGER NOT NULL
);
`;

export function runMigrations(db: Database): void {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion < 1) {
    db.exec(SCHEMA_V1);
    // New installs go straight to latest version
    try {
      db.exec(MIGRATION_V2);
    } catch {
      /* columns may exist */
    }
    try {
      db.exec(MIGRATION_V3);
    } catch {
      /* columns may exist */
    }
    db.exec(MIGRATION_V4);
    try {
      db.exec(MIGRATION_V5);
    } catch {
      /* columns may exist */
    }
    db.exec(MIGRATION_V6);
    db.exec(MIGRATION_V7);
    db.exec(MIGRATION_V8);
    setSchemaVersion(db, 8);
    return;
  }

  if (currentVersion < 2) {
    try {
      db.exec(MIGRATION_V2);
    } catch {
      /* columns may exist */
    }
    setSchemaVersion(db, 2);
  }

  if (currentVersion < 3) {
    try {
      db.exec(MIGRATION_V3);
    } catch {
      /* columns may exist */
    }
    setSchemaVersion(db, 3);
  }

  if (currentVersion < 4) {
    db.exec(MIGRATION_V4);
    setSchemaVersion(db, 4);
  }

  if (currentVersion < 5) {
    try {
      db.exec(MIGRATION_V5);
    } catch {
      /* columns may exist */
    }
    setSchemaVersion(db, 5);
  }

  if (currentVersion < 6) {
    db.exec(MIGRATION_V6);
    setSchemaVersion(db, 6);
  }

  if (currentVersion < 7) {
    db.exec(MIGRATION_V7);
    setSchemaVersion(db, 7);
  }

  if (currentVersion < 8) {
    db.exec(MIGRATION_V8);
    setSchemaVersion(db, 8);
  }
}

function getSchemaVersion(db: Database): number {
  try {
    // _meta might not exist yet
    const row = db.query("SELECT value FROM _meta WHERE key = 'schema_version'").get() as {
      value: string;
    } | null;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(db: Database, version: number): void {
  db.run("INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)", [
    String(version),
  ]);
}
