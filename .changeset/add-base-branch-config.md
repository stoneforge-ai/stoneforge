---
"@stoneforge/quarry": minor
---

Add optional `baseBranch` configuration field for explicitly setting the merge target branch. Supports config file (`base_branch`), environment variable (`STONEFORGE_BASE_BRANCH`), and CLI override. When unset, existing auto-detection behavior is preserved.
