#!/usr/bin/env bun
/**
 * Content Calendar Generator
 *
 * Takes keyword research and SERP analysis data and generates a prioritized
 * content calendar with topic clusters, content type suggestions, and scores.
 *
 * Usage:
 *   bun run tools/seo/content-calendar.ts -f keywords.json
 *   bun run tools/seo/content-calendar.ts -f keywords.json --serp serp.json
 *   bun run tools/seo/content-calendar.ts --help
 */

import { config, getTimestamp, writeOutput, parseArgs } from "./config";
import { resolve } from "path";

interface KeywordInput {
  keyword: string;
  searchVolume: number;
  cpc: number;
  competition: number;
  source?: string[];
}

interface SerpInput {
  keyword: string;
  difficulty: number;
  serpFeatures: Array<{ type: string }>;
}

interface TopicCluster {
  topic: string;
  keywords: string[];
  totalSearchVolume: number;
  avgDifficulty: number;
  avgCpc: number;
  score: number;
  suggestedContentType: string;
  suggestedTitle: string;
  priority: "high" | "medium" | "low";
  serpFeatures: string[];
}

interface ContentCalendarOutput {
  timestamp: string;
  clusters: TopicCluster[];
  summary: {
    totalClusters: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    totalSearchVolume: number;
  };
  contentPlan: Array<{
    week: number;
    topic: string;
    contentType: string;
    suggestedTitle: string;
    targetKeywords: string[];
    priority: string;
    estimatedSearchVolume: number;
  }>;
}

const HELP_TEXT = `
Content Calendar Generator

Clusters keywords by topic similarity, scores them, and generates a
prioritized content calendar with content type suggestions.

Usage:
  bun run tools/seo/content-calendar.ts -f <keywords-file.json> [--serp <serp-file.json>]

Options:
  -f, --file       Path to keyword research JSON output (required)
  --serp           Path to SERP analysis JSON output (optional, enhances scoring)
  --help, -h       Show this help message

Examples:
  bun run tools/seo/content-calendar.ts -f tools/seo/output/keywords-2026-03-09T12-00-00.json
  bun run tools/seo/content-calendar.ts -f keywords.json --serp serp.json

Output:
  tools/seo/output/calendar-{timestamp}.json
`.trim();

// Topic clustering based on keyword similarity
const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string; contentType: string }> = [
  { pattern: /\bvs\b|versus|comparison|compare|alternative/i, topic: "comparison", contentType: "comparison-page" },
  { pattern: /\bhow to\b|guide|tutorial|step/i, topic: "how-to", contentType: "blog-post" },
  { pattern: /\bwhat is\b|definition|meaning|explain/i, topic: "educational", contentType: "blog-post" },
  { pattern: /\bbest\b|top\s+\d|review/i, topic: "listicle", contentType: "blog-post" },
  { pattern: /\buse case|example|demo/i, topic: "use-case", contentType: "use-case-page" },
  { pattern: /\bpricing|cost|free|plan/i, topic: "pricing", contentType: "landing-page" },
  { pattern: /\bagent|multi.?agent|orchestrat/i, topic: "multi-agent", contentType: "blog-post" },
  { pattern: /\bcode review|review\s+ai|automat/i, topic: "automation", contentType: "use-case-page" },
  { pattern: /\bpair program|copilot|coding assist/i, topic: "ai-coding", contentType: "comparison-page" },
  { pattern: /\bteam|collaborat|parallel/i, topic: "team-productivity", contentType: "use-case-page" },
];

function clusterKeywords(
  keywords: KeywordInput[],
  serpData: Map<string, SerpInput>
): TopicCluster[] {
  const clusters = new Map<string, {
    keywords: KeywordInput[];
    serpFeatures: Set<string>;
    difficulties: number[];
  }>();

  for (const kw of keywords) {
    let matched = false;
    for (const { pattern, topic } of TOPIC_PATTERNS) {
      if (pattern.test(kw.keyword)) {
        if (!clusters.has(topic)) {
          clusters.set(topic, { keywords: [], serpFeatures: new Set(), difficulties: [] });
        }
        const cluster = clusters.get(topic)!;
        cluster.keywords.push(kw);

        // Add SERP data if available
        const serp = serpData.get(kw.keyword.toLowerCase());
        if (serp) {
          cluster.difficulties.push(serp.difficulty);
          for (const feature of serp.serpFeatures) {
            cluster.serpFeatures.add(feature.type);
          }
        }

        matched = true;
        break;
      }
    }

    if (!matched) {
      // Assign to a general topic based on keyword words
      const words = kw.keyword.toLowerCase().split(/\s+/);
      const topic = words.length > 1 ? words.slice(0, 2).join("-") : words[0];
      if (!clusters.has(topic)) {
        clusters.set(topic, { keywords: [], serpFeatures: new Set(), difficulties: [] });
      }
      const cluster = clusters.get(topic)!;
      cluster.keywords.push(kw);

      const serp = serpData.get(kw.keyword.toLowerCase());
      if (serp) {
        cluster.difficulties.push(serp.difficulty);
        for (const feature of serp.serpFeatures) {
          cluster.serpFeatures.add(feature.type);
        }
      }
    }
  }

  // Build topic clusters with scoring
  const result: TopicCluster[] = [];

  for (const [topic, data] of clusters) {
    const totalSearchVolume = data.keywords.reduce((sum, kw) => sum + kw.searchVolume, 0);
    const avgCpc = data.keywords.length > 0
      ? data.keywords.reduce((sum, kw) => sum + kw.cpc, 0) / data.keywords.length
      : 0;
    const avgDifficulty = data.difficulties.length > 0
      ? data.difficulties.reduce((sum, d) => sum + d, 0) / data.difficulties.length
      : 50; // Default to medium difficulty if unknown

    // Score = totalSearchVolume × (1 / avgDifficulty)
    // Normalize difficulty to avoid division by zero
    const normalizedDifficulty = Math.max(avgDifficulty, 1) / 100;
    const score = totalSearchVolume * (1 / normalizedDifficulty);

    // Find matching content type
    const contentPattern = TOPIC_PATTERNS.find((p) => p.topic === topic);
    const contentType = contentPattern?.contentType ?? suggestContentType(topic, data.keywords);

    // Generate a suggested title
    const primaryKeyword = data.keywords.sort((a, b) => b.searchVolume - a.searchVolume)[0];
    const suggestedTitle = generateTitle(topic, primaryKeyword?.keyword ?? topic, contentType);

    // Determine priority
    let priority: "high" | "medium" | "low";
    if (score > 1000) priority = "high";
    else if (score > 200) priority = "medium";
    else priority = "low";

    result.push({
      topic,
      keywords: data.keywords.map((kw) => kw.keyword),
      totalSearchVolume,
      avgDifficulty: Math.round(avgDifficulty * 100) / 100,
      avgCpc: Math.round(avgCpc * 100) / 100,
      score: Math.round(score * 100) / 100,
      suggestedContentType: contentType,
      suggestedTitle,
      priority,
      serpFeatures: Array.from(data.serpFeatures),
    });
  }

  // Sort by score descending
  return result.sort((a, b) => b.score - a.score);
}

function suggestContentType(topic: string, keywords: KeywordInput[]): string {
  // Heuristic: high CPC keywords suggest commercial intent → landing page
  const avgCpc = keywords.reduce((sum, kw) => sum + kw.cpc, 0) / keywords.length;
  if (avgCpc > 5) return "landing-page";
  if (keywords.length > 5) return "pillar-page";
  return "blog-post";
}

function generateTitle(topic: string, primaryKeyword: string, contentType: string): string {
  const keyword = primaryKeyword.charAt(0).toUpperCase() + primaryKeyword.slice(1);

  switch (contentType) {
    case "comparison-page":
      return `${keyword}: A Comprehensive Comparison`;
    case "use-case-page":
      return `How Teams Use ${keyword} to Ship Faster`;
    case "landing-page":
      return `${keyword} | Stoneforge`;
    case "pillar-page":
      return `The Complete Guide to ${keyword}`;
    case "blog-post":
    default:
      return `Understanding ${keyword}: What You Need to Know`;
  }
}

function generateContentPlan(clusters: TopicCluster[]): ContentCalendarOutput["contentPlan"] {
  const plan: ContentCalendarOutput["contentPlan"] = [];
  let week = 1;

  // Schedule high priority first, then medium, then low
  const sorted = [...clusters].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority] || b.score - a.score;
  });

  for (const cluster of sorted) {
    plan.push({
      week,
      topic: cluster.topic,
      contentType: cluster.suggestedContentType,
      suggestedTitle: cluster.suggestedTitle,
      targetKeywords: cluster.keywords.slice(0, 5), // Top 5 keywords per piece
      priority: cluster.priority,
      estimatedSearchVolume: cluster.totalSearchVolume,
    });
    week++;
  }

  return plan;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Find --serp argument
  let serpFile: string | undefined;
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--serp" && rawArgs[i + 1]) {
      serpFile = rawArgs[i + 1];
    }
  }

  if (!args.file) {
    console.error("Error: A keyword research file is required.");
    console.error("Usage: bun run tools/seo/content-calendar.ts -f <keywords-file.json>");
    console.error("Run keyword-research.ts first to generate the input file.");
    process.exit(1);
  }

  console.log(`\nContent Calendar Generator`);
  console.log(`Keyword file: ${args.file}`);
  if (serpFile) console.log(`SERP file: ${serpFile}`);
  console.log();

  // Load keyword data
  const keywordFileContent = await Bun.file(args.file).json();
  let keywords: KeywordInput[];

  if (Array.isArray(keywordFileContent)) {
    keywords = keywordFileContent;
  } else if (keywordFileContent.keywords) {
    keywords = keywordFileContent.keywords;
  } else {
    throw new Error("Could not parse keywords from file. Expected an array or { keywords: [...] }");
  }

  console.log(`Loaded ${keywords.length} keywords`);

  // Load SERP data if provided
  const serpData = new Map<string, SerpInput>();
  if (serpFile) {
    const serpFileContent = await Bun.file(serpFile).json();
    const serpItems: SerpInput[] = serpFileContent.serpData ?? serpFileContent;
    for (const item of serpItems) {
      serpData.set(item.keyword.toLowerCase(), item);
    }
    console.log(`Loaded ${serpData.size} SERP data entries`);
  }

  // Cluster keywords and generate calendar
  const clusters = clusterKeywords(keywords, serpData);
  const contentPlan = generateContentPlan(clusters);

  const highPriority = clusters.filter((c) => c.priority === "high").length;
  const mediumPriority = clusters.filter((c) => c.priority === "medium").length;
  const lowPriority = clusters.filter((c) => c.priority === "low").length;

  const output: ContentCalendarOutput = {
    timestamp: new Date().toISOString(),
    clusters,
    summary: {
      totalClusters: clusters.length,
      highPriority,
      mediumPriority,
      lowPriority,
      totalSearchVolume: clusters.reduce((sum, c) => sum + c.totalSearchVolume, 0),
    },
    contentPlan,
  };

  const filename = `calendar-${getTimestamp()}.json`;
  await writeOutput(filename, output);

  console.log(`\nContent Calendar Summary:`);
  console.log(`  Topic clusters: ${clusters.length}`);
  console.log(`  High priority: ${highPriority}`);
  console.log(`  Medium priority: ${mediumPriority}`);
  console.log(`  Low priority: ${lowPriority}`);

  console.log(`\nPrioritized Content Plan:`);
  for (const item of contentPlan.slice(0, 10)) {
    console.log(`  Week ${item.week}: [${item.priority}] ${item.suggestedTitle}`);
    console.log(`    Type: ${item.contentType} | Keywords: ${item.targetKeywords.slice(0, 3).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
