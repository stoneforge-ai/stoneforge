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

async function analyzeSerpForKeywords(keywords: string[]): Promise<KeywordSerpData[]> {
  const { baseUrl } = config.dataForSeo;
  const auth = getAuthHeader();

  console.log(`Analyzing SERP data for ${keywords.length} keyword(s)...`);

  // Post tasks to DataForSEO SERP API
  const tasks = keywords.map((keyword) => ({
    keyword,
    location_code: 2840, // US
    language_code: "en",
    device: "desktop",
    os: "windows",
    depth: 10,
  }));

  const postResponse = await fetch(`${baseUrl}/serp/google/organic/live/advanced`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": auth,
    },
    body: JSON.stringify(tasks),
  });

  if (!postResponse.ok) {
    const body = await postResponse.text();
    throw new Error(`DataForSEO SERP API error (${postResponse.status}): ${body}`);
  }

  const postData = await postResponse.json() as any;
  const results: KeywordSerpData[] = [];

  if (postData.tasks) {
    for (const task of postData.tasks) {
      if (task.status_code !== 20000 || !task.result) continue;

      for (const result of task.result) {
        const keyword = result.keyword;
        const serpResults: SerpResult[] = [];
        const serpFeatures: SerpFeature[] = [];
        let searchVolume = result.search_volume ?? 0;

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
              // Track SERP features
              serpFeatures.push({
                type: item.type,
                position: item.rank_absolute ?? item.position,
              });
            }
          }
        }

        results.push({
          keyword,
          difficulty: result.keyword_difficulty ?? 0,
          searchVolume,
          results: serpResults,
          serpFeatures,
          totalResults: result.se_results_count ?? 0,
        });
      }
    }
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
      if (task.status_code !== 20000 || !task.result) continue;
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
