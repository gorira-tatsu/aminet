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
  validate?: (input: string) => string | null;
  invalidMessage?: string;
}

export type PrivateRegistryMode = "auth" | "exclude" | "both" | "none";

const VULN_THRESHOLDS = new Set(["low", "medium", "high", "critical"]);
const LICENSE_THRESHOLDS = new Set(["copyleft", "weak-copyleft"]);

const CONFIG_FIELDS: ConfigField[] = [
  {
    key: "failOnVuln",
    prompt: "Vulnerability severity threshold (low/medium/high/critical)",
    type: "string",
    defaultValue: "high",
    validate: (input) => normalizeThresholdInput(input, VULN_THRESHOLDS),
    invalidMessage: "Enter one of: low, medium, high, critical.",
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
    key: "failOnLicense",
    prompt: "License failure threshold (copyleft/weak-copyleft, or empty for none)",
    type: "string",
    defaultValue: undefined,
    validate: (input) => normalizeThresholdInput(input, LICENSE_THRESHOLDS),
    invalidMessage: "Enter one of: copyleft, weak-copyleft.",
  },
  {
    key: "excludePackages",
    prompt: "Packages to exclude (comma-separated internal/private patterns to skip)",
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

function formatDefaultHint(value: unknown): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(",") : "";
  }
  return String(value);
}

export function parseBooleanInput(input: string, fallback: boolean): boolean | null {
  const trimmed = input.trim();
  if (trimmed === "") return fallback;

  const normalized = trimmed.toLowerCase();
  if (["y", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["n", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

export function normalizeThresholdInput(
  input: string,
  allowed: ReadonlySet<string>,
): string | null {
  const normalized = input.trim().toLowerCase();
  if (normalized === "") return "";
  return allowed.has(normalized) ? normalized : null;
}

export function parsePrivateRegistryModeInput(
  input: string,
  fallback: PrivateRegistryMode,
): PrivateRegistryMode | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return fallback;
  if (trimmed === "a" || trimmed === "auth") return "auth";
  if (trimmed === "e" || trimmed === "exclude") return "exclude";
  if (trimmed === "b" || trimmed === "both") return "both";
  if (trimmed === "n" || trimmed === "none") return "none";
  return null;
}

export function shouldPromptForExcludePackages(mode: PrivateRegistryMode): boolean {
  return mode === "exclude" || mode === "both";
}

export function getPrivateRegistryModeFallback(existingConfig?: AmiConfig): PrivateRegistryMode {
  const hasExcludePackages = Boolean(
    existingConfig?.excludePackages && existingConfig.excludePackages.length > 0,
  );
  const hasConfiguredAuth =
    typeof existingConfig?.npmToken === "string" && existingConfig.npmToken.trim().length > 0;

  if (hasConfiguredAuth && hasExcludePackages) {
    return "both";
  }
  if (hasConfiguredAuth) {
    return "auth";
  }
  if (hasExcludePackages) {
    return "exclude";
  }

  return "none";
}

export function resolvePrivateRegistryMode(
  selectedMode: PrivateRegistryMode,
  config: AmiConfig,
): PrivateRegistryMode {
  const hasExcludePackages = Boolean(config.excludePackages && config.excludePackages.length > 0);
  const hasConfiguredAuth =
    typeof config.npmToken === "string" && config.npmToken.trim().length > 0;
  const hasAuth = selectedMode === "auth" || selectedMode === "both" || hasConfiguredAuth;

  if (hasAuth && hasExcludePackages) {
    return "both";
  }
  if (hasAuth) {
    return "auth";
  }
  if (hasExcludePackages) {
    return "exclude";
  }

  return "none";
}

export function buildPrivateRegistryGuidance(
  config: AmiConfig,
  mode: PrivateRegistryMode,
): string[] {
  const lines = ["Private registry guidance:"];

  if (mode === "auth" || mode === "both") {
    lines.push("- Set NPM_TOKEN in the environment when private packages should be analyzed.");
  }

  if (mode === "exclude" || mode === "both") {
    lines.push("- Use excludePackages when internal packages should be skipped instead.");
  }

  if (mode === "none") {
    lines.push("- No private package handling is configured yet.");
    lines.push(
      "- Use NPM_TOKEN for authenticated private registries, or excludePackages to skip internal packages later.",
    );
  }

  if (config.excludePackages && config.excludePackages.length > 0) {
    lines.push(`- Current exclude patterns: ${config.excludePackages.join(", ")}`);
  }

  return lines;
}

function formatConfig(config: AmiConfig, redactSecrets = true): string {
  // Remove fields with empty arrays or undefined values for cleaner output
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (redactSecrets && key === "npmToken") continue;
    clean[key] = value;
  }
  return JSON.stringify(clean, null, 2);
}

function serializeConfig(config: AmiConfig): string {
  return formatConfig(config, false);
}

export async function initCommand(options: InitOptions): Promise<void> {
  if (options.force && options.merge) {
    console.error(chalk.red("--force and --merge are mutually exclusive."));
    process.exit(1);
  }

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
    let existing: AmiConfig;
    try {
      existing = JSON.parse(readFileSync(configPath, "utf-8")) as AmiConfig;
    } catch (error) {
      console.error(
        chalk.red(
          `Failed to parse ${CONFIG_FILENAME}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      process.exit(1);
    }
    config = mergeConfigs(existing, defaults);
    console.log(chalk.green(`Merged defaults into existing ${CONFIG_FILENAME}`));
  } else {
    config = defaults;
    console.log(chalk.green(`Generated ${CONFIG_FILENAME} with defaults`));
  }

  writeFileSync(configPath, `${serializeConfig(config)}\n`, "utf-8");
  console.log(formatConfig(config));
  printPrivateRegistryGuidance(config, "", resolvePrivateRegistryMode("none", config));
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
        try {
          existingConfig = JSON.parse(readFileSync(configPath, "utf-8")) as AmiConfig;
        } catch (error) {
          console.error(
            chalk.red(
              `\n  Failed to parse ${CONFIG_FILENAME}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
          console.error(chalk.dim("  Fix or remove the existing config file and try again."));
          process.exitCode = 1;
          return;
        }
      }
    }

    const config: AmiConfig = {};
    const privateRegistryMode = await promptPrivateRegistryMode(rl, existingConfig);
    if (!shouldPromptForExcludePackages(privateRegistryMode)) {
      config.excludePackages = [];
    }

    for (const field of CONFIG_FIELDS) {
      if (field.key === "excludePackages" && !shouldPromptForExcludePackages(privateRegistryMode)) {
        continue;
      }

      const promptDefault = existingConfig?.[field.key] ?? field.defaultValue;
      const defaultStr = promptDefault === undefined ? "" : formatDefaultHint(promptDefault);
      const hint = field.hint ? chalk.dim(` (${field.hint})`) : "";
      const defaultHint = defaultStr ? chalk.dim(` [${defaultStr}]`) : "";

      if (field.type === "boolean") {
        while (true) {
          const answer = await rl.question(`  ${field.prompt}${hint}${defaultHint}: `);
          const fallback = Boolean(promptDefault);
          const parsed = parseBooleanInput(answer, fallback);
          if (parsed !== null) {
            (config as Record<string, unknown>)[field.key] = parsed;
            break;
          }
          console.log(chalk.yellow("  Enter y/yes/true/1 or n/no/false/0."));
        }
      } else if (field.type === "number") {
        const answer = await rl.question(`  ${field.prompt}${hint}${defaultHint}: `);
        const trimmed = answer.trim();
        if (trimmed === "") {
          if (promptDefault !== undefined) {
            (config as Record<string, unknown>)[field.key] = promptDefault;
          }
        } else {
          const num = parseInt(trimmed, 10);
          if (!Number.isNaN(num)) {
            (config as Record<string, unknown>)[field.key] = num;
          }
        }
      } else if (field.type === "string[]") {
        const answer = await rl.question(`  ${field.prompt}${hint}${defaultHint}: `);
        const trimmed = answer.trim();
        if (trimmed) {
          (config as Record<string, unknown>)[field.key] = trimmed
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        } else if (Array.isArray(promptDefault) && promptDefault.length > 0) {
          (config as Record<string, unknown>)[field.key] = [...promptDefault];
        }
      } else {
        while (true) {
          const answer = await rl.question(`  ${field.prompt}${hint}${defaultHint}: `);
          const trimmed = answer.trim();
          if (trimmed === "") {
            if (promptDefault !== undefined) {
              (config as Record<string, unknown>)[field.key] = promptDefault;
            }
            break;
          }

          if (field.validate) {
            const validated = field.validate(trimmed);
            if (validated === null) {
              console.log(chalk.yellow(`  ${field.invalidMessage ?? "Invalid input."}`));
              continue;
            }
            (config as Record<string, unknown>)[field.key] = validated;
          } else {
            (config as Record<string, unknown>)[field.key] = trimmed;
          }
          break;
        }
      }
    }

    const finalConfig = existingConfig ? mergeConfigs(config, existingConfig) : config;
    const finalPrivateRegistryMode = resolvePrivateRegistryMode(privateRegistryMode, finalConfig);

    console.log(chalk.bold("\n  Generated config:\n"));
    console.log(formatConfig(finalConfig));

    const confirm = await rl.question(chalk.dim("\n  Write to file? [Y/n]: "));
    if (confirm.trim().toLowerCase() === "n") {
      console.log(chalk.dim("  Cancelled."));
      return;
    }

    writeFileSync(configPath, `${serializeConfig(finalConfig)}\n`, "utf-8");
    console.log(chalk.green(`\n  Wrote ${CONFIG_FILENAME}`));
    printPrivateRegistryGuidance(finalConfig, "  ", finalPrivateRegistryMode);
  } finally {
    rl.close();
  }
}

async function promptPrivateRegistryMode(
  rl: ReturnType<typeof createInterface>,
  existingConfig?: AmiConfig,
): Promise<PrivateRegistryMode> {
  const fallback = getPrivateRegistryModeFallback(existingConfig);

  while (true) {
    const answer = await rl.question(
      "  Private registry handling: (a)uth / (e)xclude / (b)oth / (n)either? " +
        chalk.dim(`[${fallback}]`) +
        ": ",
    );
    const parsed = parsePrivateRegistryModeInput(answer, fallback);
    if (parsed !== null) {
      return parsed;
    }
    console.log(chalk.yellow("  Enter auth, exclude, both, or none (a/e/b/n)."));
  }
}

function printPrivateRegistryGuidance(
  config: AmiConfig,
  indent = "",
  mode: PrivateRegistryMode = "none",
): void {
  const lines = buildPrivateRegistryGuidance(config, mode).map(
    (line) => `${indent}${formatGuidanceLine(line)}`,
  );

  console.log(chalk.dim(`\n${lines.join("\n")}`));
}

function formatGuidanceLine(line: string): string {
  return line
    .replaceAll("NPM_TOKEN", chalk.bold("NPM_TOKEN"))
    .replaceAll("excludePackages", chalk.bold("excludePackages"));
}
