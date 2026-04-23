import { test, expect } from '@playwright/test';

// Helper to extract entities array from paginated response
async function getEntities(page: import('@playwright/test').Page): Promise<{ id: string; name: string; entityType: string }[]> {
  const response = await page.request.get('/api/entities');
  const data = await response.json();
  return data.items || data;
}

// Helper to extract teams array from paginated response
async function getTeams(page: import('@playwright/test').Page): Promise<{ id: string; name: string; members: string[]; status?: string; tags?: string[] }[]> {
  const response = await page.request.get('/api/teams');
  const data = await response.json();
  return data.items || data;
}

test.describe('TB123: Teams Must Have Entity Members', () => {
  test.describe('Server validation - POST /api/teams', () => {
    test('creating a team without members returns validation error', async ({ page }) => {
      const response = await page.request.post('/api/teams', {
        data: {
          name: 'Test Team Without Members',
          members: [],
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('at least one member');
    });

    test('creating a team with undefined members returns validation error', async ({ page }) => {
      const response = await page.request.post('/api/teams', {
        data: {
          name: 'Test Team No Members Field',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('at least one member');
    });

    test('creating a team with at least one member succeeds', async ({ page }) => {
      // Get an entity to use as member
      const entities = await getEntities(page);
      if (entities.length === 0) {
        test.skip();
        return;
      }

      const testTeamName = `Test Team ${Date.now()}`;
      const response = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id],
        },
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.name).toBe(testTeamName);
      expect(data.members).toContain(entities[0].id);

      // Clean up: delete the team
      await page.request.delete(`/api/teams/${data.id}`);
    });
  });

  test.describe('Server validation - PATCH /api/teams (remove members)', () => {
    test('removing the last member returns validation error', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Create a team with one member
      const testTeamName = `Test Team Single Member ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Try to remove the only member
      const updateResponse = await page.request.patch(`/api/teams/${team.id}`, {
        data: {
          removeMembers: [entities[0].id],
        },
      });

      expect(updateResponse.status()).toBe(400);
      const data = await updateResponse.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('Cannot remove the last member');

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });

    test('removing a member when multiple members exist succeeds', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length < 2) {
        test.skip();
        return;
      }

      // Create a team with two members
      const testTeamName = `Test Team Two Members ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id, entities[1].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Remove one member
      const updateResponse = await page.request.patch(`/api/teams/${team.id}`, {
        data: {
          removeMembers: [entities[0].id],
        },
      });

      expect(updateResponse.status()).toBe(200);
      const data = await updateResponse.json();
      expect(data.members).not.toContain(entities[0].id);
      expect(data.members).toContain(entities[1].id);

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });
  });

  test.describe('Server validation - GET /api/teams/:id/can-remove-member/:entityId', () => {
    test('returns canRemove false for last member', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Create a team with one member
      const testTeamName = `Test Team Can Remove ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Check if member can be removed
      const checkResponse = await page.request.get(`/api/teams/${team.id}/can-remove-member/${entities[0].id}`);
      expect(checkResponse.status()).toBe(200);
      const data = await checkResponse.json();
      expect(data.canRemove).toBe(false);
      expect(data.reason).toContain('Cannot remove the last member');

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });

    test('returns canRemove true when multiple members exist', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length < 2) {
        test.skip();
        return;
      }

      // Create a team with two members
      const testTeamName = `Test Team Can Remove Multi ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id, entities[1].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Check if member can be removed
      const checkResponse = await page.request.get(`/api/teams/${team.id}/can-remove-member/${entities[0].id}`);
      expect(checkResponse.status()).toBe(200);
      const data = await checkResponse.json();
      expect(data.canRemove).toBe(true);
      expect(data.reason).toBe(null);

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });

    test('returns canRemove false for non-member entity', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length < 2) {
        test.skip();
        return;
      }

      // Create a team with one member
      const testTeamName = `Test Team Non Member ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Check if non-member can be removed
      const checkResponse = await page.request.get(`/api/teams/${team.id}/can-remove-member/${entities[1].id}`);
      expect(checkResponse.status()).toBe(200);
      const data = await checkResponse.json();
      expect(data.canRemove).toBe(false);
      expect(data.reason).toContain('not a member');

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });
  });

  test.describe('UI - CreateTeamModal', () => {
    test('create team button is disabled when no members selected', async ({ page }) => {
      await page.goto('/teams');
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

      // Open create modal
      await page.getByTestId('new-team-button').click();
      await expect(page.getByTestId('create-team-modal')).toBeVisible();

      // Enter a name
      await page.getByTestId('create-team-name-input').fill('Test Team');

      // Submit button should be disabled (no members selected)
      const submitButton = page.getByTestId('create-team-submit');
      await expect(submitButton).toBeDisabled();
    });

    test('shows helper text when no members selected', async ({ page }) => {
      await page.goto('/teams');
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

      // Open create modal
      await page.getByTestId('new-team-button').click();
      await expect(page.getByTestId('create-team-modal')).toBeVisible();

      // Should show helper text about members being required
      await expect(page.getByText(/at least one member/i)).toBeVisible();
    });

    test('create team button is enabled when member is selected', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto('/teams');
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

      // Open create modal
      await page.getByTestId('new-team-button').click();
      await expect(page.getByTestId('create-team-modal')).toBeVisible();

      // Enter a name
      await page.getByTestId('create-team-name-input').fill('Test Team');

      // Search for an entity
      await page.getByTestId('member-search-input').fill(entities[0].name.substring(0, 3));
      await page.waitForTimeout(300);

      // Click to add the entity
      const addButton = page.getByTestId(`add-member-${entities[0].id}`);
      if (await addButton.isVisible()) {
        await addButton.click();

        // Submit button should be enabled
        const submitButton = page.getByTestId('create-team-submit');
        await expect(submitButton).toBeEnabled();

        // Helper text should be gone
        await expect(page.getByText(/Teams must have at least one member/i)).not.toBeVisible();
      }

      // Close modal
      await page.getByTestId('create-team-modal-close').click();
    });

    test('can successfully create a team with members via UI', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length === 0) {
        test.skip();
        return;
      }

      await page.goto('/teams');
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

      // Open create modal
      await page.getByTestId('new-team-button').click();
      await expect(page.getByTestId('create-team-modal')).toBeVisible();

      // Enter a unique team name
      const testTeamName = `UI Test Team ${Date.now()}`;
      await page.getByTestId('create-team-name-input').fill(testTeamName);

      // Search for an entity
      await page.getByTestId('member-search-input').fill(entities[0].name.substring(0, 3));
      await page.waitForTimeout(300);

      // Click to add the entity
      const addButton = page.getByTestId(`add-member-${entities[0].id}`);
      if (await addButton.isVisible()) {
        await addButton.click();

        // Submit the form
        await page.getByTestId('create-team-submit').click();

        // Modal should close and team should appear
        await expect(page.getByTestId('create-team-modal')).not.toBeVisible({ timeout: 5000 });

        // Verify team was created via API
        const teams = await getTeams(page);
        const createdTeam = teams.find(t => t.name === testTeamName);
        expect(createdTeam).toBeDefined();
        expect(createdTeam?.members).toContain(entities[0].id);

        // Clean up
        if (createdTeam) {
          await page.request.delete(`/api/teams/${createdTeam.id}`);
        }
      }
    });
  });

  test.describe('UI - TeamDetailPanel (last member protection)', () => {
    test('shows warning when team has only one member', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Create a team with one member
      const testTeamName = `UI Test Single Member ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Navigate to teams page and select the team
      await page.goto(`/teams?selected=${team.id}`);
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

      // Should show warning about last member
      await expect(page.getByTestId('last-member-warning')).toBeVisible();
      await expect(page.getByText(/This is the last member/i)).toBeVisible();

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });

    test('remove button is disabled for last member', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length === 0) {
        test.skip();
        return;
      }

      // Create a team with one member
      const testTeamName = `UI Test Remove Disabled ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Navigate to teams page and select the team
      await page.goto(`/teams?selected=${team.id}`);
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

      // Wait for members to load
      await expect(page.getByTestId('team-members-list')).toBeVisible({ timeout: 5000 });

      // Remove button should be disabled (visible but disabled)
      const removeButton = page.getByTestId(`remove-member-${entities[0].id}`);
      await expect(removeButton).toBeVisible();
      await expect(removeButton).toBeDisabled();

      // Check tooltip
      await expect(removeButton).toHaveAttribute('title', 'Cannot remove the last member from a team');

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });

    test('remove button is enabled when multiple members exist', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length < 2) {
        test.skip();
        return;
      }

      // Create a team with two members
      const testTeamName = `UI Test Remove Enabled ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id, entities[1].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Navigate to teams page and select the team
      await page.goto(`/teams?selected=${team.id}`);
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

      // Wait for members to load
      await expect(page.getByTestId('team-members-list')).toBeVisible({ timeout: 5000 });

      // Hover over member item to show remove button
      const memberItem = page.getByTestId(`member-item-${entities[0].id}`);
      await memberItem.hover();

      // Remove button should be enabled
      const removeButton = page.getByTestId(`remove-member-${entities[0].id}`);
      await expect(removeButton).toBeEnabled();
      await expect(removeButton).toHaveAttribute('title', 'Remove from team');

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });

    test('no warning shown when team has multiple members', async ({ page }) => {
      const entities = await getEntities(page);
      if (entities.length < 2) {
        test.skip();
        return;
      }

      // Create a team with two members
      const testTeamName = `UI Test No Warning ${Date.now()}`;
      const createResponse = await page.request.post('/api/teams', {
        data: {
          name: testTeamName,
          members: [entities[0].id, entities[1].id],
        },
      });
      expect(createResponse.status()).toBe(201);
      const team = await createResponse.json();

      // Navigate to teams page and select the team
      await page.goto(`/teams?selected=${team.id}`);
      await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

      // Should NOT show warning about last member
      await expect(page.getByTestId('last-member-warning')).not.toBeVisible();

      // Clean up
      await page.request.delete(`/api/teams/${team.id}`);
    });
  });
});
