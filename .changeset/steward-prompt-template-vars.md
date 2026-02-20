---
"@stoneforge/smithy": minor
---

Replace hardcoded "master" references in steward prompt files with `{{baseBranch}}` template variable. Add `renderPromptTemplate()` function for variable substitution. Steward prompts now dynamically use the detected/configured branch name instead of assuming "master".
