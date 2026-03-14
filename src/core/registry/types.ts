export interface NpmPackument {
  name: string;
  "dist-tags": Record<string, string>;
  versions: Record<string, NpmVersionInfo>;
  time?: Record<string, string>;
  maintainers?: Array<{ name: string; email?: string }>;
}

export interface NpmVersionInfo {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  license?: string | { type: string; url?: string } | Array<{ type: string; url?: string }>;
  deprecated?: string;
  scripts?: Record<string, string>;
  dist?: {
    tarball: string;
    integrity?: string;
    attestations?: unknown;
  };
}
