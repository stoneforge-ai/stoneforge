---
"@stoneforge/smithy": patch
---

Fix --target-branch flag for sf agent register command: option was defined with kebab-case name causing the value to be silently ignored at runtime. Renamed to camelCase convention so the parser correctly maps --target-branch to options.targetBranch.
