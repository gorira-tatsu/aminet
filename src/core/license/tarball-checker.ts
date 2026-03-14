import { fetchWithRetry } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";

export interface LicenseFileResult {
  licenseFile?: { filename: string; content: string };
  readmeFile?: { filename: string; content: string };
  detectedLicense: string | null; // SPDX ID inferred from file content
}

const LICENSE_FILENAMES = new Set([
  "package/LICENSE",
  "package/LICENSE.md",
  "package/LICENSE.txt",
  "package/LICENCE",
  "package/LICENCE.md",
  "package/LICENCE.txt",
  "package/COPYING",
]);

const README_FILENAMES = new Set(["package/README.md", "package/README", "package/README.txt"]);

export async function extractLicenseFiles(tarballUrl: string): Promise<LicenseFileResult> {
  try {
    const response = await fetchWithRetry(tarballUrl);
    if (!response.ok) {
      logger.warn(`Failed to fetch tarball: ${response.status}`);
      return { detectedLicense: null };
    }

    const buffer = await response.arrayBuffer();
    const tmpFile = `/tmp/ami-tarball-${Date.now()}.tgz`;

    await Bun.write(tmpFile, buffer);

    try {
      // List files in tarball
      const listProc = Bun.spawn(["tar", "-tzf", tmpFile], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const listOutput = await new Response(listProc.stdout).text();
      await listProc.exited;

      const files = listOutput
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      // Find license and readme files (case-insensitive matching)
      let licenseFilePath: string | null = null;
      let readmeFilePath: string | null = null;

      for (const f of files) {
        const upper = f.toUpperCase();
        if (!licenseFilePath) {
          for (const target of LICENSE_FILENAMES) {
            if (upper === target.toUpperCase()) {
              licenseFilePath = f;
              break;
            }
          }
        }
        if (!readmeFilePath) {
          for (const target of README_FILENAMES) {
            if (upper === target.toUpperCase()) {
              readmeFilePath = f;
              break;
            }
          }
        }
      }

      const result: LicenseFileResult = { detectedLicense: null };

      if (licenseFilePath) {
        const content = await extractSingleFile(tmpFile, licenseFilePath);
        if (content) {
          result.licenseFile = { filename: licenseFilePath, content };
          result.detectedLicense = detectLicenseFromText(content);
        }
      }

      if (readmeFilePath) {
        const content = await extractSingleFile(tmpFile, readmeFilePath);
        if (content) {
          result.readmeFile = { filename: readmeFilePath, content };
        }
      }

      return result;
    } finally {
      // Clean up temp file
      try {
        const { unlinkSync } = require("node:fs");
        unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  } catch (error) {
    logger.warn(
      `Failed to extract license from tarball: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { detectedLicense: null };
  }
}

async function extractSingleFile(tarball: string, filePath: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["tar", "-xzf", tarball, "-O", filePath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const content = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return exitCode === 0 ? content : null;
  } catch {
    return null;
  }
}

export function detectLicenseFromText(text: string): string | null {
  const upper = text.toUpperCase();

  // Order matters: check more specific patterns first

  if (
    upper.includes("APACHE LICENSE, VERSION 2.0") ||
    upper.includes("APACHE LICENSE\n                           VERSION 2.0")
  ) {
    return "Apache-2.0";
  }

  if (upper.includes("GNU AFFERO GENERAL PUBLIC LICENSE")) {
    if (upper.includes("VERSION 3")) return "AGPL-3.0";
  }

  if (upper.includes("GNU LESSER GENERAL PUBLIC LICENSE")) {
    if (upper.includes("VERSION 3")) return "LGPL-3.0";
    if (upper.includes("VERSION 2.1")) return "LGPL-2.1";
    if (upper.includes("VERSION 2")) return "LGPL-2.0";
    return "LGPL-3.0";
  }

  if (upper.includes("GNU GENERAL PUBLIC LICENSE")) {
    if (upper.includes("VERSION 3")) return "GPL-3.0";
    if (upper.includes("VERSION 2")) return "GPL-2.0";
    return "GPL-3.0";
  }

  if (
    upper.includes("BSD 3-CLAUSE") ||
    upper.includes("BSD 3 CLAUSE") ||
    upper.includes("THREE-CLAUSE BSD") ||
    upper.includes("REDISTRIBUTIONS OF SOURCE CODE MUST RETAIN")
  ) {
    if (
      upper.includes("2-CLAUSE") ||
      upper.includes("TWO-CLAUSE") ||
      upper.includes("SIMPLIFIED BSD")
    ) {
      return "BSD-2-Clause";
    }
    return "BSD-3-Clause";
  }

  if (
    upper.includes("BSD 2-CLAUSE") ||
    upper.includes("BSD 2 CLAUSE") ||
    upper.includes("SIMPLIFIED BSD") ||
    upper.includes("TWO-CLAUSE BSD") ||
    upper.includes("FREEBSD LICENSE")
  ) {
    return "BSD-2-Clause";
  }

  if (
    upper.includes("MIT LICENSE") ||
    upper.includes("PERMISSION IS HEREBY GRANTED, FREE OF CHARGE")
  ) {
    return "MIT";
  }

  if (
    upper.includes("ISC LICENSE") ||
    (upper.includes("PERMISSION TO USE, COPY, MODIFY") && upper.includes("ISC"))
  ) {
    return "ISC";
  }

  if (upper.includes("THE UNLICENSE") || upper.includes("THIS IS FREE AND UNENCUMBERED SOFTWARE")) {
    return "Unlicense";
  }

  if (
    upper.includes("MOZILLA PUBLIC LICENSE VERSION 2.0") ||
    upper.includes("MOZILLA PUBLIC LICENSE, VERSION 2.0")
  ) {
    return "MPL-2.0";
  }

  if (upper.includes("CC0 1.0 UNIVERSAL") || upper.includes("CC0-1.0")) {
    return "CC0-1.0";
  }

  return null;
}
