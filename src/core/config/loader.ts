import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../utils/logger.js";
import type { AmiConfig } from "./types.js";

const CONFIG_FILENAME = "ami.config.json";

export function loadConfig(dir?: string): AmiConfig {
  const searchDir = dir ?? process.cwd();
  const configPath = join(searchDir, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as AmiConfig;
    logger.debug(`Loaded config from ${configPath}`);
    return config;
  } catch (error) {
    logger.warn(
      `Failed to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}
