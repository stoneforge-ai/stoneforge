---
"@stoneforge/quarry": minor
---

Add per-type auto-link config for document providers. New `autoLinkDocumentProvider` config key allows configuring a separate auto-link provider for documents, independent of the task auto-link provider. CLI commands `set-auto-link` and `disable-auto-link` now accept a `--type` flag (`task`/`document`/`all`).
