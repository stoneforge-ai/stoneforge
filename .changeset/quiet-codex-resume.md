---
"@stoneforge/smithy": patch
---

Fix Codex interactive resume so only UUID session IDs from the Codex continuation footer are persisted. Stopping an interactive Codex session now requests a clean `/exit` shutdown, allowing Stoneforge to capture the resume ID and avoid offering invalid resume targets from ordinary terminal text.
