---
"@stoneforge/quarry": patch
---

Fix blocked label not being added to ExternalTaskInput.labels for Linear push path. The `shouldAddBlockedLabel()` function was imported but never called — the "blocked" label was only injected when the provider config had no `statusLabels`, but Linear's config includes `statusLabels` for pull-path label injection. Now the blocked label is always added for blocked tasks regardless of config.
