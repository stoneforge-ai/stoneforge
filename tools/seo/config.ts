/**
 * SEO Tooling Configuration
 *
 * Environment variables are loaded from tools/seo/.env
 * Copy .env.example to .env and fill in your API credentials.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from tools/seo/.env
const envPath = resolve(__dirname, ".env");
try {
  const envFile = await Bun.file(envPath).text();
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env file may not exist — that's fine, env vars may be set externally
}

export const config = {
  keywordsEverywhere: {
    apiKey: process.env.KEYWORDS_EVERYWHERE_API_KEY ?? "",
    baseUrl: "https://api.keywordseverywhere.com/v1",
  },
  dataForSeo: {
    login: process.env.DATAFORSEO_LOGIN ?? "",
    password: process.env.DATAFORSEO_PASSWORD ?? "",
    baseUrl: "https://api.dataforseo.com/v3",
  },
  outputDir: resolve(__dirname, "output"),
} as const;

/** Default seed keywords for Stoneforge SEO research */
export const DEFAULT_SEED_KEYWORDS = [
  "AI coding agent",
  "multi-agent development",
  "parallel AI development",
  "code orchestration",
  "claude code teams",
  "claude code teams alternative",
  "run multiple AI agents",
  "AI pair programming",
  "automated code review AI",
];

export function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function writeOutput(filename: string, data: unknown): Promise<string> {
  const { mkdirSync } = await import("fs");
  mkdirSync(config.outputDir, { recursive: true });
  const filepath = resolve(config.outputDir, filename);
  await Bun.write(filepath, JSON.stringify(data, null, 2));
  console.log(`Output written to: ${filepath}`);
  return filepath;
}

export function parseArgs(args: string[]): { keywords: string[]; help: boolean; file?: string; domains?: string[] } {
  const result: { keywords: string[]; help: boolean; file?: string; domains?: string[] } = {
    keywords: [],
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--file" || arg === "-f") {
      result.file = args[++i];
    } else if (arg === "--domain" || arg === "-d") {
      if (!result.domains) result.domains = [];
      result.domains.push(args[++i]);
    } else if (!arg.startsWith("-")) {
      result.keywords.push(arg);
    }
  }

  return result;
}

/**
 * Load keywords from a JSON file (output from keyword-research).
 * Expects an array of objects with a `keyword` field, or an object with a `keywords` array.
 */
export async function loadKeywordsFromFile(filepath: string): Promise<string[]> {
  const content = await Bun.file(filepath).json();
  if (Array.isArray(content)) {
    return content.map((item: any) => item.keyword ?? item).filter(Boolean);
  }
  if (content.keywords && Array.isArray(content.keywords)) {
    return content.keywords.map((item: any) => item.keyword ?? item).filter(Boolean);
  }
  throw new Error(`Could not parse keywords from file: ${filepath}`);
}
