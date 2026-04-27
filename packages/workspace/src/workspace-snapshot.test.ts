import { describe, expect, it } from "vitest"

import { WorkspaceSetupService } from "./workspace-setup-service.js"
import type { AuditActor } from "./models.js"

const actor: AuditActor = {
  kind: "human",
  id: "user_operator",
  displayName: "Operator",
}

describe("WorkspaceSetupService snapshots", () => {
  it("uses the injected clock for records and audit events", () => {
    const service = new WorkspaceSetupService(undefined, {
      clock: {
        currentTimeMillis: () => Date.parse("2026-04-24T12:00:00.000Z"),
      },
    })

    const org = service.createOrg({ name: "Toolco" })
    const workspace = service.createWorkspace(
      org.id,
      { name: "stoneforge", targetBranch: "main" },
      actor
    )
    const validation = service.validateWorkspace(workspace.id, actor)
    const auditEvents = service.listAuditEventsForWorkspace(workspace.id)

    expect(org.createdAt).toBe("2026-04-24T12:00:00.000Z")
    expect(workspace.createdAt).toBe("2026-04-24T12:00:00.000Z")
    expect(validation.validatedAt).toBe("2026-04-24T12:00:00.000Z")
    expect(auditEvents.map((event) => event.timestamp)).toEqual([
      "2026-04-24T12:00:00.000Z",
      "2026-04-24T12:00:00.000Z",
    ])
  })

  it("restores setup records and continues id allocation", () => {
    const service = new WorkspaceSetupService()
    const org = service.createOrg({ name: "Toolco" })
    const workspace = service.createWorkspace(
      org.id,
      { name: "stoneforge", targetBranch: "main" },
      actor
    )

    service.connectGitHubRepository(
      workspace.id,
      {
        installationId: "github-installation-local",
        owner: "toolco",
        repository: "stoneforge",
        defaultBranch: "main",
      },
      actor
    )
    service.selectPolicyPreset(workspace.id, "supervised", actor)

    const restored = new WorkspaceSetupService(service.exportSnapshot())
    const restoredWorkspace = restored.getWorkspace(workspace.id)
    const nextOrg = restored.createOrg({ name: "Next org" })

    expect(restoredWorkspace.repository?.repository).toBe("stoneforge")
    expect(restoredWorkspace.policyPreset).toBe("supervised")
    expect(restored.listAuditEventsForWorkspace(workspace.id)).toHaveLength(3)
    expect(nextOrg.id).toBe("org_2")
  })
})
