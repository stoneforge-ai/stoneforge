---
"@stoneforge/quarry": minor
---

Add `--force` (`-f`) flag to `sf external-sync link-all` for re-linking tasks already linked to a different provider. Tasks linked to the same target provider are skipped. Works with `--dry-run` to preview re-link operations. Suggests `--force` when no unlinked tasks are found.
