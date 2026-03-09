#!/usr/bin/env bun
/**
 * Keyword Research Tool
 *
 * Uses the Keywords Everywhere API to find related keywords with search volume,
 * CPC, and competition data. Also fetches "People Also Search For" data.
 *
 * Usage:
 *   bun run tools/seo/keyword-research.ts "AI coding agent" "multi-agent development"
 *   bun run tools/seo/keyword-research.ts --help
 *   bun run tools/seo/keyword-research.ts              # uses default seed keywords
 */

import { config, DEFAULT_SEED_KEYWORDS, getTimestamp, writeOutput, parseArgs } from "./config";

interface KeywordData {
  keyword: string;
  searchVolume: number;
  cpc: number;
  competition: number;
  source: string[];
}

interface KeywordResearchOutput {
  timestamp: string;
  seedKeywords: string[];
  keywords: KeywordData[];
  totalKeywords: number;
}

const HELP_TEXT = `
Keyword Research Tool — Keywords Everywhere API

Usage:
  bun run tools/seo/keyword-research.ts [keywords...]

Arguments:
  keywords       One or more seed keywords (quoted strings)
                 If none provided, uses default seed keywords

Options:
  --help, -h     Show this help message

Examples:
  bun run tools/seo/keyword-research.ts "AI coding agent" "code orchestration"
  bun run tools/seo/keyword-research.ts

Output:
  tools/seo/output/keywords-{timestamp}.json

Environment:
  KEYWORDS_EVERYWHERE_API_KEY   Your Keywords Everywhere API key
`.trim();

async function fetchRelatedKeywords(keywords: string[]): Promise<KeywordData[]> {
  const { apiKey, baseUrl } = config.keywordsEverywhere;

  if (!apiKey) {
    console.error("Error: KEYWORDS_EVERYWHERE_API_KEY is not set.");
    console.error("Set it in tools/seo/.env or as an environment variable.");
    process.exit(1);
  }

  console.log(`Fetching related keywords for ${keywords.length} seed keyword(s)...`);

  const response = await fetch(`${baseUrl}/get_related_keywords`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: new URLSearchParams({
      kw: JSON.stringify(keywords),
      country: "us",
      currency: "USD",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Keywords Everywhere API error (${response.status}): ${body}`);
  }

  const data = await response.json() as any;
  const results: KeywordData[] = [];

  if (data.data) {
    for (const item of data.data) {
      results.push({
        keyword: item.keyword,
        searchVolume: item.vol ?? item.search_volume ?? 0,
        cpc: item.cpc?.value ?? item.cpc ?? 0,
        competition: item.competition ?? 0,
        source: ["related"],
      });
    }
  }

  console.log(`  Found ${results.length} related keywords`);
  return results;
}

async function fetchPeopleAlsoSearchFor(keywords: string[]): Promise<KeywordData[]> {
  const { apiKey, baseUrl } = config.keywordsEverywhere;

  console.log(`Fetching 'People Also Search For' data...`);

  const response = await fetch(`${baseUrl}/get_pasf_keywords`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: new URLSearchParams({
      kw: JSON.stringify(keywords),
      country: "us",
      currency: "USD",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Keywords Everywhere PASF API error (${response.status}): ${body}`);
  }

  const data = await response.json() as any;
  const results: KeywordData[] = [];

  if (data.data) {
    for (const item of data.data) {
      results.push({
        keyword: item.keyword,
        searchVolume: item.vol ?? item.search_volume ?? 0,
        cpc: item.cpc?.value ?? item.cpc ?? 0,
        competition: item.competition ?? 0,
        source: ["pasf"],
      });
    }
  }

  console.log(`  Found ${results.length} PASF keywords`);
  return results;
}

function deduplicateAndMerge(allKeywords: KeywordData[]): KeywordData[] {
  const map = new Map<string, KeywordData>();

  for (const kw of allKeywords) {
    const key = kw.keyword.toLowerCase().trim();
    const existing = map.get(key);
    if (existing) {
      // Merge sources
      existing.source = [...new Set([...existing.source, ...kw.source])];
      // Keep highest search volume
      if (kw.searchVolume > existing.searchVolume) {
        existing.searchVolume = kw.searchVolume;
      }
      // Keep highest CPC
      if (kw.cpc > existing.cpc) {
        existing.cpc = kw.cpc;
      }
      // Keep highest competition
      if (kw.competition > existing.competition) {
        existing.competition = kw.competition;
      }
    } else {
      map.set(key, { ...kw, keyword: kw.keyword.trim() });
    }
  }

  // Sort by search volume descending
  return Array.from(map.values()).sort((a, b) => b.searchVolume - a.searchVolume);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const seedKeywords = args.keywords.length > 0 ? args.keywords : DEFAULT_SEED_KEYWORDS;
  console.log(`\nKeyword Research Tool`);
  console.log(`Seed keywords: ${seedKeywords.join(", ")}\n`);

  const allKeywords: KeywordData[] = [];

  // Fetch related keywords and PASF in parallel
  const [related, pasf] = await Promise.all([
    fetchRelatedKeywords(seedKeywords),
    fetchPeopleAlsoSearchFor(seedKeywords),
  ]);

  allKeywords.push(...related, ...pasf);

  // Also add seed keywords themselves for completeness
  for (const kw of seedKeywords) {
    allKeywords.push({
      keyword: kw,
      searchVolume: 0,
      cpc: 0,
      competition: 0,
      source: ["seed"],
    });
  }

  // Deduplicate and merge
  const merged = deduplicateAndMerge(allKeywords);

  const output: KeywordResearchOutput = {
    timestamp: new Date().toISOString(),
    seedKeywords,
    keywords: merged,
    totalKeywords: merged.length,
  };

  const filename = `keywords-${getTimestamp()}.json`;
  await writeOutput(filename, output);

  console.log(`\nTotal unique keywords: ${merged.length}`);
  console.log(`Top keywords by search volume:`);
  for (const kw of merged.slice(0, 10)) {
    console.log(`  ${kw.keyword} — vol: ${kw.searchVolume}, cpc: $${kw.cpc}, comp: ${kw.competition}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
