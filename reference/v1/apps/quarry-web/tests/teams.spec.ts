import { test, expect } from '@playwright/test';

// Helper to extract teams array from paginated response
async function getTeams(page: import('@playwright/test').Page): Promise<{ id: string; name: string; members: string[]; status?: string; tags?: string[] }[]> {
  const response = await page.request.get('/api/teams');
  const data = await response.json();
  // API returns paginated response with items array
  return data.items || data;
}

// Helper to extract entities array from paginated response
async function getEntities(page: import('@playwright/test').Page): Promise<{ id: string; name: string; entityType: string }[]> {
  const response = await page.request.get('/api/entities');
  const data = await response.json();
  return data.items || data;
}

test.describe('TB37: Teams Page - List View', () => {
  test('teams endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/teams');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    // API returns paginated response with items array
    expect(data.items !== undefined || Array.isArray(data)).toBe(true);
  });

  test('teams page is accessible via navigation', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar has Teams nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Teams link in sidebar
    const teamsLink = page.getByRole('link', { name: /Teams/i });
    await expect(teamsLink).toBeVisible();
  });

  test('can navigate to Teams from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Teams link
    await page.getByRole('link', { name: /Teams/i }).click();

    // Should be on teams page
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/teams/);
  });

  test('teams page shows search box', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    // Check for search box
    await expect(page.getByTestId('team-search')).toBeVisible();
    await expect(page.getByTestId('team-search-input')).toBeVisible();
  });

  test('teams page shows appropriate content based on teams', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    if (teams.length === 0) {
      // Should show empty state
      await expect(page.getByTestId('teams-empty')).toBeVisible();
      await expect(page.getByText('No teams created')).toBeVisible();
    } else {
      // Should show teams grid
      await expect(page.getByTestId('teams-grid')).toBeVisible();
      // Should show count in header (may be paginated)
      await expect(page.getByTestId('pagination-info')).toBeVisible();
    }
  });

  test('search filters teams by name', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Get first team name
    const firstTeam = teams[0];
    const searchTerm = firstTeam.name.substring(0, 3);

    // Type in search box
    await page.getByTestId('team-search-input').fill(searchTerm);

    // Wait for filtering to apply
    await page.waitForTimeout(100);

    // Should show filtered results
    const matchingTeams = teams.filter((t: { name: string; id: string; tags?: string[] }) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.tags || []).some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (matchingTeams.length > 0) {
      await expect(page.getByTestId('teams-grid')).toBeVisible();
    }
  });

  test('team cards display correct information', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Check first team card
    const firstTeam = teams[0];
    const card = page.getByTestId(`team-card-${firstTeam.id}`);
    await expect(card).toBeVisible();

    // Check for avatar
    await expect(page.getByTestId(`team-avatar-${firstTeam.id}`)).toBeVisible();

    // Check for member count badge
    await expect(page.getByTestId(`team-member-count-${firstTeam.id}`)).toBeVisible();
  });

  test('team cards show member avatar stack when team has members', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    // Find a team with members
    const teamWithMembers = teams.find((t) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Check the team card
    const card = page.getByTestId(`team-card-${teamWithMembers.id}`);
    await expect(card).toBeVisible();

    // Should show member avatar stack
    await expect(card.getByTestId('member-avatar-stack')).toBeVisible();
  });

  test('search with no results shows empty state', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('team-search-input').fill('xyznonexistent123456');

    // Wait for filtering to apply
    await page.waitForTimeout(100);

    // Should show empty state with clear search option
    await expect(page.getByTestId('teams-empty')).toBeVisible();
    await expect(page.getByText('No teams match your search')).toBeVisible();
    await expect(page.getByTestId('clear-search-button')).toBeVisible();
  });

  test('clear search button works', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('team-search-input').fill('xyznonexistent123456');

    // Wait for filtering
    await page.waitForTimeout(100);

    // Should show empty state
    await expect(page.getByTestId('teams-empty')).toBeVisible();

    // Click clear search
    await page.getByTestId('clear-search-button').click();

    // Should now show all teams (or empty state if no teams exist)
    if (teams.length > 0) {
      await expect(page.getByTestId('teams-grid')).toBeVisible();
      await expect(page.getByTestId('pagination-info')).toBeVisible();
    } else {
      await expect(page.getByText('No teams created')).toBeVisible();
    }
  });

  test('clicking team card opens detail panel', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('team-detail-container')).toBeVisible();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible();
  });

  test('detail panel shows team information', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show team name in detail panel
    const detailPanel = page.getByTestId('team-detail-panel');
    await expect(detailPanel.getByRole('heading', { name: firstTeam.name })).toBeVisible();

    // Should show members section header
    await expect(page.getByText(/Team Members/)).toBeVisible();
  });

  test('close button closes detail panel', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click close button
    await page.getByTestId('team-detail-close').click();

    // Detail panel should be hidden
    await expect(page.getByTestId('team-detail-container')).not.toBeVisible();
  });

  test('split-view layout works correctly', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Initially, team grid should be full width (3 columns on lg)
    const grid = page.getByTestId('teams-grid').locator('> div.grid');
    await expect(grid).toHaveClass(/lg:grid-cols-3/);

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Now grid should be single column (detail panel takes half)
    await expect(grid).toHaveClass(/grid-cols-1/);
    await expect(grid).not.toHaveClass(/lg:grid-cols-3/);
  });

  test('selected team card is highlighted', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    const card = page.getByTestId(`team-card-${firstTeam.id}`);
    await card.click();

    // Card should have selected styling (blue border)
    await expect(card).toHaveClass(/border-blue-500/);
    await expect(card).toHaveClass(/ring-2/);
  });

  test('detail panel shows team members when team has members', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    // Find a team with members
    const teamWithMembers = teams.find((t) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Wait for and click the team card
    const teamCard = page.getByTestId(`team-card-${teamWithMembers.id}`);
    await expect(teamCard).toBeVisible({ timeout: 10000 });
    await teamCard.click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show members section header with count
    const memberCount = teamWithMembers.members.length;
    await expect(page.getByText(`Team Members (${memberCount})`)).toBeVisible();
  });

  test('team members endpoint returns members', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    // Find a team with members
    const teamWithMembers = teams.find((t) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    // Get members from API
    const membersResponse = await page.request.get(`/api/teams/${teamWithMembers.id}/members`);
    expect(membersResponse.ok()).toBe(true);
    const members = await membersResponse.json();
    expect(Array.isArray(members)).toBe(true);
  });

  test('team detail endpoint returns team', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    // Get first team from API
    const teamResponse = await page.request.get(`/api/teams/${teams[0].id}`);
    expect(teamResponse.ok()).toBe(true);
    const team = await teamResponse.json();
    expect(team.id).toBe(teams[0].id);
    expect(team.name).toBe(teams[0].name);
    expect(team.type).toBe('team');
  });
});

test.describe('TB38: Team Detail Panel', () => {
  test('team stats endpoint is accessible', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    // Get stats for first team
    const firstTeam = teams[0];
    const statsResponse = await page.request.get(`/api/teams/${firstTeam.id}/stats`);
    expect(statsResponse.ok()).toBe(true);
    const stats = await statsResponse.json();
    expect(typeof stats.memberCount).toBe('number');
    expect(typeof stats.totalTasksAssigned).toBe('number');
    expect(typeof stats.activeTasksAssigned).toBe('number');
    expect(typeof stats.completedTasksAssigned).toBe('number');
    expect(typeof stats.createdByTeamMembers).toBe('number');
    expect(Array.isArray(stats.workloadDistribution)).toBe(true);
  });

  test('team stats endpoint returns 404 for non-existent team', async ({ page }) => {
    const statsResponse = await page.request.get('/api/teams/nonexistent-team-id/stats');
    expect(statsResponse.ok()).toBe(false);
    expect(statsResponse.status()).toBe(404);
  });

  test('detail panel shows statistics section', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show statistics section
    await expect(page.getByText('Statistics')).toBeVisible();
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });
  });

  test('detail panel shows total tasks stat', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Total Tasks stat
    await expect(page.getByText('Total Tasks')).toBeVisible();
  });

  test('detail panel shows active tasks stat', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Active Tasks stat
    await expect(page.getByText('Active Tasks')).toBeVisible();
  });

  test('detail panel shows completed tasks stat', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Completed stat
    await expect(page.getByText('Completed')).toBeVisible();
  });

  test('detail panel shows created by team stat', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Created by Team stat
    await expect(page.getByText('Created by Team')).toBeVisible();
  });

  test('detail panel shows workload distribution when team has assigned tasks', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    // Find a team with members and check if they have tasks
    const teamWithMembers = teams.find((t) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    // Get stats to check if there are assigned tasks
    const statsResponse = await page.request.get(`/api/teams/${teamWithMembers.id}/stats`);
    const stats = await statsResponse.json();

    if (stats.totalTasksAssigned === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${teamWithMembers.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show workload distribution section
    await expect(page.getByText('Workload Distribution')).toBeVisible();
    await expect(page.getByTestId('team-workload')).toBeVisible();
  });

  test('detail panel shows members list', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    // Find a team with members
    const teamWithMembers = teams.find((t) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${teamWithMembers.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show Team Members section
    await expect(page.getByText(/Team Members/)).toBeVisible();

    // Wait for members list to load
    await expect(page.getByTestId('team-members-list')).toBeVisible({ timeout: 10000 });
  });

  test('members list shows member items with type badges', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    // Find a team with members
    const teamWithMembers = teams.find((t) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    // Get the members
    const membersResponse = await page.request.get(`/api/teams/${teamWithMembers.id}/members`);
    const members = await membersResponse.json();

    if (members.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${teamWithMembers.id}`).click();

    // Wait for detail panel and members list to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-members-list')).toBeVisible({ timeout: 10000 });

    // Check first member item is visible
    const firstMember = members[0];
    await expect(page.getByTestId(`member-item-${firstMember.id}`)).toBeVisible();
  });
});

test.describe('TB39: Create Team', () => {
  test('POST /api/teams endpoint creates a team', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    const uniqueName = `Test Team ${Date.now()}`;

    const response = await page.request.post('/api/teams', {
      data: {
        name: uniqueName,
        members: [entities[0].id], // TB123: Must have at least one member
        tags: ['test-tag'],
      },
    });

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(201);

    const team = await response.json();
    expect(team.name).toBe(uniqueName);
    expect(team.type).toBe('team');
    expect(team.members).toContain(entities[0].id);
    expect(team.tags).toContain('test-tag');
    expect(team.id).toMatch(/^el-/);

    // Clean up
    await page.request.delete(`/api/teams/${team.id}`);
  });

  test('POST /api/teams rejects empty name', async ({ page }) => {
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/teams', {
      data: {
        name: '',
        members: [entities[0].id], // TB123: Must have at least one member
      },
    });

    expect(response.ok()).toBe(false);
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/teams rejects duplicate team names', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    const uniqueName = `Dup Team ${Date.now()}`;

    // Create first team
    const response1 = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    expect(response1.ok()).toBe(true);
    const team1 = await response1.json();

    // Try to create duplicate
    const response2 = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    expect(response2.ok()).toBe(false);
    expect(response2.status()).toBe(400);
    const error = await response2.json();
    expect(error.error.message).toContain('already exists');

    // Clean up
    await page.request.delete(`/api/teams/${team1.id}`);
  });

  test('POST /api/teams accepts members array', async ({ page }) => {
    // Get existing entities
    const entities = await getEntities(page);

    if (entities.length === 0) {
      test.skip();
      return;
    }

    const memberIds = entities.slice(0, 2).map((e: { id: string }) => e.id);
    const uniqueName = `Team With Members ${Date.now()}`;

    const response = await page.request.post('/api/teams', {
      data: {
        name: uniqueName,
        members: memberIds,
      },
    });

    expect(response.ok()).toBe(true);
    const team = await response.json();
    expect(team.members).toEqual(memberIds);
  });

  test('teams page has Create Team button', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('new-team-button')).toBeVisible();
    await expect(page.getByTestId('new-team-button')).toHaveText(/Create Team/);
  });

  test('Create Team button opens modal', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();

    await expect(page.getByTestId('create-team-modal')).toBeVisible();
    await expect(page.getByTestId('create-team-modal').getByRole('heading', { name: 'Create Team' })).toBeVisible();
  });

  test('modal has name input field', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await expect(page.getByTestId('create-team-name-input')).toBeVisible();
    await expect(page.getByLabel(/Team Name/)).toBeVisible();
  });

  test('modal has member search input', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await expect(page.getByTestId('member-search-input')).toBeVisible();
  });

  test('modal has tags input', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await expect(page.getByTestId('create-team-tags-input')).toBeVisible();
  });

  test('modal has cancel and submit buttons', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await expect(page.getByTestId('create-team-cancel')).toBeVisible();
    await expect(page.getByTestId('create-team-submit')).toBeVisible();
  });

  test('close button closes modal', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await page.getByTestId('create-team-modal-close').click();

    await expect(page.getByTestId('create-team-modal')).not.toBeVisible();
  });

  test('cancel button closes modal', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await page.getByTestId('create-team-cancel').click();

    await expect(page.getByTestId('create-team-modal')).not.toBeVisible();
  });

  test('escape key closes modal', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('create-team-modal')).not.toBeVisible();
  });

  test('submit button is disabled when name is empty', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    // Submit button should be disabled
    await expect(page.getByTestId('create-team-submit')).toBeDisabled();
  });

  test('submit button is enabled when name AND member are filled (TB123)', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    // Just filling name should NOT enable button (TB123)
    await page.getByTestId('create-team-name-input').fill('Test Team');
    await expect(page.getByTestId('create-team-submit')).toBeDisabled();

    // Search and add a member
    await page.getByTestId('member-search-input').fill(entities[0].name.substring(0, 3));
    await page.waitForTimeout(300);
    const addButton = page.getByTestId(`add-member-${entities[0].id}`);
    if (await addButton.isVisible()) {
      await addButton.click();
      // Now button should be enabled
      await expect(page.getByTestId('create-team-submit')).toBeEnabled();
    }
  });

  test('can create team via modal', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    const uniqueName = `Modal Team ${Date.now()}`;

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    await page.getByTestId('create-team-name-input').fill(uniqueName);
    await page.getByTestId('create-team-tags-input').fill('modal-test');

    // TB123: Add a member before submitting
    await page.getByTestId('member-search-input').fill(entities[0].name.substring(0, 3));
    await page.waitForTimeout(300);
    const addButton = page.getByTestId(`add-member-${entities[0].id}`);
    if (await addButton.isVisible()) {
      await addButton.click();
    }

    await page.getByTestId('create-team-submit').click();

    // Modal should close
    await expect(page.getByTestId('create-team-modal')).not.toBeVisible({ timeout: 5000 });

    // Team should appear in list (the grid will have the team card)
    await page.waitForTimeout(500);
    await expect(page.getByTestId('teams-grid').getByText(uniqueName)).toBeVisible({ timeout: 5000 });

    // Clean up created team
    const teams = await getTeams(page);
    const createdTeam = teams.find(t => t.name === uniqueName);
    if (createdTeam) {
      await page.request.delete(`/api/teams/${createdTeam.id}`);
    }
  });

  test('empty state has create team link', async ({ page }) => {
    // First, check if there are any teams
    const teams = await getTeams(page);

    // Only run this test if there are no teams
    if (teams.length > 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Should show empty state with create link
    await expect(page.getByTestId('teams-empty')).toBeVisible();
    await expect(page.getByTestId('create-team-empty-button')).toBeVisible();
    await expect(page.getByTestId('create-team-empty-button')).toHaveText('Create one');
  });

  test('entity search shows results when typing', async ({ page }) => {
    // Get existing entities
    const entities = await getEntities(page);

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    // Type in member search
    const firstEntity = entities[0];
    await page.getByTestId('member-search-input').fill(firstEntity.name.substring(0, 3));

    // Should show search results
    await expect(page.getByTestId('entity-search-results')).toBeVisible();
  });

  test('can add member to team during creation', async ({ page }) => {
    // Get existing entities
    const entities = await getEntities(page);

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    // Type in member search
    const firstEntity = entities[0];
    await page.getByTestId('member-search-input').fill(firstEntity.name);

    // Wait for results
    await expect(page.getByTestId('entity-search-results')).toBeVisible();

    // Click to add member
    await page.getByTestId(`add-member-${firstEntity.id}`).click();

    // Should show selected member
    await expect(page.getByTestId('selected-members')).toBeVisible();
    await expect(page.getByTestId(`selected-member-${firstEntity.id}`)).toBeVisible();
  });

  test('can remove selected member', async ({ page }) => {
    // Get existing entities
    const entities = await getEntities(page);

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    // Add a member
    const firstEntity = entities[0];
    await page.getByTestId('member-search-input').fill(firstEntity.name);
    await expect(page.getByTestId('entity-search-results')).toBeVisible();
    await page.getByTestId(`add-member-${firstEntity.id}`).click();

    // Verify member is shown
    await expect(page.getByTestId(`selected-member-${firstEntity.id}`)).toBeVisible();

    // Remove the member
    await page.getByTestId(`remove-member-${firstEntity.id}`).click();

    // Member should no longer be visible
    await expect(page.getByTestId(`selected-member-${firstEntity.id}`)).not.toBeVisible();
  });

  test('creates team with members', async ({ page }) => {
    // Get existing entities
    const entities = await getEntities(page);

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    const uniqueName = `Team With Members UI ${Date.now()}`;
    const firstEntity = entities[0];

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    // Fill name
    await page.getByTestId('create-team-name-input').fill(uniqueName);

    // Add member
    await page.getByTestId('member-search-input').fill(firstEntity.name);
    await expect(page.getByTestId('entity-search-results')).toBeVisible();
    await page.getByTestId(`add-member-${firstEntity.id}`).click();

    // Submit
    await page.getByTestId('create-team-submit').click();

    // Modal should close
    await expect(page.getByTestId('create-team-modal')).not.toBeVisible({ timeout: 5000 });

    // Verify team was created with member
    const teams = await getTeams(page);
    const createdTeam = teams.find((t) => t.name === uniqueName);
    expect(createdTeam).toBeTruthy();
    expect(createdTeam?.members).toContain(firstEntity.id);
  });

  test('shows error for duplicate team name', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a team first
    const uniqueName = `Dup Test Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const existingTeam = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('new-team-button').click();
    await expect(page.getByTestId('create-team-modal')).toBeVisible();

    // Try to create with same name - need to add a member first (TB123)
    await page.getByTestId('create-team-name-input').fill(uniqueName);
    await page.getByTestId('member-search-input').fill(entities[0].name.substring(0, 3));
    await page.waitForTimeout(300);
    const addButton = page.getByTestId(`add-member-${entities[0].id}`);
    if (await addButton.isVisible()) {
      await addButton.click();
    }
    await page.getByTestId('create-team-submit').click();

    // Should show error
    await expect(page.getByTestId('create-team-error')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/already exists/)).toBeVisible();

    // Clean up
    await page.request.delete(`/api/teams/${existingTeam.id}`);
  });
});

test.describe('TB40: Edit Team', () => {
  test('PATCH /api/teams/:id endpoint updates team name', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a team first
    const uniqueName = `Edit Test Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    // Update the name
    const newName = `Updated Team ${Date.now()}`;
    const updateResponse = await page.request.patch(`/api/teams/${team.id}`, {
      data: { name: newName },
    });

    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.name).toBe(newName);

    // Clean up
    await page.request.delete(`/api/teams/${team.id}`);
  });

  test('PATCH /api/teams/:id endpoint adds members', async ({ page }) => {
    // Get an entity
    const entities = await getEntities(page);

    if (entities.length < 2) {
      test.skip();
      return;
    }

    // Create a team - TB123: Must have at least one member
    const uniqueName = `Add Member Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    // Add another member
    const updateResponse = await page.request.patch(`/api/teams/${team.id}`, {
      data: { addMembers: [entities[1].id] },
    });

    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.members).toContain(entities[0].id);
    expect(updated.members).toContain(entities[1].id);

    // Clean up
    await page.request.delete(`/api/teams/${team.id}`);
  });

  test('PATCH /api/teams/:id endpoint removes members (when multiple exist)', async ({ page }) => {
    // Get entities - TB123: Need at least 2 to test removal
    const entities = await getEntities(page);

    if (entities.length < 2) {
      test.skip();
      return;
    }

    // Create a team with two members (TB123: need 2 to test removal)
    const uniqueName = `Remove Member Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id, entities[1].id] },
    });
    const team = await createResponse.json();
    expect(team.members).toContain(entities[0].id);
    expect(team.members).toContain(entities[1].id);

    // Remove one member (leaving one remaining)
    const updateResponse = await page.request.patch(`/api/teams/${team.id}`, {
      data: { removeMembers: [entities[0].id] },
    });

    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.members).not.toContain(entities[0].id);
    expect(updated.members).toContain(entities[1].id);

    // Clean up
    await page.request.delete(`/api/teams/${team.id}`);
  });

  test('DELETE /api/teams/:id endpoint deletes team', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a team
    const uniqueName = `Delete Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    // Delete the team
    const deleteResponse = await page.request.delete(`/api/teams/${team.id}`);
    expect(deleteResponse.ok()).toBe(true);
    const deleteResult = await deleteResponse.json();
    expect(deleteResult.success).toBe(true);
  });

  test('team detail panel has edit name button', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Find an active team and click it
    const activeTeam = teams.find((t) => t.status !== 'tombstone');
    if (!activeTeam) {
      test.skip();
      return;
    }

    // Wait for the team card to be visible (may need to scroll/find)
    const teamCard = page.getByTestId(`team-card-${activeTeam.id}`);
    await expect(teamCard).toBeVisible({ timeout: 10000 });
    await teamCard.click();

    // Detail panel should be visible
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Edit button should be visible
    await expect(page.getByTestId('team-name-edit')).toBeVisible();
  });

  test('clicking edit name button shows input field', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    // Find an active team
    const activeTeam = teams.find((t) => t.status !== 'tombstone');
    if (!activeTeam) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${activeTeam.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('team-name-edit').click();

    // Input field should appear
    await expect(page.getByTestId('team-name-input')).toBeVisible();
    await expect(page.getByTestId('team-name-save')).toBeVisible();
    await expect(page.getByTestId('team-name-cancel')).toBeVisible();
  });

  test('can edit team name via UI', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a team to edit
    const uniqueName = `Edit UI Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${team.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('team-name-edit').click();

    // Fill in new name
    const newName = `Renamed Team ${Date.now()}`;
    await page.getByTestId('team-name-input').fill(newName);
    await page.getByTestId('team-name-save').click();

    // Wait for save to complete
    await expect(page.getByTestId('team-name-input')).not.toBeVisible({ timeout: 5000 });

    // Verify name was updated
    await expect(page.getByTestId('team-detail-panel').getByRole('heading', { name: newName })).toBeVisible();
  });

  test('cancel button cancels name edit', async ({ page }) => {
    // Get teams from API
    const teams = await getTeams(page);

    const activeTeam = teams.find((t) => t.status !== 'tombstone');
    if (!activeTeam) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${activeTeam.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('team-name-edit').click();
    await expect(page.getByTestId('team-name-input')).toBeVisible();

    // Click cancel
    await page.getByTestId('team-name-cancel').click();

    // Input should disappear
    await expect(page.getByTestId('team-name-input')).not.toBeVisible();

    // Original name should still be visible
    await expect(page.getByTestId('team-detail-panel').getByRole('heading', { name: activeTeam.name })).toBeVisible();
  });

  test('team detail panel has delete button', async ({ page }) => {
    const teams = await getTeams(page);

    const activeTeam = teams.find((t) => t.status !== 'tombstone');
    if (!activeTeam) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${activeTeam.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('team-delete-button')).toBeVisible();
  });

  test('delete button shows confirmation modal', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a team to test with
    const uniqueName = `Delete Confirm Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const ourTeam = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Wait for and click the team card (newly created team should be on first page since sorted by updatedAt)
    const teamCard = page.getByTestId(`team-card-${ourTeam.id}`);
    await expect(teamCard).toBeVisible({ timeout: 10000 });
    await teamCard.click();

    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click delete button
    await page.getByTestId('team-delete-button').click();

    // Confirmation modal should appear
    await expect(page.getByTestId('delete-team-confirm-modal')).toBeVisible();
    await expect(page.getByTestId('delete-team-confirm')).toBeVisible();
    await expect(page.getByTestId('delete-team-cancel')).toBeVisible();
  });

  test('cancel in delete confirmation closes modal', async ({ page }) => {
    const teams = await getTeams(page);

    const activeTeam = teams.find((t) => t.status !== 'tombstone');
    if (!activeTeam) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${activeTeam.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('team-delete-button').click();
    await expect(page.getByTestId('delete-team-confirm-modal')).toBeVisible();

    // Click cancel
    await page.getByTestId('delete-team-cancel').click();

    // Modal should disappear
    await expect(page.getByTestId('delete-team-confirm-modal')).not.toBeVisible();

    // Team detail should still be visible
    await expect(page.getByTestId('team-detail-panel')).toBeVisible();
  });

  test('can delete team via UI', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a team to delete
    const uniqueName = `Delete Via UI Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${team.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Delete the team
    await page.getByTestId('team-delete-button').click();
    await expect(page.getByTestId('delete-team-confirm-modal')).toBeVisible();
    await page.getByTestId('delete-team-confirm').click();

    // Modal and detail panel should close
    await expect(page.getByTestId('delete-team-confirm-modal')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('team-detail-container')).not.toBeVisible({ timeout: 5000 });
  });

  test('team detail panel has add member search', async ({ page }) => {
    // TB123: Teams must have at least one member
    const entities = await getEntities(page);
    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a fresh team
    const uniqueName = `Add Search Test Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${team.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('add-member-search')).toBeVisible();
  });

  test('add member search shows results', async ({ page }) => {
    // Get entities - TB123: Need at least 2 entities (one for team, one to search for)
    const entities = await getEntities(page);

    if (entities.length < 2) {
      test.skip();
      return;
    }

    // Create a fresh team for this test - TB123: Must have at least one member
    const uniqueName = `Search Results Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${team.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('add-member-search')).toBeVisible({ timeout: 5000 });

    // Type in search (search for an entity NOT in the team)
    await page.getByTestId('add-member-search').fill(entities[1].name.substring(0, 3));

    // Results should appear
    await expect(page.getByTestId('add-member-results')).toBeVisible();

    // Clean up
    await page.request.delete(`/api/teams/${team.id}`);
  });

  test('can add member to team via UI', async ({ page }) => {
    // Get entities - TB123: Need at least 2 entities
    const entities = await getEntities(page);

    if (entities.length < 2) {
      test.skip();
      return;
    }

    // Create a team with one member - TB123: Must have at least one member
    const uniqueName = `Add Member UI Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    // Find a different entity not in the team
    const entityToAdd = entities[1];

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${team.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Search for entity
    await page.getByTestId('add-member-search').fill(entityToAdd.name);
    await expect(page.getByTestId('add-member-results')).toBeVisible();

    // Click to add
    await page.getByTestId(`add-member-option-${entityToAdd.id}`).click();

    // Member should appear in list
    await expect(page.getByTestId(`member-item-${entityToAdd.id}`)).toBeVisible({ timeout: 5000 });

    // Clean up
    await page.request.delete(`/api/teams/${team.id}`);
  });

  test('can remove member from team via UI (when multiple members)', async ({ page }) => {
    // Get entities - TB123: Need at least 2 to test removal
    const entities = await getEntities(page);

    if (entities.length < 2) {
      test.skip();
      return;
    }

    // Create a team with TWO members (TB123: Can only remove when >1 member)
    const uniqueName = `Remove Member UI Team ${Date.now()}`;
    const memberEntity = entities[0];
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [memberEntity.id, entities[1].id] },
    });
    const team = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${team.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Wait for members to load
    await expect(page.getByTestId(`member-item-${memberEntity.id}`)).toBeVisible({ timeout: 5000 });

    // Hover over member item to reveal remove button
    await page.getByTestId(`member-item-${memberEntity.id}`).hover();

    // Click remove button
    await page.getByTestId(`remove-member-${memberEntity.id}`).click();

    // Member should be removed from list
    await expect(page.getByTestId(`member-item-${memberEntity.id}`)).not.toBeVisible({ timeout: 5000 });
    // Other member should still be there
    await expect(page.getByTestId(`member-item-${entities[1].id}`)).toBeVisible();

    // Clean up
    await page.request.delete(`/api/teams/${team.id}`);
  });

  test('member remove button appears on hover', async ({ page }) => {
    // Get entities
    const entities = await getEntities(page);

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Create a team with a member for this test
    const uniqueName = `Hover Test Team ${Date.now()}`;
    const createResponse = await page.request.post('/api/teams', {
      data: { name: uniqueName, members: [entities[0].id] },
    });
    const team = await createResponse.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId(`team-card-${team.id}`).click();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Wait for members to load
    await expect(page.getByTestId(`member-item-${entities[0].id}`)).toBeVisible({ timeout: 5000 });

    // Hover over member item
    await page.getByTestId(`member-item-${entities[0].id}`).hover();

    // Remove button should be visible
    await expect(page.getByTestId(`remove-member-${entities[0].id}`)).toBeVisible();
  });
});
