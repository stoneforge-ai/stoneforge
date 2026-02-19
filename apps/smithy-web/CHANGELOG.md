# @stoneforge/smithy-web

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
