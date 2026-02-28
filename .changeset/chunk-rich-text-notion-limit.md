---
"@stoneforge/quarry": patch
---

Fix Notion API rejection of text blocks longer than 2000 characters by chunking rich text elements at word boundaries and splitting long code blocks into consecutive blocks
