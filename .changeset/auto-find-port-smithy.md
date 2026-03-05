---
"@stoneforge/smithy": minor
---

Auto-find available port on EADDRINUSE: server now retries up to 20 ports when the requested port is in use, and startSmithyServer returns { services, port } with the actual bound port.
