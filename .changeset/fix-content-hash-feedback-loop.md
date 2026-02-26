---
"@stoneforge/quarry": patch
---

Fix content hash feedback loop in external sync push by excluding `metadata._externalSync` from content hash computation. Sync bookkeeping fields (lastPushedAt, lastPushedHash, etc.) no longer trigger unnecessary push cycles.
