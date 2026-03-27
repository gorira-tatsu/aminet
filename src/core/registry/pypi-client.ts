import { fetchWithRetry } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import type { PyPIPackageInfo } from "./pypi-types.js";

const PYPI_REGISTRY = "https://pypi.org/pypi";

/** In-memory cache for current process (avoids repeated fetches) */
const memoryCache = new Map<string, PyPIPackageInfo>();

/**
 * Mapping from PyPI trove classifiers to SPDX license identifiers.
 * Covers the most common OSI-approved licenses.
 */
const CLASSIFIER_TO_SPDX: Record<string, string> = {
  "License :: OSI Approved :: MIT License": "MIT",
  "License :: OSI Approved :: Apache Software License": "Apache-2.0",
  "License :: OSI Approved :: BSD License": "BSD-3-Clause",
  "License :: OSI Approved :: ISC License (ISCL)": "ISC",
  "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
  "License :: OSI Approved :: GNU General Public License v2 (GPLv2)": "GPL-2.0",
  "License :: OSI Approved :: GNU General Public License v2 or later (GPLv2+)": "GPL-2.0-or-later",
  "License :: OSI Approved :: GNU General Public License v3 (GPLv3)": "GPL-3.0",
  "License :: OSI Approved :: GNU General Public License v3 or later (GPLv3+)": "GPL-3.0-or-later",
  "License :: OSI Approved :: GNU Lesser General Public License v2 (LGPLv2)": "LGPL-2.0",
  "License :: OSI Approved :: GNU Lesser General Public License v2 or later (LGPLv2+)":
    "LGPL-2.0-or-later",
  "License :: OSI Approved :: GNU Lesser General Public License v3 (LGPLv3)": "LGPL-3.0",
  "License :: OSI Approved :: GNU Lesser General Public License v3 or later (LGPLv3+)":
    "LGPL-3.0-or-later",
  "License :: OSI Approved :: GNU Affero General Public License v3": "AGPL-3.0",
  "License :: OSI Approved :: GNU Affero General Public License v3 or later (AGPLv3+)":
    "AGPL-3.0-or-later",
  "License :: OSI Approved :: European Union Public Licence 1.2 (EUPL 1.2)": "EUPL-1.2",
  "License :: OSI Approved :: The Unlicense (Unlicense)": "Unlicense",
  "License :: OSI Approved :: zlib/libpng License": "Zlib",
  "License :: OSI Approved :: Python Software Foundation License": "PSF-2.0",
  "License :: OSI Approved :: Artistic License": "Artistic-2.0",
  "License :: OSI Approved :: Eclipse Public License 1.0 (EPL-1.0)": "EPL-1.0",
  "License :: OSI Approved :: Eclipse Public License 2.0 (EPL-2.0)": "EPL-2.0",
  "License :: OSI Approved :: Academic Free License (AFL)": "AFL-3.0",
  "License :: OSI Approved :: Boost Software License 1.0 (BSL-1.0)": "BSL-1.0",
  "License :: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication": "CC0-1.0",
};

export async function getPyPIPackage(name: string, version?: string): Promise<PyPIPackageInfo> {
  const cacheKey = version ? `${name}@${version}` : name;

  const memCached = memoryCache.get(cacheKey);
  if (memCached) return memCached;

  const url = version
    ? `${PYPI_REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
    : `${PYPI_REGISTRY}/${encodeURIComponent(name)}/json`;

  logger.debug(`Fetching PyPI package: ${cacheKey}`);

  const headers: Record<string, string> = { Accept: "application/json" };

  const response = await fetchWithRetry(url, { headers });

  if (response.status === 404) {
    throw new Error(`PyPI package not found: ${cacheKey}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch PyPI package ${cacheKey}: ${response.status} ${response.statusText}`,
    );
  }

  const packageInfo = (await response.json()) as PyPIPackageInfo;

  memoryCache.set(cacheKey, packageInfo);

  return packageInfo;
}

export function clearPyPICache(): void {
  memoryCache.clear();
}

/**
 * Extract an SPDX license identifier from PyPI package info.
 * Tries trove classifiers first (more reliable), then falls back to info.license.
 */
export function extractLicenseFromPyPI(info: PyPIPackageInfo["info"]): string | null {
  // Try classifiers first — they map cleanly to SPDX
  for (const classifier of info.classifiers) {
    const spdx = CLASSIFIER_TO_SPDX[classifier];
    if (spdx) return spdx;
  }

  // Fall back to the free-text license field
  if (info.license && info.license.trim() !== "") {
    return info.license.trim();
  }

  return null;
}

/**
 * Parse a PEP 508 dependency specifier string.
 *
 * PEP 508 format:  name [extras] [version-spec] [; markers]
 * Examples:
 *   "requests>=2.20"
 *   "numpy (>=1.21,<2.0)"
 *   "importlib-metadata; python_version < '3.8'"
 *   "black[jupyter]>=23.0; extra == 'dev'"
 */
export function parsePep508(
  spec: string,
): { name: string; versionSpec: string; hasMarker: boolean } | null {
  const trimmed = spec.trim();
  if (trimmed === "") return null;

  // Split on first semicolon to separate markers
  const semicolonIdx = trimmed.indexOf(";");
  const hasMarker = semicolonIdx !== -1;
  const beforeMarker = hasMarker ? trimmed.slice(0, semicolonIdx).trim() : trimmed;

  // Match: name (possibly with extras in brackets), then optional version spec
  // Name: PEP 508 allows letters, digits, hyphens, underscores, dots
  const match = beforeMarker.match(
    /^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\s*\[.*?\])?\s*(.*)?$/,
  );
  if (!match) return null;

  const name = match[1];
  // Version spec: may be wrapped in parens, e.g. "(>=1.0,<2.0)"
  let versionSpec = (match[4] ?? "").trim();

  // Strip surrounding parentheses if present
  if (versionSpec.startsWith("(") && versionSpec.endsWith(")")) {
    versionSpec = versionSpec.slice(1, -1).trim();
  }

  return { name, versionSpec, hasMarker };
}
