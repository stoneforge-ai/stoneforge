# @stoneforge/smithy-web

## 1.24.0

### Minor Changes

- ce71ed5: Add container-aware responsive hooks (useContainerWidth, useContainerBreakpoint, useContainerIsMobile, useContainerIsTablet, useContainerIsDesktop) that track the main content container's width via ResizeObserver instead of the viewport width
- 3ff3f75: Migrate PageHeader and Pagination components from viewport-based breakpoints to container query breakpoints so they respond to the actual content area width when the director panel is open

### Patch Changes

- 0987a9d: Migrate route pages from viewport to container query breakpoints. All responsive classes in route files now use @sm/@md/@lg/@xl container queries instead of viewport-based sm/md/lg/xl, so layouts adapt to the main content area width rather than the viewport.
  - @stoneforge/ui@1.24.0

## 1.23.1

### Patch Changes

- Updated dependencies [65fe969]
  - @stoneforge/ui@1.23.1

## 1.23.0

### Minor Changes

- 337769a: Add onboarding tour step: Workflow Template editor with pre-populated example steps

### Patch Changes

- 7657d9d: Fix onboarding tour agent settings step to expand Settings & Tags section in Create Agent dialog, making Provider and Model dropdowns visible and highlighted
- 1ef2d97: Fix onboarding tour: inject individual item query keys for detail panels, retarget agent settings step to Create Agent dialog, persist overlay during transitions, and disable auto-advance on detail steps
- 455fcf7: Fix two cosmetic onboarding tour issues: add mock merge request data to the Merge Requests step and set Activity page as background for Director section steps
- Updated dependencies [b074b03]
  - @stoneforge/ui@1.23.0

## 1.22.0

### Minor Changes

- 5fef2d8: Improve onboarding tutorial with richer descriptions and new steps for agent types, daemon toggle, emergency stop, and workflow presets
- 2e81fbf: Wire mock data and interactive demonstrations into onboarding tour steps. Adds 4 new tour steps (tasks-detail, plans-detail, documents-detail, messages-channel) that inject mock data, collapse the director panel, and open detail panels to showcase functionality during the guided tour.

### Patch Changes

- @stoneforge/ui@1.22.0

## 1.21.0

### Patch Changes

- @stoneforge/ui@1.21.0

## 1.20.1

### Patch Changes

- de90f4c: Fix onboarding tour flickering, back-button close, missing overlay, and auto-advance bugs
  - @stoneforge/ui@1.20.1

## 1.20.0

### Minor Changes

- 7e06e4b: Define 28-step onboarding tour with 7 sections and cross-page navigation in AppShell

### Patch Changes

- 7d74fe7: Polish onboarding tour edge cases: disable director steps on mobile, resume tour after browser refresh, fix restart from settings navigation
  - @stoneforge/ui@1.20.0

## 1.19.0

### Minor Changes

- 5cef1dd: Add clickable branch indicator in DirectorPanel header showing the active director's target branch with inline popover to change or clear it
- 30c0c30: Add Target Branch field to CreateAgentDialog for director agents
- 44cbb44: Add useChangeTargetBranch mutation hook for updating a director's target branch

### Patch Changes

- @stoneforge/ui@1.19.0

## 1.18.0

### Minor Changes

- 8b4d04c: Add provider installation check modal that blocks the app when required providers are missing, with per-provider install instructions and verify button
- 036d919: Add useDirectors hook and update useAgentsByRole for multi-director support
- 2b79b91: Add drag-and-drop tab reordering and right-click delete with confirmation to DirectorTabBar. Persist tab order in localStorage. Support reorder and delete in collapsed sidebar view.
- 6813f5b: Update Activity Dashboard, Agents page, and AppShell for multi-director support. Director cards now pass their ID when opening the panel, Agents page renders multiple director cards in a grid, and AppShell relays director selection via events.
- f61bc70: Add provider change option to the provider install modal. Users can now switch agents to an installed provider directly from the modal instead of being required to install the missing provider.
- 84b375f: Redesign DirectorPanel with tabbed interface supporting N concurrent director sessions. Add DirectorTabBar and DirectorTabContent components. Use CSS display:none for inactive tabs to preserve WebSocket/PTY connections. Collapsed panel shows tiled per-director icons. Zero-director state provides Create Director button.

### Patch Changes

- c4495f5: Normalize legacy 'claude' provider value to 'claude-code' in CreateAgentDialog submit handler
- c510a01: Merge director tab bar and per-director toolbar into a single combined header row. Remove redundant terminal header (macOS-style dots + name). Action buttons (sift backlog, messages toggle, session controls) now appear in the combined row for the active director. Lift messages queue visibility state to DirectorPanel.
  - @stoneforge/ui@1.18.0

## 1.17.0

### Minor Changes

- 600e4fd: Add totalCacheReadTokens and totalCacheCreationTokens to AggregatedProviderMetrics frontend type
- f68d308: Add notification sidebar with approval workflow UI. Replace the notification dropdown with a slide-in sidebar panel showing notification history and actionable approval request cards with inline approve/deny buttons.
- 2161a30: Add onboarding guided walkthrough tour that introduces users to the dashboard's key areas on their first visit. Includes spotlight overlay, tooltip navigation, localStorage persistence, and a restart button in Settings.
- dafa312: Add first-load preset selection modal to the activity dashboard and a Workflow Preset section to the Settings page. Users can choose Auto, Review, or Approve on first visit and change it later in Settings.
- 3bc3e76: Add model-level token & cost breakdown table, cache hit rate card, enriched agent card tooltips with cache tokens and estimated cost

### Patch Changes

- Updated dependencies [705df96]
  - @stoneforge/ui@1.17.0

## 1.16.1

### Patch Changes

- d7199b2: Auto-refresh terminal after image drag+drop upload to fix mangled output
  - @stoneforge/ui@1.16.1

## 1.16.0

### Minor Changes

- 2537df2: Add token usage display to activity page agent cards showing input/output token counts

### Patch Changes

- 00add6f: Fix workspace pane token display to show only current session tokens instead of aggregating all past sessions. Update `useAgentTokens` hook to accept optional `sessionId` parameter and `useProviderMetrics` to support session-specific queries.
  - @stoneforge/ui@1.16.0

## 1.15.0

### Patch Changes

- @stoneforge/ui@1.15.0

## 1.14.0

### Patch Changes

- 110f842: Show rate-limited executable names in the RateLimitBanner and add a Configure link to the settings page
  - @stoneforge/ui@1.14.0

## 1.13.0

### Minor Changes

- 77cab6e: Add RateLimitBanner component that shows a site-wide warning banner when the dispatch daemon is paused due to rate limits, with wake-up time display, Wake Now button, and dismissable behavior

### Patch Changes

- @stoneforge/ui@1.13.0

## 1.12.0

### Minor Changes

- 10e8201: Add Provider and Model Analytics section to metrics page with summary cards (tokens, sessions, cost), token usage trend chart, provider distribution pie chart, and error rate by provider bar chart.

### Patch Changes

- @stoneforge/ui@1.12.0

## 1.11.0

### Patch Changes

- 7064d80: Revert session image uploads to use terminal upload endpoint instead of asset API. Session images in XTerminal and StreamViewer are ephemeral and now upload to `/tmp/stoneforge-terminal-uploads/` via `/api/terminal/upload`. Task description images remain unchanged.
  - @stoneforge/ui@1.11.0

## 1.10.2

### Patch Changes

- @stoneforge/ui@1.10.2

## 1.10.1

### Patch Changes

- 08ffa58: Add max depth guard to flattenFileTree to prevent stack overflow on deep file trees
  - @stoneforge/ui@1.10.1

## 1.10.0

### Minor Changes

- 69ff886: Add image drag-and-drop and clipboard paste support to EditableDescription and ReopenDialog via a reusable useImageDrop hook

### Patch Changes

- @stoneforge/ui@1.10.0

## 1.9.0

### Patch Changes

- 9c5d630: Fix Kanban column header counts to always show unfiltered totals, preventing stale localStorage filters from making columns appear empty
  - @stoneforge/ui@1.9.0

## 1.8.0

### Patch Changes

- @stoneforge/ui@1.8.0

## 1.7.0

### Minor Changes

- 8891e17: Add bulk Set Status and Set Priority actions to the task list bulk actions bar

### Patch Changes

- @stoneforge/ui@1.7.0

## 1.6.0

### Patch Changes

- Updated dependencies [d625816]
  - @stoneforge/ui@1.6.0

## 1.5.0

### Patch Changes

- @stoneforge/ui@1.5.0

## 1.4.1

### Patch Changes

- @stoneforge/ui@1.4.1

## 1.4.0

### Minor Changes

- 5bb96e6: Add per-provider executable path inputs to the Settings page Agent Defaults section, backed by the server-side settings API

### Patch Changes

- @stoneforge/ui@1.4.0

## 1.3.0

### Minor Changes

- cba8d1b: Add per-agent executable path field to agent creation and provider change dialogs, and display custom path on agent cards

### Patch Changes

- @stoneforge/ui@1.3.0

## 1.2.0

### Minor Changes

- acf6ed0: Add 'Change triggers' option to steward agent card dropdown menu with a dialog for editing cron and event triggers
- a468899: Add Custom Steward UI: show playbook textarea when 'custom' steward focus is selected in CreateAgentDialog, update AgentRoleBadge to display custom steward label, and extend API types for playbook support.
- 0270b45: Add Edit Pool modal for modifying agent pools after creation. Extract shared AgentTypeConfigRow component, create EditPoolDialog with pre-populated form fields, read-only pool name, maxSize >= activeCount validation, and wire it into the PoolCard Edit action.
- 6ad6161: Replace Custom Steward playbook textarea with a Workflow Template dropdown in the Create Agent dialog. The dropdown lists existing workflow templates by title. When no templates exist, an empty state guides users to create one. All "Playbook" labels are renamed to "Workflow Template".
- 6a03ab1: Add provider and model input fields to CreatePoolDialog agent type rows and display provider/model info in PoolCard agent type badges.
- 49c114f: Add Agent Pool creation UI to the Agents page with a new Pools tab, CreatePoolDialog component, and pool management actions
- ff790e4: Add Recovery Steward to the Create Agent dialog, pool creation form, and role badge component.

### Patch Changes

- c7c3a2e: Add 'Custom' option to steward focus label maps in Create Pool dialog and Agents page so custom stewards can be selected and displayed.
- 7ed752d: Fix director panel maximize to use full site width by hiding the sidebar when maximized
- 4878312: Fix Pool modal height overflow and replace agent type provider/model text inputs with dropdown selects
- 5b41188: Fix workspace panel drag-and-drop: dropping on the titlebar now correctly swaps panels instead of silently reverting due to the drop handler firing twice.
- Updated dependencies [d99c357]
  - @stoneforge/ui@1.2.0

## 1.1.0

### Patch Changes

- @stoneforge/ui@1.1.0

## 1.0.3

### Patch Changes

- @stoneforge/ui@1.0.3

## 1.0.2

### Patch Changes

- @stoneforge/ui@1.0.2

## 1.0.1

### Patch Changes

- @stoneforge/ui@1.0.1
