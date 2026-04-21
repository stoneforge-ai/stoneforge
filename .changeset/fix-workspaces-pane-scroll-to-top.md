---
"@stoneforge/smithy-web": patch
---

Fix Workspaces pane scroll-to-top regression: new SSE messages no longer jump the StreamViewer to the top when the user has scrolled up. Root cause was DOM churn from a 200-event tail-cap that's now removed; adds user-scroll-intent tracking as defense-in-depth. Sticky-bottom semantics (el-2pyf) are preserved.
