---
"@stoneforge/smithy": minor
---

Add `ensureAgentChannel` method to `AgentRegistry` interface to recreate missing agent channels on startup, preventing dispatch failures when channels are lost due to partial registration failures, JSONL sync issues, or crashes.
