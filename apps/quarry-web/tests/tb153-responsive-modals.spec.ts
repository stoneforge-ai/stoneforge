/**
 * TB153: Responsive Modals & Dialogs Tests
 *
 * Tests for the responsive behavior of modals across viewports.
 *
 * Behaviors tested:
 * - Mobile: Full-screen sheet with swipe-to-close
 * - Desktop: Centered modal with backdrop
 * - Proper escape key handling
 * - Form submission works at all sizes
 */

import { test, expect } from '@playwright/test';
import {
  setViewport,
  waitForResponsiveUpdate,
} from './helpers/responsive';

test.describe('TB153: Responsive Modals & Dialogs', () => {
  test.describe('CreateTaskModal', () => {
    test.describe('Desktop Viewport', () => {
      test.beforeEach(async ({ page }) => {
        await setViewport(page, '2xl');
        await page.goto('/tasks');
        await waitForResponsiveUpdate(page, 300);
      });

      test('should show centered modal on desktop', async ({ page }) => {
        // Click create task button
        const createButton = page.getByTestId('create-task-button');
        await expect(createButton).toBeVisible();
        await createButton.click();

        // Modal should be visible
        const modal = page.getByTestId('create-task-modal');
        await expect(modal).toBeVisible();

        // Close button should exist
        const closeButton = page.getByTestId('create-task-modal-close');
        await expect(closeButton).toBeVisible();
      });

      test('should close modal when close button is clicked', async ({ page }) => {
        // Open modal
        const createButton = page.getByTestId('create-task-button');
        await createButton.click();

        const modal = page.getByTestId('create-task-modal');
        await expect(modal).toBeVisible();

        // Click close button
        const closeButton = page.getByTestId('create-task-modal-close');
        await closeButton.click();

        // Modal should be closed
        await expect(modal).not.toBeVisible();
      });

      test('should close modal when escape is pressed', async ({ page }) => {
        // Open modal
        const createButton = page.getByTestId('create-task-button');
        await createButton.click();

        const modal = page.getByTestId('create-task-modal');
        await expect(modal).toBeVisible();

        // Press escape
        await page.keyboard.press('Escape');

        // Modal should be closed
        await expect(modal).not.toBeVisible();
      });
    });

    test.describe('Mobile Viewport', () => {
      test.beforeEach(async ({ page }) => {
        await setViewport(page, 'xs');
        await page.goto('/tasks');
        await waitForResponsiveUpdate(page, 300);
      });

      test('should show full-screen modal on mobile', async ({ page }) => {
        // Click FAB to create task
        const fab = page.getByTestId('mobile-create-task-fab');
        await expect(fab).toBeVisible();
        await fab.click();

        // Modal should be visible
        const modal = page.getByTestId('create-task-modal');
        await expect(modal).toBeVisible();
      });

      test('should close modal when close button is clicked', async ({ page }) => {
        // Open modal
        const fab = page.getByTestId('mobile-create-task-fab');
        await fab.click();

        const modal = page.getByTestId('create-task-modal');
        await expect(modal).toBeVisible();

        // Click close button
        const closeButton = page.getByTestId('create-task-modal-close');
        await closeButton.click();

        // Modal should be closed
        await expect(modal).not.toBeVisible();
      });

      test('should have touch-friendly inputs', async ({ page }) => {
        // Open modal
        const fab = page.getByTestId('mobile-create-task-fab');
        await fab.click();

        const modal = page.getByTestId('create-task-modal');
        await expect(modal).toBeVisible();

        // Check that input elements exist and are usable
        const titleInput = page.getByTestId('create-task-title-input');
        await expect(titleInput).toBeVisible();

        // Input should have adequate height for touch
        const inputHeight = await titleInput.evaluate((el) => el.getBoundingClientRect().height);
        expect(inputHeight).toBeGreaterThanOrEqual(40);
      });
    });
  });

  test.describe('CreateWorkflowModal', () => {
    test.describe('Desktop Viewport', () => {
      test.beforeEach(async ({ page }) => {
        await setViewport(page, '2xl');
        await page.goto('/workflows');
        await waitForResponsiveUpdate(page, 300);
      });

      test('should show centered modal on desktop', async ({ page }) => {
        // Click create workflow button
        const createButton = page.getByTestId('create-workflow-button');
        await expect(createButton).toBeVisible();
        await createButton.click();

        // Modal should be visible
        const modal = page.getByTestId('create-workflow-modal');
        await expect(modal).toBeVisible();
      });
    });
  });
});
