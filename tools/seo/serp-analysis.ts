#!/usr/bin/env bun
/**
 * SERP Analysis Tool
 *
 * Uses the DataForSEO API to analyze search engine results pages for given keywords.
 * Checks who ranks for each keyword, gets difficulty scores, and identifies SERP features.
 *
 * Usage:
 *   bun run tools/seo/serp-analysis.ts "AI coding agent" "multi-agent development"
 *   bun run tools/seo/serp-analysis.ts -f tools/seo/output/keywords-2026-03-09.json
 *   bun run tools/seo/serp-analysis.ts --help
 */

import { config, DEFAULT_SEED_KEYWORDS, getTimestamp, writeOutput, parseArgs, loadKeywordsFromFile } from "./config";

interface SerpResult {
  position: number;
  url: string;
  title: string;
  domain: string;
  description: string;
}

interface SerpFeature {
  type: string;
  position?: number;
}

interface KeywordSerpData {
  keyword: string;
  difficulty: number;
  searchVolume: number;
  results: SerpResult[];
  serpFeatures: SerpFeature[];
  totalResults: number;
}

interface SerpAnalysisOutput {
  timestamp: string;
  keywords: string[];
  serpData: KeywordSerpData[];
  summary: {
    totalKeywordsAnalyzed: number;
    avgDifficulty: number;
    keywordsWithFeaturedSnippets: number;
    keywordsWithPAA: number;
  };
}

const HELP_TEXT = `
SERP Analysis Tool — DataForSEO API

Usage:
  bun run tools/seo/serp-analysis.ts [keywords...]
  bun run tools/seo/serp-analysis.ts -f <keywords-file.json>

Arguments:
  keywords         One or more keywords to analyze (quoted strings)
                   If none provided, uses default seed keywords

Options:
  -f, --file       Load keywords from a JSON file (keyword-research output)
  --help, -h       Show this help message

Examples:
  bun run tools/seo/serp-analysis.ts "AI coding agent"
  bun run tools/seo/serp-analysis.ts -f tools/seo/output/keywords-2026-03-09T12-00-00.json

Output:
  tools/seo/output/serp-{timestamp}.json

Environment:
  DATAFORSEO_LOGIN      Your DataForSEO login
  DATAFORSEO_PASSWORD   Your DataForSEO password
`.trim();

function getAuthHeader(): string {
  const { login, password } = config.dataForSeo;
  if (!login || !password) {
    console.error("Error: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set.");
    console.error("Set them in tools/seo/.env or as environment variables.");
    process.exit(1);
  }
  return `Basic ${btoa(`${login}:${password}`)}`;
}

/** Max concurrent SERP requests (DataForSEO allows up to 2000/min, but we stay conservative) */
const SERP_CONCURRENCY = 10;
/** Delay between batches in ms */
const BATCH_DELAY_MS = 500;
/** Max retries per keyword */
const MAX_RETRIES = 3;
/** Delay between retries in ms (doubles each retry) */
const RETRY_BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch SERP data for a single keyword with retry logic.
 * DataForSEO SERP Live Advanced endpoint only supports 1 task per request.
 */
async function fetchSerpForKeyword(
  keyword: string,
  baseUrl: string,
  auth: string,
): Promise<KeywordSerpData | null> {
  const task = [{
    keyword,
    location_code: 2840, // US
    language_code: "en",
    device: "desktop",
    os: "windows",
    depth: 10,
  }];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/serp/google/organic/live/advanced`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": auth,
        },
        body: JSON.stringify(task),
      });

      if (!response.ok) {
        const body = await response.text();
        console.warn(`  ⚠ HTTP ${response.status} for "${keyword}" (attempt ${attempt}/${MAX_RETRIES}): ${body.slice(0, 200)}`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
          continue;
        }
        return null;
      }

      const postData = await response.json() as any;

      if (!postData.tasks || postData.tasks.length === 0) {
        console.warn(`  ⚠ No tasks returned for "${keyword}" (attempt ${attempt}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
          continue;
        }
        return null;
      }

      const taskResult = postData.tasks[0];
      if (taskResult.status_code !== 20000 || !taskResult.result) {
        console.warn(`  ⚠ Task failed for "${keyword}": status_code=${taskResult.status_code}, status_message="${taskResult.status_message ?? "unknown"}" (attempt ${attempt}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
          continue;
        }
        return null;
      }

      // Parse the first result
      const result = taskResult.result[0];
      if (!result) return null;

      const serpResults: SerpResult[] = [];
      const serpFeatures: SerpFeature[] = [];
      const searchVolume = result.search_volume ?? 0;

      if (result.items) {
        for (const item of result.items) {
          if (item.type === "organic") {
            serpResults.push({
              position: item.rank_absolute ?? item.position,
              url: item.url ?? "",
              title: item.title ?? "",
              domain: item.domain ?? "",
              description: item.description ?? "",
            });
          } else {
            serpFeatures.push({
              type: item.type,
              position: item.rank_absolute ?? item.position,
            });
          }
        }
      }

      return {
        keyword: result.keyword ?? keyword,
        difficulty: result.keyword_difficulty ?? 0,
        searchVolume,
        results: serpResults,
        serpFeatures,
        totalResults: result.se_results_count ?? 0,
      };
    } catch (err: any) {
      console.warn(`  ⚠ Network error for "${keyword}" (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function analyzeSerpForKeywords(keywords: string[]): Promise<KeywordSerpData[]> {
  const { baseUrl } = config.dataForSeo;
  const auth = getAuthHeader();
  const total = keywords.length;

  console.log(`Analyzing SERP data for ${total} keyword(s) (concurrency: ${SERP_CONCURRENCY})...`);

  const results: KeywordSerpData[] = [];
  let completed = 0;
  let failed = 0;

  // Process keywords in batches with controlled concurrency
  for (let i = 0; i < total; i += SERP_CONCURRENCY) {
    const batch = keywords.slice(i, i + SERP_CONCURRENCY);
    const batchPromises = batch.map((keyword) => fetchSerpForKeyword(keyword, baseUrl, auth));
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result) {
        results.push(result);
      } else {
        failed++;
      }
      completed++;
    }

    console.log(`  Fetching SERP data: ${completed}/${total}${failed > 0 ? ` (${failed} failed)` : ""}`);

    // Delay between batches to avoid rate limiting (skip after last batch)
    if (i + SERP_CONCURRENCY < total) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  if (failed > 0) {
    console.warn(`  ⚠ ${failed}/${total} keywords failed to return SERP data`);
  }

  return results;
}

async function getKeywordDifficulty(keywords: string[]): Promise<Map<string, number>> {
  const { baseUrl } = config.dataForSeo;
  const auth = getAuthHeader();

  console.log(`Fetching keyword difficulty scores...`);

  const tasks = keywords.map((keyword) => ({
    keyword,
    location_code: 2840,
    language_code: "en",
  }));

  const response = await fetch(`${baseUrl}/keywords_data/google_ads/search_volume/live`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": auth,
    },
    body: JSON.stringify(tasks),
  });

  const difficultyMap = new Map<string, number>();

  if (!response.ok) {
    console.warn(`  Warning: Could not fetch keyword difficulty (${response.status})`);
    return difficultyMap;
  }

  const data = await response.json() as any;
  if (data.tasks) {
    for (const task of data.tasks) {
      if (task.status_code !== 20000 || !task.result) {
        console.warn(`  ⚠ Keyword difficulty task failed: status_code=${task.status_code}, status_message="${task.status_message ?? "unknown"}"`);
        continue;
      }
      for (const result of task.result) {
        if (result.keyword) {
          difficultyMap.set(result.keyword, result.keyword_difficulty ?? result.competition ?? 0);
        }
      }
    }
  }

  return difficultyMap;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  let keywords: string[];
  if (args.file) {
    console.log(`Loading keywords from: ${args.file}`);
    keywords = await loadKeywordsFromFile(args.file);
    // Limit to top 50 keywords to manage API costs
    if (keywords.length > 50) {
      console.log(`  Limiting to top 50 keywords (from ${keywords.length})`);
      keywords = keywords.slice(0, 50);
    }
  } else if (args.keywords.length > 0) {
    keywords = args.keywords;
  } else {
    keywords = DEFAULT_SEED_KEYWORDS;
  }

  console.log(`\nSERP Analysis Tool`);
  console.log(`Keywords to analyze: ${keywords.length}\n`);

  // Fetch SERP data and keyword difficulty in parallel
  const [serpData, difficultyMap] = await Promise.all([
    analyzeSerpForKeywords(keywords),
    getKeywordDifficulty(keywords),
  ]);

  // Merge difficulty scores into SERP data
  for (const item of serpData) {
    if (difficultyMap.has(item.keyword) && item.difficulty === 0) {
      item.difficulty = difficultyMap.get(item.keyword)!;
    }
  }

  // Calculate summary
  const avgDifficulty = serpData.length > 0
    ? serpData.reduce((sum, item) => sum + item.difficulty, 0) / serpData.length
    : 0;
  const keywordsWithFeaturedSnippets = serpData.filter(
    (item) => item.serpFeatures.some((f) => f.type === "featured_snippet")
  ).length;
  const keywordsWithPAA = serpData.filter(
    (item) => item.serpFeatures.some((f) => f.type === "people_also_ask")
  ).length;

  const output: SerpAnalysisOutput = {
    timestamp: new Date().toISOString(),
    keywords,
    serpData,
    summary: {
      totalKeywordsAnalyzed: serpData.length,
      avgDifficulty: Math.round(avgDifficulty * 100) / 100,
      keywordsWithFeaturedSnippets,
      keywordsWithPAA,
    },
  };

  const filename = `serp-${getTimestamp()}.json`;
  await writeOutput(filename, output);

  console.log(`\nSERP Analysis Summary:`);
  console.log(`  Keywords analyzed: ${serpData.length}`);
  console.log(`  Average difficulty: ${output.summary.avgDifficulty}`);
  console.log(`  With featured snippets: ${keywordsWithFeaturedSnippets}`);
  console.log(`  With People Also Ask: ${keywordsWithPAA}`);

  if (serpData.length > 0) {
    console.log(`\nTop keyword opportunities (lowest difficulty):`);
    const sorted = [...serpData].sort((a, b) => a.difficulty - b.difficulty);
    for (const item of sorted.slice(0, 5)) {
      console.log(`  ${item.keyword} — difficulty: ${item.difficulty}, results: ${item.results.length}`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
