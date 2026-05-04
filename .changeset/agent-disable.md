---
"@stoneforge/smithy": minor
---

Add agent disable/enable: park agents from dispatch and scheduling without removing them from the agent list.

- New `disabled?: boolean` flag on `BaseAgentMetadata`. Default omitted (treated as enabled).
- New CLI commands `sf agent disable <id>` and `sf agent enable <id>`.
- `sf agent list` appends `(disabled)` to the status column when set.
- `sf agent start <id>` refuses with a hint pointing at `sf agent enable`.
- Dispatch daemon, `getAvailableDirector` in the registry, and the steward scheduler all skip disabled agents when selecting candidates for new work.
- In-flight sessions are NOT terminated when an agent is disabled; only future work is blocked.

Closes #58.
