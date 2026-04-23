---
"@stoneforge/quarry": patch
---

Exempt workflows from parent-child blocking in blocked cache so that tasks inside a workflow are not blocked by the workflow's pending/running status. Workflows, like plans, are collections and should not act as blocking parents.
