# UI Consistency Audit — smithy-next

Systematic page-by-page review of all pages, tabs, sidebars, and detail panels. Each inconsistency is cataloged with the exact values found across components and the recommended standard.

---

## 1. Detail Page Title Font Size

The `<h1>` title in detail/sub-page headers uses different sizes across pages:

| Page | fontSize | fontWeight | File:Line |
|------|----------|------------|-----------|
| Task Detail | 22 | 600 | TaskDetailOverlay.tsx:124 |
| MR Detail | 16 | 600 | MRHeader.tsx:116 |
| CI Run Detail | 16 | 600 | CIRunHeader.tsx (title) |
| Workflow Detail | 16 | 600 | WorkflowDetailView.tsx:128 |
| Session Detail | 16 | 600 | SessionDetailHeader.tsx:131 |
| Agent Detail | **15** | 600 | AgentDetailView.tsx:84 |

**Issues:**
- Task Detail uses 22px — significantly larger than every other page (16px).
- Agent Detail uses 15px — slightly smaller than the 16px standard.

**Recommendation:** Standardize all detail page titles to `fontSize: 16, fontWeight: 600`.

---

## 2. Detail Header Padding

The header container padding varies across detail pages:

| Page | Padding | File:Line |
|------|---------|-----------|
| Task Detail | `0 16px` (44px fixed height) | TaskDetailOverlay.tsx:62 |
| MR Detail | `16px 24px` | MRHeader.tsx:35 |
| CI Run Detail | `16px 24px` | CIRunHeader.tsx |
| Workflow Detail | `12px 16px` | WorkflowDetailView.tsx:119 |
| Session Detail Row 1 | `8px 16px` | SessionDetailHeader.tsx:77 |
| Session Detail Row 2 | `12px 16px 0` | SessionDetailHeader.tsx:128 |
| Agent Detail | `12px 16px 0` | AgentDetailView.tsx:73 |

**Issues:**
- MR and CI use `16px 24px` (24px horizontal) while all others use 16px horizontal.
- Vertical padding ranges from 0 to 16px.

**Recommendation:** Standardize to `12px 16px` for detail headers (matching the majority pattern). MR and CI should reduce horizontal padding from 24px to 16px.

---

## 3. Detail Header Back Button Size

| Page | Width × Height | Background | File:Line |
|------|---------------|------------|-----------|
| Task Detail | 28 × 28 | `var(--color-surface)` | TaskDetailOverlay.tsx |
| MR Detail | 28 × 28 | `var(--color-surface)` | MRHeader.tsx:38 |
| CI Run Detail | 28 × 28 | `var(--color-surface)` | CIRunHeader.tsx |
| Workflow Detail | 28 × 28 | `var(--color-surface)` | WorkflowDetailView.tsx:122 |
| Agent Detail | 28 × 28 | `var(--color-surface)` | AgentDetailView.tsx:77 |
| Session Detail | padding: 4 (no fixed size) | `none` | SessionDetailHeader.tsx:85 |

**Issues:**
- Session Detail uses `padding: 4` and `background: 'none'` instead of a fixed 28×28 button with surface background. It also uses an `X` icon (size 16) instead of `ArrowLeft` (size 14).

**Recommendation:** Standardize to `width: 28, height: 28, background: 'var(--color-surface)'` with `ArrowLeft size={14}`. Session detail should use the same pattern.

---

## 4. Tab Styling Patterns (Two Competing Styles)

There are two distinct tab styles in the app — **underline tabs** and **pill tabs** — used inconsistently:

### Underline Tabs (bottom border indicator)
| Location | fontSize | fontWeight | padding | borderBottom (active) |
|----------|----------|------------|---------|----------------------|
| Tasks page (Kanban/MRs/CI/Agents top) | 12 | 500 | `10px 14px` | `2px solid var(--color-primary)` |
| Agent Detail (Overview/Sessions/Tasks/Settings) | 12 | 500 | `8px 14px` | `2px solid var(--color-primary)` |
| Session Detail (Transcript/Chat) | **13** | 500 | `0 0 4px` | `2px solid var(--color-primary)` |

### Pill Tabs (background color indicator)
| Location | fontSize | fontWeight | padding | Active background |
|----------|----------|------------|---------|-------------------|
| MR Detail (Conversation/Commits/Checks/Files) | 12 | 500 | `6px 12px` | `var(--color-surface-active)` |
| Workflow Detail (Overview/Runs/Editor) | 12 | 500 | `6px 12px` | `var(--color-surface-active)` |

**Issues:**
- Session Detail tabs use **fontSize 13** while all other tabs use 12.
- Session Detail tabs use unusual padding `0 0 4px` (zero horizontal padding).
- Agent Detail tabs use `8px 14px` vertical padding, while top-level tabs use `10px 14px`.
- No clear rule for when to use underline vs pill style. Within the same app, MR detail uses pills while Agent detail uses underlines.

**Recommendation:** Pick one tab style and use it consistently. The underline style is more common in the app. Standardize to: `fontSize: 12, fontWeight: 500, padding: '8px 14px'` with `borderBottom: '2px solid var(--color-primary)'` for active state. Fix Session Detail tabs to match.

---

## 5. Left Sidebar Widths

| Page | Width | File:Line |
|------|-------|-----------|
| CI Run List (Actions) | 200 | CIRunListView.tsx |
| CI Run Detail (Jobs) | 240 | CIRunDetailView.tsx:88 |
| Agent Sidebar | **220** | AgentSidebar.tsx:23 |
| Role Definition Sidebar | 200 | AgentsOverlay.tsx:215 |
| Runtime Sidebar | 200 | AgentsOverlay.tsx:278 |
| Workflow Detail Sidebar | 200 | WorkflowDetailView.tsx:62 |
| Settings Sidebar | 200 | SettingsOverlay.tsx |
| Editor Sidebar | 240 | EditorOverlayNew.tsx |
| Documents Sidebar | 240 | DocumentsOverlay.tsx |

**Issues:**
- Agent Sidebar uses 220px — doesn't match either the 200px or 240px patterns.
- No clear rule: navigation-only sidebars should be 200px, content-rich sidebars (file trees, job lists) should be 240px.

**Recommendation:** Agent Sidebar should be 200px to match other navigation sidebars (Role Definitions, Runtimes, Workflows, Settings, CI Actions).

---

## 6. Left Sidebar Title (Header) Styles

This is the specific inconsistency mentioned in the task:

| Sidebar | fontSize | fontWeight | textTransform | letterSpacing | borderBottom | File:Line |
|---------|----------|------------|---------------|---------------|--------------|-----------|
| Agent Sidebar | 12 | 600 | uppercase | `0.5px` | 1px border-subtle | AgentSidebar.tsx:26 |
| Role Definitions Sidebar | 12 | 600 | uppercase | `0.5px` | 1px border-subtle | AgentsOverlay.tsx:216 |
| Runtimes Sidebar | 12 | 600 | uppercase | `0.5px` | 1px border-subtle | AgentsOverlay.tsx:279 |
| CI Detail "Jobs" | 10 | 500 | uppercase | `0.05em` | none | CIRunDetailView.tsx:108 |
| CI Detail "Run details" | 10 | 500 | uppercase | `0.05em` | none | CIRunDetailView.tsx:140 |
| CI List "Actions" | 10 | 500 | uppercase | `0.05em` | none | CIRunListView.tsx |
| Workflow Detail "Automations" | 10 | 500 | uppercase | `0.05em` | none | WorkflowDetailView.tsx:66 |
| Session List group headers | 11 | 600 | uppercase | `0.05em` | none | SessionListView.tsx |

**Issues:**
- **Three different font sizes**: 10px (CI, Workflows), 11px (Sessions), 12px (Agents/Roles/Runtimes).
- **Two different font weights**: 500 (CI, Workflows) vs 600 (Agents, Sessions).
- **Two different letter-spacing units**: `0.5px` (Agents) vs `0.05em` (CI, Workflows, Sessions). At 12px base, `0.05em` = 0.6px, so these are close but not identical.
- Agent/Role/Runtime sidebars have a `borderBottom` below the title; CI/Workflow sidebars do not.

**Recommendation:** Standardize all sidebar section headers to: `fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)'`. No borderBottom on the text label (use a separate divider element if separation is needed).

---

## 7. Left Sidebar Active Item Indicator

| Sidebar | Active Background | Left Border Accent | File:Line |
|---------|------------------|-------------------|-----------|
| Agent Sidebar | `var(--color-surface-active)` | `boxShadow: inset 2px 0 0 var(--color-primary)` | AgentSidebar.tsx:59-60 |
| CI Actions Sidebar | `var(--color-surface-active)` | `boxShadow: inset 2px 0 0 var(--color-primary)` | CIRunListView.tsx |
| CI Jobs Sidebar | `var(--color-surface-active)` | `boxShadow: inset 2px 0 0 var(--color-primary)` | CIRunDetailView.tsx:126 |
| Workflow Detail Sidebar | `var(--color-surface-active)` | `boxShadow: inset 2px 0 0 var(--color-primary)` | WorkflowDetailView.tsx:98 |
| Role Definition Sidebar | `var(--color-surface-active)` | **none** | AgentsOverlay.tsx:227 |
| Runtime Sidebar | `var(--color-surface-active)` | **none** | AgentsOverlay.tsx:288 |
| Settings Sidebar | `var(--color-primary-subtle)` | **none** | SettingsOverlay.tsx |

**Issues:**
- Role Definition and Runtime sidebars are missing the left accent border that Agent, CI, and Workflow sidebars all have.
- Settings sidebar uses a different background color (`primary-subtle` instead of `surface-active`) and no accent bar.

**Recommendation:** All sidebar active items should use `background: 'var(--color-surface-active)'` + `boxShadow: 'inset 2px 0 0 var(--color-primary)'`.

---

## 8. Left Sidebar Border Color

| Sidebar | borderRight | File:Line |
|---------|------------|-----------|
| Agent Sidebar | `1px solid var(--color-border)` | AgentSidebar.tsx:23 |
| CI Actions Sidebar | `1px solid var(--color-border)` | CIRunListView.tsx |
| CI Jobs Sidebar | `1px solid var(--color-border)` | CIRunDetailView.tsx:88 |
| Workflow Detail Sidebar | `1px solid var(--color-border)` | WorkflowDetailView.tsx:62 |
| Role Definition Sidebar | `1px solid var(--color-border-subtle)` | AgentsOverlay.tsx:215 |
| Runtime Sidebar | `1px solid var(--color-border-subtle)` | AgentsOverlay.tsx:278 |

**Issues:**
- Role Definition and Runtime sidebars use `--color-border-subtle` while all other sidebars use `--color-border`.

**Recommendation:** Standardize to `1px solid var(--color-border)` for all left sidebar borders.

---

## 9. Left Sidebar Item Padding

| Sidebar | Item Padding | File:Line |
|---------|-------------|-----------|
| Agent Sidebar | `6px 12px 6px 16px` | AgentSidebar.tsx:57 |
| CI Actions Sidebar | `6px 12px` | CIRunListView.tsx |
| CI Jobs Sidebar | `7px 16px` | CIRunDetailView.tsx:121 |
| Workflow Detail | `7px 12px` | WorkflowDetailView.tsx:95 |
| Role Definition | `8px 12px` | AgentsOverlay.tsx:226 |
| Runtime | `8px 12px` | AgentsOverlay.tsx:287 |

**Issues:**
- Agent Sidebar uses asymmetric horizontal padding (12px left, 16px indented left). 
- Vertical padding ranges from 6px to 8px.
- Horizontal padding ranges from 12px to 16px.

**Recommendation:** Standardize to `7px 12px` for navigation sidebars (matching Workflow/CI), or `8px 12px` for flat lists. The Agent Sidebar asymmetric padding (`6px 12px 6px 16px`) should be changed to match the standard pattern.

---

## 10. "Stoneforge" Section Title

This branded section title appears in several right sidebars but with different styles:

| Location | fontSize | fontWeight | letterSpacing | border separator | File:Line |
|----------|----------|------------|---------------|-----------------|-----------|
| Task Detail sidebar | 11 | 500 | `0.05em` | `borderTop: 1px solid var(--color-border-subtle)` | TaskDetailOverlay.tsx:556 |
| MR Review sidebar | **10** | **600** | `0.05em` | `borderTop: 1px solid var(--color-border)` | MRReviewSidebar.tsx:178 |

**Issues:**
- Font size differs: 11px (Task) vs 10px (MR).
- Font weight differs: 500 (Task) vs 600 (MR).
- Border color differs: `--color-border-subtle` (Task) vs `--color-border` (MR).

**Recommendation:** Standardize to `fontSize: 11, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase'` with `borderTop: 1px solid var(--color-border-subtle)`.

---

## 11. Right Sidebar Section Titles

| Location | fontSize | fontWeight | textTransform | Color | File:Line |
|----------|----------|------------|---------------|-------|-----------|
| Task Detail "Properties" | 12 | 500 | none | text-tertiary | TaskDetailOverlay.tsx:378 |
| Task Detail "Labels" | 12 | 500 | none | text-tertiary | TaskDetailOverlay.tsx:419 |
| Task Detail "Watchers" | 12 | 500 | none | text-tertiary | TaskDetailOverlay.tsx:503 |
| MR Sidebar "Reviewers"/"Labels" | 11 | 500 | none | text-tertiary | MRReviewSidebar.tsx:264 |

**Issues:**
- Task Detail uses 12px for section titles, MR sidebar uses 11px.

**Recommendation:** Standardize to `fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)'` for right sidebar section titles.

---

## 12. Content Section Headings (Left Column)

These are section headings within the main content area of detail views:

| Section | fontSize | fontWeight | Color | File:Line |
|---------|----------|------------|-------|-----------|
| Task "Acceptance Criteria" | 12 | 500 | text-secondary | TaskDetailOverlay.tsx:165 |
| Task "Sub-tasks" | 12 | 500 | text-secondary | TaskDetailOverlay.tsx:244 |
| Task "Dependencies" | 12 | 500 | text-secondary | TaskDetailOverlay.tsx:285 |
| Task "Activity" | **14** | **600** | **text** (primary) | TaskDetailOverlay.tsx:317 |
| CI "Artifacts" | 12 | 500 | text-secondary | CIRunDetailView.tsx |
| Workflow Section titles | 12 | 500 | text-secondary | WorkflowDetailView.tsx |

**Issues:**
- Task Detail "Activity" heading uses a completely different style (14px/600/primary text color) compared to sibling sections (12px/500/secondary text color).

**Recommendation:** Standardize "Activity" to `fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)'` to match its sibling sections.

---

## 13. Primary CTA Button Horizontal Padding

| Page | Button Text | Padding | File:Line |
|------|------------|---------|-----------|
| Tasks "New Task" | `0 10px` | KanbanBoard.tsx:302 |
| MR "New MR" | `0 10px` | MRListView.tsx |
| CI "Run action" | `0 10px` | CIRunListView.tsx |
| Sessions "New Session" | `0 10px` | SessionListView.tsx |
| Automations "New Automation" | `0 10px` | WorkflowListView.tsx |
| Agents "New Agent" | `0 10px` | AgentListView.tsx:223 |
| Role Definitions "New Role Definition" | `0 **12px**` | RoleDefinitionListView.tsx:117 |
| Runtimes "New Runtime" | `0 **12px**` | RuntimeListView.tsx:61 |

**Issues:**
- Role Definitions and Runtimes use `0 12px` padding while every other page uses `0 10px`.

**Recommendation:** Standardize to `padding: '0 10px'` for all primary CTA buttons.

---

## 14. Session Detail Action Buttons

| Page | Button Height | borderRadius | Border | File:Line |
|------|--------------|--------------|--------|-----------|
| CI Run Detail (Re-run, Cancel) | **28** | `var(--radius-sm)` | none | CIRunHeader.tsx |
| Session Detail (Actions) | **30** | `var(--radius-md)` | `1px solid var(--color-border)` | SessionDetailHeader.tsx:162 |
| Session Detail (Resume) | **30** | `var(--radius-md)` | none | SessionDetailHeader.tsx:206 |
| Workflow Detail (Run) | 26 | `var(--radius-sm)` | none | WorkflowDetailView.tsx:161 |
| Toolbar buttons everywhere | 26 | `var(--radius-sm)` | none | Various |

**Issues:**
- Session Detail uses height 30 and `radius-md` for its action buttons, which is unique.
- CI Run Detail uses height 28 instead of the standard 26.
- Session Detail "Actions" button also has a visible border (1px solid), unlike others.

**Recommendation:** Standardize detail-page action buttons to `height: 28, borderRadius: 'var(--radius-sm)', border: 'none'` (slightly larger than toolbar 26px to distinguish page-level actions). Session Detail should drop the border and reduce to radius-sm. Or adopt 26px everywhere for maximum consistency.

---

## 15. Toolbar Gap Spacing

| Page | Toolbar Gap | File:Line |
|------|------------|-----------|
| Tasks | 8 | KanbanBoard.tsx:183 |
| MR List | 8 | MRListView.tsx |
| CI List | 8 | CIRunListView.tsx |
| Automations List | 8 | WorkflowListView.tsx |
| Agents List | 8 | AgentListView.tsx:155 |
| Session List | **10** | SessionListView.tsx |

**Issues:**
- Session List toolbar uses `gap: 10` while all others use `gap: 8`.

**Recommendation:** Standardize to `gap: 8`.

---

## 16. Session List Active Filter Pill Styling

| Page | borderRadius | background | color |
|------|-------------|------------|-------|
| Tasks, MR, CI, Automations | `var(--radius-sm)` | `var(--color-primary-subtle)` | `var(--color-text-accent)` |
| Session List | `var(--radius-full)` | `var(--color-primary-subtle)` | `var(--color-primary)` |

**Issues:**
- Session List uses `radius-full` (pill shape) while all other pages use `radius-sm` (rounded rect).
- Session List uses `var(--color-primary)` while others use `var(--color-text-accent)`.

**Recommendation:** Standardize to `borderRadius: 'var(--radius-sm)', color: 'var(--color-text-accent)'`.

---

## 17. Detail Header Border Color

| Page | Header borderBottom |
|------|-------------------|
| Task Detail | `1px solid var(--color-border)` |
| MR Detail | `1px solid var(--color-border)` |
| CI Run Detail | `1px solid var(--color-border)` |
| Agent Detail | `1px solid var(--color-border-subtle)` |
| Workflow Detail | `1px solid var(--color-border-subtle)` |
| Session Detail | `1px solid var(--color-border-subtle)` |

**Issues:**
- Inconsistent use of `--color-border` vs `--color-border-subtle` for detail header bottom borders.

**Recommendation:** Use `--color-border-subtle` for detail header bottom borders (lighter feel, matching the majority of newer pages). Or `--color-border` for stronger separation. Pick one.

---

## 18. List View Group Header Styles

| Page | fontSize | fontWeight | textTransform | letterSpacing | Color |
|------|----------|------------|---------------|---------------|-------|
| Tasks (Kanban columns) | 12 | 500 | none | none | text-secondary |
| MR List groups | 12 | 500 | none | none | text-secondary |
| CI List groups | 12 | 500 | none | none | text-secondary |
| Automations groups | 12 | 500 | none | none | text-secondary |
| Session List groups | **11** | **600** | **uppercase** | **0.05em** | text-tertiary |

**Issues:**
- Session List uses an entirely different group header style — smaller, bolder, uppercase with letter-spacing, and a different color. Every other list view uses 12/500/no-transform/text-secondary.

**Recommendation:** Standardize Session List groups to `fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)'` (no uppercase, no letterSpacing) to match all other list views.

---

## Summary of All Inconsistencies (by priority)

### High Impact (Visible layout/typography inconsistencies)
1. **Detail page title fontSize** — 22px (Task), 16px (MR/CI/Workflow/Session), 15px (Agent)
2. **Tab style mixing** — underline vs pill tabs used without clear rule; Session tabs at 13px vs 12px everywhere else
3. **Sidebar active indicators** — Role Def & Runtime sidebars missing left accent bar
4. **Left sidebar title styles** — 3 different font sizes (10/11/12), 2 weights, 2 letter-spacing units

### Medium Impact (Spacing/sizing inconsistencies)
5. **Detail header padding** — 24px horizontal (MR/CI) vs 16px (everywhere else)
6. **Agent Sidebar width** — 220px vs standard 200px
7. **Session Detail back button** — different style from all other pages
8. **Session List filter pills** — pill-shaped vs rounded-rect everywhere else
9. **"Stoneforge" section title** — 10px/600 (MR) vs 11px/500 (Task)
10. **Session List group headers** — uppercase/11px vs title-case/12px everywhere else

### Low Impact (Minor spacing/padding differences)
11. **Primary CTA padding** — 10px (most) vs 12px (Role Def/Runtimes)
12. **Sidebar border color** — border vs border-subtle
13. **Sidebar item padding** — ranges from 6-8px vertical, 12-16px horizontal
14. **Toolbar gap** — 10px (Sessions) vs 8px (everyone else)
15. **Detail header border color** — border vs border-subtle inconsistency
16. **Action button heights** — 26/28/30px across different detail pages
17. **Right sidebar section titles** — 11px (MR) vs 12px (Task)
18. **Task "Activity" heading** — 14px/600 vs 12px/500 siblings
