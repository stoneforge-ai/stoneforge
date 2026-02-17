---
"@stoneforge/smithy": minor
---

Add `playbookId` field to StewardMetadata and RegisterStewardInput for referencing Workflow Templates by ID. The steward scheduler resolves playbookId at execution time, falling back to inline playbook content for backward compatibility. API routes accept either `playbook` or `playbookId` for custom steward creation.
