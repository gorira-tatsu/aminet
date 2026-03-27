export interface PyPIPackageInfo {
  info: {
    name: string;
    version: string;
    license: string | null;
    summary: string;
    requires_dist: string[] | null;
    classifiers: string[];
    home_page: string | null;
    author: string | null;
  };
  releases: Record<string, PyPIRelease[]>;
}

export interface PyPIRelease {
  filename: string;
  packagetype: string;
  url: string;
  digests: Record<string, string>;
}
