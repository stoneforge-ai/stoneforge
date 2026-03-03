---
"@stoneforge/quarry": minor
---

Add large element set warning for link-all and push --all: when operating on >100 elements, a warning is shown on stderr informing the user the operation may take significant time. Warnings are suppressed in --json, --quiet, and --dry-run modes.
