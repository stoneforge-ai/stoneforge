---
"@stoneforge/quarry": patch
---

Fix sync engine push path to use field mapping for labels. The push path now correctly generates sf:priority:* and sf:type:* labels via buildExternalLabels(), hydrates description content from descriptionRef, and resolves assignees — matching the behavior already used by the link-all command.
