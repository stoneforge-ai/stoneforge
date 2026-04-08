/**
 * Cost Service
 *
 * Calculates estimated costs for LLM usage based on model pricing.
 * Uses the shared pricing configuration from @stoneforge/core and
 * provides integration with the metrics service for computing costs
 * on aggregated metrics data.
 */

import type { StorageBackend } from '@stoneforge/storage';
import {
  type CostBreakdown,
  type ModelPricing,
  calculateCost,
  calculateCostFromPricing,
  lookupModelPricing,
  DEFAULT_PRICING,
} from '@stoneforge/core';
import type { AggregatedMetrics } from './metrics-service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('cost-service');

// ============================================================================
// Types
// ============================================================================

/**
 * AggregatedMetrics enriched with cost breakdown
 */
export interface AggregatedMetricsWithCost extends AggregatedMetrics {
  estimatedCost: CostBreakdown;
}

/**
 * Database row for per-model cost aggregation query
 */
interface DbModelCostRow {
  [key: string]: unknown;
  group_key: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

// ============================================================================
// Interface
// ============================================================================

export interface CostService {
  /**
   * Calculate cost breakdown for a single model's token usage.
   *
   * @param model - Model name (full or partial)
   * @param provider - Provider name
   * @param inputTokens - Input token count
   * @param outputTokens - Output token count
   * @param cacheReadTokens - Cache read token count
   * @param cacheCreationTokens - Cache creation token count
   * @returns CostBreakdown with per-category and total costs
   */
  calculateCost(
    model: string,
    provider: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheCreationTokens: number
  ): CostBreakdown;

  /**
   * Enrich aggregated metrics with cost breakdowns.
   *
   * For model-grouped metrics, uses the model name directly for lookup.
   * For provider/agent-grouped metrics, queries per-model token breakdowns
   * from the database to compute accurate costs.
   *
   * @param metrics - Array of aggregated metrics entries
   * @param groupBy - How the metrics are grouped ('provider' | 'model' | 'agent' | 'session')
   * @param timeRange - Time range for DB queries (days)
   * @returns Metrics enriched with estimatedCost fields
   */
  enrichWithCosts(
    metrics: AggregatedMetrics[],
    groupBy: 'provider' | 'model' | 'agent' | 'session',
    timeRange?: { days: number }
  ): AggregatedMetricsWithCost[];
}

// ============================================================================
// Implementation
// ============================================================================

export function createCostService(storage: StorageBackend): CostService {
  /**
   * Compute costs for a model-grouped metric entry.
   * The group key is the model name, so we can look up pricing directly.
   */
  function costForModelGroup(metric: AggregatedMetrics): CostBreakdown {
    const model = metric.group;
    const result = calculateCost(
      model,
      '', // provider unknown when grouped by model
      metric.totalInputTokens,
      metric.totalOutputTokens,
      metric.totalCacheReadTokens,
      metric.totalCacheCreationTokens
    );

    if (!result.modelMatched && model !== 'unknown') {
      logger.warn(`No pricing found for model "${model}", using default (Sonnet) pricing`);
    }

    return {
      inputCost: result.inputCost,
      outputCost: result.outputCost,
      cacheReadCost: result.cacheReadCost,
      cacheCreationCost: result.cacheCreationCost,
      totalCost: result.totalCost,
    };
  }

  /**
   * Compute costs for provider or agent-grouped metrics by querying
   * per-model token breakdowns from the database.
   */
  function costForProviderOrAgentGroup(
    metric: AggregatedMetrics,
    groupBy: 'provider' | 'agent',
    timeRange?: { days: number }
  ): CostBreakdown {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (timeRange?.days ?? 7));
      const cutoffStr = cutoff.toISOString();

      let query: string;
      let params: unknown[];

      if (groupBy === 'provider') {
        query = `SELECT
            provider AS group_key,
            COALESCE(model, 'unknown') AS model,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
            COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
          FROM provider_metrics
          WHERE timestamp >= ? AND provider = ?
          GROUP BY provider, model`;
        params = [cutoffStr, metric.group];
      } else {
        // agent grouping — join with session_messages to get agent_id
        query = `SELECT
            sm.agent_id AS group_key,
            COALESCE(pm.model, 'unknown') AS model,
            COALESCE(SUM(pm.input_tokens), 0) AS input_tokens,
            COALESCE(SUM(pm.output_tokens), 0) AS output_tokens,
            COALESCE(SUM(pm.cache_read_tokens), 0) AS cache_read_tokens,
            COALESCE(SUM(pm.cache_creation_tokens), 0) AS cache_creation_tokens
          FROM provider_metrics pm
          JOIN (
            SELECT DISTINCT session_id, agent_id
            FROM session_messages
          ) sm ON pm.session_id = sm.session_id
          WHERE pm.timestamp >= ? AND sm.agent_id = ?
          GROUP BY sm.agent_id, pm.model`;
        params = [cutoffStr, metric.group];
      }

      const rows = storage.query<DbModelCostRow>(query, params);

      // Sum costs across per-model breakdowns
      let totalInputCost = 0;
      let totalOutputCost = 0;
      let totalCacheReadCost = 0;
      let totalCacheCreationCost = 0;

      for (const row of rows) {
        const model = String(row.model ?? 'unknown');
        const { pricing, matched } = lookupModelPricing(model);

        if (!matched && model !== 'unknown') {
          logger.warn(`No pricing found for model "${model}", using default (Sonnet) pricing`);
        }

        const cost = calculateCostFromPricing(
          pricing,
          Number(row.input_tokens),
          Number(row.output_tokens),
          Number(row.cache_read_tokens),
          Number(row.cache_creation_tokens)
        );

        totalInputCost += cost.inputCost;
        totalOutputCost += cost.outputCost;
        totalCacheReadCost += cost.cacheReadCost;
        totalCacheCreationCost += cost.cacheCreationCost;
      }

      return {
        inputCost: totalInputCost,
        outputCost: totalOutputCost,
        cacheReadCost: totalCacheReadCost,
        cacheCreationCost: totalCacheCreationCost,
        totalCost: totalInputCost + totalOutputCost + totalCacheReadCost + totalCacheCreationCost,
      };
    } catch (err) {
      logger.error(`Failed to compute costs for ${groupBy} group "${metric.group}":`, err);
      // Fall back to default pricing on error
      return calculateCostFromPricing(
        DEFAULT_PRICING,
        metric.totalInputTokens,
        metric.totalOutputTokens,
        metric.totalCacheReadTokens,
        metric.totalCacheCreationTokens
      );
    }
  }

  /**
   * Compute costs for a session-grouped metric entry.
   * Query the session's model from the database for accurate pricing.
   */
  function costForSessionGroup(metric: AggregatedMetrics): CostBreakdown {
    try {
      const rows = storage.query<{ model: string | null; provider: string }>(
        `SELECT model, provider FROM provider_metrics WHERE session_id = ? LIMIT 1`,
        [metric.group]
      );

      if (rows.length > 0) {
        const model = rows[0].model ?? 'unknown';
        const provider = rows[0].provider;
        const result = calculateCost(
          model,
          provider,
          metric.totalInputTokens,
          metric.totalOutputTokens,
          metric.totalCacheReadTokens,
          metric.totalCacheCreationTokens
        );

        if (!result.modelMatched && model !== 'unknown') {
          logger.warn(`No pricing found for model "${model}", using default (Sonnet) pricing`);
        }

        return {
          inputCost: result.inputCost,
          outputCost: result.outputCost,
          cacheReadCost: result.cacheReadCost,
          cacheCreationCost: result.cacheCreationCost,
          totalCost: result.totalCost,
        };
      }
    } catch (err) {
      logger.error(`Failed to look up model for session "${metric.group}":`, err);
    }

    // Fallback to default pricing
    return calculateCostFromPricing(
      DEFAULT_PRICING,
      metric.totalInputTokens,
      metric.totalOutputTokens,
      metric.totalCacheReadTokens,
      metric.totalCacheCreationTokens
    );
  }

  return {
    calculateCost(
      model: string,
      provider: string,
      inputTokens: number,
      outputTokens: number,
      cacheReadTokens: number,
      cacheCreationTokens: number
    ): CostBreakdown {
      const result = calculateCost(model, provider, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

      if (!result.modelMatched) {
        logger.warn(`No pricing found for model "${model}" (provider: "${provider}"), using default (Sonnet) pricing`);
      }

      return {
        inputCost: result.inputCost,
        outputCost: result.outputCost,
        cacheReadCost: result.cacheReadCost,
        cacheCreationCost: result.cacheCreationCost,
        totalCost: result.totalCost,
      };
    },

    enrichWithCosts(
      metrics: AggregatedMetrics[],
      groupBy: 'provider' | 'model' | 'agent' | 'session',
      timeRange?: { days: number }
    ): AggregatedMetricsWithCost[] {
      return metrics.map(metric => {
        let estimatedCost: CostBreakdown;

        switch (groupBy) {
          case 'model':
            estimatedCost = costForModelGroup(metric);
            break;
          case 'provider':
          case 'agent':
            estimatedCost = costForProviderOrAgentGroup(metric, groupBy, timeRange);
            break;
          case 'session':
            estimatedCost = costForSessionGroup(metric);
            break;
          default:
            estimatedCost = calculateCostFromPricing(
              DEFAULT_PRICING,
              metric.totalInputTokens,
              metric.totalOutputTokens,
              metric.totalCacheReadTokens,
              metric.totalCacheCreationTokens
            );
        }

        return { ...metric, estimatedCost };
      });
    },
  };
}
