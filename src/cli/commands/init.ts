import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import type { AmiConfig } from "../../core/config/types.js";

const CONFIG_FILENAME = "aminet.config.json";

export interface InitOptions {
  defaults?: boolean;
  force?: boolean;
  merge?: boolean;
}

interface ConfigField {
  key: keyof AmiConfig;
  prompt: string;
  type: "string" | "number" | "boolean" | "string[]";
  defaultValue: unknown;
  hint?: string;
}

const CONFIG_FIELDS: ConfigField[] = [
  {
    key: "failOnVuln",
    prompt: "Vulnerability severity threshold (low/medium/high/critical)",
    type: "string",
    defaultValue: "high",
  },
  {
    key: "security",
    prompt: "Enable security deep analysis?",
    type: "boolean",
    defaultValue: true,
  },
  {
    key: "denyLicenses",
    prompt: "Denied licenses (comma-separated SPDX IDs, or empty)",
    type: "string[]",
    defaultValue: [],
    hint: "e.g., GPL-3.0,AGPL-3.0",
  },
  {
    key: "allowLicenses",
    prompt: "Allowed licenses (comma-separated, or empty for no whitelist)",
    type: "string[]",
    defaultValue: [],
    hint: "e.g., MIT,ISC,Apache-2.0",
  },
  {
    key: "depth",
    prompt: "Maximum dependency depth (or empty for unlimited)",
    type: "number",
    defaultValue: undefined,
  },
  {
    key: "concurrency",
    prompt: "Concurrent requests",
    type: "number",
    defaultValue: 5,
  },
  {
    key: "deepLicenseCheck",
    prompt: "Deep license check (verify LICENSE files from tarballs)?",
    type: "boolean",
    defaultValue: false,
  },
  {
    key: "excludePackages",
    prompt: "Packages to exclude (comma-separated, supports wildcards)",
    type: "string[]",
    defaultValue: [],
    hint: "e.g., @my-org/*,legacy-pkg",
  },
];

export function buildDefaultConfig(): AmiConfig {
  const config: AmiConfig = {};
  for (const field of CONFIG_FIELDS) {
    if (field.defaultValue !== undefined) {
      (config as Record<string, unknown>)[field.key] = field.defaultValue;
    }
  }
  return config;
}

export function mergeConfigs(existing: AmiConfig, defaults: AmiConfig): AmiConfig {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(existing)) {
    if (value !== undefined && value !== null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function formatConfig(config: AmiConfig): string {
  // Remove fields with empty arrays or undefined values for cleaner output
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    clean[key] = value;
  }
  return JSON.stringify(clean, null, 2);
}

export async function initCommand(options: InitOptions): Promise<void> {
  const configPath = join(process.cwd(), CONFIG_FILENAME);
  const exists = existsSync(configPath);

  if (options.defaults) {
    return handleNonInteractive(configPath, exists, options);
  }

  return handleInteractive(configPath, exists);
}

function handleNonInteractive(configPath: string, exists: boolean, options: InitOptions): void {
  const defaults = buildDefaultConfig();

  if (exists && !options.force && !options.merge) {
    console.error(
      chalk.red(`${CONFIG_FILENAME} already exists. Use --force to overwrite or --merge to merge.`),
    );
    process.exit(1);
  }

  let config: AmiConfig;
  if (exists && options.merge) {
    const existing = JSON.parse(readFileSync(configPath, "utf-8")) as AmiConfig;
    config = mergeConfigs(existing, defaults);
    console.log(chalk.green(`Merged defaults into existing ${CONFIG_FILENAME}`));
  } else {
    config = defaults;
    console.log(chalk.green(`Generated ${CONFIG_FILENAME} with defaults`));
  }

  writeFileSync(configPath, `${formatConfig(config)}\n`, "utf-8");
  console.log(formatConfig(config));
  console.log(chalk.dim("\nTip: Set NPM_TOKEN as an environment variable for private registries."));
}

async function handleInteractive(configPath: string, exists: boolean): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let existingConfig: AmiConfig | undefined;

  try {
    console.log(chalk.bold("\n  aminet configuration\n"));
    console.log(`  This will create ${CONFIG_FILENAME} in the current directory.\n`);

    if (exists) {
      const choice = await rl.question(
        `  ${CONFIG_FILENAME} already exists. (m)erge / (o)verwrite / (c)ancel? [c]: `,
      );
      const normalized = choice.trim().toLowerCase();
      if (normalized === "c" || normalized === "") {
        console.log(chalk.dim("  Cancelled."));
        return;
      }
      if (normalized !== "m" && normalized !== "o") {
        console.log(chalk.dim("  Cancelled."));
        return;
      }

      if (normalized === "m") {
        existingConfig = JSON.parse(readFileSync(configPath, "utf-8")) as AmiConfig;
      }
    }

    const config: AmiConfig = {};

    for (const field of CONFIG_FIELDS) {
      const defaultStr =
        field.defaultValue === undefined
          ? ""
          : Array.isArray(field.defaultValue)
            ? ""
            : String(field.defaultValue);
      const hint = field.hint ? chalk.dim(` (${field.hint})`) : "";
      const defaultHint = defaultStr ? chalk.dim(` [${defaultStr}]`) : "";

      const answer = await rl.question(`  ${field.prompt}${hint}${defaultHint}: `);
      const trimmed = answer.trim();

      if (field.type === "boolean") {
        const val =
          trimmed === ""
            ? field.defaultValue
            : trimmed.toLowerCase() === "y" || trimmed.toLowerCase() === "true";
        (config as Record<string, unknown>)[field.key] = val;
      } else if (field.type === "number") {
        if (trimmed === "") {
          if (field.defaultValue !== undefined) {
            (config as Record<string, unknown>)[field.key] = field.defaultValue;
          }
        } else {
          const num = parseInt(trimmed, 10);
          if (!Number.isNaN(num)) {
            (config as Record<string, unknown>)[field.key] = num;
          }
        }
      } else if (field.type === "string[]") {
        if (trimmed) {
          (config as Record<string, unknown>)[field.key] = trimmed
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      } else {
        (config as Record<string, unknown>)[field.key] = trimmed || field.defaultValue;
      }
    }

    const finalConfig = existingConfig ? mergeConfigs(existingConfig, config) : config;

    console.log(chalk.bold("\n  Generated config:\n"));
    console.log(formatConfig(finalConfig));

    const confirm = await rl.question(chalk.dim("\n  Write to file? [Y/n]: "));
    if (confirm.trim().toLowerCase() === "n") {
      console.log(chalk.dim("  Cancelled."));
      return;
    }

    writeFileSync(configPath, `${formatConfig(finalConfig)}\n`, "utf-8");
    console.log(chalk.green(`\n  Wrote ${CONFIG_FILENAME}`));
    console.log(
      chalk.dim("  Tip: Set NPM_TOKEN as an environment variable for private registries."),
    );
  } finally {
    rl.close();
  }
}
