/**
 * Model Pricing Tests
 *
 * Tests for the shared pricing configuration and cost calculation utilities.
 */

import { describe, it, expect } from 'bun:test';
import {
  MODEL_PRICING,
  DEFAULT_PRICING,
  lookupModelPricing,
  calculateCostFromPricing,
  calculateCost,
} from './model-pricing.js';

describe('MODEL_PRICING', () => {
  it('contains anthropic provider with known models', () => {
    expect(MODEL_PRICING.anthropic).toBeDefined();
    expect(MODEL_PRICING.anthropic['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING.anthropic['claude-haiku-4-5-20251001']).toBeDefined();
    expect(MODEL_PRICING.anthropic['claude-opus-4-6-20250612']).toBeDefined();
  });

  it('contains opencode provider', () => {
    expect(MODEL_PRICING.opencode).toBeDefined();
    expect(MODEL_PRICING.opencode['minimax-m2.5-free']).toBeDefined();
  });

  it('has correct Sonnet pricing', () => {
    const sonnet = MODEL_PRICING.anthropic['claude-sonnet-4-20250514'];
    expect(sonnet.inputPer1M).toBe(3.0);
    expect(sonnet.outputPer1M).toBe(15.0);
    expect(sonnet.cacheReadPer1M).toBe(0.3);
    expect(sonnet.cacheCreationPer1M).toBe(3.75);
  });

  it('has zero pricing for free models', () => {
    const free = MODEL_PRICING.opencode['minimax-m2.5-free'];
    expect(free.inputPer1M).toBe(0);
    expect(free.outputPer1M).toBe(0);
    expect(free.cacheReadPer1M).toBe(0);
    expect(free.cacheCreationPer1M).toBe(0);
  });
});

describe('lookupModelPricing', () => {
  it('finds exact model match with provider', () => {
    const result = lookupModelPricing('claude-sonnet-4-20250514', 'anthropic');
    expect(result.matched).toBe(true);
    expect(result.pricing.inputPer1M).toBe(3.0);
  });

  it('finds exact model match without provider', () => {
    const result = lookupModelPricing('claude-sonnet-4-20250514');
    expect(result.matched).toBe(true);
    expect(result.pricing.inputPer1M).toBe(3.0);
  });

  it('supports partial model name matching (prefix)', () => {
    const result = lookupModelPricing('claude-sonnet-4', 'anthropic');
    expect(result.matched).toBe(true);
    expect(result.pricing.inputPer1M).toBe(3.0);
  });

  it('supports partial model name matching without provider', () => {
    const result = lookupModelPricing('claude-opus-4-6');
    expect(result.matched).toBe(true);
    expect(result.pricing.inputPer1M).toBe(15.0);
  });

  it('returns default pricing for unknown model', () => {
    const result = lookupModelPricing('unknown-model-xyz');
    expect(result.matched).toBe(false);
    expect(result.pricing).toEqual(DEFAULT_PRICING);
  });

  it('returns default pricing for unknown provider + model', () => {
    const result = lookupModelPricing('some-model', 'some-provider');
    expect(result.matched).toBe(false);
    expect(result.pricing).toEqual(DEFAULT_PRICING);
  });
});

describe('calculateCostFromPricing', () => {
  it('computes correct cost breakdown', () => {
    const pricing = {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheCreationPer1M: 3.75,
    };

    const result = calculateCostFromPricing(pricing, 1_000_000, 500_000, 200_000, 100_000);

    expect(result.inputCost).toBeCloseTo(3.0);
    expect(result.outputCost).toBeCloseTo(7.5);
    expect(result.cacheReadCost).toBeCloseTo(0.06);
    expect(result.cacheCreationCost).toBeCloseTo(0.375);
    expect(result.totalCost).toBeCloseTo(10.935);
  });

  it('returns zero costs for zero tokens', () => {
    const result = calculateCostFromPricing(DEFAULT_PRICING, 0, 0, 0, 0);
    expect(result.totalCost).toBe(0);
  });

  it('returns zero costs for free pricing', () => {
    const freePricing = { inputPer1M: 0, outputPer1M: 0, cacheReadPer1M: 0, cacheCreationPer1M: 0 };
    const result = calculateCostFromPricing(freePricing, 1_000_000, 1_000_000, 1_000_000, 1_000_000);
    expect(result.totalCost).toBe(0);
  });
});

describe('calculateCost', () => {
  it('looks up model pricing and calculates costs', () => {
    const result = calculateCost('claude-sonnet-4-20250514', 'anthropic', 1_000_000, 0, 0, 0);
    expect(result.modelMatched).toBe(true);
    expect(result.inputCost).toBeCloseTo(3.0);
    expect(result.totalCost).toBeCloseTo(3.0);
  });

  it('uses default pricing for unknown models', () => {
    const result = calculateCost('unknown-model', 'unknown-provider', 1_000_000, 0, 0, 0);
    expect(result.modelMatched).toBe(false);
    expect(result.inputCost).toBeCloseTo(DEFAULT_PRICING.inputPer1M);
  });

  it('supports partial model names', () => {
    const result = calculateCost('claude-haiku-4-5', 'anthropic', 1_000_000, 0, 0, 0);
    expect(result.modelMatched).toBe(true);
    expect(result.inputCost).toBeCloseTo(0.8);
  });
});
