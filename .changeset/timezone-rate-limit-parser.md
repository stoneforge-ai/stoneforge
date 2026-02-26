---
'@stoneforge/smithy': minor
---

Handle IANA timezone in rate limit reset time parser. Messages with timezone context like "resets 11pm (Pacific/Honolulu)" now correctly compute the reset time in the specified timezone instead of using server local time. Invalid or missing timezones gracefully fall back to existing behavior.
