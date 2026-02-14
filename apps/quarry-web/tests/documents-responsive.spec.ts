/**
 * TB150: Responsive Documents Page Tests
 *
 * Tests the responsive behavior of the Documents page on mobile and desktop viewports.
 * Implements the Notion-style two-screen navigation pattern for mobile devices.
 */
import { test, expect } from '@playwright/test';

// Mobile viewport dimensions
const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Desktop viewport dimensions
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe('TB150: Responsive Documents Page', () => {
  test.describe('Mobile Viewport', () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test('shows simplified document list on mobile (no sidebar)', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // On mobile, we show a simplified view without the library tree sidebar
      // All Documents view should be visible and take full width
      const allDocsView = page.getByTestId('all-documents-view');
      await expect(allDocsView).toBeVisible();

      // FAB for creating documents should be visible
      const createFab = page.getByTestId('mobile-create-document-fab');
      await expect(createFab).toBeVisible();

      // Library tree sidebar should NOT be visible on mobile
      const libraryTreeSidebar = page.getByTestId('library-tree-sidebar');
      await expect(libraryTreeSidebar).not.toBeVisible();
    });

    test('document items are visible and clickable on mobile', async ({ page }) => {
      // Go to documents page
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Wait for document list to load
      const documentList = page.getByTestId('virtualized-all-documents-list');
      await expect(documentList).toBeVisible({ timeout: 10000 });

      // Document items should be visible
      const firstDoc = page.locator('[data-testid^="document-item-"]').first();
      await expect(firstDoc).toBeVisible();

      // Document items should have cursor pointer (clickable)
      const cursor = await firstDoc.evaluate((el) => window.getComputedStyle(el).cursor);
      expect(cursor).toBe('pointer');
    });

    test('search input is touch-friendly on mobile', async ({ page }) => {
      // Go to documents page
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // Search input should be visible
      const searchInput = page.getByTestId('documents-search-input');
      await expect(searchInput).toBeVisible();

      // Search input should have appropriate padding for touch (py-3 = 12px top/bottom padding)
      const paddingTop = await searchInput.evaluate((el) =>
        window.getComputedStyle(el).paddingTop
      );
      // py-3 on mobile means 12px padding
      expect(parseInt(paddingTop)).toBeGreaterThanOrEqual(8);
    });

    test('create document modal is full-screen on mobile', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Click the FAB to create a document
      const createFab = page.getByTestId('mobile-create-document-fab');
      await createFab.click();

      // Modal should be visible
      const modal = page.getByTestId('create-document-modal');
      await expect(modal).toBeVisible();

      // Modal should be approximately full-screen (checking height)
      const modalDialog = modal.locator('> div > div').first();
      const box = await modalDialog.boundingBox();

      if (box) {
        // On mobile, modal should take most of the screen height
        expect(box.height).toBeGreaterThan(MOBILE_VIEWPORT.height * 0.7);
      }

      // Close button should be touch-friendly
      const closeButton = page.getByTestId('create-document-modal-close');
      await expect(closeButton).toBeVisible();

      // Close the modal
      await closeButton.click();
      await expect(modal).not.toBeVisible();
    });

    test('FAB create button has proper touch target size on mobile', async ({ page }) => {
      // Go to documents page
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // FAB should be visible
      const fab = page.getByTestId('mobile-create-document-fab');
      await expect(fab).toBeVisible();

      // FAB should have proper touch target size (44px minimum)
      const box = await fab.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('Desktop Viewport', () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test('shows side-by-side layout on desktop', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Library tree sidebar should be visible
      const libraryTree = page.getByTestId('library-tree-sidebar');
      await expect(libraryTree).toBeVisible();

      // Library tree should have fixed width (w-64 = 256px)
      const treeElement = page.getByTestId('library-tree');
      const box = await treeElement.boundingBox();
      if (box) {
        expect(box.width).toBe(256);
      }
    });

    test('document detail panel shows alongside document list on desktop', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Wait for documents to load
      await page.waitForTimeout(500);

      // Click a document
      const firstDoc = page.locator('[data-testid^="document-item-"]').first();
      const docExists = await firstDoc.isVisible().catch(() => false);

      if (docExists) {
        await firstDoc.click();

        // Document detail panel should be visible
        const detailPanel = page.getByTestId('document-detail-panel');
        await expect(detailPanel).toBeVisible();

        // Document list should still be visible
        const allDocsView = page.getByTestId('all-documents-view');
        await expect(allDocsView).toBeVisible();
      }
    });

    test('fullscreen button is available on desktop', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Wait for documents to load
      await page.waitForTimeout(500);

      // Click a document
      const firstDoc = page.locator('[data-testid^="document-item-"]').first();
      const docExists = await firstDoc.isVisible().catch(() => false);

      if (docExists) {
        await firstDoc.click();

        // Wait for detail panel
        await page.waitForTimeout(300);

        // Fullscreen button should be visible on desktop
        const fullscreenButton = page.getByTestId('document-fullscreen-button');
        await expect(fullscreenButton).toBeVisible();
      }
    });

    test('expand/collapse button works on desktop', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Wait for documents to load
      await page.waitForTimeout(500);

      // Click a document
      const firstDoc = page.locator('[data-testid^="document-item-"]').first();
      const docExists = await firstDoc.isVisible().catch(() => false);

      if (docExists) {
        await firstDoc.click();

        // Wait for detail panel
        await page.waitForTimeout(300);

        // Expand button should be visible
        const expandButton = page.getByTestId('document-expand-button');
        await expect(expandButton).toBeVisible();

        // Click expand
        await expandButton.click();

        // Document list should be hidden when expanded
        const allDocsView = page.getByTestId('all-documents-view');
        await expect(allDocsView).not.toBeVisible();

        // Click again to collapse
        await expandButton.click();

        // Document list should be visible again
        await expect(allDocsView).toBeVisible();
      }
    });

    test('version history and clone buttons are visible on desktop', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Wait for documents to load
      await page.waitForTimeout(500);

      // Click a document
      const firstDoc = page.locator('[data-testid^="document-item-"]').first();
      const docExists = await firstDoc.isVisible().catch(() => false);

      if (docExists) {
        await firstDoc.click();

        // Wait for detail panel
        await page.waitForTimeout(300);

        // Clone button should be visible on desktop
        const cloneButton = page.getByTestId('document-clone-button');
        await expect(cloneButton).toBeVisible();

        // History button should be visible on desktop
        const historyButton = page.getByTestId('document-history-button');
        await expect(historyButton).toBeVisible();
      }
    });

    test('create document modal is centered on desktop', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Click new document button in sidebar
      const newDocButton = page.getByTestId('new-document-button-sidebar');
      await newDocButton.click();

      // Modal should be visible
      const modal = page.getByTestId('create-document-modal');
      await expect(modal).toBeVisible();

      // Modal should have max-width on desktop
      const modalDialog = modal.locator('.max-w-lg');
      await expect(modalDialog).toBeVisible();

      // Close the modal
      const closeButton = page.getByTestId('create-document-modal-close');
      await closeButton.click();
      await expect(modal).not.toBeVisible();
    });
  });

  test.describe('Responsive Breakpoint Transitions', () => {
    test('layout transitions correctly when resizing viewport', async ({ page }) => {
      // Start with desktop
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto('/documents');
      await page.waitForLoadState('networkidle');

      // Desktop should have fixed-width sidebar
      const libraryTree = page.getByTestId('library-tree');
      let box = await libraryTree.boundingBox();
      if (box) {
        expect(box.width).toBe(256);
      }

      // Resize to mobile
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.waitForTimeout(300);

      // Mobile should have full-width layout and FAB
      const createFab = page.getByTestId('mobile-create-document-fab');
      await expect(createFab).toBeVisible();
    });
  });
});
