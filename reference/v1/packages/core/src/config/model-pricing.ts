/**
 * Model Pricing Configuration
 *
 * Provides per-token pricing data for LLM models and a shared cost
 * calculation utility. The pricing data lives in model-pricing.json
 * and covers all 4 token categories: input, output, cache read, and
 * cache creation.
 *
 * This module lives in @stoneforge/core so it can be used by both
 * the CLI (quarry) and the orchestrator (smithy).
 */

import pricingData from './model-pricing.json' with { type: 'json' };

// ============================================================================
// Types
// ============================================================================

/**
 * Per-token pricing for a single model (costs per 1M tokens)
 */
export interface ModelPricing {
  /** Cost per 1M input tokens */
  inputPer1M: number;
  /** Cost per 1M output tokens */
  outputPer1M: number;
  /** Cost per 1M cache read tokens */
  cacheReadPer1M: number;
  /** Cost per 1M cache creation tokens */
  cacheCreationPer1M: number;
}

/**
 * Pricing data structure: provider → model → pricing
 */
export type PricingConfig = Record<string, Record<string, ModelPricing>>;

/**
 * Breakdown of costs by token category
 */
export interface CostBreakdown {
  /** Cost from input tokens */
  inputCost: number;
  /** Cost from output tokens */
  outputCost: number;
  /** Cost from cache read tokens */
  cacheReadCost: number;
  /** Cost from cache creation tokens */
  cacheCreationCost: number;
  /** Total cost (sum of all categories) */
  totalCost: number;
}

// ============================================================================
// Pricing Data
// ============================================================================

/**
 * The loaded pricing configuration.
 * Cast to PricingConfig since the JSON import is typed as a plain object.
 */
export const MODEL_PRICING: PricingConfig = pricingData as PricingConfig;

/**
 * Default fallback pricing (Sonnet) used when a model is not found.
 */
export const DEFAULT_PRICING: ModelPricing = {
  inputPer1M: 3.0,
  outputPer1M: 15.0,
  cacheReadPer1M: 0.3,
  cacheCreationPer1M: 3.75,
};

// ============================================================================
// Lookup
// ============================================================================

/**
 * Look up pricing for a model, with support for partial model name matching.
 * For example, "claude-sonnet-4" will match "claude-sonnet-4-20250514".
 *
 * @param model - Model name (full or partial)
 * @param provider - Provider name (e.g., "anthropic", "opencode")
 * @returns The matching ModelPricing, or null if not found
 */
export function lookupModelPricing(
  model: string,
  provider?: string
): { pricing: ModelPricing; matched: boolean } {
  // Try exact match first within specific provider
  if (provider) {
    const providerModels = MODEL_PRICING[provider];
    if (providerModels) {
      // Exact match
      if (providerModels[model]) {
        return { pricing: providerModels[model], matched: true };
      }
      // Partial match: model name is a prefix of a known model
      for (const knownModel of Object.keys(providerModels)) {
        if (knownModel.startsWith(model) || model.startsWith(knownModel)) {
          return { pricing: providerModels[knownModel], matched: true };
        }
      }
    }
  }

  // Try all providers (exact match first, then partial)
  for (const providerModels of Object.values(MODEL_PRICING)) {
    if (providerModels[model]) {
      return { pricing: providerModels[model], matched: true };
    }
  }
  for (const providerModels of Object.values(MODEL_PRICING)) {
    for (const knownModel of Object.keys(providerModels)) {
      if (knownModel.startsWith(model) || model.startsWith(knownModel)) {
        return { pricing: providerModels[knownModel], matched: true };
      }
    }
  }

  return { pricing: DEFAULT_PRICING, matched: false };
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Calculate cost breakdown for a set of token counts and pricing.
 *
 * @param pricing - Per-token pricing rates
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param cacheReadTokens - Number of cache read tokens
 * @param cacheCreationTokens - Number of cache creation tokens
 * @returns CostBreakdown with per-category and total costs
 */
export function calculateCostFromPricing(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): CostBreakdown {
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M;
  const cacheCreationCost = (cacheCreationTokens / 1_000_000) * pricing.cacheCreationPer1M;
  const totalCost = inputCost + outputCost + cacheReadCost + cacheCreationCost;

  return { inputCost, outputCost, cacheReadCost, cacheCreationCost, totalCost };
}

/**
 * Calculate cost breakdown for a model's token usage.
 *
 * Looks up pricing by provider + model name (with partial matching),
 * falls back to default Sonnet pricing if not found.
 *
 * @param model - Model name (full or partial)
 * @param provider - Provider name
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param cacheReadTokens - Number of cache read tokens
 * @param cacheCreationTokens - Number of cache creation tokens
 * @returns Object with CostBreakdown and whether the model was matched
 */
export function calculateCost(
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): CostBreakdown & { modelMatched: boolean } {
  const { pricing, matched } = lookupModelPricing(model, provider);
  const breakdown = calculateCostFromPricing(
    pricing,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens
  );

  return { ...breakdown, modelMatched: matched };
}
