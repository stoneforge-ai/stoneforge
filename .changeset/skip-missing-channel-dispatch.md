---
"@stoneforge/smithy": patch
---

Skip workers with missing channels during dispatch instead of crashing. When `dispatchService.dispatch` throws "Agent channel not found", the daemon logs a warning, writes to the operation log, and continues to the next worker.
