export type LicenseCategory = "permissive" | "copyleft" | "weak-copyleft" | "unknown";

export interface PackageNode {
  id: string; // "express@4.21.2"
  name: string;
  version: string;
  license: string | null;
  licenseCategory: LicenseCategory;
  depth: number; // shortest distance from root
  parents: Set<string>;
  dependencies: Map<string, string>; // name -> version range
}

export interface DependencyEdge {
  from: string; // parent id
  to: string; // child id
  versionRange: string; // original range from package.json
}

export interface DependencyGraph {
  root: string;
  nodes: Map<string, PackageNode>;
  edges: DependencyEdge[];
}
