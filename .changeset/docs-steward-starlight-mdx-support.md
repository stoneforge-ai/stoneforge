---
"@stoneforge/smithy": patch
---

Docs Steward verifiers now handle Astro Starlight docs sites correctly: `.mdx` files are scanned alongside `.md`, absolute route links like `[x](/guides/foo/)` resolve to the underlying page file under the configured docs directory, and heading anchors tolerate backticks in heading text (so `### \`sf create\`` matches anchor `#sf-create`). File-path verifiers also skip bare basenames and product names like "Node.js" that were producing false positives when mentioned in prose.
