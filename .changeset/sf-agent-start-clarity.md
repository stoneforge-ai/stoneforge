---
"@stoneforge/smithy": patch
---

fix: clearer error from `sf agent start` when headless invocation has no input source

`sf agent start <id>` for a worker/steward in headless mode now refuses
upfront when invoked without --prompt or --resume, with an explanation
and the three fixes (--prompt, --resume, --mode interactive). Replaces
the cryptic "Session exited before init" error users previously saw.
