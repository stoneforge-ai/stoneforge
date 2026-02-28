---
"@stoneforge/quarry": patch
---

Fix duplicate document titles in folder provider. createPage() now appends numeric suffixes (e.g., my-doc-2.md, my-doc-3.md) when a file with the slugified title already exists, preventing silent overwrites.
