---
"@stoneforge/quarry": patch
---

Skip untitled documents during document link-all and sync pull operations. Documents with no title (null, undefined, or whitespace-only) are now filtered out to prevent them from slugifying to "untitled.md" and overwriting each other.
