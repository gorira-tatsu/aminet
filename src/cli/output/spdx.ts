import { randomUUID } from "node:crypto";
import type { DependencyGraph } from "../../core/graph/types.js";
import type { Report } from "../../core/report/types.js";

interface SpdxPackage {
  SPDXID: string;
  name: string;
  versionInfo: string;
  downloadLocation: string;
  filesAnalyzed: boolean;
  licenseConcluded: string;
  licenseDeclared: string;
  copyrightText: string;
  externalRefs: Array<{
    referenceCategory: string;
    referenceType: string;
    referenceLocator: string;
  }>;
}

interface SpdxRelationship {
  spdxElementId: string;
  relatedSpdxElement: string;
  relationshipType: string;
}

interface SpdxDocument {
  spdxVersion: string;
  dataLicense: string;
  SPDXID: string;
  name: string;
  documentNamespace: string;
  creationInfo: {
    created: string;
    creators: string[];
    licenseListVersion: string;
  };
  packages: SpdxPackage[];
  relationships: SpdxRelationship[];
}

export function buildSpdxDocument(report: Report, graph: DependencyGraph): SpdxDocument {
  const packages: SpdxPackage[] = [];
  const relationships: SpdxRelationship[] = [];

  // Add document package
  const rootNode = graph.nodes.get(graph.root);
  const rootSpdxId = "SPDXRef-DOCUMENT";

  for (const entry of report.entries) {
    if (entry.depth === 0) continue; // Skip root

    const node = graph.nodes.get(entry.id);
    const spdxId = toSpdxId(entry.name, entry.version);
    const scopedName = entry.name.startsWith("@") ? `%40${entry.name.slice(1)}` : entry.name;
    const purl = `pkg:npm/${scopedName}@${entry.version}`;

    // Get tarball URL from node if available
    const nodeAny = node as Record<string, unknown> | undefined;
    const tarballUrl =
      typeof nodeAny?.tarballUrl === "string" ? (nodeAny.tarballUrl as string) : "NOASSERTION";

    const pkg: SpdxPackage = {
      SPDXID: spdxId,
      name: entry.name,
      versionInfo: entry.version,
      downloadLocation: tarballUrl,
      filesAnalyzed: false,
      licenseConcluded: entry.license ?? "NOASSERTION",
      licenseDeclared: entry.license ?? "NOASSERTION",
      copyrightText: "NOASSERTION",
      externalRefs: [
        {
          referenceCategory: "PACKAGE-MANAGER",
          referenceType: "purl",
          referenceLocator: purl,
        },
      ],
    };

    packages.push(pkg);
  }

  // Build relationships from edges
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const fromId = fromNode.depth === 0 ? rootSpdxId : toSpdxId(fromNode.name, fromNode.version);
    const toId = toSpdxId(toNode.name, toNode.version);

    relationships.push({
      spdxElementId: fromId,
      relatedSpdxElement: toId,
      relationshipType: "DEPENDS_ON",
    });
  }

  // Add DESCRIBES relationship
  relationships.unshift({
    spdxElementId: rootSpdxId,
    relatedSpdxElement: rootSpdxId,
    relationshipType: "DESCRIBES",
  });

  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: rootSpdxId,
    name: rootNode?.name ?? "root",
    documentNamespace: `https://spdx.org/spdxdocs/${rootNode?.name ?? "root"}-${randomUUID()}`,
    creationInfo: {
      created: new Date().toISOString(),
      creators: ["Tool: aminet-0.1.1"],
      licenseListVersion: "3.22",
    },
    packages,
    relationships,
  };
}

export function renderSpdx(report: Report, graph: DependencyGraph): void {
  const doc = buildSpdxDocument(report, graph);
  console.log(JSON.stringify(doc, null, 2));
}

function toSpdxId(name: string, version: string): string {
  // SPDX IDs: letters, numbers, dots, hyphens only
  const sanitized = `${name}-${version}`
    .replace(/@/g, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9.-]/g, "-");
  return `SPDXRef-Package-${sanitized}`;
}
