import { logger } from "../../utils/logger.js";
import type { SecuritySignal } from "../security/types.js";
import { getDatabase } from "./database.js";

interface SecuritySignalRow {
  ecosystem: string;
  name: string;
  version: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  details: string | null;
  scanned_at: number;
}

/** Cache TTL for security signals: 24 hours */
const SIGNAL_TTL = 24 * 60 * 60 * 1000;

export function getCachedSecuritySignals(
  name: string,
  version: string,
  ecosystem = "npm",
): SecuritySignal[] | null {
  const db = getDatabase();
  try {
    const rows = db
      .query<SecuritySignalRow, [string, string, string, number]>(
        `SELECT category, severity, title, description, details
         FROM security_signals
         WHERE ecosystem = ? AND name = ? AND version = ?
         AND scanned_at > ?`,
      )
      .all(ecosystem, name, version, Date.now() - SIGNAL_TTL);

    if (rows.length === 0) return null;

    logger.debug(`Security cache hit: ${name}@${version} (${rows.length} signals)`);
    return rows.map((row) => ({
      category: row.category as SecuritySignal["category"],
      severity: row.severity as SecuritySignal["severity"],
      packageId: `${name}@${version}`,
      name,
      version,
      title: row.title,
      description: row.description,
      details: row.details ? JSON.parse(row.details) : undefined,
    }));
  } catch {
    // Table might not exist yet
    return null;
  }
}

export function cacheSecuritySignals(
  name: string,
  version: string,
  signals: SecuritySignal[],
  ecosystem = "npm",
): void {
  const db = getDatabase();
  const now = Date.now();

  try {
    // Delete old entries for this package
    db.run(`DELETE FROM security_signals WHERE ecosystem = ? AND name = ? AND version = ?`, [
      ecosystem,
      name,
      version,
    ]);

    if (signals.length === 0) {
      // Cache a "no signals" marker
      db.run(
        `INSERT OR REPLACE INTO security_signals
         (ecosystem, name, version, category, severity, title, description, details, scanned_at)
         VALUES (?, ?, ?, '_none', 'info', 'No signals', '', NULL, ?)`,
        [ecosystem, name, version, now],
      );
      return;
    }

    const stmt = db.prepare(
      `INSERT OR REPLACE INTO security_signals
       (ecosystem, name, version, category, severity, title, description, details, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertAll = db.transaction(() => {
      for (const signal of signals) {
        stmt.run(
          ecosystem,
          name,
          version,
          signal.category,
          signal.severity,
          signal.title,
          signal.description,
          signal.details ? JSON.stringify(signal.details) : null,
          now,
        );
      }
    });

    insertAll();
  } catch {
    // Non-critical - continue without caching
  }
}
