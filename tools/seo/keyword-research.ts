#!/usr/bin/env bun
/**
 * Keyword Research Tool
 *
 * Uses the DataForSEO Labs API to find related keywords, keyword suggestions,
 * and keyword ideas with search volume, CPC, competition, keyword difficulty,
 * and 12-month trend data. Also fetches "People Also Search For" data via the
 * DataForSEO SERP API.
 *
 * Usage:
 *   bun run tools/seo/keyword-research.ts "AI coding agent" "multi-agent development"
 *   bun run tools/seo/keyword-research.ts --help
 *   bun run tools/seo/keyword-research.ts              # uses default seed keywords
 */

import {
  config,
  DEFAULT_SEED_KEYWORDS,
  getTimestamp,
  writeOutput,
  parseArgs,
} from "./config"

interface MonthlySearch {
  year: number
  month: number
  search_volume: number
}

interface KeywordData {
  keyword: string
  searchVolume: number
  cpc: number
  competition: number
  competitionLevel: string
  keywordDifficulty: number
  monthlySearches: MonthlySearch[]
  source: string[]
}

interface KeywordResearchOutput {
  timestamp: string
  dataSource: "dataforseo"
  seedKeywords: string[]
  keywords: KeywordData[]
  totalKeywords: number
}

const HELP_TEXT = `
Keyword Research Tool — DataForSEO Labs API

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

Data sources:
  - DataForSEO Labs: Related Keywords, Keyword Suggestions, Keyword Ideas
  - DataForSEO SERP: People Also Search For

Output:
  tools/seo/output/keywords-{timestamp}.json

Environment:
  DATAFORSEO_LOGIN      Your DataForSEO login
  DATAFORSEO_PASSWORD   Your DataForSEO password
`.trim()

function getAuthHeader(): string {
  const { login, password } = config.dataForSeo
  if (!login || !password) {
    console.error(
      "Error: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set."
    )
    console.error("Set them in tools/seo/.env or as environment variables.")
    process.exit(1)
  }
  return `Basic ${btoa(`${login}:${password}`)}`
}

/** Extract keyword data from a DataForSEO Labs result item */
function extractKeywordData(item: any, source: string): KeywordData | null {
  // Labs endpoints nest under keyword_data for related_keywords, or directly for suggestions/ideas
  const info = item.keyword_data?.keyword_info ?? item.keyword_info ?? item
  const props =
    item.keyword_data?.keyword_properties ?? item.keyword_properties ?? {}
  const keyword = item.keyword_data?.keyword ?? item.keyword ?? info.keyword

  if (!keyword) return null

  return {
    keyword,
    searchVolume: info.search_volume ?? 0,
    cpc: info.cpc ?? 0,
    competition: info.competition ?? 0,
    competitionLevel: info.competition_level ?? "UNKNOWN",
    keywordDifficulty: props.keyword_difficulty ?? 0,
    monthlySearches: info.monthly_searches ?? [],
    source: [source],
  }
}

async function fetchFromLabsEndpoint(
  endpoint: string,
  body: Record<string, unknown>[],
  source: string,
  label: string
): Promise<KeywordData[]> {
  const { baseUrl } = config.dataForSeo
  const auth = getAuthHeader()

  console.log(`Fetching ${label}...`)

  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DataForSEO ${label} error (${response.status}): ${text}`)
  }

  const data = (await response.json()) as any
  const results: KeywordData[] = []

  if (data.tasks) {
    for (const task of data.tasks) {
      if (task.status_code !== 20000 || !task.result) continue
      for (const result of task.result) {
        if (result.items) {
          for (const item of result.items) {
            const kw = extractKeywordData(item, source)
            if (kw) results.push(kw)
          }
        }
      }
    }
  }

  console.log(`  Found ${results.length} keywords from ${label}`)
  return results
}

async function fetchRelatedKeywords(
  seedKeywords: string[]
): Promise<KeywordData[]> {
  const tasks = seedKeywords.map((keyword) => ({
    keyword,
    location_code: 2840,
    language_code: "en",
    depth: 2,
    limit: 100,
    include_seed_keyword: true,
  }))

  return fetchFromLabsEndpoint(
    "dataforseo_labs/google/related_keywords/live",
    tasks,
    "related_keywords",
    "related keywords"
  )
}

async function fetchKeywordSuggestions(
  seedKeywords: string[]
): Promise<KeywordData[]> {
  const tasks = seedKeywords.map((keyword) => ({
    keyword,
    location_code: 2840,
    language_code: "en",
    limit: 100,
  }))

  return fetchFromLabsEndpoint(
    "dataforseo_labs/google/keyword_suggestions/live",
    tasks,
    "keyword_suggestions",
    "keyword suggestions"
  )
}

async function fetchKeywordIdeas(
  seedKeywords: string[]
): Promise<KeywordData[]> {
  // keyword_ideas accepts an array of keywords in a single task
  const tasks = [
    {
      keywords: seedKeywords,
      location_code: 2840,
      language_code: "en",
      limit: 200,
    },
  ]

  return fetchFromLabsEndpoint(
    "dataforseo_labs/google/keyword_ideas/live",
    tasks,
    "keyword_ideas",
    "keyword ideas"
  )
}

async function fetchPeopleAlsoSearchFor(
  seedKeywords: string[]
): Promise<KeywordData[]> {
  const { baseUrl } = config.dataForSeo
  const auth = getAuthHeader()

  console.log("Fetching 'People Also Search For' via SERP API...")

  const tasks = seedKeywords.map((keyword) => ({
    keyword,
    location_code: 2840,
    language_code: "en",
    device: "desktop",
    os: "windows",
    depth: 10,
  }))

  const response = await fetch(`${baseUrl}/serp/google/organic/live/advanced`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify(tasks),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DataForSEO SERP API error (${response.status}): ${text}`)
  }

  const data = (await response.json()) as any
  const results: KeywordData[] = []

  if (data.tasks) {
    for (const task of data.tasks) {
      if (task.status_code !== 20000 || !task.result) continue
      for (const result of task.result) {
        if (!result.items) continue
        for (const item of result.items) {
          if (item.type === "people_also_search" && item.items) {
            for (const pasf of item.items) {
              const keyword = pasf.title ?? pasf.keyword
              if (keyword) {
                results.push({
                  keyword,
                  searchVolume: 0,
                  cpc: 0,
                  competition: 0,
                  competitionLevel: "UNKNOWN",
                  keywordDifficulty: 0,
                  monthlySearches: [],
                  source: ["people_also_search"],
                })
              }
            }
          }
        }
      }
    }
  }

  console.log(`  Found ${results.length} PASF keywords`)
  return results
}

function deduplicateAndMerge(allKeywords: KeywordData[]): KeywordData[] {
  const map = new Map<string, KeywordData>()

  for (const kw of allKeywords) {
    const key = kw.keyword.toLowerCase().trim()
    const existing = map.get(key)
    if (existing) {
      existing.source = [...new Set([...existing.source, ...kw.source])]
      if (kw.searchVolume > existing.searchVolume) {
        existing.searchVolume = kw.searchVolume
        existing.monthlySearches = kw.monthlySearches
      }
      if (kw.cpc > existing.cpc) existing.cpc = kw.cpc
      if (kw.competition > existing.competition) {
        existing.competition = kw.competition
        existing.competitionLevel = kw.competitionLevel
      }
      if (kw.keywordDifficulty > existing.keywordDifficulty) {
        existing.keywordDifficulty = kw.keywordDifficulty
      }
    } else {
      map.set(key, { ...kw, keyword: kw.keyword.trim() })
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.searchVolume - a.searchVolume
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  const seedKeywords =
    args.keywords.length > 0 ? args.keywords : DEFAULT_SEED_KEYWORDS
  console.log(`\nKeyword Research Tool (DataForSEO)`)
  console.log(`Seed keywords: ${seedKeywords.join(", ")}\n`)

  // Fetch from all four sources in parallel
  const [related, suggestions, ideas, pasf] = await Promise.all([
    fetchRelatedKeywords(seedKeywords),
    fetchKeywordSuggestions(seedKeywords),
    fetchKeywordIdeas(seedKeywords),
    fetchPeopleAlsoSearchFor(seedKeywords),
  ])

  const allKeywords: KeywordData[] = [
    ...related,
    ...suggestions,
    ...ideas,
    ...pasf,
  ]

  // Add seed keywords for completeness
  for (const kw of seedKeywords) {
    allKeywords.push({
      keyword: kw,
      searchVolume: 0,
      cpc: 0,
      competition: 0,
      competitionLevel: "UNKNOWN",
      keywordDifficulty: 0,
      monthlySearches: [],
      source: ["seed"],
    })
  }

  const merged = deduplicateAndMerge(allKeywords)

  const output: KeywordResearchOutput = {
    timestamp: new Date().toISOString(),
    dataSource: "dataforseo",
    seedKeywords,
    keywords: merged,
    totalKeywords: merged.length,
  }

  const filename = `keywords-${getTimestamp()}.json`
  await writeOutput(filename, output)

  console.log(`\nTotal unique keywords: ${merged.length}`)
  console.log(`Top keywords by search volume:`)
  for (const kw of merged.slice(0, 10)) {
    console.log(
      `  ${kw.keyword} — vol: ${kw.searchVolume}, cpc: $${kw.cpc}, comp: ${kw.competition}, KD: ${kw.keywordDifficulty}`
    )
  }
}

main().catch((err) => {
  console.error("Error:", err.message)
  process.exit(1)
})
