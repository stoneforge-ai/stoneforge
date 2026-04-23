---
"@stoneforge/smithy-web": patch
---

Fix sidebar responsive layout to use content area width instead of viewport width. The sidebar now computes `contentAreaWidth = viewportWidth - directorPanelWidth` and uses that for all responsive decisions, ensuring identical behavior whether the director panel is open or closed.
