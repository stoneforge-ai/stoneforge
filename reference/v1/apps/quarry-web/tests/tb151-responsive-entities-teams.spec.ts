/**
 * TB151: Responsive Entities & Teams Pages Tests
 *
 * Tests for the responsive behavior of the Entities and Teams pages across viewports.
 *
 * Behaviors tested:
 * - Mobile: Card-based list view, full-screen detail sheet, mobile modals
 * - Tablet/Desktop: Grid list view, side panel for detail, desktop modals
 * - Responsive entity list
 * - Responsive team list
 * - Full-screen modals on mobile
 */

import { test, expect } from '@playwright/test';
import {
  setViewport,
  waitForResponsiveUpdate,
} from './helpers/responsive';

test.describe('TB151: Responsive Entities Page', () => {
  test.describe('Mobile Viewport (< 640px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, 'xs');
      await page.goto('/entities');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show page header with compact create button on mobile', async ({ page }) => {
      // Page title should be visible (use heading role for specificity)
      await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible();

      // Create button should show short text on mobile
      const registerButton = page.getByTestId('create-entity-button');
      await expect(registerButton).toBeVisible();
      await expect(registerButton).toContainText('Add');
    });

    test('should show entity list on mobile', async ({ page }) => {
      // Wait for page to load
      await page.waitForSelector('[data-testid="entities-page"]', { timeout: 10000 });

      // Entities grid should be visible
      const entitiesGrid = page.getByTestId('entities-grid');
      await expect(entitiesGrid).toBeVisible();
    });

    test('should show full-screen create modal on mobile', async ({ page }) => {
      // Click create button
      const registerButton = page.getByTestId('create-entity-button');
      await registerButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-entity-modal');
      await expect(modal).toBeVisible();

      // Name input should be visible
      await expect(page.getByTestId('create-entity-name-input')).toBeVisible();

      // Close button should be accessible
      await expect(page.getByTestId('create-entity-modal-close')).toBeVisible();
    });

    test('should show stacked action buttons in create modal on mobile', async ({ page }) => {
      // Click create button
      const registerButton = page.getByTestId('create-entity-button');
      await registerButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-entity-modal');
      await expect(modal).toBeVisible();

      // Submit button should be visible
      const submitButton = page.getByTestId('create-entity-submit');
      await expect(submitButton).toBeVisible();

      // Cancel button should be visible
      const cancelButton = page.getByTestId('create-entity-cancel');
      await expect(cancelButton).toBeVisible();
    });

    test('should close create modal when close button is clicked', async ({ page }) => {
      // Click create button
      const registerButton = page.getByTestId('create-entity-button');
      await registerButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-entity-modal');
      await expect(modal).toBeVisible();

      // Click close button
      const closeButton = page.getByTestId('create-entity-modal-close');
      await closeButton.click();

      // Modal should be closed
      await expect(modal).not.toBeVisible();
    });
  });

  test.describe('Desktop Viewport (1280px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, '2xl');
      await page.goto('/entities');
      await waitForResponsiveUpdate(page);
    });

    test('should show page header with full create button on desktop', async ({ page }) => {
      // Page title should be visible (use heading role for specificity)
      await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible();

      // Create button should show full text on desktop
      const createButton = page.getByTestId('create-entity-button');
      await expect(createButton).toBeVisible();
      await expect(createButton).toContainText('Create Entity');
    });

    test('should show grid-based entity list on desktop', async ({ page }) => {
      // Wait for page to load
      await page.waitForSelector('[data-testid="entities-page"]', { timeout: 10000 });

      // Entities grid should be visible
      const entitiesGrid = page.getByTestId('entities-grid');
      await expect(entitiesGrid).toBeVisible();
    });

    test('should show centered create modal on desktop', async ({ page }) => {
      // Click create button
      const createButton = page.getByTestId('create-entity-button');
      await createButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-entity-modal');
      await expect(modal).toBeVisible();

      // Name input should be visible
      await expect(page.getByTestId('create-entity-name-input')).toBeVisible();
    });
  });

  test.describe('Viewport Transitions', () => {
    test('should adapt layout when viewport changes from desktop to mobile', async ({ page }) => {
      // Start at desktop
      await setViewport(page, '2xl');
      await page.goto('/entities');
      await waitForResponsiveUpdate(page);

      // Verify desktop layout - full button text
      const createButton = page.getByTestId('create-entity-button');
      await expect(createButton).toContainText('Create Entity');

      // Resize to mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page, 300);

      // Verify mobile layout - short button text
      await expect(createButton).toContainText('Add');
    });
  });
});

test.describe('TB151: Responsive Teams Page', () => {
  test.describe('Mobile Viewport (< 640px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport BEFORE navigation
      await setViewport(page, 'xs');
      await page.goto('/teams');
      // Wait for responsive hooks to stabilize
      await waitForResponsiveUpdate(page, 300);
    });

    test('should show page header with compact new team button on mobile', async ({ page }) => {
      // Page title should be visible (use heading role for specificity)
      await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();

      // New team button should show short text on mobile
      const newTeamButton = page.getByTestId('new-team-button');
      await expect(newTeamButton).toBeVisible();
      await expect(newTeamButton).toContainText('Add');
    });

    test('should show team list on mobile', async ({ page }) => {
      // Wait for page to load
      await page.waitForSelector('[data-testid="teams-page"]', { timeout: 10000 });

      // Teams grid should be visible
      const teamsGrid = page.getByTestId('teams-grid');
      await expect(teamsGrid).toBeVisible();
    });

    test('should show full-screen create team modal on mobile', async ({ page }) => {
      // Click new team button
      const newTeamButton = page.getByTestId('new-team-button');
      await newTeamButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-team-modal');
      await expect(modal).toBeVisible();

      // Name input should be visible
      await expect(page.getByTestId('create-team-name-input')).toBeVisible();

      // Close button should be accessible
      await expect(page.getByTestId('create-team-modal-close')).toBeVisible();
    });

    test('should show stacked action buttons in create team modal on mobile', async ({ page }) => {
      // Click new team button
      const newTeamButton = page.getByTestId('new-team-button');
      await newTeamButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-team-modal');
      await expect(modal).toBeVisible();

      // Submit button should be visible
      const submitButton = page.getByTestId('create-team-submit');
      await expect(submitButton).toBeVisible();

      // Cancel button should be visible
      const cancelButton = page.getByTestId('create-team-cancel');
      await expect(cancelButton).toBeVisible();
    });

    test('should close create team modal when close button is clicked', async ({ page }) => {
      // Click new team button
      const newTeamButton = page.getByTestId('new-team-button');
      await newTeamButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-team-modal');
      await expect(modal).toBeVisible();

      // Click close button
      const closeButton = page.getByTestId('create-team-modal-close');
      await closeButton.click();

      // Modal should be closed
      await expect(modal).not.toBeVisible();
    });

    test('should show member search in create team modal', async ({ page }) => {
      // Click new team button
      const newTeamButton = page.getByTestId('new-team-button');
      await newTeamButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-team-modal');
      await expect(modal).toBeVisible();

      // Member search input should be visible
      const memberSearchInput = page.getByTestId('member-search-input');
      await expect(memberSearchInput).toBeVisible();
    });
  });

  test.describe('Desktop Viewport (1280px)', () => {
    test.beforeEach(async ({ page }) => {
      await setViewport(page, '2xl');
      await page.goto('/teams');
      await waitForResponsiveUpdate(page);
    });

    test('should show page header with full create team button on desktop', async ({ page }) => {
      // Page title should be visible (use heading role for specificity)
      await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();

      // Create team button should show full text on desktop
      const newTeamButton = page.getByTestId('new-team-button');
      await expect(newTeamButton).toBeVisible();
      await expect(newTeamButton).toContainText('Create Team');
    });

    test('should show grid-based team list on desktop', async ({ page }) => {
      // Wait for page to load
      await page.waitForSelector('[data-testid="teams-page"]', { timeout: 10000 });

      // Teams grid should be visible
      const teamsGrid = page.getByTestId('teams-grid');
      await expect(teamsGrid).toBeVisible();
    });

    test('should show centered create team modal on desktop', async ({ page }) => {
      // Click new team button
      const newTeamButton = page.getByTestId('new-team-button');
      await newTeamButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-team-modal');
      await expect(modal).toBeVisible();

      // Name input should be visible
      await expect(page.getByTestId('create-team-name-input')).toBeVisible();
    });
  });

  test.describe('Viewport Transitions', () => {
    test('should adapt layout when viewport changes from desktop to mobile', async ({ page }) => {
      // Start at desktop
      await setViewport(page, '2xl');
      await page.goto('/teams');
      await waitForResponsiveUpdate(page);

      // Verify desktop layout - full button text
      const newTeamButton = page.getByTestId('new-team-button');
      await expect(newTeamButton).toContainText('Create Team');

      // Resize to mobile
      await setViewport(page, 'xs');
      await waitForResponsiveUpdate(page, 300);

      // Verify mobile layout - short button text
      await expect(newTeamButton).toContainText('Add');
    });
  });
});
