/**
 * Onboarding Tour QA Walkthrough
 *
 * Comprehensive end-to-end test that walks through every step of the onboarding tour,
 * takes screenshots, and validates visual/behavioral correctness at each step.
 */

import { test, expect } from '@playwright/test';
import { initCheckpoints } from '../test-utils/checkpoint';
import * as fs from 'fs';

// ============================================================================
// Helpers
// ============================================================================

async function clearOnboardingState(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('stoneforge:onboarding-complete');
    localStorage.removeItem('stoneforge:onboarding-step');
  });
}

async function mockPresetConfigured(
  page: import('@playwright/test').Page,
  preset: 'auto' | 'review' | 'approve',
) {
  await page.route('**/api/settings/workflow-preset', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { preset, isConfigured: true },
      });
    } else if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { success: true } });
    } else {
      await route.continue();
    }
  });
}

// Expected steps in order (for auto preset, no director agent, desktop)
// Director steps are conditionally enabled - they may be skipped if no director agent
const EXPECTED_SECTIONS = [
  'Command Center',
  'Managing Work',
  'Agent Fleet',
  // 'The Director' - conditionally enabled
  'Collaboration',
  'Power Tools',
  'Settings & Wrap-Up',
];

// ============================================================================
// Full Walkthrough: Every Step with Screenshots
// ============================================================================

test.describe('QA: Full Onboarding Tour Walkthrough', () => {
  test.setTimeout(180000); // 3 minutes for full walkthrough

  test('walk through every step, screenshot and validate each one', async ({ page }) => {
    const capture = initCheckpoints('qa-full-walkthrough');
    await clearOnboardingState(page);
    await mockPresetConfigured(page, 'auto');

    // Navigate to activity page
    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15000 });

    // Wait for tour to auto-start
    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Collect data about every step
    const stepResults: Array<{
      index: number;
      title: string;
      description: string;
      section: string;
      url: string;
      hasBackdrop: boolean;
      hasTooltip: boolean;
      backButtonVisible: boolean;
      nextButtonText: string;
      skipButtonVisible: boolean;
      skipSectionVisible: boolean;
      issues: string[];
    }> = [];

    let stepIndex = 0;
    let hasMoreSteps = true;

    while (hasMoreSteps) {
      const issues: string[] = [];

      // Wait for tooltip to be stable
      await page.waitForTimeout(500);

      // Get step info
      const titleEl = tooltip.locator('h3');
      const title = (await titleEl.textContent()) || 'UNKNOWN';
      const descEl = tooltip.locator('p');
      const description = (await descEl.textContent()) || '';

      // Get section from progress bar area (the section label is in the footer, not the header)
      // The header has "Getting Started" with uppercase tracking-wider class
      // The section label is in the progress bar footer with just font-medium
      const sectionLabel = await tooltip
        .locator('.border-t .text-xs.font-medium')
        .first()
        .textContent()
        .catch(() => '');

      const url = page.url();

      // Check backdrop visibility
      const backdrop = page.getByTestId('onboarding-backdrop');
      const hasBackdrop = await backdrop.isVisible().catch(() => false);
      if (!hasBackdrop) {
        issues.push('BLOCKER: Dark overlay/backdrop is NOT visible');
      }

      // Check tooltip visibility
      const hasTooltip = await tooltip.isVisible().catch(() => false);
      if (!hasTooltip) {
        issues.push('BLOCKER: Tooltip is NOT visible');
      }

      // Check spotlight overlay (SVG)
      const spotlightSvg = page.locator('svg.fixed.inset-0');
      const hasSpotlight = await spotlightSvg.isVisible().catch(() => false);
      if (!hasSpotlight) {
        issues.push('MAJOR: Spotlight SVG overlay is not visible');
      }

      // Check title is readable (non-empty)
      if (!title || title === 'UNKNOWN') {
        issues.push('BLOCKER: Step title is empty or unreadable');
      }

      // Check description is readable
      if (!description || description.length < 10) {
        issues.push('MAJOR: Step description is empty or too short');
      }

      // Check navigation buttons
      const backBtn = page.getByTestId('onboarding-prev');
      const backButtonVisible = await backBtn.isVisible().catch(() => false);

      if (stepIndex === 0 && backButtonVisible) {
        issues.push('MINOR: Back button should NOT be visible on first step');
      }
      if (stepIndex > 0 && !backButtonVisible) {
        issues.push('MAJOR: Back button should be visible on step > 0');
      }

      const nextBtn = page.getByTestId('onboarding-next');
      const nextButtonText = (await nextBtn.textContent()) || '';

      const skipBtn = page.getByTestId('onboarding-skip');
      const skipButtonVisible = await skipBtn.isVisible().catch(() => false);
      if (!skipButtonVisible) {
        issues.push('MINOR: Skip (X) button is not visible');
      }

      const skipSectionBtn = page.getByTestId('onboarding-skip-section');
      const skipSectionVisible = await skipSectionBtn.isVisible().catch(() => false);

      // Check progress bar shows section info
      const stepCounterText = await tooltip
        .locator('text=/Step \\d+ of \\d+/')
        .textContent()
        .catch(() => null);
      if (!stepCounterText) {
        // Try alternate format "X of Y"
        const altCounter = await tooltip
          .locator('text=/\\d+ of \\d+/')
          .textContent()
          .catch(() => null);
        if (!altCounter) {
          issues.push('MINOR: Step counter not visible in progress bar');
        }
      }

      // Take screenshot
      await capture(
        page,
        `Step ${stepIndex + 1} - ${title}`,
      );

      stepResults.push({
        index: stepIndex,
        title,
        description: description.slice(0, 80) + (description.length > 80 ? '...' : ''),
        section: sectionLabel || '',
        url,
        hasBackdrop,
        hasTooltip,
        backButtonVisible,
        nextButtonText,
        skipButtonVisible,
        skipSectionVisible,
        issues,
      });

      // Advance to next step or finish
      if (nextButtonText.includes('Finish')) {
        hasMoreSteps = false;
      } else {
        await nextBtn.click();
        // Wait for navigation/transition
        await page.waitForTimeout(800);
        // Wait for tooltip to reappear (may need longer for route changes)
        await expect(tooltip).toBeVisible({ timeout: 10000 });
        stepIndex++;
      }
    }

    // Click Finish
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).not.toBeVisible({ timeout: 5000 });
    await capture(page, 'Tour completed - tooltip dismissed');

    // Compile report
    console.log('\n' + '='.repeat(80));
    console.log('ONBOARDING TOUR QA REPORT');
    console.log('='.repeat(80));
    console.log(`Total steps walked: ${stepResults.length}`);
    console.log(`Total issues found: ${stepResults.reduce((acc, s) => acc + s.issues.length, 0)}`);
    console.log('');

    for (const step of stepResults) {
      console.log(`--- Step ${step.index + 1}: "${step.title}" ---`);
      console.log(`  Section: ${step.section}`);
      console.log(`  URL: ${step.url}`);
      console.log(`  Backdrop: ${step.hasBackdrop ? 'YES' : 'NO'}`);
      console.log(`  Tooltip: ${step.hasTooltip ? 'YES' : 'NO'}`);
      console.log(`  Back btn: ${step.backButtonVisible ? 'visible' : 'hidden'}`);
      console.log(`  Next btn: "${step.nextButtonText}"`);
      console.log(`  Skip btn: ${step.skipButtonVisible ? 'visible' : 'hidden'}`);
      console.log(`  Skip section: ${step.skipSectionVisible ? 'visible' : 'hidden'}`);
      if (step.issues.length > 0) {
        for (const issue of step.issues) {
          console.log(`  ⚠ ${issue}`);
        }
      } else {
        console.log(`  ✓ No issues`);
      }
    }

    console.log('\n' + '='.repeat(80));

    // Write report to a JSON file for later use
    const reportPath = './checkpoints/qa-full-walkthrough/report.json';
    fs.writeFileSync(reportPath, JSON.stringify({ steps: stepResults, totalSteps: stepResults.length }, null, 2));
  });
});

// ============================================================================
// Back Button Test: Verify back navigates correctly (not closing tour)
// ============================================================================

test.describe('QA: Back Button Navigation', () => {
  test('back button goes to previous step, not closing the tour', async ({ page }) => {
    const capture = initCheckpoints('qa-back-button');
    await clearOnboardingState(page);
    await mockPresetConfigured(page, 'auto');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Step 1
    const step1Title = await tooltip.locator('h3').textContent();
    await capture(page, 'Step 1 before advancing');

    // Go to step 2
    await page.getByTestId('onboarding-next').click();
    await page.waitForTimeout(500);
    const step2Title = await tooltip.locator('h3').textContent();
    expect(step2Title).not.toBe(step1Title);
    await capture(page, 'Step 2 after advancing');

    // Go to step 3
    await page.getByTestId('onboarding-next').click();
    await page.waitForTimeout(500);
    const step3Title = await tooltip.locator('h3').textContent();
    await capture(page, 'Step 3 after advancing');

    // Go back to step 2
    await page.getByTestId('onboarding-prev').click();
    await page.waitForTimeout(500);
    const backToStep2Title = await tooltip.locator('h3').textContent();

    // Tour should still be active
    await expect(tooltip).toBeVisible();
    await expect(page.getByTestId('onboarding-backdrop')).toBeVisible();

    // Should show step 2 title, not step 3
    expect(backToStep2Title).toBe(step2Title);
    await capture(page, 'Back to Step 2 - tour still active');

    // Go back to step 1
    await page.getByTestId('onboarding-prev').click();
    await page.waitForTimeout(500);
    const backToStep1Title = await tooltip.locator('h3').textContent();
    expect(backToStep1Title).toBe(step1Title);
    await expect(tooltip).toBeVisible();
    await capture(page, 'Back to Step 1 - tour still active');
  });
});

// ============================================================================
// Skip Section Test
// ============================================================================

test.describe('QA: Skip Section', () => {
  test('skip section button advances to the next section', async ({ page }) => {
    const capture = initCheckpoints('qa-skip-section');
    await clearOnboardingState(page);
    await mockPresetConfigured(page, 'auto');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Get first section label from the progress bar footer area
    const firstSectionLabel = await tooltip
      .locator('.border-t .text-xs.font-medium')
      .first()
      .textContent()
      .catch(() => '');
    await capture(page, `In section: ${firstSectionLabel}`);

    // Get first step counter text
    const firstStepCounter = await tooltip
      .locator('text=/Step \\d+ of \\d+/')
      .textContent()
      .catch(() => '');

    // Click skip section if visible
    const skipSectionBtn = page.getByTestId('onboarding-skip-section');
    const isSkipSectionVisible = await skipSectionBtn.isVisible().catch(() => false);

    if (isSkipSectionVisible) {
      await skipSectionBtn.click();
      await page.waitForTimeout(1500);
      await expect(tooltip).toBeVisible({ timeout: 10000 });

      const newSectionLabel = await tooltip
        .locator('.border-t .text-xs.font-medium')
        .first()
        .textContent()
        .catch(() => '');
      const newStepCounter = await tooltip
        .locator('text=/Step \\d+ of \\d+/')
        .textContent()
        .catch(() => '');
      await capture(page, `Skipped to section: ${newSectionLabel}`);

      // Verify we moved to a different section (either label changed or step counter reset to "Step 1 of X")
      const labelChanged = newSectionLabel !== firstSectionLabel;
      const counterReset = newStepCounter?.startsWith('Step 1 of');
      expect(labelChanged || counterReset).toBeTruthy();
    } else {
      console.log('Skip section button not visible on first step');
    }
  });
});

// ============================================================================
// Skip Tour (X button) Test
// ============================================================================

test.describe('QA: Skip Tour', () => {
  test('X button dismisses tour at any step', async ({ page }) => {
    const capture = initCheckpoints('qa-skip-tour');
    await clearOnboardingState(page);
    await mockPresetConfigured(page, 'auto');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Advance a few steps
    await page.getByTestId('onboarding-next').click();
    await page.waitForTimeout(500);
    await page.getByTestId('onboarding-next').click();
    await page.waitForTimeout(500);
    await capture(page, 'At step 3 before skipping');

    // Click X to skip
    await page.getByTestId('onboarding-skip').click();

    // Tour should be completely dismissed
    await expect(tooltip).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('onboarding-backdrop')).not.toBeVisible();
    await capture(page, 'Tour dismissed after clicking X');
  });
});

// ============================================================================
// Keyboard Navigation Test
// ============================================================================

test.describe('QA: Keyboard Navigation', () => {
  test('arrow keys, Enter, and Escape work for tour navigation', async ({ page }) => {
    const capture = initCheckpoints('qa-keyboard-nav');
    await clearOnboardingState(page);
    await mockPresetConfigured(page, 'auto');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Step 1
    const step1Title = await tooltip.locator('h3').textContent();
    await capture(page, 'Step 1 - keyboard test start');

    // ArrowRight → next step
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const step2Title = await tooltip.locator('h3').textContent();
    expect(step2Title).not.toBe(step1Title);
    await expect(tooltip).toBeVisible();
    await capture(page, 'Step 2 after ArrowRight');

    // Enter → next step
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const step3Title = await tooltip.locator('h3').textContent();
    expect(step3Title).not.toBe(step2Title);
    await expect(tooltip).toBeVisible();
    await capture(page, 'Step 3 after Enter');

    // ArrowLeft → previous step
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    const backToStep2 = await tooltip.locator('h3').textContent();
    expect(backToStep2).toBe(step2Title);
    await expect(tooltip).toBeVisible();
    await capture(page, 'Back to step 2 after ArrowLeft');

    // Escape → dismiss tour
    await page.keyboard.press('Escape');
    await expect(tooltip).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('onboarding-backdrop')).not.toBeVisible();
    await capture(page, 'Tour dismissed after Escape');
  });
});

// ============================================================================
// Restart from Settings Test
// ============================================================================

test.describe('QA: Restart from Settings', () => {
  test('tour can be restarted from Settings page', async ({ page }) => {
    const capture = initCheckpoints('qa-restart-settings');

    // Start with tour already completed
    await page.addInitScript(() => {
      localStorage.setItem('stoneforge:onboarding-complete', 'true');
    });
    await mockPresetConfigured(page, 'auto');

    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 15000 });

    // Find restart button
    const onboardingSection = page.getByTestId('settings-section-onboarding-tour');
    await onboardingSection.scrollIntoViewIfNeeded();
    await expect(onboardingSection).toBeVisible({ timeout: 10000 });
    await capture(page, 'Settings page with onboarding section');

    const restartBtn = page.getByTestId('settings-restart-onboarding');
    await expect(restartBtn).toBeVisible();
    await capture(page, 'Restart button visible');

    // Click restart
    await restartBtn.click();

    // Should navigate to /activity and start tour
    await expect(page).toHaveURL(/\/activity/, { timeout: 10000 });
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Should be on step 1
    await expect(tooltip).toContainText(/1 of|Step 1/);
    await capture(page, 'Tour restarted from settings - step 1');
  });
});
