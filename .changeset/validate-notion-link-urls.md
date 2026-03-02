---
"@stoneforge/quarry": patch
---

Validate URLs before creating Notion link blocks to prevent "Invalid URL for link" API errors; invalid URLs (relative paths, fragments, element IDs, malformed) now render as plain text
