import { generateKeyPairSync } from "node:crypto"

import { describe, expect, it } from "vitest"

import { createMergeRequestAdapter } from "./merge-request-provider.js"

describe("createMergeRequestAdapter", () => {
  it("creates the fake provider adapter", () => {
    const adapter = createMergeRequestAdapter({ provider: "fake" })

    expect(adapter.createOrUpdateTaskPullRequest).toBeTypeOf("function")
  })

  it("creates GitHub adapters with explicit and discoverable installations", () => {
    const explicitAdapter = createMergeRequestAdapter({
      provider: "github",
      github: githubConfig({ installationId: 123 }),
    })
    const discoverableAdapter = createMergeRequestAdapter({
      provider: "github",
      github: githubConfig({ installationId: undefined }),
    })

    expect(explicitAdapter.createOrUpdateTaskPullRequest).toBeTypeOf("function")
    expect(discoverableAdapter.createOrUpdateTaskPullRequest).toBeTypeOf(
      "function"
    )
  })

  it("rejects malformed GitHub provider configs", () => {
    expect(() =>
      createMergeRequestAdapter({
        provider: "github",
        // @ts-expect-error Runtime validation catches malformed config objects.
        github: undefined,
      })
    ).toThrow("GitHub merge provider config is missing.")
  })
})

function githubConfig(input: { installationId: number | undefined }) {
  return {
    provider: "github",
    owner: "toolco",
    repo: "stoneforge",
    baseBranch: "main",
    sourceBranchPrefix: "stoneforge/task",
    appId: "123",
    privateKey: testPrivateKey(),
    installationId: input.installationId,
    allowMerge: false,
  } as const
}

function testPrivateKey(): string {
  return generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString()
}
