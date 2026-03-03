---
"@stoneforge/quarry": minor
---

Resolve and pass libraryPath during document push. Documents belonging to libraries now include their library path in ExternalDocumentInput, enabling providers to organize documents by library hierarchy. Library paths are batch-resolved before the push loop to avoid N+1 queries.
