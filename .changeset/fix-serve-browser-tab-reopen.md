---
"@stoneforge/quarry": patch
---

Fix sf serve opening a new browser tab on every restart. Uses a marker file combined with WebSocket client polling (5s window) to reliably detect existing dashboard tabs before deciding to open a new one.
