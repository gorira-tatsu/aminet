import type { TrustScore } from "../trust/types.js";
import { TTL } from "./config.js";
import { getDatabase } from "./database.js";

interface TrustScoreRow {
  overall_score: number;
  breakdown: string;
  signals: string;
  has_provenance: number;
  scorecard_score: number | null;
  computed_at: number;
}

export function getCachedTrustScore(
  name: string,
  version: string,
  ecosystem = "npm",
): TrustScore | null {
  const db = getDatabase();
  try {
    const row = db
      .query<TrustScoreRow, [string, string, string]>(
        "SELECT overall_score, breakdown, signals, has_provenance, scorecard_score, computed_at FROM trust_scores WHERE ecosystem = ? AND name = ? AND version = ?",
      )
      .get(ecosystem, name, version);

    if (!row) return null;

    const age = Date.now() - row.computed_at;
    if (age > TTL.trustScore) return null;

    return {
      overall: row.overall_score,
      breakdown: JSON.parse(row.breakdown),
      signals: JSON.parse(row.signals),
      hasProvenance: row.has_provenance === 1,
      scorecardScore: row.scorecard_score,
    };
  } catch {
    return null;
  }
}

export function cacheTrustScore(
  name: string,
  version: string,
  score: TrustScore,
  ecosystem = "npm",
): void {
  const db = getDatabase();
  try {
    db.run(
      `INSERT OR REPLACE INTO trust_scores (ecosystem, name, version, overall_score, breakdown, signals, has_provenance, scorecard_score, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ecosystem,
        name,
        version,
        score.overall,
        JSON.stringify(score.breakdown),
        JSON.stringify(score.signals),
        score.hasProvenance ? 1 : 0,
        score.scorecardScore,
        Date.now(),
      ],
    );
  } catch {
    // Table might not exist yet
  }
}
