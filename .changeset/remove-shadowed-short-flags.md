---
"@stoneforge/quarry": patch
---

Remove CLI short flags (-v, -V) from commands where they were shadowed by global flags (--verbose, --version), making them non-functional. Affected options: `channel create --visibility`, `document show --doc-version`, `playbook show --variables`, `playbook create --variable`.
