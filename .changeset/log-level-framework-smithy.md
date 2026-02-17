---
"@stoneforge/smithy": minor
---

Add structured logging framework with log-level filtering. New `createLogger` factory and `getLogLevel` utility support DEBUG, INFO, WARNING, and ERROR levels configurable via `LOG_LEVEL` environment variable. All server service console calls migrated to use leveled logger.
