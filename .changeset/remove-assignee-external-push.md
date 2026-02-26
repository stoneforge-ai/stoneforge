---
"@stoneforge/quarry": patch
---

Remove assignee setting from external-sync push/link operations

Stoneforge assignees are ephemeral agents (e.g., el-xxxx) that don't correspond to valid users on external platforms like GitHub. Setting assignees on external issues caused `sf external-sync link-all` to fail with validation errors. Assignees are no longer written to external systems during create or update operations. Reading assignees from external systems (pull) is preserved.
