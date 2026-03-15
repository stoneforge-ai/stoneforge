---
"@stoneforge/smithy-web": minor
---

Redesign DirectorPanel with tabbed interface supporting N concurrent director sessions. Add DirectorTabBar and DirectorTabContent components. Use CSS display:none for inactive tabs to preserve WebSocket/PTY connections. Collapsed panel shows tiled per-director icons. Zero-director state provides Create Director button.
