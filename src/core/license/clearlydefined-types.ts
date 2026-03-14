export interface ClearlyDefinedDefinition {
  described?: {
    releaseDate?: string;
    sourceLocation?: {
      type: string;
      provider: string;
      namespace?: string;
      name: string;
      revision: string;
      url?: string;
    };
  };
  licensed?: {
    declared?: string;
    toolScore?: {
      total: number;
      declared: number;
      discovered: number;
      consistency: number;
      spdx: number;
      texts: number;
    };
    facets?: {
      core?: {
        discovered?: {
          expressions: string[];
        };
        attribution?: {
          parties: string[];
        };
      };
    };
  };
  scores?: {
    effective: number;
    tool: number;
  };
}
