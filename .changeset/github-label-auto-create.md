---
"@stoneforge/quarry": patch
---

Auto-create sf:* labels on GitHub repos before assigning to issues, preventing 422 "Validation Failed" errors during link-all and push operations. Labels are cached per session for efficiency.
