#!/usr/bin/env bun
/**
 * Google Search Console API Integration
 *
 * Pulls search performance data (queries, impressions, clicks, CTR, position)
 * and index coverage from the Google Search Console API using a service account.
 *
 * Usage:
 *   bun run tools/seo/search-console.ts
 *   bun run tools/seo/search-console.ts --days 90
 *   bun run tools/seo/search-console.ts --page "/docs/*"
 *   bun run tools/seo/search-console.ts --country USA
 *   bun run tools/seo/search-console.ts --type query
 *   bun run tools/seo/search-console.ts --help
 */

import { config, getTimestamp, writeOutput } from "./config";
import { resolve } from "path";
import { readFileSync } from "fs";
import { SignJWT, importPKCS8 } from "jose";

// ── Types ──────────────────────────────────────────────────────────────────

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface QueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchAnalyticsResponse {
  rows?: QueryRow[];
  responseAggregationType?: string;
}

interface InspectionResult {
  inspectionResultLink?: string;
  indexStatusResult?: {
    coverageState?: string;
    robotsTxtState?: string;
    indexingState?: string;
    lastCrawlTime?: string;
    pageFetchState?: string;
    verdict?: string;
    crawledAs?: string;
  };
}

interface PerformanceRow {
  query?: string;
  page?: string;
  country?: string;
  device?: string;
  date?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GSCSiteOutput {
  siteUrl: string;
  queryPerformance: PerformanceRow[];
  pagePerformance: PerformanceRow[];
  summary: {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
    totalQueries: number;
    totalPages: number;
    topQuery: string | null;
    topPage: string | null;
  };
  indexCoverage?: {
    inspectedUrls: number;
    indexedUrls: number;
    results: Array<{
      url: string;
      verdict: string;
      coverageState: string;
      lastCrawlTime: string | null;
      indexingState: string;
    }>;
  };
}

interface GSCOutput {
  timestamp: string;
  /** @deprecated Use `sites` array instead for multi-site support */
  siteUrl: string;
  dateRange: { start: string; end: string };
  /** Per-site results when querying multiple sites */
  sites: GSCSiteOutput[];
  /** Combined query performance across all sites */
  queryPerformance: PerformanceRow[];
  /** Combined page performance across all sites */
  pagePerformance: PerformanceRow[];
  summary: {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
    totalQueries: number;
    totalPages: number;
    topQuery: string | null;
    topPage: string | null;
  };
  indexCoverage?: {
    inspectedUrls: number;
    indexedUrls: number;
    results: Array<{
      url: string;
      verdict: string;
      coverageState: string;
      lastCrawlTime: string | null;
      indexingState: string;
    }>;
  };
}

// Insights for content calendar integration
export interface GSCInsights {
  highImpressionLowCtr: PerformanceRow[];
  lowHangingFruit: PerformanceRow[];
  decliningPages: PerformanceRow[];
}

// ── CLI ────────────────────────────────────────────────────────────────────

const HELP_TEXT = `
Google Search Console API Tool

Pulls search performance data from Google Search Console using a service account.

Usage:
  bun run tools/seo/search-console.ts [options]

Options:
  --days <number>    Number of days to look back (default: 28)
  --page <pattern>   Filter by page URL pattern (e.g. "/docs/*")
  --country <code>   Filter by country (3-letter code, e.g. "USA")
  --type <type>      Dimension to query: "query" (default), "page", "both"
  --site <url>       Target a single site URL (skips other configured sites)
  --inspect <urls>   Comma-separated URLs to check index coverage
  --help, -h         Show this help message

Examples:
  bun run tools/seo/search-console.ts                          # queries all configured sites
  bun run tools/seo/search-console.ts --site https://stoneforge.ai  # single site only
  bun run tools/seo/search-console.ts --days 90 --type both
  bun run tools/seo/search-console.ts --page "/blog/*" --country USA
  bun run tools/seo/search-console.ts --inspect "https://stoneforge.ai/,https://docs.stoneforge.ai/"

Output:
  tools/seo/output/gsc-{timestamp}.json

Environment:
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH   Path to service account JSON key file
  GSC_SITE_URLS                     Comma-separated site URLs (e.g. https://stoneforge.ai,https://docs.stoneforge.ai)
  GSC_SITE_URL                      Legacy single site URL (fallback if GSC_SITE_URLS not set)

Setup:
  1. Create a GCP project at https://console.cloud.google.com
  2. Enable the "Google Search Console API" (aka Search Analytics API)
  3. Create a service account and download the JSON key file
  4. In Google Search Console (https://search.google.com/search-console),
     add the service account email as an owner/user for your property
  5. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH and GSC_SITE_URLS in tools/seo/.env
`.trim();

interface GSCArgs {
  help: boolean;
  days: number;
  page?: string;
  country?: string;
  type: "query" | "page" | "both";
  site?: string;
  inspect?: string[];
}

function parseGSCArgs(argv: string[]): GSCArgs {
  const result: GSCArgs = {
    help: false,
    days: 28,
    type: "both",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--days":
        result.days = parseInt(argv[++i], 10);
        if (isNaN(result.days) || result.days < 1) {
          console.error("Error: --days must be a positive integer");
          process.exit(1);
        }
        break;
      case "--page":
        result.page = argv[++i];
        break;
      case "--country":
        result.country = argv[++i];
        break;
      case "--type":
        result.type = argv[++i] as GSCArgs["type"];
        if (!["query", "page", "both"].includes(result.type)) {
          console.error('Error: --type must be "query", "page", or "both"');
          process.exit(1);
        }
        break;
      case "--site":
        result.site = argv[++i];
        break;
      case "--inspect":
        result.inspect = argv[++i].split(",").map((u) => u.trim());
        break;
    }
  }

  return result;
}

// ── Auth ───────────────────────────────────────────────────────────────────

function loadServiceAccountKey(): ServiceAccountKey {
  const keyPath = config.googleSearchConsole.serviceAccountKeyPath;
  if (!keyPath) {
    console.error("Error: GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set.");
    console.error("Set it in tools/seo/.env or as an environment variable.");
    console.error("Run with --help for setup instructions.");
    process.exit(1);
  }

  try {
    const resolved = resolve(keyPath);
    const content = readFileSync(resolved, "utf-8");
    return JSON.parse(content);
  } catch (err: any) {
    console.error(`Error reading service account key file: ${err.message}`);
    console.error(`Path: ${keyPath}`);
    process.exit(1);
  }
}

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const scope = "https://www.googleapis.com/auth/webmasters.readonly";
  const now = Math.floor(Date.now() / 1000);

  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");

  const jwt = await new SignJWT({
    scope,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(serviceAccount.token_uri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get access token (${response.status}): ${body}`);
  }

  const data = (await response.json()) as any;
  return data.access_token;
}

// ── API Calls ──────────────────────────────────────────────────────────────

function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1); // GSC data has a 1-2 day delay
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

async function fetchSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  dimensions: string[],
  dateRange: { start: string; end: string },
  options: { page?: string; country?: string }
): Promise<PerformanceRow[]> {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`;

  const body: any = {
    startDate: dateRange.start,
    endDate: dateRange.end,
    dimensions,
    rowLimit: 1000,
    startRow: 0,
  };

  // Add dimension filters
  const filters: any[] = [];
  if (options.page) {
    filters.push({
      dimension: "page",
      operator: options.page.includes("*") ? "includingRegex" : "contains",
      expression: options.page.replace(/\*/g, ".*"),
    });
  }
  if (options.country) {
    filters.push({
      dimension: "country",
      operator: "equals",
      expression: options.country,
    });
  }
  if (filters.length > 0) {
    body.dimensionFilterGroups = [{ filters }];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Search Analytics API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as SearchAnalyticsResponse;
  if (!data.rows) return [];

  return data.rows.map((row) => {
    const result: PerformanceRow = {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: Math.round(row.ctr * 10000) / 10000,
      position: Math.round(row.position * 100) / 100,
    };

    for (let i = 0; i < dimensions.length; i++) {
      const dim = dimensions[i];
      if (dim === "query") result.query = row.keys[i];
      else if (dim === "page") result.page = row.keys[i];
      else if (dim === "country") result.country = row.keys[i];
      else if (dim === "device") result.device = row.keys[i];
      else if (dim === "date") result.date = row.keys[i];
    }

    return result;
  });
}

async function inspectUrls(
  accessToken: string,
  siteUrl: string,
  urls: string[]
): Promise<GSCOutput["indexCoverage"]> {
  const results: NonNullable<GSCOutput["indexCoverage"]>["results"] = [];

  for (const inspectionUrl of urls) {
    try {
      const response = await fetch(
        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspectionUrl,
            siteUrl,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn(`  Warning: Could not inspect ${inspectionUrl} (${response.status}): ${errorBody}`);
        results.push({
          url: inspectionUrl,
          verdict: "ERROR",
          coverageState: "unknown",
          lastCrawlTime: null,
          indexingState: "unknown",
        });
        continue;
      }

      const data = (await response.json()) as { inspectionResult: InspectionResult };
      const idx = data.inspectionResult.indexStatusResult;

      results.push({
        url: inspectionUrl,
        verdict: idx?.verdict ?? "unknown",
        coverageState: idx?.coverageState ?? "unknown",
        lastCrawlTime: idx?.lastCrawlTime ?? null,
        indexingState: idx?.indexingState ?? "unknown",
      });
    } catch (err: any) {
      console.warn(`  Warning: Error inspecting ${inspectionUrl}: ${err.message}`);
      results.push({
        url: inspectionUrl,
        verdict: "ERROR",
        coverageState: "unknown",
        lastCrawlTime: null,
        indexingState: "unknown",
      });
    }
  }

  const indexedUrls = results.filter(
    (r) => r.verdict === "PASS" || r.indexingState === "INDEXING_ALLOWED"
  ).length;

  return {
    inspectedUrls: results.length,
    indexedUrls,
    results,
  };
}

// ── Insights (for content calendar integration) ────────────────────────────

/**
 * Analyze GSC data and return actionable insights for content planning.
 *
 * - highImpressionLowCtr: Queries with many impressions but low CTR — optimize titles/descriptions
 * - lowHangingFruit: Queries ranking positions 5-20 — push higher with targeted content
 * - decliningPages: Pages that could benefit from content updates (low CTR at decent positions)
 */
export function analyzeGSCInsights(
  queryPerformance: PerformanceRow[],
  pagePerformance: PerformanceRow[]
): GSCInsights {
  // High impressions, low CTR — opportunity to improve title/description
  const highImpressionLowCtr = queryPerformance
    .filter((row) => row.impressions >= 50 && row.ctr < 0.03)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  // Positions 5-20 — low-hanging fruit to push into top results
  const lowHangingFruit = queryPerformance
    .filter((row) => row.position >= 5 && row.position <= 20 && row.impressions >= 10)
    .sort((a, b) => a.position - b.position)
    .slice(0, 20);

  // Pages with declining performance signals (low CTR despite decent position)
  const decliningPages = pagePerformance
    .filter((row) => row.position <= 20 && row.ctr < 0.02 && row.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  return { highImpressionLowCtr, lowHangingFruit, decliningPages };
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Calculate summary stats from performance rows.
 */
function calculateSummary(
  queryPerformance: PerformanceRow[],
  pagePerformance: PerformanceRow[]
): GSCSiteOutput["summary"] {
  const totalClicks = queryPerformance.reduce((sum, r) => sum + r.clicks, 0) ||
    pagePerformance.reduce((sum, r) => sum + r.clicks, 0);
  const totalImpressions = queryPerformance.reduce((sum, r) => sum + r.impressions, 0) ||
    pagePerformance.reduce((sum, r) => sum + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 10000 : 0;
  const avgPosition = queryPerformance.length > 0
    ? Math.round(
        (queryPerformance.reduce((sum, r) => sum + r.position, 0) / queryPerformance.length) * 100
      ) / 100
    : pagePerformance.length > 0
    ? Math.round(
        (pagePerformance.reduce((sum, r) => sum + r.position, 0) / pagePerformance.length) * 100
      ) / 100
    : 0;

  const topQuery = queryPerformance.length > 0
    ? [...queryPerformance].sort((a, b) => b.clicks - a.clicks)[0].query ?? null
    : null;
  const topPage = pagePerformance.length > 0
    ? [...pagePerformance].sort((a, b) => b.clicks - a.clicks)[0].page ?? null
    : null;

  return {
    totalClicks,
    totalImpressions,
    avgCtr,
    avgPosition,
    totalQueries: queryPerformance.length,
    totalPages: pagePerformance.length,
    topQuery,
    topPage,
  };
}

/**
 * Fetch all performance data for a single site URL.
 */
async function fetchSiteData(
  accessToken: string,
  siteUrl: string,
  args: GSCArgs,
  dateRange: { start: string; end: string }
): Promise<GSCSiteOutput> {
  const filterOptions = { page: args.page, country: args.country };

  let queryPerformance: PerformanceRow[] = [];
  let pagePerformance: PerformanceRow[] = [];

  if (args.type === "query" || args.type === "both") {
    console.log(`  Fetching query performance data for ${siteUrl}...`);
    queryPerformance = await fetchSearchAnalytics(
      accessToken,
      siteUrl,
      ["query"],
      dateRange,
      filterOptions
    );
    console.log(`    Found ${queryPerformance.length} queries`);
  }

  if (args.type === "page" || args.type === "both") {
    console.log(`  Fetching page performance data for ${siteUrl}...`);
    pagePerformance = await fetchSearchAnalytics(
      accessToken,
      siteUrl,
      ["page"],
      dateRange,
      filterOptions
    );
    console.log(`    Found ${pagePerformance.length} pages`);
  }

  // Index coverage inspection (only if --inspect URLs belong to this site)
  let indexCoverage: GSCSiteOutput["indexCoverage"] | undefined;
  if (args.inspect && args.inspect.length > 0) {
    const siteInspectUrls = args.inspect.filter((u) => u.startsWith(siteUrl));
    if (siteInspectUrls.length > 0) {
      console.log(`  Inspecting ${siteInspectUrls.length} URL(s) for index coverage on ${siteUrl}...`);
      indexCoverage = await inspectUrls(accessToken, siteUrl, siteInspectUrls);
      if (indexCoverage) {
        console.log(`    Indexed: ${indexCoverage.indexedUrls}/${indexCoverage.inspectedUrls}`);
      }
    }
  }

  return {
    siteUrl,
    queryPerformance,
    pagePerformance,
    summary: calculateSummary(queryPerformance, pagePerformance),
    indexCoverage,
  };
}

/**
 * Print summary and insights for a single site's data.
 */
function printSiteSummary(site: GSCSiteOutput, insights: GSCInsights): void {
  console.log(`\n── ${site.siteUrl} ──`);
  console.log(`  Total clicks: ${site.summary.totalClicks.toLocaleString()}`);
  console.log(`  Total impressions: ${site.summary.totalImpressions.toLocaleString()}`);
  console.log(`  Average CTR: ${(site.summary.avgCtr * 100).toFixed(2)}%`);
  console.log(`  Average position: ${site.summary.avgPosition}`);
  console.log(`  Unique queries: ${site.summary.totalQueries}`);
  console.log(`  Unique pages: ${site.summary.totalPages}`);

  if (site.summary.topQuery) console.log(`  Top query: "${site.summary.topQuery}"`);
  if (site.summary.topPage) console.log(`  Top page: ${site.summary.topPage}`);

  if (insights.highImpressionLowCtr.length > 0) {
    console.log(`  High-Impression, Low-CTR Queries:`);
    for (const row of insights.highImpressionLowCtr.slice(0, 5)) {
      console.log(
        `    "${row.query}" — ${row.impressions} impressions, ${(row.ctr * 100).toFixed(2)}% CTR, pos ${row.position}`
      );
    }
  }

  if (insights.lowHangingFruit.length > 0) {
    console.log(`  Low-Hanging Fruit (positions 5-20):`);
    for (const row of insights.lowHangingFruit.slice(0, 5)) {
      console.log(
        `    "${row.query}" — pos ${row.position}, ${row.impressions} impressions, ${row.clicks} clicks`
      );
    }
  }

  if (insights.decliningPages.length > 0) {
    console.log(`  Pages Needing Updates:`);
    for (const row of insights.decliningPages.slice(0, 5)) {
      console.log(
        `    ${row.page} — pos ${row.position}, ${(row.ctr * 100).toFixed(2)}% CTR, ${row.impressions} impressions`
      );
    }
  }

  if (site.indexCoverage) {
    console.log(`  Index Coverage:`);
    console.log(`    Inspected: ${site.indexCoverage.inspectedUrls}`);
    console.log(`    Indexed: ${site.indexCoverage.indexedUrls}`);
    for (const result of site.indexCoverage.results) {
      const status = result.verdict === "PASS" ? "✓" : "✗";
      console.log(`    ${status} ${result.url} — ${result.coverageState} (${result.indexingState})`);
    }
  }
}

async function main() {
  const args = parseGSCArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Determine which site URLs to process
  let siteUrls: string[];
  if (args.site) {
    // --site flag targets a single site
    siteUrls = [args.site];
  } else {
    // Use all configured site URLs (GSC_SITE_URLS or fallback to GSC_SITE_URL)
    siteUrls = config.googleSearchConsole.siteUrls;
  }

  if (siteUrls.length === 0) {
    console.error("Error: No site URL(s) specified.");
    console.error("Set GSC_SITE_URLS in tools/seo/.env or use --site <url>");
    console.error("(Legacy GSC_SITE_URL is also supported as a fallback)");
    process.exit(1);
  }

  console.log(`\nGoogle Search Console — Performance Report`);
  console.log(`Sites: ${siteUrls.join(", ")}`);
  console.log(`Looking back: ${args.days} days`);
  if (args.page) console.log(`Page filter: ${args.page}`);
  if (args.country) console.log(`Country filter: ${args.country}`);
  console.log();

  // Authenticate
  console.log("Authenticating with service account...");
  const serviceAccount = loadServiceAccountKey();
  const accessToken = await getAccessToken(serviceAccount);
  console.log("  Authenticated successfully\n");

  const dateRange = getDateRange(args.days);
  console.log(`Date range: ${dateRange.start} to ${dateRange.end}\n`);

  // Fetch data for each site
  const siteResults: GSCSiteOutput[] = [];
  for (const siteUrl of siteUrls) {
    const siteData = await fetchSiteData(accessToken, siteUrl, args, dateRange);
    siteResults.push(siteData);
    console.log();
  }

  // Combine results across all sites
  const allQueryPerformance = siteResults.flatMap((s) => s.queryPerformance);
  const allPagePerformance = siteResults.flatMap((s) => s.pagePerformance);
  const combinedSummary = calculateSummary(allQueryPerformance, allPagePerformance);

  // Merge index coverage from all sites
  let combinedIndexCoverage: GSCOutput["indexCoverage"] | undefined;
  const allIndexResults = siteResults
    .filter((s) => s.indexCoverage)
    .flatMap((s) => s.indexCoverage!.results);
  if (allIndexResults.length > 0) {
    combinedIndexCoverage = {
      inspectedUrls: allIndexResults.length,
      indexedUrls: allIndexResults.filter(
        (r) => r.verdict === "PASS" || r.indexingState === "INDEXING_ALLOWED"
      ).length,
      results: allIndexResults,
    };
  }

  const output: GSCOutput = {
    timestamp: new Date().toISOString(),
    siteUrl: siteUrls.join(","),
    dateRange,
    sites: siteResults,
    queryPerformance: allQueryPerformance,
    pagePerformance: allPagePerformance,
    summary: combinedSummary,
    indexCoverage: combinedIndexCoverage,
  };

  // Generate per-site and combined insights
  const combinedInsights = analyzeGSCInsights(allQueryPerformance, allPagePerformance);

  const outputWithInsights = {
    ...output,
    insights: {
      highImpressionLowCtr: combinedInsights.highImpressionLowCtr.length,
      lowHangingFruit: combinedInsights.lowHangingFruit.length,
      decliningPages: combinedInsights.decliningPages.length,
      details: combinedInsights,
    },
  };

  const filename = `gsc-${getTimestamp()}.json`;
  await writeOutput(filename, outputWithInsights);

  // Print per-site summaries
  console.log(`\nSearch Console Summary:`);
  for (const site of siteResults) {
    const siteInsights = analyzeGSCInsights(site.queryPerformance, site.pagePerformance);
    printSiteSummary(site, siteInsights);
  }

  // Print combined summary if multiple sites
  if (siteResults.length > 1) {
    console.log(`\n── Combined (${siteResults.length} sites) ──`);
    console.log(`  Total clicks: ${combinedSummary.totalClicks.toLocaleString()}`);
    console.log(`  Total impressions: ${combinedSummary.totalImpressions.toLocaleString()}`);
    console.log(`  Average CTR: ${(combinedSummary.avgCtr * 100).toFixed(2)}%`);
    console.log(`  Average position: ${combinedSummary.avgPosition}`);
    console.log(`  Unique queries: ${combinedSummary.totalQueries}`);
    console.log(`  Unique pages: ${combinedSummary.totalPages}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
