import { randomUUID } from "node:crypto";
import type { DependencyGraph } from "../../core/graph/types.js";
import type { Report } from "../../core/report/types.js";

interface CycloneDxComponent {
  type: string;
  "bom-ref": string;
  name: string;
  version: string;
  purl: string;
  licenses?: Array<{ license: { id?: string; name?: string } }>;
  hashes?: Array<{ alg: string; content: string }>;
  description?: string;
}

interface CycloneDxDependency {
  ref: string;
  dependsOn: string[];
}

interface CycloneDxBom {
  bomFormat: string;
  specVersion: string;
  version: number;
  serialNumber: string;
  metadata: {
    timestamp: string;
    tools: Array<{ vendor: string; name: string; version: string }>;
  };
  components: CycloneDxComponent[];
  dependencies: CycloneDxDependency[];
}

export function buildCycloneDxBom(report: Report, graph: DependencyGraph): CycloneDxBom {
  const components: CycloneDxComponent[] = [];

  for (const entry of report.entries) {
    if (entry.depth === 0) continue; // Skip root

    const node = graph.nodes.get(entry.id);
    const scopedName = entry.name.startsWith("@") ? `%40${entry.name.slice(1)}` : entry.name;
    const purl = `pkg:npm/${scopedName}@${entry.version}`;

    const component: CycloneDxComponent = {
      type: "library",
      "bom-ref": purl,
      name: entry.name,
      version: entry.version,
      purl,
    };

    if (entry.license) {
      component.licenses = [{ license: { id: entry.license } }];
    }

    // Add integrity hash if available from node data
    if (node) {
      const nodeAny = node as unknown as Record<string, unknown>;
      if (typeof nodeAny.integrity === "string" && nodeAny.integrity) {
        const integrity = nodeAny.integrity as string;
        const match = integrity.match(/^(sha256|sha384|sha512)-(.+)$/);
        if (match) {
          const algMap: Record<string, string> = {
            sha256: "SHA-256",
            sha384: "SHA-384",
            sha512: "SHA-512",
          };
          const decoded = Buffer.from(match[2], "base64").toString("hex");
          component.hashes = [{ alg: algMap[match[1]] ?? match[1], content: decoded }];
        }
      }
    }

    components.push(component);
  }

  // Build dependency tree
  const dependencyMap = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const fromPurl = nodeToPurl(fromNode.name, fromNode.version);
    const toPurl = nodeToPurl(toNode.name, toNode.version);

    if (!dependencyMap.has(fromPurl)) {
      dependencyMap.set(fromPurl, new Set());
    }
    dependencyMap.get(fromPurl)!.add(toPurl);
  }

  const dependencies: CycloneDxDependency[] = [];
  for (const [ref, deps] of dependencyMap) {
    dependencies.push({ ref, dependsOn: [...deps] });
  }

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    serialNumber: `urn:uuid:${randomUUID()}`,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: "aminet", name: "aminet", version: "0.1.1" }],
    },
    components,
    dependencies,
  };
}

export function renderCycloneDx(report: Report, graph: DependencyGraph): void {
  const bom = buildCycloneDxBom(report, graph);
  console.log(JSON.stringify(bom, null, 2));
}

function nodeToPurl(name: string, version: string): string {
  const scopedName = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${scopedName}@${version}`;
}
