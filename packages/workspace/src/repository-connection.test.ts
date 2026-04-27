import { describe, expect, it } from "vitest"

import {
  assertRepositoryLinkCompatible,
  repositoryAuditOutcome,
  repositoryConnectReason,
  repositoryStatusReason,
  type ConnectGitHubRepositoryInput,
  type Workspace,
} from "./index.js"

describe("repository connection policy", () => {
  it("allows first links and idempotent links to the same repository", () => {
    expect(() =>
      assertRepositoryLinkCompatible(workspace(), repositoryInput())
    ).not.toThrow()
    expect(() =>
      assertRepositoryLinkCompatible(
        workspace({ owner: "stoneforge-ai", repository: "stoneforge" }),
        repositoryInput()
      )
    ).not.toThrow()
  })

  it("rejects relinking a workspace to a different repository", () => {
    expect(() =>
      assertRepositoryLinkCompatible(
        workspace({ owner: "stoneforge-ai", repository: "other" }),
        repositoryInput()
      )
    ).toThrow(/already linked/i)
    expect(() =>
      assertRepositoryLinkCompatible(
        workspace({ owner: "other-owner", repository: "stoneforge" }),
        repositoryInput()
      )
    ).toThrow(/already linked/i)
  })

  it("maps connection status to audit outcome and reasons", () => {
    expect(repositoryAuditOutcome("connected")).toBe("success")
    expect(repositoryAuditOutcome("disconnected")).toBe("failure")
    expect(repositoryConnectReason("connected")).toBeUndefined()
    expect(repositoryConnectReason("disconnected")).toMatch(
      /without a live connection/i
    )
    expect(repositoryStatusReason("connected")).toBeUndefined()
    expect(repositoryStatusReason("disconnected")).toMatch(
      /connectivity check failed/i
    )
  })
})

function repositoryInput(): ConnectGitHubRepositoryInput {
  return {
    installationId: "ghinst_1",
    owner: "stoneforge-ai",
    repository: "stoneforge",
    defaultBranch: "main",
  }
}

function workspace(repository?: {
  owner: string
  repository: string
}): Workspace {
  return {
    id: "workspace_1" as never,
    orgId: "org_1" as never,
    name: "Stoneforge",
    targetBranch: "main",
    state: "draft",
    repository: repository && {
      installationId: "ghinst_1",
      owner: repository.owner,
      repository: repository.repository,
      defaultBranch: "main",
      connectionStatus: "connected",
      connectedAt: "2026-04-24T00:00:00.000Z",
    },
    runtimes: [],
    agents: [],
    roleDefinitions: [],
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
  }
}
