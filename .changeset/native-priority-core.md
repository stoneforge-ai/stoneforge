---
"@stoneforge/core": minor
---

Add optional `priority` field to `ExternalTaskInput` and `ExternalTask` interfaces, enabling providers with native priority support (e.g., Linear) to pass priority values through create/update operations instead of relying on label-based conventions.
