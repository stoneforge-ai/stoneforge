---
"@stoneforge/quarry": patch
---

Enforce Notion rich_text array length limit (max 100 elements). When inline-heavy markdown produces more than 100 rich_text elements, blocks are split into multiple blocks. Adjacent plain text elements with identical formatting are merged to reduce array count.
