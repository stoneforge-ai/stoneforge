---
'@stoneforge/quarry': minor
---

Add description/body sync on pull path. When pulling changes from external services (GitHub/Linear), the sync engine now syncs the issue body/description back to the Stoneforge task's description Document. Previously, body changes were detected in the hash but silently dropped. The pull path now creates or updates description Documents to match the external item's body, completing bidirectional description sync.
