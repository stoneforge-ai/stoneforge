import { test, expect } from '@playwright/test';

test.describe('TB9: Timeline Lens', () => {
  // Note: TB42 tests are at the bottom of this file
  test('events endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/events');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('events endpoint respects limit parameter', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=5');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('events endpoint supports eventType filter', async ({ page }) => {
    const response = await page.request.get('/api/events?eventType=created');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    // All returned events should be of type 'created'
    for (const event of data) {
      expect(event.eventType).toBe('created');
    }
  });

  test('events endpoint supports multiple eventType filter', async ({ page }) => {
    const response = await page.request.get('/api/events?eventType=created,updated');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    // All returned events should be either 'created' or 'updated'
    for (const event of data) {
      expect(['created', 'updated']).toContain(event.eventType);
    }
  });

  test('timeline page is accessible via navigation', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
  });

  test('timeline page displays search input', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('timeline page displays event type filters', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('event-type-filters')).toBeVisible();
  });

  test('timeline page shows event count', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('event-count')).toBeVisible();
  });

  test('timeline page shows events list', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list')).toBeVisible();
  });

  test('sidebar has Timeline nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Timeline link in sidebar
    const timelineLink = page.getByRole('link', { name: /Timeline/i });
    await expect(timelineLink).toBeVisible();
  });

  test('can navigate to Timeline from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Timeline link
    await page.getByRole('link', { name: /Timeline/i }).click();

    // Should be on timeline page
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard\/timeline/);
  });

  test('event cards display when events exist', async ({ page }) => {
    // First check if there are any events
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to finish - check the events list specifically
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    if (events.length > 0) {
      // At least one event card should be visible
      await expect(page.getByTestId('event-card').first()).toBeVisible({ timeout: 10000 });
    } else {
      // Empty state should be shown
      await expect(page.getByText('No events recorded yet')).toBeVisible();
    }
  });

  test('search filters events by element ID', async ({ page }) => {
    // First check if there are any events to search
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Wait for events to load - use specific locator to avoid matching both count and list loading states
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Get the element ID from the first event
    const firstEventElementId = events[0].elementId;

    // Type the element ID in the search box
    await page.getByTestId('search-input').fill(firstEventElementId);

    // Wait a moment for filtering
    await page.waitForTimeout(300);

    // The event count should be filtered
    const eventCount = page.getByTestId('event-count');
    await expect(eventCount).toContainText('(filtered)');
  });

  test('event type filter toggles work', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Find the Created filter button (now a chip with icon)
    const createdFilter = page.getByTestId('filter-chip-created');
    await expect(createdFilter).toBeVisible();

    // Click to toggle the filter on
    await createdFilter.click();

    // The button should now have an active style (we check for ring-2 class as indicator)
    await expect(createdFilter).toHaveClass(/ring-2/);

    // Click to toggle the filter off
    await createdFilter.click();

    // The button should no longer have the ring
    await expect(createdFilter).not.toHaveClass(/ring-2/);
  });

  test('clear filters button appears when filters are active', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Initially, clear filters button should not be visible
    await expect(page.getByRole('button', { name: /Clear filters/i })).not.toBeVisible();

    // Type something in search
    await page.getByTestId('search-input').fill('test');

    // Now clear filters should appear
    await expect(page.getByRole('button', { name: /Clear filters/i })).toBeVisible();

    // Click clear filters
    await page.getByRole('button', { name: /Clear filters/i }).click();

    // Search should be cleared
    await expect(page.getByTestId('search-input')).toHaveValue('');
  });
});

test.describe('TB42: Timeline Visual Overhaul', () => {
  test('event cards display visual icons', async ({ page }) => {
    // Check if there are any events first
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Check that event cards have visual icons
    const firstEventCard = page.getByTestId('event-card').first();
    await expect(firstEventCard).toBeVisible();

    // Verify event icon container exists
    await expect(firstEventCard.getByTestId('event-icon')).toBeVisible();
  });

  test('event cards display actor avatar', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Check that event cards have actor avatars
    const firstEventCard = page.getByTestId('event-card').first();
    await expect(firstEventCard.getByTestId('actor-avatar')).toBeVisible();
  });

  test('event cards display element type badge', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Check that event cards have element type badges
    const firstEventCard = page.getByTestId('event-card').first();
    await expect(firstEventCard.getByTestId('element-type-badge')).toBeVisible();
  });

  test('event cards display event type badge', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Check that event cards have event type badges
    const firstEventCard = page.getByTestId('event-card').first();
    await expect(firstEventCard.getByTestId('event-type-badge')).toBeVisible();
  });

  test('event cards display relative timestamp', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Check that event cards have timestamp
    const firstEventCard = page.getByTestId('event-card').first();
    await expect(firstEventCard.getByTestId('event-time')).toBeVisible();
  });

  test('events are grouped by time period', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=100');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // At least one time period group should be visible
    const timePeriodHeaders = page.locator('[data-testid^="time-period-header-"]');
    const count = await timePeriodHeaders.count();
    expect(count).toBeGreaterThan(0);
  });

  test('time period headers show event count', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=100');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Time period headers should contain a count in parentheses
    const timePeriodHeader = page.locator('[data-testid^="time-period-header-"]').first();
    if (await timePeriodHeader.isVisible()) {
      const headerText = await timePeriodHeader.textContent();
      expect(headerText).toMatch(/\(\d+\)/);
    }
  });

  test('jump to date button is visible', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Jump to date button should be visible
    await expect(page.getByTestId('jump-to-date-button')).toBeVisible();
  });

  test('jump to date picker can be activated', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Click the jump to date button
    const jumpButton = page.getByTestId('jump-to-date-button');
    await expect(jumpButton).toBeVisible();

    // The date input should exist (even if hidden)
    const dateInput = page.getByTestId('jump-to-date-input');
    await expect(dateInput).toBeAttached();
  });

  test('actor filter dropdown is visible', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Actor filter dropdown button should be visible
    await expect(page.getByTestId('actor-filter')).toBeVisible();
  });

  test('actor filter dropdown opens on click', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Click actor filter
    await page.getByTestId('actor-filter').click();

    // Dropdown should appear
    await expect(page.getByTestId('actor-filter-dropdown')).toBeVisible();
  });

  test('element type filter dropdown is visible', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Element type filter dropdown button should be visible
    await expect(page.getByTestId('element-type-filter')).toBeVisible();
  });

  test('element type filter dropdown opens on click', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Click element type filter
    await page.getByTestId('element-type-filter').click();

    // Dropdown should appear
    await expect(page.getByTestId('element-type-filter-dropdown')).toBeVisible();
  });

  test('event type filter chips have icons', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Created filter chip should be visible with an icon (SVG element)
    const createdChip = page.getByTestId('filter-chip-created');
    await expect(createdChip).toBeVisible();

    // The chip should contain an SVG icon
    const icon = createdChip.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('filter chips show X when active', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Click on Created filter to activate it
    const createdChip = page.getByTestId('filter-chip-created');
    await createdChip.click();

    // The chip should now show an X icon (has ring-2 and contains X icon)
    await expect(createdChip).toHaveClass(/ring-2/);

    // Should have two SVG icons: the event type icon and the X icon
    const icons = createdChip.locator('svg');
    expect(await icons.count()).toBe(2);
  });

  test('clear filters button shows with data-testid', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Initially, clear filters button should not be visible
    await expect(page.getByTestId('clear-filters-button')).not.toBeVisible();

    // Type something in search
    await page.getByTestId('search-input').fill('test');

    // Now clear filters button should appear with correct test ID
    await expect(page.getByTestId('clear-filters-button')).toBeVisible();
  });

  test('search input has icon', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Search container should have an SVG icon (search icon)
    const searchContainer = page.getByTestId('search-input').locator('..');
    const searchIcon = searchContainer.locator('svg');
    await expect(searchIcon).toBeVisible();
  });

  test('actor filter shows selection count when items selected', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Open actor filter dropdown
    await page.getByTestId('actor-filter').click();
    await expect(page.getByTestId('actor-filter-dropdown')).toBeVisible();

    // Click on the first actor option
    const firstOption = page.getByTestId('actor-filter-dropdown').locator('button').first();
    await firstOption.click();

    // The filter button should now show a selection count badge
    const actorFilter = page.getByTestId('actor-filter');
    const countBadge = actorFilter.locator('span.bg-blue-600');
    await expect(countBadge).toBeVisible();
    expect(await countBadge.textContent()).toBe('1');
  });
});

test.describe('TB116: Horizontal Timeline View', () => {
  test('view mode toggle is visible', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // View mode toggle should be visible
    await expect(page.getByTestId('view-mode-toggle')).toBeVisible();
  });

  test('view mode toggle has List and Horizontal options', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Both view mode buttons should be visible
    await expect(page.getByTestId('view-mode-list')).toBeVisible();
    await expect(page.getByTestId('view-mode-horizontal')).toBeVisible();
  });

  test('List view is default', async ({ page }) => {
    // Clear localStorage to test default
    await page.goto('/dashboard/timeline');
    await page.evaluate(() => localStorage.removeItem('timeline-view-mode'));
    await page.reload();

    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // List button should be active (has shadow)
    const listButton = page.getByTestId('view-mode-list');
    await expect(listButton).toHaveClass(/shadow-sm/);

    // Events list should be visible
    await expect(page.getByTestId('events-list')).toBeVisible();
  });

  test('can switch to Horizontal view', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Click Horizontal view button
    await page.getByTestId('view-mode-horizontal').click();

    // Horizontal button should be active
    const horizontalButton = page.getByTestId('view-mode-horizontal');
    await expect(horizontalButton).toHaveClass(/shadow-sm/);

    // Horizontal timeline should be visible
    await expect(page.getByTestId('horizontal-timeline-container')).toBeVisible();
  });

  test('can switch back to List view from Horizontal', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline-container')).toBeVisible();

    // Switch back to List
    await page.getByTestId('view-mode-list').click();

    // Events list should be visible again
    await expect(page.getByTestId('events-list')).toBeVisible();
  });

  test('view mode is persisted in localStorage', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal
    await page.getByTestId('view-mode-horizontal').click();

    // Check localStorage
    const savedMode = await page.evaluate(() => localStorage.getItem('timeline-view-mode'));
    expect(savedMode).toBe('horizontal');

    // Refresh and verify it persisted
    await page.reload();
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Should still be in Horizontal view
    await expect(page.getByTestId('horizontal-timeline-container')).toBeVisible();
  });

  test('horizontal timeline shows time range selector', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Time range selector should be visible
    await expect(page.getByTestId('time-range-selector')).toBeVisible();
    await expect(page.getByTestId('time-range-select')).toBeVisible();
  });

  test('can change time range', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Change time range to 24h
    await page.getByTestId('time-range-select').selectOption('24h');

    // Verify the option is selected
    await expect(page.getByTestId('time-range-select')).toHaveValue('24h');
  });

  test('horizontal timeline shows zoom controls', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Zoom controls should be visible
    await expect(page.getByTestId('zoom-controls')).toBeVisible();
    await expect(page.getByTestId('zoom-in-button')).toBeVisible();
    await expect(page.getByTestId('zoom-out-button')).toBeVisible();
    await expect(page.getByTestId('fit-to-view-button')).toBeVisible();
  });

  test('zoom in button works', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Get initial zoom level
    const initialZoom = await page.getByTestId('zoom-level').textContent();
    expect(initialZoom).toBe('100%');

    // Click zoom in
    await page.getByTestId('zoom-in-button').click();

    // Zoom level should increase
    const newZoom = await page.getByTestId('zoom-level').textContent();
    expect(newZoom).toBe('150%');
  });

  test('zoom out button is disabled at 100%', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Zoom out should be disabled at 100%
    await expect(page.getByTestId('zoom-out-button')).toBeDisabled();
  });

  test('zoom out button is enabled after zooming in', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Zoom in
    await page.getByTestId('zoom-in-button').click();

    // Zoom out should now be enabled
    await expect(page.getByTestId('zoom-out-button')).toBeEnabled();
  });

  test('fit to view resets zoom', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Zoom in twice
    await page.getByTestId('zoom-in-button').click();
    await page.getByTestId('zoom-in-button').click();

    // Click fit to view
    await page.getByTestId('fit-to-view-button').click();

    // Zoom should be back to 100%
    const zoom = await page.getByTestId('zoom-level').textContent();
    expect(zoom).toBe('100%');
  });

  test('timeline canvas is visible', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Canvas should be visible
    await expect(page.getByTestId('timeline-canvas')).toBeVisible();
  });

  test('event dots are displayed when events exist', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    if (events.length > 0) {
      // At least one event dot should be visible
      const eventDots = page.locator('[data-testid^="event-dot-"]');
      await expect(eventDots.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('clicking event dot shows event card', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Wait for dots to appear
    const eventDots = page.locator('[data-testid^="event-dot-"]');
    await expect(eventDots.first()).toBeVisible({ timeout: 5000 });

    // Click the first event dot
    await eventDots.first().click();

    // Selected event card should appear
    await expect(page.getByTestId('selected-event-card')).toBeVisible();
  });

  test('can close selected event card', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Wait for dots and click one
    const eventDots = page.locator('[data-testid^="event-dot-"]');
    await expect(eventDots.first()).toBeVisible({ timeout: 5000 });
    await eventDots.first().click();

    // Close the selected event card
    await page.getByTestId('close-selected-event').click();

    // Selected event card should be hidden
    await expect(page.getByTestId('selected-event-card')).not.toBeVisible();
  });

  test('timeline legend is visible', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Legend should be visible
    await expect(page.getByTestId('timeline-legend')).toBeVisible();
  });

  test('filters still work in horizontal view', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Apply a filter (Created events)
    await page.getByTestId('filter-chip-created').click();

    // The filter should be active (has ring-2)
    await expect(page.getByTestId('filter-chip-created')).toHaveClass(/ring-2/);
  });
});

test.describe('TB117: Timeline Brush Selection', () => {
  test('mode toggle is visible in horizontal view', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Mode toggle should be visible with Pan and Select options
    await expect(page.getByTestId('mode-toggle')).toBeVisible();
    await expect(page.getByTestId('pan-mode-button')).toBeVisible();
    await expect(page.getByTestId('brush-mode-button')).toBeVisible();
  });

  test('pan mode is default', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Pan button should be active (has shadow-sm)
    const panButton = page.getByTestId('pan-mode-button');
    await expect(panButton).toHaveClass(/shadow-sm/);
  });

  test('can switch to brush/select mode', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Click brush/select mode button
    await page.getByTestId('brush-mode-button').click();

    // Brush button should be active
    const brushButton = page.getByTestId('brush-mode-button');
    await expect(brushButton).toHaveClass(/shadow-sm/);
  });

  test('brush selection creates time range selection via drag', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Enable brush mode
    await page.getByTestId('brush-mode-button').click();

    // Get the canvas bounding box
    const canvas = page.getByTestId('timeline-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip();
      return;
    }

    // Drag across the canvas to create a selection
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2);
    await page.mouse.up();

    // Brush selection info should appear
    await expect(page.getByTestId('brush-selection-info')).toBeVisible({ timeout: 5000 });
  });

  test('brush selection shows clear button', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Enable brush mode
    await page.getByTestId('brush-mode-button').click();

    // Get the canvas bounding box
    const canvas = page.getByTestId('timeline-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip();
      return;
    }

    // Drag across the canvas to create a selection
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2);
    await page.mouse.up();

    // Clear selection button should appear
    await expect(page.getByTestId('clear-selection-button')).toBeVisible({ timeout: 5000 });
  });

  test('clear button removes selection', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Enable brush mode
    await page.getByTestId('brush-mode-button').click();

    // Get the canvas bounding box
    const canvas = page.getByTestId('timeline-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip();
      return;
    }

    // Drag across the canvas to create a selection
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2);
    await page.mouse.up();

    // Wait for selection to appear
    await expect(page.getByTestId('clear-selection-button')).toBeVisible({ timeout: 5000 });

    // Click clear button
    await page.getByTestId('clear-selection-button').click();

    // Selection should be cleared
    await expect(page.getByTestId('brush-selection-info')).not.toBeVisible();
    await expect(page.getByTestId('clear-selection-button')).not.toBeVisible();
  });

  test('brush selection shows selected events list', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Enable brush mode
    await page.getByTestId('brush-mode-button').click();

    // Get the canvas bounding box
    const canvas = page.getByTestId('timeline-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip();
      return;
    }

    // Drag across the entire canvas to select all events
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await page.mouse.up();

    // Selected events list should appear
    await expect(page.getByTestId('selected-events-list')).toBeVisible({ timeout: 5000 });
  });

  test('brush selection syncs with URL params', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Enable brush mode
    await page.getByTestId('brush-mode-button').click();

    // Get the canvas bounding box
    const canvas = page.getByTestId('timeline-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip();
      return;
    }

    // Drag across the canvas to create a selection
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2);
    await page.mouse.up();

    // Wait for selection to appear
    await expect(page.getByTestId('brush-selection-info')).toBeVisible({ timeout: 5000 });

    // URL should contain startTime and endTime params
    const url = page.url();
    expect(url).toContain('startTime=');
    expect(url).toContain('endTime=');
  });

  test('brush selection is restored from URL on page load', async ({ page }) => {
    // Navigate with startTime and endTime in URL
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    await page.goto(`/dashboard/timeline?startTime=${oneHourAgo}&endTime=${now}`);
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Brush selection info should be visible (restored from URL)
    await expect(page.getByTestId('brush-selection-info')).toBeVisible();
  });

  test('committed selection shows dashed border overlay', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Enable brush mode
    await page.getByTestId('brush-mode-button').click();

    // Get the canvas bounding box
    const canvas = page.getByTestId('timeline-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip();
      return;
    }

    // Drag across the canvas to create a selection
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2);
    await page.mouse.up();

    // Wait for selection info to appear
    await expect(page.getByTestId('brush-selection-info')).toBeVisible({ timeout: 5000 });

    // Committed selection overlay should be visible
    await expect(page.getByTestId('brush-selection-committed')).toBeVisible();
  });

  test('can switch back to pan mode after selection', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Switch to Horizontal view
    await page.getByTestId('view-mode-horizontal').click();
    await expect(page.getByTestId('horizontal-timeline')).toBeVisible();

    // Enable brush mode
    await page.getByTestId('brush-mode-button').click();

    // Get the canvas bounding box
    const canvas = page.getByTestId('timeline-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip();
      return;
    }

    // Drag across the canvas to create a selection
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2);
    await page.mouse.up();

    // Wait for selection to appear
    await expect(page.getByTestId('brush-selection-info')).toBeVisible({ timeout: 5000 });

    // Switch back to pan mode
    await page.getByTestId('pan-mode-button').click();

    // Pan button should be active
    await expect(page.getByTestId('pan-mode-button')).toHaveClass(/shadow-sm/);

    // Selection should still be visible
    await expect(page.getByTestId('brush-selection-info')).toBeVisible();
  });
});
