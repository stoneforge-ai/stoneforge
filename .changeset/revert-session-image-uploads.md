---
"@stoneforge/smithy-web": patch
---

Revert session image uploads to use terminal upload endpoint instead of asset API. Session images in XTerminal and StreamViewer are ephemeral and now upload to `/tmp/stoneforge-terminal-uploads/` via `/api/terminal/upload`. Task description images remain unchanged.
