---
"@stoneforge/smithy": patch
---

Fix PR creation to use task's targetBranch from orchestrator metadata instead of hardcoded 'main'. PRs now correctly target the configured target branch when set.
