#!/usr/bin/env bun
/**
 * Competitor Analysis Tool
 *
 * Uses the DataForSEO API to analyze competitor backlink profiles and find
 * link-building opportunities through domain intersection analysis.
 *
 * Usage:
 *   bun run tools/seo/competitor-analysis.ts -d cursor.com -d github.com
 *   bun run tools/seo/competitor-analysis.ts --help
 */

import { config, getTimestamp, writeOutput, parseArgs } from "./config";

const DEFAULT_COMPETITORS = [
  "cursor.com",
  "github.com",
  "codeium.com",
  "tabnine.com",
];

const OUR_DOMAIN = "stoneforge.ai";

interface BacklinkData {
  domain: string;
  totalBacklinks: number;
  referringDomains: number;
  domainRank: number;
  topReferringDomains: Array<{
    domain: string;
    backlinks: number;
    rank: number;
  }>;
}

interface GapDomain {
  domain: string;
  linksToCompetitors: string[];
  totalBacklinks: number;
  rank: number;
}

interface CompetitorAnalysisOutput {
  timestamp: string;
  ourDomain: string;
  competitors: string[];
  backlinkProfiles: BacklinkData[];
  backlinkGap: GapDomain[];
  summary: {
    totalGapDomains: number;
    highValueGapDomains: number;
    competitorsAnalyzed: number;
  };
}

const HELP_TEXT = `
Competitor Analysis Tool — DataForSEO API

Usage:
  bun run tools/seo/competitor-analysis.ts -d <domain> [-d <domain> ...]

Options:
  -d, --domain   Competitor domain to analyze (can specify multiple)
                 If none provided, uses default competitor list
  --help, -h     Show this help message

Examples:
  bun run tools/seo/competitor-analysis.ts -d cursor.com -d github.com
  bun run tools/seo/competitor-analysis.ts

Output:
  tools/seo/output/backlink-gap-{timestamp}.json

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

async function getBacklinkProfile(domain: string): Promise<BacklinkData> {
  const { baseUrl } = config.dataForSeo;
  const auth = getAuthHeader();

  console.log(`  Fetching backlink profile for ${domain}...`);

  // Get backlink summary
  const summaryResponse = await fetch(`${baseUrl}/backlinks/summary/live`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": auth,
    },
    body: JSON.stringify([{ target: domain, internal_list_limit: 0, include_subdomains: true }]),
  });

  if (!summaryResponse.ok) {
    const body = await summaryResponse.text();
    throw new Error(`DataForSEO Backlinks Summary error (${summaryResponse.status}): ${body}`);
  }

  const summaryData = await summaryResponse.json() as any;
  let totalBacklinks = 0;
  let referringDomains = 0;
  let domainRank = 0;

  if (summaryData.tasks?.[0]?.result?.[0]) {
    const result = summaryData.tasks[0].result[0];
    totalBacklinks = result.external_links_count ?? 0;
    referringDomains = result.referring_domains ?? 0;
    domainRank = result.rank ?? 0;
  }

  // Get top referring domains
  const referringResponse = await fetch(`${baseUrl}/backlinks/referring_domains/live`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": auth,
    },
    body: JSON.stringify([{
      target: domain,
      limit: 20,
      order_by: ["rank,desc"],
      include_subdomains: true,
    }]),
  });

  const topReferringDomains: BacklinkData["topReferringDomains"] = [];

  if (referringResponse.ok) {
    const refData = await referringResponse.json() as any;
    if (refData.tasks?.[0]?.result?.[0]?.items) {
      for (const item of refData.tasks[0].result[0].items) {
        topReferringDomains.push({
          domain: item.domain ?? "",
          backlinks: item.backlinks ?? 0,
          rank: item.rank ?? 0,
        });
      }
    }
  }

  return {
    domain,
    totalBacklinks,
    referringDomains,
    domainRank,
    topReferringDomains,
  };
}

async function findBacklinkGap(
  ourDomain: string,
  competitors: string[],
  profiles: BacklinkData[]
): Promise<GapDomain[]> {
  const { baseUrl } = config.dataForSeo;
  const auth = getAuthHeader();

  console.log(`\nRunning domain intersection analysis...`);

  // Use the DataForSEO domain intersection endpoint
  const targets: Record<string, string> = {};
  competitors.forEach((domain, i) => {
    targets[`target${i + 1}`] = domain;
  });

  // Exclude our domain to find sites linking to competitors but not to us
  const response = await fetch(`${baseUrl}/backlinks/domain_intersection/live`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": auth,
    },
    body: JSON.stringify([{
      ...targets,
      exclude_targets: [ourDomain],
      limit: 100,
      order_by: ["rank,desc"],
    }]),
  });

  const gapDomains: GapDomain[] = [];

  if (!response.ok) {
    console.warn(`  Warning: Domain intersection request failed (${response.status})`);
    // Fallback: manually compute gap from profiles
    return computeManualGap(ourDomain, profiles);
  }

  const data = await response.json() as any;
  if (data.tasks?.[0]?.result?.[0]?.items) {
    for (const item of data.tasks[0].result[0].items) {
      const linksTo: string[] = [];
      for (const comp of competitors) {
        if (item[comp]?.is_referring) {
          linksTo.push(comp);
        }
      }
      gapDomains.push({
        domain: item.domain ?? "",
        linksToCompetitors: linksTo,
        totalBacklinks: item.backlinks ?? 0,
        rank: item.rank ?? 0,
      });
    }
  }

  console.log(`  Found ${gapDomains.length} domains in the backlink gap`);
  return gapDomains;
}

function computeManualGap(ourDomain: string, profiles: BacklinkData[]): GapDomain[] {
  console.log(`  Computing manual backlink gap from profiles...`);

  // Collect all referring domains from competitors
  const competitorReferrers = new Map<string, string[]>();

  for (const profile of profiles) {
    if (profile.domain === ourDomain) continue;
    for (const ref of profile.topReferringDomains) {
      const existing = competitorReferrers.get(ref.domain) ?? [];
      existing.push(profile.domain);
      competitorReferrers.set(ref.domain, existing);
    }
  }

  // Filter out our own domain referrers (approximation)
  const gapDomains: GapDomain[] = [];
  for (const [domain, linksTo] of competitorReferrers) {
    if (domain === ourDomain) continue;
    gapDomains.push({
      domain,
      linksToCompetitors: linksTo,
      totalBacklinks: 0,
      rank: 0,
    });
  }

  return gapDomains.sort((a, b) => b.linksToCompetitors.length - a.linksToCompetitors.length);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const competitors = args.domains && args.domains.length > 0 ? args.domains : DEFAULT_COMPETITORS;

  console.log(`\nCompetitor Analysis Tool`);
  console.log(`Our domain: ${OUR_DOMAIN}`);
  console.log(`Competitors: ${competitors.join(", ")}\n`);

  // Fetch backlink profiles for all domains (including ours)
  console.log(`Fetching backlink profiles...`);
  const allDomains = [OUR_DOMAIN, ...competitors];
  const profiles = await Promise.all(allDomains.map(getBacklinkProfile));

  // Run gap analysis
  const gapDomains = await findBacklinkGap(OUR_DOMAIN, competitors, profiles);

  // High-value: domains linking to 2+ competitors
  const highValue = gapDomains.filter((d) => d.linksToCompetitors.length >= 2);

  const output: CompetitorAnalysisOutput = {
    timestamp: new Date().toISOString(),
    ourDomain: OUR_DOMAIN,
    competitors,
    backlinkProfiles: profiles,
    backlinkGap: gapDomains,
    summary: {
      totalGapDomains: gapDomains.length,
      highValueGapDomains: highValue.length,
      competitorsAnalyzed: competitors.length,
    },
  };

  const filename = `backlink-gap-${getTimestamp()}.json`;
  await writeOutput(filename, output);

  console.log(`\nCompetitor Analysis Summary:`);
  console.log(`  Competitors analyzed: ${competitors.length}`);
  for (const profile of profiles) {
    console.log(`  ${profile.domain}: ${profile.referringDomains} referring domains, rank: ${profile.domainRank}`);
  }
  console.log(`\nBacklink Gap:`);
  console.log(`  Total gap domains: ${gapDomains.length}`);
  console.log(`  High-value (link to 2+ competitors): ${highValue.length}`);

  if (highValue.length > 0) {
    console.log(`\nTop backlink gap opportunities:`);
    for (const d of highValue.slice(0, 10)) {
      console.log(`  ${d.domain} — links to: ${d.linksToCompetitors.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
