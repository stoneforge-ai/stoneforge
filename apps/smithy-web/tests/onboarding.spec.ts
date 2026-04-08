/**
 * Visual QA: Onboarding flow, preset selection, and guided walkthrough
 *
 * Tests the full first-time user experience:
 * 1. Preset selection modal on first load
 * 2. Onboarding guided tour after preset selection
 * 3. Re-accessible tour from Settings
 * 4. Preset change from Settings
 */

import { test, expect } from '@playwright/test';
import { initCheckpoints } from '../test-utils/checkpoint';

// ============================================================================
// Helper: Clear onboarding state for a fresh start
// ============================================================================

/**
 * Clears the localStorage onboarding flag and any preset configuration
 * so that the preset selection modal and tour appear as if for a new user.
 */
async function clearOnboardingState(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('stoneforge:onboarding-complete');
  });
}

/**
 * Intercepts the workflow preset API to simulate an unconfigured state (no preset).
 */
async function mockNoPreset(page: import('@playwright/test').Page) {
  await page.route('**/api/settings/workflow-preset', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { preset: null, isConfigured: false },
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Intercepts the workflow preset API to simulate a configured preset.
 */
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
      // Accept PUT and return success
      await route.fulfill({
        json: { success: true },
      });
    } else {
      await route.continue();
    }
  });
}

// ============================================================================
// 1. First-Load Preset Selection Modal
// ============================================================================

test.describe('Preset Selection Modal', () => {
  test('shows full-screen preset selection modal when no preset configured', async ({
    page,
  }) => {
    const capture = initCheckpoints('preset-modal');
    await clearOnboardingState(page);
    await mockNoPreset(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    // Modal should appear
    const modal = page.getByTestId('preset-selection-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    await capture(page, 'Preset selection modal is visible on first load');
  });

  test('displays all three preset cards: Auto, Review, Approve', async ({ page }) => {
    const capture = initCheckpoints('preset-cards');
    await clearOnboardingState(page);
    await mockNoPreset(page);

    await page.goto('/activity');
    await expect(page.getByTestId('preset-selection-modal')).toBeVisible({ timeout: 10000 });

    // All three cards visible
    await expect(page.getByTestId('preset-card-auto')).toBeVisible();
    await expect(page.getByTestId('preset-card-review')).toBeVisible();
    await expect(page.getByTestId('preset-card-approve')).toBeVisible();

    await capture(page, 'All three preset cards are visible');
  });

  test('each preset card has icon, tagline, and description', async ({ page }) => {
    await clearOnboardingState(page);
    await mockNoPreset(page);

    await page.goto('/activity');
    await expect(page.getByTestId('preset-selection-modal')).toBeVisible({ timeout: 10000 });

    // Auto card content
    const autoCard = page.getByTestId('preset-card-auto');
    await expect(autoCard).toContainText('Auto');
    await expect(autoCard).toContainText('Fast iteration, no human review');
    await expect(autoCard).toContainText('Agents merge directly to main');

    // Review card content
    const reviewCard = page.getByTestId('preset-card-review');
    await expect(reviewCard).toContainText('Review');
    await expect(reviewCard).toContainText('Human reviews before main');
    await expect(reviewCard).toContainText('Agents merge to a review branch');

    // Approve card content
    const approveCard = page.getByTestId('preset-card-approve');
    await expect(approveCard).toContainText('Approve');
    await expect(approveCard).toContainText('Full control, explicit approval');
    await expect(approveCard).toContainText('Agents need permission');

    // Each card should have an SVG icon
    await expect(autoCard.locator('svg').first()).toBeVisible();
    await expect(reviewCard.locator('svg').first()).toBeVisible();
    await expect(approveCard.locator('svg').first()).toBeVisible();
  });

  test('clicking a preset card highlights it with selection state', async ({ page }) => {
    const capture = initCheckpoints('preset-selection-highlight');
    await clearOnboardingState(page);
    await mockNoPreset(page);

    await page.goto('/activity');
    await expect(page.getByTestId('preset-selection-modal')).toBeVisible({ timeout: 10000 });

    // Initially, Continue button should be disabled (no selection)
    const continueBtn = page.getByTestId('preset-selection-confirm');
    await expect(continueBtn).toBeDisabled();

    // Click Auto
    await page.getByTestId('preset-card-auto').click();
    // Auto card should have primary border (selected)
    await expect(page.getByTestId('preset-card-auto')).toHaveClass(/border-\[var\(--color-primary\)\]/);
    // Continue button now enabled
    await expect(continueBtn).toBeEnabled();

    await capture(page, 'Auto preset card is selected with visual highlight');

    // Click Review — should switch selection
    await page.getByTestId('preset-card-review').click();
    await expect(page.getByTestId('preset-card-review')).toHaveClass(/border-\[var\(--color-primary\)\]/);
    // Auto should no longer be selected
    await expect(page.getByTestId('preset-card-auto')).not.toHaveClass(/border-\[var\(--color-primary\)\]/);

    await capture(page, 'Review preset card is selected, Auto is deselected');

    // Click Approve
    await page.getByTestId('preset-card-approve').click();
    await expect(page.getByTestId('preset-card-approve')).toHaveClass(/border-\[var\(--color-primary\)\]/);

    await capture(page, 'Approve preset card is selected');
  });

  test('Continue button saves preset and dismisses modal', async ({ page }) => {
    const capture = initCheckpoints('preset-confirm');
    await clearOnboardingState(page);
    await mockNoPreset(page);

    // Track PUT request to verify save
    let savedPreset: string | null = null;
    await page.route('**/api/settings/workflow-preset', async (route) => {
      if (route.request().method() === 'GET') {
        // After save, return configured state
        if (savedPreset) {
          await route.fulfill({
            json: { preset: savedPreset, isConfigured: true },
          });
        } else {
          await route.fulfill({
            json: { preset: null, isConfigured: false },
          });
        }
      } else if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        savedPreset = body.preset || body;
        await route.fulfill({
          json: { success: true },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/activity');
    await expect(page.getByTestId('preset-selection-modal')).toBeVisible({ timeout: 10000 });

    // Select Review and confirm
    await page.getByTestId('preset-card-review').click();
    await page.getByTestId('preset-selection-confirm').click();

    // Modal should dismiss
    await expect(page.getByTestId('preset-selection-modal')).not.toBeVisible({ timeout: 10000 });

    // Dashboard should be visible
    await expect(page.getByTestId('activity-page')).toBeVisible();

    await capture(page, 'Modal dismissed and dashboard visible after preset selection');
  });

  test('does not show modal when preset is already configured', async ({ page }) => {
    await mockPresetConfigured(page, 'auto');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    // Modal should NOT appear
    await expect(page.getByTestId('preset-selection-modal')).not.toBeVisible();
  });
});

// ============================================================================
// 2. Onboarding Guided Walkthrough
// ============================================================================

test.describe('Onboarding Guided Tour', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure clean state with a configured preset so tour auto-starts
    await clearOnboardingState(page);
    await mockPresetConfigured(page, 'auto');
  });

  test('tour starts automatically after preset configuration', async ({ page }) => {
    const capture = initCheckpoints('tour-auto-start');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    // Tour should auto-start after ~800ms
    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Backdrop overlay should be visible
    await expect(page.getByTestId('onboarding-backdrop')).toBeVisible();

    await capture(page, 'Onboarding tour auto-started with tooltip and backdrop');
  });

  test('each step highlights the correct UI element with backdrop overlay', async ({
    page,
  }) => {
    const capture = initCheckpoints('tour-step-highlights');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    // Wait for tour to start
    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Step 1: Activity Dashboard
    await expect(tooltip).toContainText('Activity Dashboard');
    await expect(page.getByTestId('onboarding-backdrop')).toBeVisible();
    await capture(page, 'Step 1 highlights Activity Dashboard');

    // Step 2: Agent Cards
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).toContainText('Agent Cards');
    await capture(page, 'Step 2 highlights Agent Cards');

    // Step 3: System Status Bar
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).toContainText('System Status Bar');
    await capture(page, 'Step 3 highlights System Status Bar');

    // Step 4: Sidebar Navigation
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).toContainText('Sidebar Navigation');
    await capture(page, 'Step 4 highlights Sidebar Navigation');
  });

  test('step content shows title, description, step counter, and navigation buttons', async ({
    page,
  }) => {
    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Title
    await expect(tooltip).toContainText('Activity Dashboard');
    // Description
    await expect(tooltip).toContainText('command center');
    // Step counter — "1 of N"
    await expect(tooltip).toContainText(/1 of \d+/);
    // Next button
    await expect(page.getByTestId('onboarding-next')).toBeVisible();
    await expect(page.getByTestId('onboarding-next')).toContainText('Next');
    // Skip button (X icon)
    await expect(page.getByTestId('onboarding-skip')).toBeVisible();
    // No Back button on first step
    await expect(page.getByTestId('onboarding-prev')).not.toBeVisible();

    // Go to step 2 — Back button should now appear
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).toContainText(/2 of \d+/);
    await expect(page.getByTestId('onboarding-prev')).toBeVisible();
  });

  test('Skip tour dismisses the tour at any step', async ({ page }) => {
    const capture = initCheckpoints('tour-skip');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Advance to step 2
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).toContainText(/2 of \d+/);

    // Skip tour
    await page.getByTestId('onboarding-skip').click();

    // Tour should be dismissed
    await expect(tooltip).not.toBeVisible();
    await expect(page.getByTestId('onboarding-backdrop')).not.toBeVisible();

    await capture(page, 'Tour dismissed after skip at step 2');
  });

  test('tour does NOT reappear on page reload after completion', async ({ page }) => {
    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Skip to complete the tour
    await page.getByTestId('onboarding-skip').click();
    await expect(tooltip).not.toBeVisible();

    // Reload the page
    await page.reload();
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    // Wait a bit and verify tour does NOT reappear
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('onboarding-tooltip')).not.toBeVisible();
  });

  test('tour does NOT reappear on page reload after skip', async ({ page }) => {
    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Advance a couple steps then skip
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-skip').click();
    await expect(tooltip).not.toBeVisible();

    // Reload
    await page.reload();
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('onboarding-tooltip')).not.toBeVisible();
  });

  test('Notification Bell step only appears when Approve preset is active', async ({
    page,
  }) => {
    // Override to use 'approve' preset
    await mockPresetConfigured(page, 'approve');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Collect all step titles by navigating through the tour
    const stepTitles: string[] = [];
    let hasMoreSteps = true;

    while (hasMoreSteps) {
      const titleText = await tooltip.locator('h3').textContent();
      if (titleText) stepTitles.push(titleText);

      const nextButton = page.getByTestId('onboarding-next');
      const nextText = await nextButton.textContent();

      if (nextText?.includes('Finish')) {
        hasMoreSteps = false;
      } else {
        await nextButton.click();
        // Wait for next step to render
        await page.waitForTimeout(200);
      }
    }

    // Should contain the Notification Bell step
    expect(stepTitles).toContain('Notification Bell');
  });

  test('Notification Bell step does NOT appear for Auto preset', async ({ page }) => {
    // auto preset (already set in beforeEach)
    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Collect all step titles
    const stepTitles: string[] = [];
    let hasMoreSteps = true;

    while (hasMoreSteps) {
      const titleText = await tooltip.locator('h3').textContent();
      if (titleText) stepTitles.push(titleText);

      const nextButton = page.getByTestId('onboarding-next');
      const nextText = await nextButton.textContent();

      if (nextText?.includes('Finish')) {
        hasMoreSteps = false;
      } else {
        await nextButton.click();
        await page.waitForTimeout(200);
      }
    }

    // Should NOT contain the Notification Bell step
    expect(stepTitles).not.toContain('Notification Bell');
  });

  test('last step shows Finish button instead of Next', async ({ page }) => {
    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Navigate to last step
    let nextText = await page.getByTestId('onboarding-next').textContent();
    while (!nextText?.includes('Finish')) {
      await page.getByTestId('onboarding-next').click();
      await page.waitForTimeout(200);
      nextText = await page.getByTestId('onboarding-next').textContent();
    }

    // Last step should say "Finish"
    await expect(page.getByTestId('onboarding-next')).toContainText('Finish');
  });

  test('clicking Finish on last step completes the tour', async ({ page }) => {
    const capture = initCheckpoints('tour-finish');

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Navigate to last step
    let nextText = await page.getByTestId('onboarding-next').textContent();
    while (!nextText?.includes('Finish')) {
      await page.getByTestId('onboarding-next').click();
      await page.waitForTimeout(200);
      nextText = await page.getByTestId('onboarding-next').textContent();
    }

    // Click Finish
    await page.getByTestId('onboarding-next').click();

    // Tour should be dismissed
    await expect(tooltip).not.toBeVisible();
    await expect(page.getByTestId('onboarding-backdrop')).not.toBeVisible();

    await capture(page, 'Tour completed and dismissed after clicking Finish');
  });

  test('Back button navigates to previous step', async ({ page }) => {
    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Step 1
    await expect(tooltip).toContainText('Activity Dashboard');

    // Go to step 2
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).toContainText('Agent Cards');

    // Go back to step 1
    await page.getByTestId('onboarding-prev').click();
    await expect(tooltip).toContainText('Activity Dashboard');
  });
});

// ============================================================================
// 3. Re-Accessible Tour from Settings
// ============================================================================

test.describe('Restart Tour from Settings', () => {
  test('Settings > Preferences has Restart Onboarding Tour button', async ({ page }) => {
    await mockPresetConfigured(page, 'auto');

    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 });

    // Scroll to and find onboarding tour section
    const onboardingSection = page.getByTestId('settings-section-onboarding-tour');
    await onboardingSection.scrollIntoViewIfNeeded();
    await expect(onboardingSection).toBeVisible({ timeout: 10000 });

    // Restart button should be present
    const restartButton = page.getByTestId('settings-restart-onboarding');
    await expect(restartButton).toBeVisible();
    await expect(restartButton).toContainText('Restart Onboarding Tour');
  });

  test('clicking Restart Onboarding Tour replays the tour from the beginning', async ({
    page,
  }) => {
    const capture = initCheckpoints('tour-restart');

    // Start with tour already completed
    await page.addInitScript(() => {
      localStorage.setItem('stoneforge:onboarding-complete', 'true');
    });
    await mockPresetConfigured(page, 'auto');

    // Navigate to settings
    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 });

    // Find and click restart
    const onboardingSection = page.getByTestId('settings-section-onboarding-tour');
    await onboardingSection.scrollIntoViewIfNeeded();
    await page.getByTestId('settings-restart-onboarding').click();

    // Should navigate to /activity
    await expect(page).toHaveURL(/\/activity/, { timeout: 10000 });
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    // Tour should start from the beginning
    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(tooltip).toContainText('Activity Dashboard');
    await expect(tooltip).toContainText(/1 of \d+/);

    await capture(page, 'Tour replayed from beginning after restart from settings');
  });
});

// ============================================================================
// 4. Preset Change from Settings
// ============================================================================

test.describe('Preset Change from Settings', () => {
  test('Settings > Workspace tab shows current workflow preset', async ({ page }) => {
    await mockPresetConfigured(page, 'auto');

    await page.goto('/settings?tab=workspace');
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('settings-workspace')).toBeVisible({ timeout: 10000 });

    // Workflow Preset section should be visible
    const presetSection = page.getByTestId('settings-section-workflow-preset');
    await expect(presetSection).toBeVisible({ timeout: 10000 });

    // Inline preset selector should be visible
    await expect(page.getByTestId('inline-preset-selector')).toBeVisible();

    // Auto should be the current preset (shown with "current" badge)
    const autoCard = page.getByTestId('inline-preset-auto');
    await expect(autoCard).toContainText('current');
  });

  test('can change from one preset to another in settings', async ({ page }) => {
    const capture = initCheckpoints('preset-change');
    let currentPreset = 'auto';

    await page.route('**/api/settings/workflow-preset', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: { preset: currentPreset, isConfigured: true },
        });
      } else if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        currentPreset = body.preset || body;
        await route.fulfill({
          json: { success: true },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/settings?tab=workspace');
    await expect(page.getByTestId('settings-workspace')).toBeVisible({ timeout: 10000 });

    // Select Review preset
    await page.getByTestId('inline-preset-review').click();

    // Save button should appear since selection changed
    const saveBtn = page.getByTestId('preset-save-button');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toContainText('Apply Preset');

    await capture(page, 'Review preset selected, Apply Preset button visible');

    // Click save
    await saveBtn.click();

    // Save button should disappear after successful save
    await expect(saveBtn).not.toBeVisible({ timeout: 5000 });

    await capture(page, 'Preset changed to Review successfully');
  });

  test('selecting same preset does not show save button', async ({ page }) => {
    await mockPresetConfigured(page, 'auto');

    await page.goto('/settings?tab=workspace');
    await expect(page.getByTestId('settings-workspace')).toBeVisible({ timeout: 10000 });

    // Click the already-active Auto preset
    await page.getByTestId('inline-preset-auto').click();

    // Save button should NOT appear
    await expect(page.getByTestId('preset-save-button')).not.toBeVisible();
  });
});

// ============================================================================
// 5. Full E2E: Preset Selection → Tour → Completion
// ============================================================================

test.describe('Full Onboarding E2E Flow', () => {
  test('complete flow: modal → select preset → tour → finish', async ({ page }) => {
    const capture = initCheckpoints('full-e2e-flow');
    await clearOnboardingState(page);

    let currentPreset: string | null = null;

    await page.route('**/api/settings/workflow-preset', async (route) => {
      if (route.request().method() === 'GET') {
        if (currentPreset) {
          await route.fulfill({
            json: { preset: currentPreset, isConfigured: true },
          });
        } else {
          await route.fulfill({
            json: { preset: null, isConfigured: false },
          });
        }
      } else if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        currentPreset = body.preset || body;
        await route.fulfill({
          json: { success: true },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });

    // Step 1: Preset selection modal appears
    await expect(page.getByTestId('preset-selection-modal')).toBeVisible({ timeout: 10000 });
    await capture(page, 'E2E Step 1 - Preset selection modal appears');

    // Step 2: Select Auto preset and continue
    await page.getByTestId('preset-card-auto').click();
    await page.getByTestId('preset-selection-confirm').click();

    // Modal dismisses
    await expect(page.getByTestId('preset-selection-modal')).not.toBeVisible({ timeout: 10000 });
    await capture(page, 'E2E Step 2 - Modal dismissed after selecting Auto preset');

    // Step 3: Tour auto-starts
    const tooltip = page.getByTestId('onboarding-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(tooltip).toContainText('Activity Dashboard');
    await capture(page, 'E2E Step 3 - Tour started with first step');

    // Step 4: Navigate through all steps
    let nextText = await page.getByTestId('onboarding-next').textContent();
    while (!nextText?.includes('Finish')) {
      await page.getByTestId('onboarding-next').click();
      await page.waitForTimeout(300);
      nextText = await page.getByTestId('onboarding-next').textContent();
    }
    await capture(page, 'E2E Step 4 - Navigated to last tour step');

    // Step 5: Finish the tour
    await page.getByTestId('onboarding-next').click();
    await expect(tooltip).not.toBeVisible();
    await capture(page, 'E2E Step 5 - Tour completed');

    // Step 6: Verify tour does not reappear on reload
    await page.reload();
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('onboarding-tooltip')).not.toBeVisible();
    await capture(page, 'E2E Step 6 - Tour does not reappear after reload');
  });
});
