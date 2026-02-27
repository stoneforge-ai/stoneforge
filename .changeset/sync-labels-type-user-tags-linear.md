---
"@stoneforge/quarry": minor
---

Sync labels (type, user tags) to Linear issues on create and update. Previously only the special "blocked" label was handled; sf:type:* labels and user tags were silently dropped. Now all syncable labels are resolved to Linear label IDs and included in create/update mutations, with auto-creation for labels that don't exist in the workspace. Priority (sf:priority:*) and status (sf:status:*) labels are filtered out since Linear handles those natively.
