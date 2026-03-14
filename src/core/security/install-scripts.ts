import type { NpmVersionInfo } from "../registry/types.js";
import type { SecuritySignal } from "./types.js";

const HIGH_RISK_SCRIPTS = ["preinstall", "install", "postinstall"];
const MEDIUM_RISK_SCRIPTS = ["preuninstall", "postuninstall", "prepare"];

export function detectInstallScripts(
  name: string,
  version: string,
  versionInfo: NpmVersionInfo,
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];
  const scripts = versionInfo.scripts;
  if (!scripts) return signals;

  const packageId = `${name}@${version}`;

  for (const scriptName of HIGH_RISK_SCRIPTS) {
    if (scripts[scriptName]) {
      signals.push({
        category: "install-script",
        severity: scriptName === "preinstall" ? "high" : "medium",
        packageId,
        name,
        version,
        title: `Has ${scriptName} script`,
        description: `Package defines a ${scriptName} lifecycle script: "${truncate(scripts[scriptName], 100)}"`,
        details: {
          scriptName,
          scriptContent: scripts[scriptName],
        },
      });
    }
  }

  for (const scriptName of MEDIUM_RISK_SCRIPTS) {
    if (scripts[scriptName]) {
      signals.push({
        category: "install-script",
        severity: "low",
        packageId,
        name,
        version,
        title: `Has ${scriptName} script`,
        description: `Package defines a ${scriptName} lifecycle script`,
        details: {
          scriptName,
          scriptContent: scripts[scriptName],
        },
      });
    }
  }

  return signals;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}
