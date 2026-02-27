---
"@stoneforge/quarry": patch
---

Wire IdLengthCache and checkCollision into QuarryAPI element creation to prevent ID collisions on large databases. QuarryAPI now exposes getIdGeneratorConfig() for adaptive hash length and collision detection.
