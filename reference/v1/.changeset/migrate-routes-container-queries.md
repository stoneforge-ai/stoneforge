---
"@stoneforge/smithy-web": patch
---

Migrate route pages from viewport to container query breakpoints. All responsive classes in route files now use @sm/@md/@lg/@xl container queries instead of viewport-based sm/md/lg/xl, so layouts adapt to the main content area width rather than the viewport.
