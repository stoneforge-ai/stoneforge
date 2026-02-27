---
"@stoneforge/quarry": minor
---

Add `--force` (`-f`) flag to `sf external-sync push` command that skips content hash comparison and event query guards, forcing all linked tasks to be pushed regardless of whether their local content has changed.
