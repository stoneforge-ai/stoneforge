---
"@stoneforge/quarry": minor
---

Wire up shouldAddBlockedLabel for Linear push path. Blocked tasks now map to the 'started' workflow state type and receive a native "blocked" label on the Linear issue. The label is automatically created if missing, added when a task becomes blocked, and removed when it transitions to another status. Adds getLabels() and createLabel() to LinearApiClient, and labelIds support to create/update issue inputs.
