---
"@stoneforge/quarry": minor
---

Add unlink-all command and fix link-all --force for same provider

- `sf external-sync unlink-all` command for bulk-removing external links with `--provider`, `--type`, and `--dry-run` options
- `link-all --force` now re-links elements already linked to the same provider (previously only re-linked from different providers)
